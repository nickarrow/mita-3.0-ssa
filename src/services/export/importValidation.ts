/**
 * Import Validation for MITA 3.0
 *
 * Imported files are untrusted input. They may be hand-edited, produced by a
 * different app version, or simply corrupt. Every record is validated and
 * normalized here *before* anything touches the database, so a bad file is
 * rejected or repaired up front rather than discovered halfway through a write.
 *
 * The strategy is: reject the file outright only when its overall shape is
 * unusable; otherwise drop the individual records that are invalid and report
 * exactly what was dropped, so the user knows what they did and didn't get.
 */

import { getCapabilityByCode } from "../blueprint";
import { questionCountAtRevision, resolveRecordRevision } from "../blueprintRevision";
import {
  MAX_MATURITY_LEVEL,
  MAX_PLAUSIBLE_QUESTION_INDEX,
  MIN_MATURITY_LEVEL,
  SUPPORTED_EXPORT_VERSIONS,
} from "../../constants/export";
import { isValidTag, normalizeTag } from "../../utils/tags";
import type { AssessmentExport, ExportData, RatingExport, AttachmentMetadata } from "./types";
import type { AssessmentHistory, HistoricalRating, Tag } from "../../types";

const MIN_LEVEL = MIN_MATURITY_LEVEL;
const MAX_LEVEL = MAX_MATURITY_LEVEL;

export interface ValidationOutcome {
  /** Normalized payload, safe to write. Only present when `errors` is empty. */
  data?: ExportData;
  /** Fatal problems. Non-empty means nothing should be written at all. */
  errors: string[];
  /** Records that were dropped or corrected. Import can proceed. */
  warnings: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Why a numeric field was rejected. Reported separately because "not a number"
 * and "outside 1-5" are different mistakes, and a message that calls a
 * string `"4"` an out-of-range value is actively misleading.
 */
type RejectionReason = "wrong-type" | "out-of-range";

function describeRejection(reason: RejectionReason, value: unknown, range: string): string {
  return reason === "wrong-type"
    ? `${JSON.stringify(value)} is not a number`
    : `${String(value)} is outside the valid range (${range})`;
}

/**
 * Coerce a maturity level. Anything not an integer 1-5 becomes null (unrated)
 * rather than being written through, which would corrupt every score reading it.
 */
function normalizeLevel(value: unknown): {
  value: 1 | 2 | 3 | 4 | 5 | null;
  reason?: RejectionReason;
} {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: null, reason: "wrong-type" };
  }
  if (!Number.isInteger(value)) return { value: null, reason: "out-of-range" };
  if (value < MIN_LEVEL || value > MAX_LEVEL) return { value: null, reason: "out-of-range" };
  return { value: value as 1 | 2 | 3 | 4 | 5 };
}

/**
 * Coerce a score. Scores are means of 1-5 levels, so anything outside that range
 * is meaningless and is dropped rather than displayed (a bad value here surfaces
 * on the dashboard as e.g. "42.0" and poisons every average it feeds).
 */
function normalizeScore(value: unknown): { value?: number; reason?: RejectionReason } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { reason: "wrong-type" };
  }
  if (value < MIN_LEVEL || value > MAX_LEVEL) return { reason: "out-of-range" };
  return { value };
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString);
}

/**
 * Number of questions a capability had in the extraction `revision` was written
 * against, or null when this build doesn't know the capability.
 *
 * Bounds must be checked in the coordinate system the file uses, not the current
 * one. EE_Enroll_Provider dropped from 13 questions to 12, so a legitimate answer to
 * question 13 in an older backup is only out of range if you measure it against
 * today's list — and discarding it here would pre-empt the index migration that
 * knows the question was removed. The migration reports that as a removal, which is
 * what happened; "question 13 does not exist" describes the wrong thing.
 */
function questionCountFor(capabilityCode: string, revision: string | undefined): number | null {
  const capability = getCapabilityByCode(capabilityCode);
  if (!capability) return null;
  return (
    questionCountAtRevision(capabilityCode, revision) ??
    capability.bcm.maturity_model.capability_questions.length
  );
}

/**
 * Drop ratings that collide on `[capabilityAssessmentId, questionIndex]`.
 *
 * The compound index is not unique, so a file carrying two answers for one question
 * writes both. `getRating` resolves with `find`, so the UI shows an arbitrary one and
 * edits touch only that row — while the others stay invisible, count toward progress,
 * and are averaged into the finalized score. Keeping the first occurrence is arbitrary
 * but deterministic; the point is that exactly one survives and the user is told.
 */
function dedupeRatings(ratings: RatingExport[], warnings: string[]): RatingExport[] {
  const seen = new Set<string>();
  const kept: RatingExport[] = [];
  let collisions = 0;
  for (const rating of ratings) {
    const key = `${rating.capabilityAssessmentId}::${rating.questionIndex}`;
    if (seen.has(key)) {
      collisions += 1;
      continue;
    }
    seen.add(key);
    kept.push(rating);
  }
  if (collisions > 0) {
    warnings.push(
      `${collisions} duplicate answer(s) for questions that already had one were not imported.`
    );
  }
  return kept;
}

function validateAssessment(raw: unknown, warnings: string[]): AssessmentExport | null {
  if (!isObject(raw)) {
    warnings.push("Skipped an assessment entry that was not an object.");
    return null;
  }

  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.capabilityCode)) {
    warnings.push("Skipped an assessment missing an id or capability code.");
    return null;
  }

  const label = isNonEmptyString(raw.processName) ? raw.processName : raw.capabilityCode;

  const status =
    raw.status === "finalized" || raw.status === "in_progress" ? raw.status : "in_progress";
  if (status !== raw.status) {
    warnings.push(`${label}: unrecognized status "${String(raw.status)}" treated as in progress.`);
  }

  const updatedAt = normalizeDate(raw.updatedAt);
  if (!updatedAt) {
    warnings.push(`${label}: skipped, its last-updated date is missing or invalid.`);
    return null;
  }

  const score = normalizeScore(raw.score);
  if (raw.score !== undefined && score.value === undefined) {
    warnings.push(
      `${label}: discarded its score because ${describeRejection(score.reason!, raw.score, `${MIN_LEVEL}-${MAX_LEVEL}`)}.`
    );
  }

  return {
    id: raw.id,
    capabilityCode: raw.capabilityCode,
    businessArea: isNonEmptyString(raw.businessArea) ? raw.businessArea : "",
    processName: label,
    status,
    tags: normalizeTags(raw.tags),
    blueprintVersion: isNonEmptyString(raw.blueprintVersion) ? raw.blueprintVersion : "3.0",
    // Left undefined when absent rather than defaulted: absence means "written
    // before revisions were tracked", which is what triggers the index migration.
    // Defaulting it to the current revision would claim this record's indices are
    // already correct and silently skip the correction it needs.
    blueprintRevision: isNonEmptyString(raw.blueprintRevision) ? raw.blueprintRevision : undefined,
    createdAt: normalizeDate(raw.createdAt) ?? updatedAt,
    updatedAt,
    finalizedAt: normalizeDate(raw.finalizedAt),
    score: score.value,
  };
}

function validateRating(
  raw: unknown,
  assessmentsById: Map<string, AssessmentExport>,
  warnings: string[],
  orphanCount: { total: number },
  /**
   * File-level revision, used as the fallback when a record carries none.
   *
   * Passed in so this resolves the coordinate system exactly as
   * `migrateImportPayload` does. When the two disagreed, a payload whose file said
   * "current" and whose records said nothing was bounds-checked in old coordinates and
   * then never migrated — answers landed on the wrong questions with no warning.
   */
  fileRevision: string | undefined
): RatingExport | null {
  if (!isObject(raw)) return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.capabilityAssessmentId)) return null;

  const parent = assessmentsById.get(raw.capabilityAssessmentId);
  if (!parent) {
    // Orphaned rating: its assessment is absent from the file or was rejected.
    // Writing it would create a row nothing can reach. Counted and reported by the
    // caller — silently dropping answers produced a finalized assessment whose
    // score was backed by nothing.
    orphanCount.total += 1;
    return null;
  }

  if (typeof raw.questionIndex !== "number" || !Number.isInteger(raw.questionIndex)) return null;
  if (raw.questionIndex < 0) return null;

  const parentRevision = resolveRecordRevision(parent.blueprintRevision, fileRevision);

  // Normally bounded by the capability's question count in the extraction this
  // record was written against. For a capability this build doesn't recognize that
  // count is unknown, so fall back to a sanity ceiling rather than accepting any
  // integer.
  const questionCount = questionCountFor(parent.capabilityCode, parentRevision);
  const limit = questionCount ?? MAX_PLAUSIBLE_QUESTION_INDEX;
  if (raw.questionIndex >= limit) {
    warnings.push(
      questionCount !== null
        ? `${parent.processName}: dropped an answer for question ${raw.questionIndex + 1}, which does not exist (this capability has ${questionCount} questions).`
        : `${parent.processName}: dropped an answer for question ${raw.questionIndex + 1}; the question count for this capability is unknown, so answers beyond ${limit} are rejected.`
    );
    return null;
  }

  const level = normalizeLevel(raw.level);
  if (raw.level !== null && raw.level !== undefined && level.value === null) {
    warnings.push(
      `${parent.processName}: cleared the level on question ${raw.questionIndex + 1} because ${describeRejection(level.reason!, raw.level, `whole numbers ${MIN_LEVEL}-${MAX_LEVEL}`)}.`
    );
  }

  return {
    id: raw.id,
    capabilityAssessmentId: raw.capabilityAssessmentId,
    questionIndex: raw.questionIndex,
    level: level.value,
    previousLevel: normalizeLevel(raw.previousLevel).value ?? undefined,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    carriedForward: raw.carriedForward === true,
    attachmentIds: Array.isArray(raw.attachmentIds)
      ? raw.attachmentIds.filter(isNonEmptyString)
      : [],
    updatedAt: normalizeDate(raw.updatedAt) ?? parent.updatedAt,
  };
}

function validateHistoryEntry(
  raw: unknown,
  warnings: string[],
  /** File-level revision, the fallback when the snapshot carries none. */
  fileRevision: string | undefined
): AssessmentHistory | null {
  if (!isObject(raw)) return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.capabilityCode)) return null;

  const snapshotDate = normalizeDate(raw.snapshotDate);
  if (!snapshotDate) {
    warnings.push(`Skipped a history entry for ${raw.capabilityCode} with an invalid date.`);
    return null;
  }

  // A snapshot may legitimately carry no score, but a *bad* score is a signal the
  // entry is untrustworthy, so reject the entry rather than nulling the field.
  const score = normalizeScore(raw.score);
  if (raw.score !== undefined && raw.score !== null && score.value === undefined) {
    warnings.push(
      `Skipped a history entry for ${raw.capabilityCode}: ${describeRejection(score.reason!, raw.score, `${MIN_LEVEL}-${MAX_LEVEL}`)}.`
    );
    return null;
  }

  if (raw.ratings !== undefined && !Array.isArray(raw.ratings)) {
    warnings.push(
      `Skipped a history entry for ${raw.capabilityCode}: its list of answers is missing or malformed.`
    );
    return null;
  }

  // Bounded in this snapshot's own coordinate system, for the same reason as
  // ratings: a snapshot from an older extraction is not malformed just because a
  // question has since been removed.
  const snapshotRevision = resolveRecordRevision(
    isNonEmptyString(raw.blueprintRevision) ? raw.blueprintRevision : undefined,
    fileRevision
  );
  const questionCount = questionCountFor(raw.capabilityCode, snapshotRevision);
  const indexLimit = questionCount ?? MAX_PLAUSIBLE_QUESTION_INDEX;
  const rawRatings = Array.isArray(raw.ratings) ? raw.ratings : [];
  const ratings: HistoricalRating[] = rawRatings
    .map((entry): HistoricalRating | null => {
      if (!isObject(entry)) return null;
      const level = normalizeLevel(entry.level);
      if (level.value === null) return null;
      if (typeof entry.questionIndex !== "number" || !Number.isInteger(entry.questionIndex)) {
        return null;
      }
      if (entry.questionIndex < 0 || entry.questionIndex >= indexLimit) return null;
      return {
        questionIndex: entry.questionIndex,
        level: level.value,
        notes: typeof entry.notes === "string" ? entry.notes : "",
        attachmentIds: Array.isArray(entry.attachmentIds)
          ? entry.attachmentIds.filter(isNonEmptyString)
          : [],
      };
    })
    .filter((entry): entry is HistoricalRating => entry !== null);

  // A scored snapshot with no usable answers is a trend point backed by nothing.
  if (score.value !== undefined && ratings.length === 0 && rawRatings.length > 0) {
    warnings.push(
      `Skipped a history entry for ${raw.capabilityCode}: none of its ${rawRatings.length} answer(s) were valid.`
    );
    return null;
  }

  return {
    id: raw.id,
    capabilityCode: raw.capabilityCode,
    snapshotDate: new Date(snapshotDate),
    tags: normalizeTags(raw.tags),
    score: score.value ?? null,
    ratings,
    blueprintVersion: isNonEmptyString(raw.blueprintVersion) ? raw.blueprintVersion : "3.0",
    blueprintRevision: isNonEmptyString(raw.blueprintRevision) ? raw.blueprintRevision : undefined,
  };
}

/**
 * Validate and normalize an imported tag.
 *
 * Held to exactly the same rules as a tag typed into the UI. Skipping that let an
 * import populate the vocabulary with case-duplicate, over-long and structurally
 * invalid names, and with an attacker-chosen `usageCount` that pinned them to the
 * top of the autocomplete list.
 *
 * `usageCount` is deliberately not trusted: it is derived data, recomputed from
 * the assessments table after the import by `refreshTagUsage`.
 */
function validateTag(raw: unknown, warnings: string[]): Tag | null {
  if (!isObject(raw)) return null;
  if (!isNonEmptyString(raw.name)) return null;

  if (!isValidTag(raw.name)) {
    warnings.push(`Skipped the imported tag ${JSON.stringify(raw.name)}: it is not a valid tag.`);
    return null;
  }

  const lastUsed = normalizeDate(raw.lastUsed);
  return {
    // A fresh id, always. Reusing the imported id can collide with an unrelated
    // local tag and abort the whole import with a ConstraintError.
    id: crypto.randomUUID(),
    name: normalizeTag(raw.name),
    usageCount: 0,
    lastUsed: lastUsed ? new Date(lastUsed) : new Date(),
  };
}

function validateAttachmentMetadata(raw: unknown): AttachmentMetadata | null {
  if (!isObject(raw)) return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.fileName)) return null;
  if (!isNonEmptyString(raw.capabilityAssessmentId) || !isNonEmptyString(raw.ratingId)) return null;
  return {
    id: raw.id,
    capabilityAssessmentId: raw.capabilityAssessmentId,
    ratingId: raw.ratingId,
    fileName: raw.fileName,
    fileType: isNonEmptyString(raw.fileType) ? raw.fileType : "application/octet-stream",
    fileSize: typeof raw.fileSize === "number" && raw.fileSize >= 0 ? raw.fileSize : 0,
    description: isNonEmptyString(raw.description) ? raw.description : undefined,
    uploadedAt: normalizeDate(raw.uploadedAt) ?? new Date().toISOString(),
  };
}

/**
 * Validate and normalize a parsed export file.
 *
 * Returns fatal `errors` when the file cannot be used at all, and `warnings`
 * describing individual records that were dropped or corrected.
 */
export function validateImportPayload(raw: unknown): ValidationOutcome {
  const warnings: string[] = [];

  if (!isObject(raw)) {
    return { errors: ["This file does not contain MITA assessment data."], warnings };
  }

  if (typeof raw.exportVersion !== "string") {
    return { errors: ["This file is missing an export version and cannot be read."], warnings };
  }

  if (!SUPPORTED_EXPORT_VERSIONS.includes(raw.exportVersion)) {
    return {
      errors: [
        `This file uses export version ${raw.exportVersion}, which this version of the tool cannot read.`,
      ],
      warnings,
    };
  }

  if (!isObject(raw.data)) {
    return { errors: ["This file is missing its assessment data section."], warnings };
  }

  const section = raw.data;

  if (!Array.isArray(section.assessments)) {
    return { errors: ["This file does not contain a list of assessments."], warnings };
  }

  if (!Array.isArray(section.ratings)) {
    return { errors: ["This file does not contain a list of ratings."], warnings };
  }

  // history, tags and attachments are optional. A file without them is valid and
  // simply carries no history/tags/attachments - it must not abort the import.
  const rawHistory = Array.isArray(section.history) ? section.history : [];
  const rawTags = Array.isArray(section.tags) ? section.tags : [];
  const rawAttachments = Array.isArray(section.attachments) ? section.attachments : [];

  const validatedAssessments = section.assessments
    .map((entry) => validateAssessment(entry, warnings))
    .filter((entry): entry is AssessmentExport => entry !== null);

  // Reject structurally ambiguous files rather than letting the merge resolve them
  // arbitrarily. Duplicate ids silently collapse when keyed into a Map, and two
  // assessments for one capability make the second overwrite the first *and*
  // snapshot it as history — inventing a data point from a single file.
  const seenIds = new Set<string>();
  const seenCodes = new Map<string, string>();
  const assessments: AssessmentExport[] = [];
  for (const assessment of validatedAssessments) {
    if (seenIds.has(assessment.id)) {
      warnings.push(
        `${assessment.processName}: skipped a second entry sharing the id ${assessment.id}.`
      );
      continue;
    }
    const existingName = seenCodes.get(assessment.capabilityCode);
    if (existingName !== undefined) {
      warnings.push(
        `${assessment.processName}: skipped because this file contains more than one assessment for ${assessment.capabilityCode}.`
      );
      continue;
    }
    seenIds.add(assessment.id);
    seenCodes.set(assessment.capabilityCode, assessment.processName);
    assessments.push(assessment);
  }

  if (assessments.length === 0 && rawHistory.length === 0) {
    return {
      errors: ["This file contains no assessments that could be read."],
      warnings,
    };
  }

  const assessmentsById = new Map(assessments.map((a) => [a.id, a]));

  const fileRevision = isNonEmptyString(raw.blueprintRevision) ? raw.blueprintRevision : undefined;

  const orphanCount = { total: 0 };
  const ratings = dedupeRatings(
    section.ratings
      .map((entry) => validateRating(entry, assessmentsById, warnings, orphanCount, fileRevision))
      .filter((entry): entry is RatingExport => entry !== null),
    warnings
  );

  if (orphanCount.total > 0) {
    warnings.push(
      `${orphanCount.total} answer(s) referenced an assessment that is not present in this file and were not imported.`
    );
  }

  // An assessment claiming to be finalized with a score but carrying no usable
  // answers would display a score backed by nothing.
  const ratedAssessmentIds = new Set(ratings.map((r) => r.capabilityAssessmentId));
  for (const assessment of assessments) {
    if (assessment.score !== undefined && !ratedAssessmentIds.has(assessment.id)) {
      warnings.push(
        `${assessment.processName}: imported with a score of ${assessment.score} but no valid answers, so its score cannot be verified.`
      );
    }
  }

  const history = rawHistory
    .map((entry) => validateHistoryEntry(entry, warnings, fileRevision))
    .filter((entry): entry is AssessmentHistory => entry !== null);

  const tags = rawTags
    .map((entry) => validateTag(entry, warnings))
    .filter((entry): entry is Tag => entry !== null);

  const attachments = rawAttachments
    .map(validateAttachmentMetadata)
    .filter((entry): entry is AttachmentMetadata => entry !== null);

  // Flag capabilities this build doesn't recognize. Their data is still imported
  // (a future blueprint version may restore them) but they won't be visible, so
  // the user needs to know.
  const unknownCapabilities = [
    ...new Set(
      assessments
        .map((a) => a.capabilityCode)
        .filter((code) => getCapabilityByCode(code) === undefined)
    ),
  ];
  for (const code of unknownCapabilities) {
    warnings.push(
      `${code} is not part of this version of the MITA blueprint; its data was imported but will not appear in the dashboard.`
    );
  }

  const data: ExportData = {
    exportVersion: raw.exportVersion,
    exportDate: normalizeDate(raw.exportDate) ?? new Date().toISOString(),
    appVersion: isNonEmptyString(raw.appVersion) ? raw.appVersion : "unknown",
    blueprintVersion: isNonEmptyString(raw.blueprintVersion) ? raw.blueprintVersion : "3.0",
    blueprintRevision: isNonEmptyString(raw.blueprintRevision) ? raw.blueprintRevision : undefined,
    scope:
      raw.scope === "full" || raw.scope === "business_area" || raw.scope === "capability"
        ? raw.scope
        : "full",
    // Rebuilt field by field rather than asserted: an unchecked cast in the module
    // whose job is validation is the one hole worth not leaving.
    scopeDetails: isObject(raw.scopeDetails)
      ? {
          businessArea: isNonEmptyString(raw.scopeDetails.businessArea)
            ? raw.scopeDetails.businessArea
            : undefined,
          capabilityCode: isNonEmptyString(raw.scopeDetails.capabilityCode)
            ? raw.scopeDetails.capabilityCode
            : undefined,
          capabilityName: isNonEmptyString(raw.scopeDetails.capabilityName)
            ? raw.scopeDetails.capabilityName
            : undefined,
        }
      : undefined,
    stateName: isNonEmptyString(raw.stateName) ? raw.stateName : undefined,
    data: { assessments, ratings, history, tags, attachments },
    metadata: {
      totalAssessments: assessments.length,
      totalRatings: ratings.length,
      totalHistory: history.length,
      totalAttachments: attachments.length,
      businessAreas: [...new Set(assessments.map((a) => a.businessArea).filter(Boolean))],
      capabilities: [...new Set(assessments.map((a) => a.capabilityCode))],
    },
  };

  return { data, errors: [], warnings };
}
