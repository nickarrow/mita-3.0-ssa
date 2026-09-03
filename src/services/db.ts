import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { CapabilityAssessment, Rating, AssessmentHistory, Tag, Attachment } from "../types";
import {
  INDEX_SHIFTS_2026_09_02,
  mapQuestionIndex,
  type CapabilityIndexShift,
} from "./blueprintRevision";

// ============================================
// Database Definition - v2.0
// ============================================

const db = new Dexie("MitaSSADatabase") as Dexie & {
  capabilityAssessments: EntityTable<CapabilityAssessment, "id">;
  ratings: EntityTable<Rating, "id">;
  assessmentHistory: EntityTable<AssessmentHistory, "id">;
  tags: EntityTable<Tag, "id">;
  attachments: EntityTable<Attachment, "id">;
};

// Fresh v2.0 schema - clean slate
db.version(3).stores({
  capabilityAssessments: "id, capabilityCode, status, updatedAt",
  ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
  assessmentHistory: "id, capabilityCode, snapshotDate",
  tags: "id, name, usageCount, lastUsed",
});

// v4: Add compound index for ratings to prevent duplicates
db.version(4).stores({
  capabilityAssessments: "id, capabilityCode, status, updatedAt",
  ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
  assessmentHistory: "id, capabilityCode, snapshotDate",
  tags: "id, name, usageCount, lastUsed",
});

// v5: Add attachments table for file storage
db.version(5).stores({
  capabilityAssessments: "id, capabilityCode, status, updatedAt",
  ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
  assessmentHistory: "id, capabilityCode, snapshotDate",
  tags: "id, name, usageCount, lastUsed",
  attachments: "id, capabilityAssessmentId, ratingId, uploadedAt",
});

/**
 * v6: Backfill `editSnapshotId` on re-assessments that were already in flight.
 *
 * No index or table change — `editSnapshotId` is not indexed. This version exists
 * purely for the upgrade function.
 *
 * Whether an assessment is a re-assessment (Cancel restores the previous result)
 * or a first attempt (Cancel deletes it) is now read from `editSnapshotId`. Rows
 * written by the previous build don't have it, so a user who is mid-re-assessment
 * when this version loads would find Cancel deleting their work instead of
 * restoring it.
 *
 * The signature of an in-flight re-assessment is unambiguous: status
 * `in_progress`, with ratings carrying `carriedForward` — a state only
 * `editAssessment` produces. For those, link the newest snapshot for the
 * capability, which is the one that edit session created.
 */
db.version(6)
  .stores({
    capabilityAssessments: "id, capabilityCode, status, updatedAt",
    ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
    assessmentHistory: "id, capabilityCode, snapshotDate",
    tags: "id, name, usageCount, lastUsed",
    attachments: "id, capabilityAssessmentId, ratingId, uploadedAt",
  })
  .upgrade(async (tx) => {
    const assessments = await tx.table("capabilityAssessments").toArray();
    const inProgress = assessments.filter(
      (a: CapabilityAssessment) => a.status === "in_progress" && a.editSnapshotId === undefined
    );
    if (inProgress.length === 0) return;

    const history = (await tx.table("assessmentHistory").toArray()) as AssessmentHistory[];
    const ratings = (await tx.table("ratings").toArray()) as Rating[];

    for (const assessment of inProgress) {
      const isReassessment = ratings.some(
        (r) => r.capabilityAssessmentId === assessment.id && r.carriedForward
      );
      if (!isReassessment) continue;

      const snapshot = history
        .filter((h) => h.capabilityCode === assessment.capabilityCode)
        .sort((a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime())[0];
      if (!snapshot) continue;

      await tx
        .table("capabilityAssessments")
        .update(assessment.id, { editSnapshotId: snapshot.id });
    }
  });

/**
 * v7: Remap `questionIndex` for capabilities whose question list changed shape in
 * the 2026-09-02 blueprint extraction, and stamp `blueprintRevision` on every row.
 *
 * No index or table change — `blueprintRevision` is not indexed. This version
 * exists purely for the upgrade function.
 *
 * Why an upgrade rather than a check at read time: a rating carries no record of
 * which extraction it was made against, so once the new data ships, an old index
 * and a new index are indistinguishable. The correction has to happen exactly
 * once, at a known point, and a Dexie version upgrade is the only hook that
 * guarantees that per browser. Doing it lazily would mean every reader needs to
 * know the migration, and a single missed reader corrupts the row.
 *
 * Ratings whose question no longer exists are deleted rather than kept with a null
 * level: the only such case is a question that was never part of this capability
 * (EE_Enroll_Provider had absorbed one belonging to Disenroll Provider), so there
 * is nothing meaningful to preserve.
 *
 * Stored `score` values are deliberately left alone. A score is the result the user
 * finalized, computed from the answers they gave; recomputing it here would
 * silently restate a historical result, and adding a question means a previously
 * complete assessment is now genuinely incomplete. The dashboard already reports
 * real progress rather than assuming 100% for finalized rows, so that surfaces
 * honestly on its own.
 */
db.version(7)
  .stores({
    capabilityAssessments: "id, capabilityCode, status, updatedAt",
    ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
    assessmentHistory: "id, capabilityCode, snapshotDate",
    tags: "id, name, usageCount, lastUsed",
    attachments: "id, capabilityAssessmentId, ratingId, uploadedAt",
  })
  .upgrade((tx) => migrateToRevision(tx, "2026-09-02", INDEX_SHIFTS_2026_09_02));

/**
 * Apply one revision boundary's index shifts to everything in a transaction.
 *
 * Exported so the test suite exercises the shipped implementation. The previous test
 * reimplemented the body, which meant the code that actually runs in a user's browser
 * had no coverage, and a divergence between the two would pass.
 *
 * Scoped to a single named boundary rather than looping every entry in
 * `REVISION_MIGRATIONS`. Looping looks more general but is wrong: a future boundary
 * needs its own Dexie version, browsers already at v7 will never re-run this one, and
 * Dexie runs every intervening upgrade in sequence — so a v6 database opening at v8
 * would execute this loop over both boundaries and then v8 over the second, applying
 * it twice.
 */
export async function migrateToRevision(
  tx: Transaction,
  toRevision: string,
  shifts: Readonly<Record<string, CapabilityIndexShift>>
): Promise<void> {
  const assessmentTable = tx.table("capabilityAssessments");
  const ratingTable = tx.table("ratings");
  const historyTable = tx.table("assessmentHistory");
  const attachmentTable = tx.table("attachments");

  const assessments = (await assessmentTable.toArray()) as CapabilityAssessment[];
  const history = (await historyTable.toArray()) as AssessmentHistory[];

  for (const [capabilityCode, shift] of Object.entries(shifts)) {
    // Skip rows already at this revision. An upgrade function normally runs once, so
    // this is belt-and-braces — but the shifts are not idempotent (re-applying an
    // insert moves answers a second time and can delete a real one), so the guard is
    // worth having wherever the stamp is available to check.
    const affected = assessments.filter(
      (a) => a.capabilityCode === capabilityCode && a.blueprintRevision !== toRevision
    );

    for (const assessment of affected) {
      const ratings = (await ratingTable
        .where("capabilityAssessmentId")
        .equals(assessment.id)
        .toArray()) as Rating[];

      const moves: { id: string; to: number }[] = [];
      const deletes: string[] = [];
      for (const rating of ratings) {
        const to = mapQuestionIndex(shift, rating.questionIndex);
        if (to === null) {
          deletes.push(rating.id);
        } else if (to !== rating.questionIndex) {
          moves.push({ id: rating.id, to });
        }
      }
      const originalIndexById = new Map(ratings.map((r) => [r.id, r.questionIndex]));

      for (const id of deletes) {
        // Take the rating's attachments with it. Leaving them behind stranded a blob
        // whose `ratingId` pointed at a deleted row: unreachable in the UI, still
        // exported, and reported on re-import as a file that could not be matched to
        // a question — about which the user could do nothing.
        await attachmentTable.where("ratingId").equals(id).delete();
        await ratingTable.delete(id);
      }

      // Ordering here is cosmetic, not a correctness requirement: this runs inside
      // the IndexedDB versionchange transaction, which excludes other connections and
      // commits atomically, so no reader can observe an intermediate state. Sorted by
      // direction of travel anyway, so a future mid-list removal (which moves answers
      // *down*) does not transiently collide either.
      const movingUp = moves
        .filter((m) => m.to > (originalIndexById.get(m.id) ?? m.to))
        .sort((a, b) => b.to - a.to);
      const movingDown = moves
        .filter((m) => m.to < (originalIndexById.get(m.id) ?? m.to))
        .sort((a, b) => a.to - b.to);
      for (const move of [...movingUp, ...movingDown]) {
        await ratingTable.update(move.id, { questionIndex: move.to });
      }
    }

    // History snapshots hold their ratings inline, so they are rewritten as a whole
    // array. Keyed by capabilityCode, not by assessment id, so snapshots whose
    // assessment has been deleted are still migrated.
    const affectedHistory = history.filter(
      (h) => h.capabilityCode === capabilityCode && h.blueprintRevision !== toRevision
    );
    for (const entry of affectedHistory) {
      const nextRatings = entry.ratings
        .map((rating) => {
          const to = mapQuestionIndex(shift, rating.questionIndex);
          return to === null ? null : { ...rating, questionIndex: to };
        })
        .filter((rating): rating is (typeof entry.ratings)[number] => rating !== null);
      await historyTable.update(entry.id, { ratings: nextRatings });
    }
  }

  // Stamp last: the marker attests that the rewrite above completed, so it must not
  // be written before it has. A failure aborts the whole version transition and Dexie
  // retries on next open with the rows still unstamped.
  for (const assessment of assessments) {
    await assessmentTable.update(assessment.id, { blueprintRevision: toRevision });
  }
  for (const entry of history) {
    await historyTable.update(entry.id, { blueprintRevision: toRevision });
  }
}

export { db };
