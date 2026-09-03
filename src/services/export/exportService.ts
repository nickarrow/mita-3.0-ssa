/**
 * Export Service for MITA 3.0
 *
 * Core service for exporting assessment data in various formats.
 * Supports JSON, ZIP (with attachments), and PDF exports.
 */

import JSZip from "jszip";

import { db } from "../db";
import { getCapabilityByCode } from "../blueprint";
import type {
  ExportOptions,
  ExportData,
  AttachmentMetadata,
  RatingExport,
  AssessmentExport,
  ExportProgressCallback,
} from "./types";
import { generatePdfReport } from "./pdfExport";
import { EXPORT_VERSION } from "../../constants/export";
import { BLUEPRINT_REVISION } from "../../constants/blueprint";

/** App version */
const APP_VERSION = "3.0";

/** Blueprint version */
const BLUEPRINT_VERSION = "3.0";

/**
 * Generates a unique filename for an attachment in the ZIP export.
 */
function generateUniqueExportFileName(attachmentId: string, originalFileName: string): string {
  const lastDotIndex = originalFileName.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return `${originalFileName}_${attachmentId}`;
  }
  const baseName = originalFileName.substring(0, lastDotIndex);
  const extension = originalFileName.substring(lastDotIndex + 1);
  return `${baseName}_${attachmentId}.${extension}`;
}

/**
 * Extracts the attachment ID from a unique export filename.
 */
export function extractAttachmentIdFromFileName(uniqueFileName: string): string | null {
  const lastDotIndex = uniqueFileName.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex === -1 ? uniqueFileName : uniqueFileName.substring(0, lastDotIndex);
  const lastUnderscoreIndex = nameWithoutExt.lastIndexOf("_");

  if (lastUnderscoreIndex === -1) {
    return null;
  }

  return nameWithoutExt.substring(lastUnderscoreIndex + 1);
}

/**
 * Collects all data for export based on scope
 */
async function collectExportData(options: ExportOptions): Promise<ExportData> {
  const { scope, businessArea, capabilityCode } = options;

  let assessments = await db.capabilityAssessments.toArray();
  let scopeDetails: ExportData["scopeDetails"];

  // Filter by scope
  if (scope === "capability" && capabilityCode) {
    assessments = assessments.filter((a) => a.capabilityCode === capabilityCode);
    const capability = getCapabilityByCode(capabilityCode);
    scopeDetails = {
      capabilityCode,
      capabilityName: capability?.processName,
      businessArea: capability?.businessArea,
    };
  } else if (scope === "business_area" && businessArea) {
    assessments = assessments.filter((a) => a.businessArea === businessArea);
    scopeDetails = { businessArea };
  }

  // Get ratings for these assessments
  const assessmentIds = assessments.map((a) => a.id);
  const ratings =
    assessmentIds.length > 0
      ? await db.ratings.where("capabilityAssessmentId").anyOf(assessmentIds).toArray()
      : [];

  // Get history
  const capabilityCodes = assessments.map((a) => a.capabilityCode);
  const history =
    capabilityCodes.length > 0
      ? await db.assessmentHistory.where("capabilityCode").anyOf(capabilityCodes).toArray()
      : [];

  // Get all tags
  const tags = await db.tags.toArray();

  // Get attachment metadata
  const attachmentsRaw =
    assessmentIds.length > 0
      ? await db.attachments.where("capabilityAssessmentId").anyOf(assessmentIds).toArray()
      : [];

  const attachments: AttachmentMetadata[] = attachmentsRaw.map((a) => ({
    id: a.id,
    capabilityAssessmentId: a.capabilityAssessmentId,
    ratingId: a.ratingId,
    fileName: a.fileName,
    fileType: a.fileType,
    fileSize: a.fileSize,
    description: a.description,
    uploadedAt: a.uploadedAt.toISOString(),
  }));

  // Convert assessments to export format
  const assessmentsExport: AssessmentExport[] = assessments.map((a) => ({
    id: a.id,
    capabilityCode: a.capabilityCode,
    businessArea: a.businessArea,
    processName: a.processName,
    status: a.status,
    tags: a.tags,
    blueprintVersion: a.blueprintVersion,
    blueprintRevision: a.blueprintRevision,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    finalizedAt: a.finalizedAt?.toISOString(),
    score: a.score,
  }));

  // Convert ratings to export format
  const ratingsExport: RatingExport[] = ratings.map((r) => ({
    id: r.id,
    capabilityAssessmentId: r.capabilityAssessmentId,
    questionIndex: r.questionIndex,
    level: r.level,
    previousLevel: r.previousLevel,
    notes: r.notes,
    carriedForward: r.carriedForward,
    attachmentIds: r.attachmentIds || [],
    updatedAt: r.updatedAt.toISOString(),
  }));

  // Get unique business areas
  const businessAreas = [...new Set(assessments.map((a) => a.businessArea))];

  return {
    exportVersion: EXPORT_VERSION,
    exportDate: new Date().toISOString(),
    appVersion: APP_VERSION,
    blueprintVersion: BLUEPRINT_VERSION,
    blueprintRevision: BLUEPRINT_REVISION,
    scope,
    scopeDetails,
    // Persist the state name the user supplied. Previously it was collected by
    // the export dialog and then dropped for JSON/ZIP, so a backup carried no
    // record of which agency produced it.
    stateName: options.stateName,
    data: {
      assessments: assessmentsExport,
      ratings: ratingsExport,
      history,
      tags,
      attachments,
    },
    metadata: {
      totalAssessments: assessments.length,
      totalRatings: ratings.length,
      totalHistory: history.length,
      totalAttachments: attachments.length,
      businessAreas,
      capabilities: assessments.map((a) => a.capabilityCode),
    },
  };
}

/**
 * Exports data as JSON string
 */
export async function exportAsJson(options: ExportOptions): Promise<string> {
  const data = await collectExportData(options);
  return JSON.stringify(data, null, 2);
}

/**
 * Exports data as a ZIP file containing JSON and attachments
 */
export async function exportAsZip(
  options: ExportOptions,
  onProgress?: ExportProgressCallback
): Promise<Blob> {
  const zip = new JSZip();

  onProgress?.(10, "Collecting assessment data...");

  const exportData = await collectExportData(options);

  onProgress?.(30, "Adding JSON data...");

  // Add JSON data file
  zip.file("data.json", JSON.stringify(exportData, null, 2));

  onProgress?.(50, "Adding attachments...");

  // Add attachments if requested
  if (options.includeAttachments !== false) {
    const attachmentsFolder = zip.folder("attachments");
    if (attachmentsFolder) {
      const assessmentIds = exportData.data.assessments.map((a) => a.id);
      const attachments =
        assessmentIds.length > 0
          ? await db.attachments.where("capabilityAssessmentId").anyOf(assessmentIds).toArray()
          : [];

      for (const attachment of attachments) {
        const assessment = exportData.data.assessments.find(
          (a) => a.id === attachment.capabilityAssessmentId
        );
        if (assessment) {
          const folderPath = assessment.capabilityCode;
          const folder = attachmentsFolder.folder(folderPath);
          const uniqueFileName = generateUniqueExportFileName(attachment.id, attachment.fileName);
          folder?.file(uniqueFileName, attachment.blob);
        }
      }
    }
  }

  onProgress?.(80, "Creating manifest...");

  // Add manifest
  const manifest = {
    exportVersion: EXPORT_VERSION,
    exportDate: exportData.exportDate,
    appVersion: APP_VERSION,
    blueprintVersion: BLUEPRINT_VERSION,
    blueprintRevision: BLUEPRINT_REVISION,
    scope: options.scope,
    stateName: options.stateName,
    contents: {
      dataJson: true,
      attachments: options.includeAttachments !== false,
    },
    stats: exportData.metadata,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  onProgress?.(90, "Compressing...");

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  });

  onProgress?.(100, "Complete");

  return blob;
}

/**
 * Exports data as PDF report
 */
export async function exportAsPdf(
  options: ExportOptions,
  onProgress?: ExportProgressCallback
): Promise<Blob> {
  onProgress?.(10, "Collecting data...");
  const exportData = await collectExportData(options);

  onProgress?.(50, "Generating PDF...");
  const blob = await generatePdfReport(exportData, options);

  onProgress?.(100, "Complete");
  return blob;
}

// Re-export download helpers from utils for backwards compatibility
export { downloadBlob, downloadText } from "../../utils/downloadHelpers";

/**
 * Generates a filename with timestamp
 */
export function generateFilename(prefix: string, extension: string, scope?: string): string {
  const date = new Date().toISOString().split("T")[0];
  const scopePart = scope ? `-${scope}` : "";
  return `mita-3.0-${prefix}${scopePart}-${date}.${extension}`;
}
