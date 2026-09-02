/**
 * Shared test helpers.
 *
 * Two things live here: resetting the database between tests, and building valid
 * export payloads. Both exist so individual tests can state only what they are
 * actually about — a test for out-of-range levels shouldn't need thirty lines of
 * boilerplate envelope.
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "../services/db";
import { getCapabilities } from "../services/blueprint";
import { EXPORT_VERSION } from "../constants/export";
import type { CapabilityAssessment, Rating } from "../types";
import type { ExportData } from "../services/export/types";

/** Empty every table. Call in beforeEach so tests cannot leak state into one another. */
export async function resetDatabase(): Promise<void> {
  await db.transaction(
    "rw",
    [db.capabilityAssessments, db.ratings, db.assessmentHistory, db.tags, db.attachments],
    async () => {
      await Promise.all([
        db.capabilityAssessments.clear(),
        db.ratings.clear(),
        db.assessmentHistory.clear(),
        db.tags.clear(),
        db.attachments.clear(),
      ]);
    }
  );
}

/** A real capability code from the loaded blueprint, so question counts are real. */
export function firstCapability() {
  const capability = getCapabilities()[0];
  if (!capability) throw new Error("Blueprint loaded no capabilities");
  return capability;
}

export function questionCountFor(code: string): number {
  const capability = getCapabilities().find((c) => c.code === code);
  if (!capability) throw new Error(`Unknown capability: ${code}`);
  return capability.bcm.maturity_model.capability_questions.length;
}

/**
 * Insert a finalized assessment with every question answered at `level`.
 * Returns the assessment id.
 */
export async function seedFinalizedAssessment(options?: {
  capabilityCode?: string;
  level?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  notesOnFirst?: string;
}): Promise<string> {
  const capability = options?.capabilityCode
    ? getCapabilities().find((c) => c.code === options.capabilityCode)!
    : firstCapability();
  const level = options?.level ?? 3;
  const total = capability.bcm.maturity_model.capability_questions.length;
  const id = uuidv4();
  const now = new Date();

  const assessment: CapabilityAssessment = {
    id,
    capabilityCode: capability.code,
    businessArea: capability.businessArea,
    processName: capability.processName,
    status: "finalized",
    tags: options?.tags ?? [],
    blueprintVersion: "3.0",
    createdAt: now,
    updatedAt: now,
    finalizedAt: now,
    score: level,
  };
  await db.capabilityAssessments.add(assessment);

  const ratings: Rating[] = Array.from({ length: total }, (_, index) => ({
    id: uuidv4(),
    capabilityAssessmentId: id,
    questionIndex: index,
    level,
    notes: index === 0 ? (options?.notesOnFirst ?? "") : "",
    carriedForward: false,
    attachmentIds: [],
    updatedAt: now,
  }));
  await db.ratings.bulkAdd(ratings);

  return id;
}

/** Attach a stored file to a rating, returning the attachment id. */
export async function seedAttachment(
  assessmentId: string,
  questionIndex: number,
  fileName = "evidence.txt"
): Promise<string> {
  const rating = await db.ratings
    .where("[capabilityAssessmentId+questionIndex]")
    .equals([assessmentId, questionIndex])
    .first();
  if (!rating) throw new Error(`No rating at question ${questionIndex}`);

  const attachmentId = uuidv4();
  await db.attachments.add({
    id: attachmentId,
    capabilityAssessmentId: assessmentId,
    ratingId: rating.id,
    fileName,
    fileType: "text/plain",
    fileSize: 12,
    blob: new Blob(["evidence data"], { type: "text/plain" }),
    uploadedAt: new Date(),
  });
  await db.ratings.update(rating.id, {
    attachmentIds: [...rating.attachmentIds, attachmentId],
  });
  return attachmentId;
}

/** Attachments whose `ratingId` no longer resolves — the invariant that must hold at zero. */
export async function findOrphanedAttachments(): Promise<string[]> {
  const [attachments, ratings] = await Promise.all([
    db.attachments.toArray(),
    db.ratings.toArray(),
  ]);
  const ratingIds = new Set(ratings.map((r) => r.id));
  return attachments.filter((a) => !ratingIds.has(a.ratingId)).map((a) => a.fileName);
}

/** `attachmentIds` entries on ratings that point at no stored attachment. */
export async function findDanglingAttachmentIds(): Promise<string[]> {
  const [attachments, ratings] = await Promise.all([
    db.attachments.toArray(),
    db.ratings.toArray(),
  ]);
  const attachmentIds = new Set(attachments.map((a) => a.id));
  return ratings.flatMap((r) => r.attachmentIds.filter((id) => !attachmentIds.has(id)));
}

/**
 * A well-formed export payload. Override any part of it per test.
 *
 * Overrides are intentionally typed loosely: most tests exist to feed the validator
 * values the real types forbid (a string where a number belongs, a level of 99), so
 * enforcing the export types here would make the interesting cases unwritable.
 */
export function buildExportPayload(overrides?: {
  assessments?: Record<string, unknown>[];
  ratings?: Record<string, unknown>[];
  history?: unknown[];
  tags?: unknown[];
  attachments?: unknown[];
  exportVersion?: string;
}): Record<string, unknown> {
  const capability = firstCapability();
  const assessmentId = "assessment-1";

  const assessments = (overrides?.assessments ?? [{}]).map((partial, index) => ({
    id: index === 0 ? assessmentId : `assessment-${index + 1}`,
    capabilityCode: capability.code,
    businessArea: capability.businessArea,
    processName: capability.processName,
    status: "finalized",
    tags: [],
    blueprintVersion: "3.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    finalizedAt: "2026-01-02T00:00:00.000Z",
    score: 3,
    ...partial,
  }));

  const ratings = (overrides?.ratings ?? [{}]).map((partial, index) => ({
    id: `rating-${index + 1}`,
    capabilityAssessmentId: assessmentId,
    questionIndex: index,
    level: 3,
    notes: "",
    carriedForward: false,
    attachmentIds: [],
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...partial,
  }));

  return {
    exportVersion: overrides?.exportVersion ?? EXPORT_VERSION,
    exportDate: "2026-01-02T00:00:00.000Z",
    appVersion: "3.0",
    blueprintVersion: "3.0",
    scope: "full",
    data: {
      assessments,
      ratings,
      history: overrides?.history ?? [],
      tags: overrides?.tags ?? [],
      attachments: overrides?.attachments ?? [],
    },
    metadata: {
      totalAssessments: assessments.length,
      totalRatings: ratings.length,
      totalHistory: 0,
      totalAttachments: 0,
      businessAreas: [capability.businessArea],
      capabilities: [capability.code],
    },
  };
}

/** Convenience for asserting on a payload after validation. */
export type { ExportData };
