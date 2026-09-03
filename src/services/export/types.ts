/**
 * Export/Import Types for MITA 3.0
 *
 * Type definitions for the export and import system.
 */

import type { AssessmentHistory, Tag } from "../../types";

/**
 * Export scope options
 */
export type ExportScope = "full" | "business_area" | "capability";

/**
 * Export format options
 */
export type ExportFormat = "json" | "zip" | "pdf";

/**
 * Export options
 */
export interface ExportOptions {
  scope: ExportScope;
  format: ExportFormat;
  businessArea?: string;
  capabilityCode?: string;
  includeAttachments?: boolean;
  includeHistory?: boolean;
  stateName?: string;
}

/**
 * Attachment metadata without blob (for JSON export)
 */
export interface AttachmentMetadata {
  id: string;
  capabilityAssessmentId: string;
  ratingId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description?: string;
  uploadedAt: string;
}

/**
 * Rating export format (dates as ISO strings)
 */
export interface RatingExport {
  id: string;
  capabilityAssessmentId: string;
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5 | null;
  previousLevel?: 1 | 2 | 3 | 4 | 5;
  notes: string;
  carriedForward: boolean;
  attachmentIds: string[];
  updatedAt: string;
}

/**
 * Assessment export format (dates as ISO strings)
 */
export interface AssessmentExport {
  id: string;
  capabilityCode: string;
  businessArea: string;
  processName: string;
  status: "in_progress" | "finalized";
  tags: string[];
  blueprintVersion: string;
  /**
   * Blueprint extraction this record's question indices refer to. Absent on files
   * written before revisions were tracked, which is itself the signal that its
   * indices predate the 2026-09-02 corrections.
   */
  blueprintRevision?: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  score?: number;
}

/**
 * Export data structure (JSON format)
 */
export interface ExportData {
  exportVersion: string;
  exportDate: string;
  appVersion: string;
  blueprintVersion: string;
  /**
   * Blueprint extraction this file was produced against, used as the fallback when
   * an individual record carries no revision of its own.
   *
   * `exportVersion` is deliberately not bumped for this field: it is additive and
   * optional, and `SUPPORTED_EXPORT_VERSIONS` is an equality check with no
   * migration layer, so bumping it would make this build unable to read every
   * backup users already have.
   */
  blueprintRevision?: string;
  scope: ExportScope;
  scopeDetails?: {
    businessArea?: string;
    capabilityCode?: string;
    capabilityName?: string;
  };
  /** State/agency name captured at export time, for identifying the source. */
  stateName?: string;
  data: {
    assessments: AssessmentExport[];
    ratings: RatingExport[];
    history: AssessmentHistory[];
    tags: Tag[];
    attachments: AttachmentMetadata[];
  };
  metadata: {
    totalAssessments: number;
    totalRatings: number;
    totalHistory: number;
    totalAttachments: number;
    businessAreas: string[];
    capabilities: string[];
  };
}

/**
 * Import result summary
 */
export interface ImportResult {
  success: boolean;
  importedAsCurrent: number;
  importedAsHistory: number;
  skipped: number;
  attachmentsRestored: number;
  errors: string[];
  /**
   * Non-fatal issues: records that were dropped or corrected during validation.
   * The import still succeeded, but the user should know what changed.
   */
  warnings: string[];
  details: ImportItemResult[];
}

/**
 * Individual import item result
 */
export interface ImportItemResult {
  capabilityCode: string;
  capabilityName: string;
  action: "imported_current" | "imported_history" | "skipped" | "error";
  reason?: string;
}

/**
 * Export progress callback
 */
export type ExportProgressCallback = (progress: number, message: string) => void;

/**
 * Import progress callback
 */
export type ImportProgressCallback = (progress: number, message: string) => void;
