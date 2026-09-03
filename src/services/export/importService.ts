/**
 * Import Service for MITA 3.0
 *
 * Handles importing assessment data from JSON and ZIP files.
 * Uses "Merge with History" strategy:
 * - Newer imports become current, existing moves to history
 * - Older imports are added to history, existing stays current
 */

import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";

import { db } from "../db";
import { extractAttachmentIdFromFileName } from "./exportService";
import { validateImportPayload } from "./importValidation";
import { migrateImportPayload } from "./importRevisionMigration";
import { SCORE_TOLERANCE, TIMESTAMP_TOLERANCE_MS } from "../../constants/export";
import { BLUEPRINT_REVISION } from "../../constants/blueprint";
import { refreshTagUsage } from "../tagUsage";
import type { ExportData, ImportResult, ImportItemResult, ImportProgressCallback } from "./types";
import type {
  CapabilityAssessment,
  Rating,
  AssessmentHistory,
  HistoricalRating,
  Attachment,
} from "../../types";

/**
 * Turn an unknown thrown value into something worth showing a user.
 *
 * Raw messages from Dexie ("Key already exists in the object store") describe an
 * implementation detail, so they are replaced with the constraint they represent.
 */
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "ConstraintError") {
    return "it conflicts with data already stored in this browser";
  }
  if (name === "QuotaExceededError") {
    return "this browser has run out of storage space";
  }
  return message || "an unexpected error occurred";
}

/** Build a failed ImportResult with nothing written. */
function failure(errors: string[], warnings: string[] = []): ImportResult {
  return {
    success: false,
    importedAsCurrent: 0,
    importedAsHistory: 0,
    skipped: 0,
    attachmentsRestored: 0,
    errors,
    warnings,
    details: [],
  };
}

/**
 * Creates a history snapshot from an assessment and its ratings
 */
function createHistorySnapshot(
  assessment: CapabilityAssessment,
  ratings: Rating[],
  score: number | null
): AssessmentHistory {
  const historicalRatings: HistoricalRating[] = ratings
    .filter((r) => r.level !== null)
    .map((r) => ({
      questionIndex: r.questionIndex,
      level: r.level as 1 | 2 | 3 | 4 | 5,
      notes: r.notes,
      attachmentIds: r.attachmentIds || [],
    }));

  return {
    id: uuidv4(),
    capabilityCode: assessment.capabilityCode,
    snapshotDate: assessment.finalizedAt ?? assessment.updatedAt,
    tags: [...assessment.tags],
    score,
    ratings: historicalRatings,
    blueprintVersion: assessment.blueprintVersion,
    blueprintRevision: assessment.blueprintRevision ?? BLUEPRINT_REVISION,
  };
}

/**
 * Imports data from a JSON string
 */
export async function importFromJson(
  jsonString: string,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  onProgress?.(10, "Parsing JSON...");

  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    return failure(["This file is not valid JSON."]);
  }

  const { data, errors, warnings } = validateImportPayload(raw);
  if (!data) {
    return failure(errors, warnings);
  }

  // Re-align question indices before anything is written. A file produced against
  // an older blueprint extraction carries indices that are valid-looking but point
  // at the wrong questions.
  const migration = migrateImportPayload(data);
  warnings.push(...migration.warnings);

  onProgress?.(30, "Processing assessments...");

  return await runImport(data, warnings, onProgress);
}

/**
 * Run the merge, converting any escaping exception into a reported failure.
 *
 * The merge is transactional, so a throw means nothing was written — but the
 * caller still needs to be told why in language it can display.
 */
async function runImport(
  data: ExportData,
  warnings: string[],
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  try {
    return await processImport(data, warnings, onProgress);
  } catch (error) {
    return failure(
      [`The import was cancelled and no data was changed, because ${describeError(error)}.`],
      warnings
    );
  }
}

/**
 * Imports data from a ZIP file
 */
export async function importFromZip(
  zipBlob: Blob,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  onProgress?.(10, "Reading ZIP file...");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBlob);
  } catch {
    return failure(["This file could not be opened as a ZIP archive."]);
  }

  const dataFile = zip.file("data.json");
  if (!dataFile) {
    return failure(["This ZIP does not contain data.json, so it is not a MITA assessment backup."]);
  }

  onProgress?.(20, "Parsing data...");

  const jsonString = await dataFile.async("string");
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    return failure(["The data.json inside this ZIP is not valid JSON."]);
  }

  const { data, errors, warnings } = validateImportPayload(raw);
  if (!data) {
    return failure(errors, warnings);
  }

  warnings.push(...migrateImportPayload(data).warnings);

  onProgress?.(40, "Processing assessments...");

  const result = await runImport(data, warnings, (p, m) => {
    onProgress?.(Math.round(40 + p * 0.3), m);
  });

  // The merge failed and rolled back; do not go on to write attachments.
  if (!result.success) {
    return result;
  }

  // Import attachments
  onProgress?.(70, "Importing attachments...");

  // Collect the archive entries first. Reading blobs is async and unrelated to the
  // database, so it happens before the write transaction opens.
  const attachmentFiles: { path: string; file: JSZip.JSZipObject }[] = [];
  const attachmentsFolder = zip.folder("attachments");
  attachmentsFolder?.forEach((relativePath, file) => {
    if (!file.dir) {
      attachmentFiles.push({ path: relativePath, file });
    }
  });

  const pending: { attachment: Omit<Attachment, "id" | "ratingId">; ratingId: string }[] = [];
  const unmatched: string[] = [];

  for (const { path, file } of attachmentFiles) {
    const fileName = path.split("/").pop() ?? "";
    try {
      const attachmentId = extractAttachmentIdFromFileName(fileName);
      const attachmentMeta =
        (attachmentId ? data.data.attachments.find((a) => a.id === attachmentId) : undefined) ??
        data.data.attachments.find((a) => a.fileName === fileName);

      if (!attachmentMeta) {
        unmatched.push(fileName);
        continue;
      }

      const importedAssessment = data.data.assessments.find(
        (a) => a.id === attachmentMeta.capabilityAssessmentId
      );
      const importedRating = data.data.ratings.find((r) => r.id === attachmentMeta.ratingId);
      if (!importedAssessment || !importedRating) {
        unmatched.push(fileName);
        continue;
      }

      // Resolve the local assessment the same way the merge did. Using `.first()`
      // here (as this code previously did) can pick a different row than the merge
      // targeted when a capability has both a finalized and an in-progress record,
      // binding the file to the wrong assessment.
      const assessment = await resolveLocalAssessment(importedAssessment.capabilityCode);
      if (!assessment) {
        unmatched.push(fileName);
        continue;
      }

      const rating = await db.ratings
        .where("[capabilityAssessmentId+questionIndex]")
        .equals([assessment.id, importedRating.questionIndex])
        .first();
      if (!rating) {
        unmatched.push(fileName);
        continue;
      }

      pending.push({
        ratingId: rating.id,
        attachment: {
          capabilityAssessmentId: assessment.id,
          fileName: attachmentMeta.fileName,
          fileType: attachmentMeta.fileType,
          fileSize: attachmentMeta.fileSize,
          blob: await file.async("blob"),
          description: attachmentMeta.description,
          uploadedAt: new Date(attachmentMeta.uploadedAt),
        },
      });
    } catch {
      unmatched.push(fileName);
    }
  }

  // Write them together: either every matched file is stored and linked, or none
  // is. Storing a blob and then failing to link it produces an unreachable file.
  if (pending.length > 0) {
    try {
      await db.transaction("rw", [db.attachments, db.ratings], async () => {
        for (const { attachment, ratingId } of pending) {
          const id = uuidv4();
          await db.attachments.add({ ...attachment, id, ratingId });
          const rating = await db.ratings.get(ratingId);
          await db.ratings.update(ratingId, {
            attachmentIds: [...(rating?.attachmentIds ?? []), id],
          });
        }
      });
      result.attachmentsRestored += pending.length;
    } catch (error) {
      result.warnings.push(
        `The assessment data was imported, but the attached files could not be saved because ${describeError(error)}.`
      );
    }
  }

  // Report only files that were actually present in the archive but could not be
  // placed. Comparing against the metadata count instead reported every attachment
  // as missing for a ZIP exported without them.
  if (unmatched.length > 0) {
    result.warnings.push(
      `${unmatched.length} file(s) in this backup could not be matched to a question and were not restored: ${unmatched.slice(0, 3).join(", ")}${unmatched.length > 3 ? ", ..." : ""}`
    );
  }

  onProgress?.(100, "Complete");

  return result;
}

/**
 * Resolve the local assessment for a capability, deterministically.
 *
 * `.first()` on the capabilityCode index returns an arbitrary row when a
 * capability has both a finalized and an in-progress assessment. Every code path
 * that needs "the" assessment must agree on which one that is.
 */
async function resolveLocalAssessment(
  capabilityCode: string
): Promise<CapabilityAssessment | undefined> {
  const candidates = await db.capabilityAssessments
    .where("capabilityCode")
    .equals(capabilityCode)
    .toArray();
  return (
    candidates.find((a) => a.status === "finalized") ??
    candidates.find((a) => a.status === "in_progress") ??
    candidates[0]
  );
}

/**
 * Core import processing logic
 */
async function processImport(
  data: ExportData,
  validationWarnings: string[],
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    importedAsCurrent: 0,
    importedAsHistory: 0,
    skipped: 0,
    attachmentsRestored: 0,
    errors: [],
    warnings: [...validationWarnings],
    details: [],
  };

  const totalAssessments = data.data.assessments.length;

  // A file can legitimately carry only history entries, in which case the
  // per-assessment loop never runs. Report progress up front so the bar doesn't
  // appear stuck.
  if (totalAssessments === 0) {
    onProgress?.(100, "Importing history...");
  }

  // The entire merge runs in one transaction. Previously an exception partway
  // through (e.g. a malformed tag list) left assessments already written while
  // the UI reported failure, so the user believed nothing had changed and could
  // double-import by retrying. Now it is all-or-nothing.
  await db.transaction(
    "rw",
    [db.capabilityAssessments, db.ratings, db.assessmentHistory, db.tags, db.attachments],
    async () => {
      for (let i = 0; i < data.data.assessments.length; i++) {
        const importedAssessment = data.data.assessments[i];
        if (!importedAssessment) continue;

        onProgress?.(
          Math.round(((i + 1) / totalAssessments) * 100),
          `Processing ${importedAssessment.processName}...`
        );

        // Per-item try/catch *inside* the transaction. The catch records which
        // assessment failed and then rethrows, so the transaction still aborts
        // (nothing is left half-merged) but the caller can report the cause
        // instead of surfacing a raw Dexie message.
        let itemResult: ImportItemResult;
        try {
          itemResult = await processAssessmentImport(importedAssessment, data, result.warnings);
        } catch (error) {
          result.errors.push(
            `Could not import ${importedAssessment.processName}: ${describeError(error)}`
          );
          result.details.push({
            capabilityCode: importedAssessment.capabilityCode,
            capabilityName: importedAssessment.processName,
            action: "error",
            reason: describeError(error),
          });
          throw error;
        }

        result.details.push(itemResult);

        switch (itemResult.action) {
          case "imported_current":
            result.importedAsCurrent++;
            break;
          case "imported_history":
            result.importedAsHistory++;
            break;
          case "skipped":
            result.skipped++;
            break;
          case "error":
            result.errors.push(itemResult.reason ?? "Unknown error");
            break;
        }
      }

      // Import tags. Names are already normalized and validated, and ids are
      // freshly minted, by validateImportPayload.
      for (const tag of data.data.tags) {
        const existing = await db.tags.where("name").equals(tag.name).first();
        if (!existing) {
          await db.tags.add(tag);
        }
      }

      // Import history entries
      for (const historyEntry of data.data.history) {
        const existing = await db.assessmentHistory.get(historyEntry.id);
        if (!existing) {
          await db.assessmentHistory.add({
            ...historyEntry,
            snapshotDate: new Date(historyEntry.snapshotDate),
          });
        }
      }

      // Imported usageCount values are not trusted (a crafted file could pin a tag
      // to the top of every suggestion list), so derive them from what was actually
      // written. Already inside this transaction, whose scope covers both tables.
      const importedTagNames = data.data.assessments.flatMap((a) => a.tags);
      await refreshTagUsage(importedTagNames, true);
    }
  );

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Processes a single assessment import with merge logic
 */
async function processAssessmentImport(
  importedAssessment: ExportData["data"]["assessments"][0],
  data: ExportData,
  warnings: string[]
): Promise<ImportItemResult> {
  const capabilityCode = importedAssessment.capabilityCode;

  const importedRatings = data.data.ratings.filter(
    (r) => r.capabilityAssessmentId === importedAssessment.id
  );

  const existingAssessment = await resolveLocalAssessment(capabilityCode);

  const importedDate = new Date(importedAssessment.updatedAt);

  if (!existingAssessment) {
    // No existing - import as current
    const newAssessmentId = uuidv4();

    await db.capabilityAssessments.add({
      id: newAssessmentId,
      capabilityCode: importedAssessment.capabilityCode,
      businessArea: importedAssessment.businessArea,
      processName: importedAssessment.processName,
      status: importedAssessment.status,
      tags: importedAssessment.tags,
      blueprintVersion: importedAssessment.blueprintVersion,
      // Whatever the migration resolved, not an unconditional "current".
      // `migrateImportPayload` sets this to the current revision for records it
      // re-aligned, and leaves a foreign revision in place for records it declined to
      // touch. Stamping current regardless asserted that indices had been checked when
      // they had not — and the stamp is the only thing that would ever prompt another
      // look at them.
      blueprintRevision: importedAssessment.blueprintRevision,
      createdAt: new Date(importedAssessment.createdAt),
      updatedAt: importedDate,
      finalizedAt: importedAssessment.finalizedAt
        ? new Date(importedAssessment.finalizedAt)
        : undefined,
      score: importedAssessment.score,
    });

    for (const rating of importedRatings) {
      await db.ratings.add({
        id: uuidv4(),
        capabilityAssessmentId: newAssessmentId,
        questionIndex: rating.questionIndex,
        level: rating.level,
        previousLevel: rating.previousLevel,
        notes: rating.notes,
        carriedForward: rating.carriedForward,
        attachmentIds: [],
        updatedAt: new Date(rating.updatedAt),
      });
    }

    return {
      capabilityCode,
      capabilityName: importedAssessment.processName,
      action: "imported_current",
    };
  }

  // Existing assessment found - compare timestamps
  const existingDate = existingAssessment.updatedAt;
  const timeDiff = Math.abs(importedDate.getTime() - existingDate.getTime());

  const isSameData =
    timeDiff < 1000 &&
    importedAssessment.score !== undefined &&
    existingAssessment.score !== undefined &&
    Math.abs(importedAssessment.score - existingAssessment.score) < 0.01;

  if (isSameData) {
    return {
      capabilityCode,
      capabilityName: importedAssessment.processName,
      action: "skipped",
      reason: "Identical to current assessment",
    };
  }

  if (importedDate > existingDate) {
    // Imported is newer - move existing to history, import as current

    const existingRatings = await db.ratings
      .where("capabilityAssessmentId")
      .equals(existingAssessment.id)
      .toArray();

    // Always snapshot before overwriting. Gating this on a truthy score meant a
    // local assessment with no score was destroyed with no history trace at all.
    //
    // The snapshot records the stored score or nothing at all. Deriving one from
    // however many answers a draft happened to have would put a two-question
    // average into the same field the dashboard and the overall maturity number
    // read from.
    const answeredExisting = existingRatings.filter((r) => r.level !== null);
    if (answeredExisting.length > 0) {
      await db.assessmentHistory.add(
        createHistorySnapshot(existingAssessment, existingRatings, existingAssessment.score ?? null)
      );
    }

    // Losing local answers is a real consequence of a merge; say so explicitly
    // rather than reporting an unqualified success.
    const importedAnswered = importedRatings.filter((r) => r.level !== null).length;
    if (answeredExisting.length > 0 && importedAnswered < answeredExisting.length) {
      warnings.push(
        `${importedAssessment.processName}: replaced ${answeredExisting.length} local answer(s) with ${importedAnswered} from this file. The previous version was saved to history.`
      );
    }

    // Apply imported ratings onto the existing rows, matched on questionIndex.
    //
    // Deleting and recreating would mint new rating ids and strand every local
    // attachment as an unreachable blob (Attachment.ratingId would dangle).
    // Updating in place keeps uploaded evidence attached to its question.
    const existingByQuestion = new Map(existingRatings.map((r) => [r.questionIndex, r]));
    const importedQuestions = new Set(importedRatings.map((r) => r.questionIndex));

    for (const rating of importedRatings) {
      const existing = existingByQuestion.get(rating.questionIndex);
      if (existing) {
        await db.ratings.update(existing.id, {
          level: rating.level,
          previousLevel: rating.previousLevel,
          notes: rating.notes,
          carriedForward: rating.carriedForward,
          updatedAt: new Date(rating.updatedAt),
        });
      } else {
        await db.ratings.add({
          id: uuidv4(),
          capabilityAssessmentId: existingAssessment.id,
          questionIndex: rating.questionIndex,
          level: rating.level,
          previousLevel: rating.previousLevel,
          notes: rating.notes,
          carriedForward: rating.carriedForward,
          attachmentIds: [],
          updatedAt: new Date(rating.updatedAt),
        });
      }
    }

    // Local answers for questions the import doesn't cover are not part of the
    // imported result, so clear the level. The row (and its notes and
    // attachments) is kept rather than deleted.
    for (const existing of existingRatings) {
      if (importedQuestions.has(existing.questionIndex)) continue;
      await db.ratings.update(existing.id, { level: null, carriedForward: false });
    }

    // Update existing assessment with imported data
    await db.capabilityAssessments
      .where("id")
      .equals(existingAssessment.id)
      .modify((row) => {
        row.status = importedAssessment.status;
        row.tags = importedAssessment.tags;
        row.updatedAt = importedDate;
        // The rating rows above have just been rewritten from the imported record, so
        // the row now describes the imported extraction, not whatever it held before.
        // Leaving the old revision here would claim indices had been verified against
        // an extraction they no longer come from.
        row.blueprintRevision = importedAssessment.blueprintRevision;
        delete row.editSnapshotId;
        if (importedAssessment.finalizedAt) {
          row.finalizedAt = new Date(importedAssessment.finalizedAt);
        } else {
          delete row.finalizedAt;
        }
        if (importedAssessment.score === undefined) {
          delete row.score;
        } else {
          row.score = importedAssessment.score;
        }
      });

    return {
      capabilityCode,
      capabilityName: importedAssessment.processName,
      action: "imported_current",
      reason: "Replaced older local assessment (moved to history)",
    };
  } else {
    // Imported is older - add to history only

    // Explicit undefined check, not truthiness: a truthiness test would silently
    // discard a legitimate score of 0 if the scale ever changes.
    const importedScore = importedAssessment.score;
    if (importedAssessment.status === "finalized" && importedScore !== undefined) {
      const existingHistory = await db.assessmentHistory
        .where("capabilityCode")
        .equals(capabilityCode)
        .toArray();

      const alreadyExists = existingHistory.some(
        (h) =>
          Math.abs(h.snapshotDate.getTime() - importedDate.getTime()) < TIMESTAMP_TOLERANCE_MS &&
          h.score !== null &&
          Math.abs(h.score - importedScore) < SCORE_TOLERANCE
      );

      if (alreadyExists) {
        return {
          capabilityCode,
          capabilityName: importedAssessment.processName,
          action: "skipped",
          reason: "Historical entry already exists",
        };
      }

      const historicalRatings: HistoricalRating[] = importedRatings
        .filter((r) => r.level !== null)
        .map((r) => ({
          questionIndex: r.questionIndex,
          level: r.level as 1 | 2 | 3 | 4 | 5,
          notes: r.notes,
          attachmentIds: r.attachmentIds || [],
        }));

      await db.assessmentHistory.add({
        id: uuidv4(),
        capabilityCode,
        snapshotDate: importedDate,
        tags: importedAssessment.tags,
        score: importedScore,
        ratings: historicalRatings,
        blueprintVersion: importedAssessment.blueprintVersion,
        blueprintRevision: importedAssessment.blueprintRevision,
      });

      return {
        capabilityCode,
        capabilityName: importedAssessment.processName,
        action: "imported_history",
        reason: "Added as historical entry (local is newer)",
      };
    }

    return {
      capabilityCode,
      capabilityName: importedAssessment.processName,
      action: "skipped",
      reason: "Local assessment is newer and imported is not finalized",
    };
  }
}

/**
 * Reads a file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
