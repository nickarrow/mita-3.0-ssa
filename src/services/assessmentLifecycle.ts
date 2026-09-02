/**
 * Assessment lifecycle operations.
 *
 * The mutating half of the assessment model: creating, editing, finalizing,
 * reverting and deleting. These are plain async functions over Dexie with no React
 * dependency, which is what makes them directly testable — they previously lived
 * inside `useCapabilityAssessments`, where reaching them required rendering a
 * component even though none of them touched component state.
 *
 * `useCapabilityAssessments` still owns the reactive query and the synchronous
 * derived getters, and re-exports these so call sites are unchanged.
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "./db";
import { getBlueprintVersion, getCapabilityByCode } from "./blueprint";
import { normalizeTagList } from "../utils/tags";
import { refreshTagUsage } from "./tagUsage";
import type { CapabilityAssessment, Rating, AssessmentHistory } from "../types";

/**
 * Start a new assessment for a capability.
 *
 * Idempotent per capability: if one already exists it is returned rather than
 * duplicated. A capability is only ever meant to have one live assessment, and
 * nothing enforced that — double-clicking "Start" produced two in-progress rows,
 * after which `getCapabilityStatus` (which checks in-progress first) permanently
 * masked the finalized one and hid the Edit action.
 */
export async function startAssessment(
  capabilityCode: string,
  initialTags: string[] = []
): Promise<string> {
  const capability = getCapabilityByCode(capabilityCode);
  if (!capability) {
    throw new Error(`Capability not found: ${capabilityCode}`);
  }

  const normalizedTags = normalizeTagList(initialTags);
  let assessmentId = "";

  await db.transaction("rw", [db.capabilityAssessments], async () => {
    const existing = await db.capabilityAssessments
      .where("capabilityCode")
      .equals(capabilityCode)
      .toArray();

    const reusable =
      existing.find((a) => a.status === "in_progress") ??
      existing.find((a) => a.status === "finalized");

    if (reusable) {
      assessmentId = reusable.id;
      return;
    }

    const now = new Date();
    assessmentId = uuidv4();

    const assessment: CapabilityAssessment = {
      id: assessmentId,
      capabilityCode,
      businessArea: capability.businessArea,
      processName: capability.processName,
      status: "in_progress",
      tags: normalizedTags,
      blueprintVersion: getBlueprintVersion(),
      createdAt: now,
      updatedAt: now,
    };

    await db.capabilityAssessments.add(assessment);
  });

  await refreshTagUsage(normalizedTags);

  return assessmentId;
}

/**
 * Edit an existing finalized assessment
 * Snapshots the current state to history, then sets status to in_progress
 * Converts ratings to "suggestion" format (level becomes previousLevel, level set to null)
 */
export async function editAssessment(assessmentId: string): Promise<void> {
  const assessment = await db.capabilityAssessments.get(assessmentId);
  if (!assessment) {
    throw new Error(`Assessment not found: ${assessmentId}`);
  }

  if (assessment.status !== "finalized") {
    // Already in progress, nothing to do
    return;
  }

  // One transaction: either the whole assessment enters edit mode or none of it
  // does. A partial conversion would leave some ratings as suggestions and
  // others as confirmed answers, with no way to tell them apart.
  await db.transaction(
    "rw",
    [db.capabilityAssessments, db.ratings, db.assessmentHistory],
    async () => {
      const currentRatings = await db.ratings
        .where("capabilityAssessmentId")
        .equals(assessmentId)
        .toArray();

      // Snapshot the finalized state to history before editing. This snapshot
      // becomes the authoritative record of the previous result: it is what the
      // dashboard displays while the re-assessment is in progress, and what
      // revertEdit restores from.
      const historyEntry: AssessmentHistory = {
        id: uuidv4(),
        capabilityCode: assessment.capabilityCode,
        snapshotDate: assessment.finalizedAt || assessment.updatedAt,
        tags: assessment.tags,
        // Record the absence of a score rather than inventing one. A finalized
        // assessment normally has a score, but an imported one may not.
        score: assessment.score ?? null,
        ratings: currentRatings
          .filter((r) => r.level !== null)
          .map((r) => ({
            questionIndex: r.questionIndex,
            level: r.level as 1 | 2 | 3 | 4 | 5,
            notes: r.notes,
            attachmentIds: r.attachmentIds || [],
          })),
        blueprintVersion: assessment.blueprintVersion,
      };

      await db.assessmentHistory.add(historyEntry);

      // Convert ratings to "suggestion" format
      // Move current level to previousLevel, set level to null
      const now = new Date();
      for (const rating of currentRatings) {
        if (rating.level !== null) {
          await db.ratings.update(rating.id, {
            previousLevel: rating.level,
            level: null,
            carriedForward: true,
            updatedAt: now,
          });
        }
      }

      // Drop the score. Every level has just been nulled, so the stored score
      // no longer describes this row's contents. The previous score lives in
      // the history snapshot created above.
      await db.capabilityAssessments
        .where("id")
        .equals(assessmentId)
        .modify((row) => {
          row.status = "in_progress";
          row.updatedAt = now;
          row.editSnapshotId = historyEntry.id;
          delete row.score;
          delete row.finalizedAt;
        });
    }
  );
}

/**
 * Finalize an assessment
 * Snapshots any existing finalized assessment to history first
 */
export async function finalizeAssessment(assessmentId: string): Promise<void> {
  const assessment = await db.capabilityAssessments.get(assessmentId);

  if (!assessment) {
    throw new Error(`Assessment not found: ${assessmentId}`);
  }

  const now = new Date();

  // One transaction. This is the most destructive path in the lifecycle: it
  // archives and then deletes a previous finalized assessment along with its
  // ratings and attachments. Interrupted midway it could leave a finalized
  // assessment with no ratings at all.
  await db.transaction(
    "rw",
    [db.capabilityAssessments, db.ratings, db.assessmentHistory, db.attachments],
    async () => {
      const ratings = await db.ratings
        .where("capabilityAssessmentId")
        .equals(assessmentId)
        .toArray();

      // Calculate score
      const answeredRatings = ratings.filter((r) => r.level !== null);
      const score =
        answeredRatings.length > 0
          ? answeredRatings.reduce((sum, r) => sum + (r.level || 0), 0) / answeredRatings.length
          : undefined;

      // Check for existing finalized assessment (different from current)
      const existingFinalized = await db.capabilityAssessments
        .where("capabilityCode")
        .equals(assessment.capabilityCode)
        .filter((a) => a.status === "finalized" && a.id !== assessmentId)
        .first();

      if (existingFinalized) {
        const existingRatings = await db.ratings
          .where("capabilityAssessmentId")
          .equals(existingFinalized.id)
          .toArray();

        // Snapshot unconditionally. Gating on a defined score meant a finalized
        // assessment without one was deleted leaving no trace.
        const historyEntry: AssessmentHistory = {
          id: uuidv4(),
          capabilityCode: existingFinalized.capabilityCode,
          snapshotDate: existingFinalized.finalizedAt || existingFinalized.updatedAt,
          tags: existingFinalized.tags,
          score: existingFinalized.score ?? null,
          ratings: existingRatings
            .filter((r) => r.level !== null)
            .map((r) => ({
              questionIndex: r.questionIndex,
              level: r.level as 1 | 2 | 3 | 4 | 5,
              notes: r.notes,
              // Deliberately empty: the blobs are deleted immediately below, so
              // recording their ids would leave the snapshot pointing at files
              // that no longer exist. History keeps the ratings, not the evidence.
              attachmentIds: [],
            })),
          blueprintVersion: existingFinalized.blueprintVersion,
        };

        await db.assessmentHistory.add(historyEntry);

        // Delete the old finalized assessment and its ratings and attachments
        await db.attachments.where("capabilityAssessmentId").equals(existingFinalized.id).delete();
        await db.ratings.where("capabilityAssessmentId").equals(existingFinalized.id).delete();
        await db.capabilityAssessments.delete(existingFinalized.id);
      }

      // Update current assessment to finalized. The edit snapshot (if any) is kept
      // in history as the prior result, but is no longer this row's "previous
      // result" pointer now that a new result exists.
      await db.capabilityAssessments
        .where("id")
        .equals(assessmentId)
        .modify((row) => {
          row.status = "finalized";
          row.finalizedAt = now;
          row.updatedAt = now;
          delete row.editSnapshotId;
          if (score === undefined) {
            delete row.score;
          } else {
            row.score = Math.round(score * 10) / 10;
          }
        });
    }
  );

  // Tag bookkeeping runs after the transaction: it is derived data, and a
  // failure there must not roll back the finalization itself.
  await refreshTagUsage(assessment.tags);
}

/**
 * Update tags on an assessment
 */
export async function updateTags(assessmentId: string, tags: string[]): Promise<void> {
  // Normalize at the persistence boundary so no caller can write a tag in a
  // form that breaks equality comparisons elsewhere.
  const normalized = normalizeTagList(tags);

  await db.capabilityAssessments.update(assessmentId, {
    tags: normalized,
    updatedAt: new Date(),
  });

  // Recompute counts across all tags, not just the ones still present, so a tag
  // removed from its last assessment drops to zero instead of staying inflated.
  await refreshTagUsage(normalized);
}

/**
 * Delete an assessment and its ratings and attachments
 */
export async function deleteAssessment(assessmentId: string): Promise<void> {
  await db.transaction("rw", [db.capabilityAssessments, db.ratings, db.attachments], async () => {
    await db.attachments.where("capabilityAssessmentId").equals(assessmentId).delete();
    await db.ratings.where("capabilityAssessmentId").equals(assessmentId).delete();
    await db.capabilityAssessments.delete(assessmentId);
  });
}

/**
 * Discard an in-progress assessment (for new assessments that were never finalized)
 * Deletes the assessment and all its ratings and attachments
 */
export async function discardAssessment(assessmentId: string): Promise<void> {
  await db.transaction("rw", [db.capabilityAssessments, db.ratings, db.attachments], async () => {
    await db.attachments.where("capabilityAssessmentId").equals(assessmentId).delete();
    await db.ratings.where("capabilityAssessmentId").equals(assessmentId).delete();
    await db.capabilityAssessments.delete(assessmentId);
  });
}

/**
 * Revert an edit session on a finalized assessment
 * Restores the assessment to finalized status and restores ratings from the most recent history snapshot
 */
export async function revertEdit(assessmentId: string): Promise<void> {
  const assessment = await db.capabilityAssessments.get(assessmentId);
  if (!assessment) {
    throw new Error(`Assessment not found: ${assessmentId}`);
  }

  // Restore from the snapshot this edit session created. Falling back to
  // newest-by-date is only for rows predating editSnapshotId; that fallback can
  // pick an imported entry with a later snapshotDate, so the explicit pointer is
  // always preferred.
  const latestHistory = assessment.editSnapshotId
    ? await db.assessmentHistory.get(assessment.editSnapshotId)
    : await db.assessmentHistory
        .where("capabilityCode")
        .equals(assessment.capabilityCode)
        .reverse()
        .sortBy("snapshotDate")
        .then((entries) => entries[0]);

  if (!latestHistory) {
    // No history to restore from - this shouldn't happen if we're reverting an edit
    // but handle gracefully by just setting status back to finalized
    await db.capabilityAssessments
      .where("id")
      .equals(assessmentId)
      .modify((row) => {
        row.status = "finalized";
        row.updatedAt = new Date();
        delete row.editSnapshotId;
      });
    return;
  }

  await db.transaction(
    "rw",
    [db.capabilityAssessments, db.ratings, db.assessmentHistory, db.attachments],
    async () => {
      const now = new Date();

      // Restore ratings *in place*, matched on questionIndex.
      //
      // This must not delete-and-recreate: attachments reference their rating by
      // id, so new ids would strand every uploaded file as an unreachable blob
      // with no UI path to view or delete it. Updating the existing rows keeps
      // Attachment.ratingId valid.
      const existingRatings = await db.ratings
        .where("capabilityAssessmentId")
        .equals(assessmentId)
        .toArray();
      const existingByQuestion = new Map(existingRatings.map((r) => [r.questionIndex, r]));
      const snapshotByQuestion = new Map(latestHistory.ratings.map((r) => [r.questionIndex, r]));

      // Attachments are the source of truth for their own links. Rebuilding
      // attachmentIds from the table (rather than trusting the snapshot, which
      // predates anything uploaded during this edit session) guarantees the
      // links and the blobs agree in both directions.
      const liveAttachments = await db.attachments
        .where("capabilityAssessmentId")
        .equals(assessmentId)
        .toArray();
      const attachmentIdsByRating = new Map<string, string[]>();
      for (const attachment of liveAttachments) {
        const ids = attachmentIdsByRating.get(attachment.ratingId) || [];
        ids.push(attachment.id);
        attachmentIdsByRating.set(attachment.ratingId, ids);
      }

      for (const snapshotRating of latestHistory.ratings) {
        const existing = existingByQuestion.get(snapshotRating.questionIndex);
        if (existing) {
          await db.ratings.update(existing.id, {
            level: snapshotRating.level,
            notes: snapshotRating.notes,
            carriedForward: false,
            previousLevel: undefined,
            attachmentIds: attachmentIdsByRating.get(existing.id) || [],
            updatedAt: now,
          });
        } else {
          // No row for this question (unusual, but possible if a rating was
          // deleted mid-edit). Nothing can reference it yet, so a new id is safe.
          const rating: Rating = {
            id: uuidv4(),
            capabilityAssessmentId: assessmentId,
            questionIndex: snapshotRating.questionIndex,
            level: snapshotRating.level,
            notes: snapshotRating.notes,
            carriedForward: false,
            attachmentIds: [],
            updatedAt: now,
          };
          await db.ratings.add(rating);
        }
      }

      // Rows absent from the snapshot were unanswered when the assessment was
      // finalized. Clear the level to match that state, but keep the row so any
      // notes and attachments on it survive.
      for (const existing of existingRatings) {
        if (snapshotByQuestion.has(existing.questionIndex)) continue;
        await db.ratings.update(existing.id, {
          level: null,
          carriedForward: false,
          previousLevel: undefined,
          attachmentIds: attachmentIdsByRating.get(existing.id) || [],
          updatedAt: now,
        });
      }

      // Restore assessment to finalized state
      await db.capabilityAssessments
        .where("id")
        .equals(assessmentId)
        .modify((row) => {
          row.status = "finalized";
          row.tags = latestHistory.tags;
          row.finalizedAt = latestHistory.snapshotDate;
          row.updatedAt = now;
          delete row.editSnapshotId;
          // A snapshot with no score restores to no score, rather than writing
          // a fabricated number onto a finalized row.
          if (latestHistory.score === null) {
            delete row.score;
          } else {
            row.score = latestHistory.score;
          }
        });

      // Remove the history entry we just restored from (since we're reverting, not keeping it)
      await db.assessmentHistory.delete(latestHistory.id);
    }
  );
}
