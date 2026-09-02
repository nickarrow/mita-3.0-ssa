/**
 * Tests for the v6 schema upgrade.
 *
 * This is the first upgrade function in the schema, and it exists to protect a
 * narrow but real case: a user whose re-assessment was already in flight when this
 * version shipped. Without the backfill, Cancel would delete their work instead of
 * restoring the previous result.
 *
 * Dexie runs upgrade functions only when opening a database at a lower version, so
 * the test builds a v5 database by hand and then opens it at v6.
 */

import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";

const DB_NAME = "MitaSSADatabase_upgrade_test";

const V5_STORES = {
  capabilityAssessments: "id, capabilityCode, status, updatedAt",
  ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
  assessmentHistory: "id, capabilityCode, snapshotDate",
  tags: "id, name, usageCount, lastUsed",
  attachments: "id, capabilityAssessmentId, ratingId, uploadedAt",
};

/** The upgrade under test, applied to a throwaway database. */
function openAtV6(): Dexie {
  const db = new Dexie(DB_NAME);
  db.version(5).stores(V5_STORES);
  db.version(6)
    .stores(V5_STORES)
    .upgrade(async (tx) => {
      const assessments = await tx.table("capabilityAssessments").toArray();
      const inProgress = assessments.filter(
        (a) => a.status === "in_progress" && a.editSnapshotId === undefined
      );
      if (inProgress.length === 0) return;

      const history = await tx.table("assessmentHistory").toArray();
      const ratings = await tx.table("ratings").toArray();

      for (const assessment of inProgress) {
        const isReassessment = ratings.some(
          (r) => r.capabilityAssessmentId === assessment.id && r.carriedForward
        );
        if (!isReassessment) continue;

        const snapshot = history
          .filter((h) => h.capabilityCode === assessment.capabilityCode)
          .sort(
            (a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()
          )[0];
        if (!snapshot) continue;

        await tx
          .table("capabilityAssessments")
          .update(assessment.id, { editSnapshotId: snapshot.id });
      }
    });
  return db;
}

interface SeedOptions {
  carriedForward: boolean;
  historyDates?: string[];
}

/** Build a v5 database containing one in-progress assessment, then close it. */
async function seedV5({ carriedForward, historyDates = [] }: SeedOptions): Promise<void> {
  const db = new Dexie(DB_NAME);
  db.version(5).stores(V5_STORES);
  await db.open();

  await db.table("capabilityAssessments").add({
    id: "assessment-1",
    capabilityCode: "CM_Establish_Case",
    businessArea: "Care Management",
    processName: "Establish Case",
    status: "in_progress",
    tags: [],
    blueprintVersion: "3.0",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  });

  await db.table("ratings").add({
    id: "rating-1",
    capabilityAssessmentId: "assessment-1",
    questionIndex: 0,
    level: null,
    previousLevel: carriedForward ? 3 : undefined,
    notes: "",
    carriedForward,
    attachmentIds: [],
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  });

  for (const [index, date] of historyDates.entries()) {
    await db.table("assessmentHistory").add({
      id: `history-${index + 1}`,
      capabilityCode: "CM_Establish_Case",
      snapshotDate: new Date(date),
      tags: [],
      score: 3,
      ratings: [{ questionIndex: 0, level: 3, notes: "", attachmentIds: [] }],
      blueprintVersion: "3.0",
    });
  }

  db.close();
}

async function readEditSnapshotId(): Promise<string | undefined> {
  const db = openAtV6();
  await db.open();
  const row = await db.table("capabilityAssessments").get("assessment-1");
  db.close();
  return row?.editSnapshotId;
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME);
});

describe("v6 upgrade: editSnapshotId backfill", () => {
  it("links an in-flight re-assessment to its snapshot", async () => {
    await seedV5({ carriedForward: true, historyDates: ["2026-01-02T00:00:00.000Z"] });

    expect(await readEditSnapshotId()).toBe("history-1");
  });

  it("picks the newest snapshot when a capability has several", async () => {
    await seedV5({
      carriedForward: true,
      historyDates: ["2020-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"],
    });

    expect(await readEditSnapshotId()).toBe("history-2");
  });

  it("leaves a first-attempt assessment alone", async () => {
    // No carried-forward ratings, so this was never a re-assessment: Cancel should
    // still delete it, and marking it as an edit session would be wrong.
    await seedV5({ carriedForward: false, historyDates: ["2026-01-02T00:00:00.000Z"] });

    expect(await readEditSnapshotId()).toBeUndefined();
  });

  it("leaves a re-assessment with no available snapshot alone", async () => {
    await seedV5({ carriedForward: true, historyDates: [] });

    expect(await readEditSnapshotId()).toBeUndefined();
  });

  it("is safe to run against a database with nothing to backfill", async () => {
    const db = new Dexie(DB_NAME);
    db.version(5).stores(V5_STORES);
    await db.open();
    db.close();

    const upgraded = openAtV6();
    await expect(upgraded.open()).resolves.toBeDefined();
    upgraded.close();
  });
});
