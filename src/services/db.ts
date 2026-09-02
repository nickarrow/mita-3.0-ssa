import Dexie, { type EntityTable } from "dexie";
import type { CapabilityAssessment, Rating, AssessmentHistory, Tag, Attachment } from "../types";

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

export { db };
