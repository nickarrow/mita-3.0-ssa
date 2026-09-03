/**
 * Tests for the v7 schema upgrade: question-index remapping.
 *
 * This rewrites primary user data — the answers someone gave — so it gets the same
 * treatment as the v6 test: build a real database by hand, run the upgrade, and inspect
 * what actually landed. `fake-indexeddb` is a real IndexedDB, so Dexie's version
 * transition runs unmodified.
 *
 * Unlike the v6 test, this imports `migrateToRevision` from `db.ts` rather than
 * reimplementing it. A copied body meant the code that runs in a user's browser had no
 * coverage at all, and a divergence between the copy and the original would pass.
 */

import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { BLUEPRINT_REVISION } from "../constants/blueprint";
import { migrateToRevision } from "./db";
import { INDEX_SHIFTS_2026_09_02, type CapabilityIndexShift } from "./blueprintRevision";

const DB_NAME = "MitaSSADatabase_v7_upgrade_test";

const STORES = {
  capabilityAssessments: "id, capabilityCode, status, updatedAt",
  ratings: "id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]",
  assessmentHistory: "id, capabilityCode, snapshotDate",
  tags: "id, name, usageCount, lastUsed",
  attachments: "id, capabilityAssessmentId, ratingId, uploadedAt",
};

/** Open at v7, wiring the shipped upgrade exactly as `db.ts` does. */
function openAtV7(
  shifts: Readonly<Record<string, CapabilityIndexShift>> = INDEX_SHIFTS_2026_09_02,
  toRevision: string = BLUEPRINT_REVISION
): Dexie {
  const db = new Dexie(DB_NAME);
  db.version(6).stores(STORES);
  db.version(7)
    .stores(STORES)
    .upgrade((tx) => migrateToRevision(tx, toRevision, shifts));
  return db;
}

interface SeedOptions {
  capabilityCode: string;
  /** Question indices to answer, in the *old* coordinate system. */
  answeredIndices: number[];
  historyIndices?: number[];
  /** Set to simulate a row that has already been migrated. */
  blueprintRevision?: string;
  /** Attach a file to the rating at this old index. */
  attachmentOnIndex?: number;
}

async function seedV6({
  capabilityCode,
  answeredIndices,
  historyIndices,
  blueprintRevision,
  attachmentOnIndex,
}: SeedOptions): Promise<void> {
  const db = new Dexie(DB_NAME);
  db.version(6).stores(STORES);
  await db.open();

  await db.table("capabilityAssessments").add({
    id: "assessment-1",
    capabilityCode,
    businessArea: "Test Area",
    processName: capabilityCode,
    status: "finalized",
    tags: [],
    blueprintVersion: "3.0",
    ...(blueprintRevision ? { blueprintRevision } : {}),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    finalizedAt: new Date("2026-01-02T00:00:00.000Z"),
    score: 3,
  });

  for (const index of answeredIndices) {
    await db.table("ratings").add({
      id: `rating-${index}`,
      capabilityAssessmentId: "assessment-1",
      questionIndex: index,
      // Level encodes the index so a mis-mapping is visible, not just a count change.
      level: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      notes: `note-for-old-q${index}`,
      carriedForward: false,
      attachmentIds: [],
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
  }

  if (attachmentOnIndex !== undefined) {
    await db.table("attachments").add({
      id: "attachment-1",
      capabilityAssessmentId: "assessment-1",
      ratingId: `rating-${attachmentOnIndex}`,
      fileName: "evidence.txt",
      fileType: "text/plain",
      fileSize: 4,
      blob: new Blob(["hi"]),
      uploadedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    await db
      .table("ratings")
      .update(`rating-${attachmentOnIndex}`, { attachmentIds: ["attachment-1"] });
  }

  if (historyIndices) {
    await db.table("assessmentHistory").add({
      id: "history-1",
      capabilityCode,
      snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
      tags: [],
      score: 3,
      ...(blueprintRevision ? { blueprintRevision } : {}),
      ratings: historyIndices.map((index) => ({
        questionIndex: index,
        level: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
        notes: `history-note-old-q${index}`,
        attachmentIds: [],
      })),
      blueprintVersion: "3.0",
    });
  }

  db.close();
}

async function readAfterUpgrade(
  shifts?: Readonly<Record<string, CapabilityIndexShift>>,
  toRevision?: string
) {
  const db = openAtV7(shifts, toRevision);
  await db.open();
  const assessment = await db.table("capabilityAssessments").get("assessment-1");
  const ratings = await db.table("ratings").toArray();
  const history = await db.table("assessmentHistory").get("history-1");
  const attachments = await db.table("attachments").toArray();
  db.close();
  return {
    assessment,
    ratings: ratings.sort(
      (a: { questionIndex: number }, b: { questionIndex: number }) =>
        a.questionIndex - b.questionIndex
    ),
    history,
    attachments,
  };
}

beforeEach(async () => {
  await Dexie.delete(DB_NAME);
});

describe("v7 upgrade: PE_Prepare_REOMB (question restored at index 2)", () => {
  it("shifts answers below the restored question and keeps their notes with them", async () => {
    await seedV6({ capabilityCode: "PE_Prepare_REOMB", answeredIndices: [0, 1, 2, 3, 9] });

    const { ratings } = await readAfterUpgrade();

    // Each note names the old index it was written against, so this asserts the answer
    // moved *with* its content rather than a slot merely being occupied.
    expect(ratings.map((r) => [r.questionIndex, r.notes])).toEqual([
      [0, "note-for-old-q0"],
      [1, "note-for-old-q1"],
      [3, "note-for-old-q2"],
      [4, "note-for-old-q3"],
      [10, "note-for-old-q9"],
    ]);
  });

  it("leaves the restored question unanswered", async () => {
    await seedV6({
      capabilityCode: "PE_Prepare_REOMB",
      answeredIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    const { ratings } = await readAfterUpgrade();

    expect(ratings).toHaveLength(10);
    expect(ratings.some((r) => r.questionIndex === 2)).toBe(false);
  });

  it("migrates history snapshots too", async () => {
    await seedV6({
      capabilityCode: "PE_Prepare_REOMB",
      answeredIndices: [],
      historyIndices: [0, 2, 9],
    });

    const { history } = await readAfterUpgrade();

    expect(
      history.ratings.map((r: { questionIndex: number; notes: string }) => [
        r.questionIndex,
        r.notes,
      ])
    ).toEqual([
      [0, "history-note-old-q0"],
      [3, "history-note-old-q2"],
      [10, "history-note-old-q9"],
    ]);
  });
});

describe("v7 upgrade: EE_Enroll_Provider (question removed at index 12)", () => {
  it("drops the answer to the question that belonged elsewhere", async () => {
    await seedV6({ capabilityCode: "EE_Enroll_Provider", answeredIndices: [0, 11, 12] });

    const { ratings } = await readAfterUpgrade();

    expect(ratings.map((r) => r.questionIndex)).toEqual([0, 11]);
    expect(ratings.some((r) => r.notes === "note-for-old-q12")).toBe(false);
  });

  it("drops it from history as well", async () => {
    await seedV6({
      capabilityCode: "EE_Enroll_Provider",
      answeredIndices: [],
      historyIndices: [11, 12],
    });

    const { history } = await readAfterUpgrade();

    expect(history.ratings.map((r: { questionIndex: number }) => r.questionIndex)).toEqual([11]);
  });

  it("deletes the attachment belonging to the removed question", async () => {
    // Leaving it behind stranded a blob whose ratingId pointed at a deleted row:
    // unreachable in the UI, still exported, and reported on re-import as a file that
    // could not be matched to a question.
    await seedV6({
      capabilityCode: "EE_Enroll_Provider",
      answeredIndices: [0, 12],
      attachmentOnIndex: 12,
    });

    const { attachments } = await readAfterUpgrade();

    expect(attachments).toHaveLength(0);
  });

  it("keeps an attachment whose question survived", async () => {
    await seedV6({
      capabilityCode: "EE_Enroll_Provider",
      answeredIndices: [0, 11, 12],
      attachmentOnIndex: 11,
    });

    const { attachments, ratings } = await readAfterUpgrade();

    expect(attachments).toHaveLength(1);
    expect(attachments[0].ratingId).toBe("rating-11");
    expect(ratings.find((r) => r.id === "rating-11")).toBeDefined();
  });
});

describe("v7 upgrade: CO_Perform_Contractor_Outreach (never-extracted question at 9)", () => {
  it("steps answers over the newly present question", async () => {
    await seedV6({
      capabilityCode: "CO_Perform_Contractor_Outreach",
      answeredIndices: [8, 9, 10],
    });

    const { ratings } = await readAfterUpgrade();

    expect(ratings.map((r) => [r.questionIndex, r.notes])).toEqual([
      [8, "note-for-old-q8"],
      [10, "note-for-old-q9"],
      [11, "note-for-old-q10"],
    ]);
  });
});

describe("v7 upgrade: general behaviour", () => {
  it("leaves untouched capabilities exactly as they were", async () => {
    await seedV6({
      capabilityCode: "CM_Establish_Case",
      answeredIndices: [0, 1, 2, 9],
      historyIndices: [0, 9],
    });

    const { ratings, history } = await readAfterUpgrade();

    expect(ratings.map((r) => [r.questionIndex, r.notes])).toEqual([
      [0, "note-for-old-q0"],
      [1, "note-for-old-q1"],
      [2, "note-for-old-q2"],
      [9, "note-for-old-q9"],
    ]);
    expect(history.ratings.map((r: { questionIndex: number }) => r.questionIndex)).toEqual([0, 9]);
  });

  it("stamps the revision so the migration is not reapplied", async () => {
    await seedV6({
      capabilityCode: "PE_Prepare_REOMB",
      answeredIndices: [2],
      historyIndices: [2],
    });

    const { assessment, history } = await readAfterUpgrade();

    expect(assessment.blueprintRevision).toBe(BLUEPRINT_REVISION);
    expect(history.blueprintRevision).toBe(BLUEPRINT_REVISION);
  });

  it("skips rows already stamped at the target revision", async () => {
    // The shifts are not idempotent: re-applying an insert moves answers a second time
    // and can delete a real answer. A row that already claims the target revision is
    // left alone even if the upgrade somehow runs again.
    await seedV6({
      capabilityCode: "PE_Prepare_REOMB",
      // New-coordinate indices, as a migrated row would hold.
      answeredIndices: [0, 1, 3, 10],
      historyIndices: [0, 3, 10],
      blueprintRevision: BLUEPRINT_REVISION,
    });

    const { ratings, history } = await readAfterUpgrade();

    expect(ratings.map((r) => r.questionIndex)).toEqual([0, 1, 3, 10]);
    expect(history.ratings.map((r: { questionIndex: number }) => r.questionIndex)).toEqual([
      0, 3, 10,
    ]);
  });

  it("is idempotent across a second open at the same version", async () => {
    await seedV6({ capabilityCode: "PE_Prepare_REOMB", answeredIndices: [2, 9] });

    const first = await readAfterUpgrade();
    const second = await readAfterUpgrade();

    expect(second.ratings.map((r) => r.questionIndex)).toEqual(
      first.ratings.map((r) => r.questionIndex)
    );
    expect(second.ratings.map((r) => r.questionIndex)).toEqual([3, 10]);
  });

  it("never leaves two answers on one question", async () => {
    // The compound index is not unique, so a bad write order would produce duplicates
    // rather than an error. Exercised on a full set, where every answer below the
    // insert point has to move up by one.
    await seedV6({
      capabilityCode: "PE_Prepare_REOMB",
      answeredIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    const { ratings } = await readAfterUpgrade();
    const indices = ratings.map((r) => r.questionIndex);

    expect(new Set(indices).size).toBe(indices.length);
  });

  it("preserves rating identity, so attachment links stay valid", async () => {
    await seedV6({ capabilityCode: "PE_Prepare_REOMB", answeredIndices: [2] });

    const { ratings } = await readAfterUpgrade();

    expect(ratings[0].id).toBe("rating-2");
    expect(ratings[0].questionIndex).toBe(3);
  });

  it("handles a mid-list removal without colliding", async () => {
    // No shipped shift removes from the middle — the one removal is at the last index,
    // which generates no moves at all. A mid-list removal moves answers *down*, the
    // opposite direction, so the write ordering has to handle both.
    const midRemoval: Record<string, CapabilityIndexShift> = {
      CM_Establish_Case: {
        oldQuestionCount: 10,
        newQuestionCount: 9,
        insertedAt: [],
        removedAt: [5],
        reason: "synthetic mid-list removal",
      },
    };
    await seedV6({
      capabilityCode: "CM_Establish_Case",
      answeredIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    const { ratings } = await readAfterUpgrade(midRemoval, "synthetic");
    const indices = ratings.map((r) => r.questionIndex);

    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(indices).size).toBe(indices.length);
    // Old q6..q9 shifted down into 5..8; old q5 is gone.
    expect(ratings.map((r) => r.notes)).toEqual([
      "note-for-old-q0",
      "note-for-old-q1",
      "note-for-old-q2",
      "note-for-old-q3",
      "note-for-old-q4",
      "note-for-old-q6",
      "note-for-old-q7",
      "note-for-old-q8",
      "note-for-old-q9",
    ]);
  });

  it("is safe on an empty database", async () => {
    const db = new Dexie(DB_NAME);
    db.version(6).stores(STORES);
    await db.open();
    db.close();

    const upgraded = openAtV7();
    await expect(upgraded.open()).resolves.toBeDefined();
    upgraded.close();
  });
});
