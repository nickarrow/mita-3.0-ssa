/**
 * Tests for the import merge.
 *
 * Covers the merge decision matrix and, most importantly, atomicity: the previous
 * implementation wrote assessments and then threw, reporting failure while having
 * already committed — so a user who retried imported everything twice.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { getCapabilities } from "../blueprint";
import { importFromJson } from "./importService";
import { editAssessment, startAssessment } from "../assessmentLifecycle";
import {
  buildExportPayload,
  findDanglingAttachmentIds,
  findOrphanedAttachments,
  firstCapability,
  resetDatabase,
  seedAttachment,
  seedFinalizedAssessment,
} from "../../test/helpers";

beforeEach(resetDatabase);

/** Snapshot every table so a test can assert nothing changed. */
async function databaseFingerprint() {
  const [assessments, ratings, history, tags, attachments] = await Promise.all([
    db.capabilityAssessments.toArray(),
    db.ratings.toArray(),
    db.assessmentHistory.toArray(),
    db.tags.toArray(),
    db.attachments.toArray(),
  ]);
  return JSON.stringify({
    assessments: assessments.map((a) => ({ ...a })).sort((a, b) => a.id.localeCompare(b.id)),
    ratings: ratings.map((r) => ({ ...r })).sort((a, b) => a.id.localeCompare(b.id)),
    history: history.map((h) => ({ ...h })).sort((a, b) => a.id.localeCompare(b.id)),
    tags: tags.map((t) => t.name).sort(),
    attachments: attachments.map((a) => a.fileName).sort(),
  });
}

const importPayload = (payload: Record<string, unknown>) => importFromJson(JSON.stringify(payload));

describe("importFromJson — rejection", () => {
  it.each([
    ["invalid JSON", "{not json"],
    ["a bare string", '"hello"'],
    ["an unrelated object", '{"name":"my-package","version":"1.0.0"}'],
  ])("rejects %s and reports why", async (_label, json) => {
    const before = await databaseFingerprint();

    const result = await importFromJson(json);

    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).not.toBe("");
    expect(await databaseFingerprint()).toBe(before);
  });

  it("writes nothing when the version is unsupported", async () => {
    await seedFinalizedAssessment();
    const before = await databaseFingerprint();

    const result = await importPayload(buildExportPayload({ exportVersion: "2.0" }));

    expect(result.success).toBe(false);
    expect(await databaseFingerprint()).toBe(before);
  });

  it("never surfaces a raw exception message as user copy", async () => {
    const result = await importFromJson("{not json");
    expect(result.errors.join(" ")).not.toMatch(/JSON\.parse|Unexpected token|TypeError/);
  });
});

describe("importFromJson — merge matrix", () => {
  it("imports a capability that has no local assessment", async () => {
    const result = await importPayload(buildExportPayload());

    expect(result.success).toBe(true);
    expect(result.importedAsCurrent).toBe(1);
    expect(await db.capabilityAssessments.count()).toBe(1);
  });

  it("skips a file identical to the local assessment", async () => {
    await importPayload(buildExportPayload());
    const result = await importPayload(buildExportPayload());

    expect(result.skipped).toBe(1);
    expect(result.importedAsCurrent).toBe(0);
    expect(await db.capabilityAssessments.count()).toBe(1);
  });

  it("replaces an older local assessment and archives it", async () => {
    await importPayload(buildExportPayload({ assessments: [{ score: 2 }] }));

    const result = await importPayload(
      buildExportPayload({
        assessments: [{ score: 4, updatedAt: "2027-01-01T00:00:00.000Z" }],
      })
    );

    expect(result.importedAsCurrent).toBe(1);
    const row = (await db.capabilityAssessments.toArray())[0]!;
    expect(row.score).toBe(4);

    const history = await db.assessmentHistory.toArray();
    expect(history).toHaveLength(1);
    expect(history[0]!.score).toBe(2);
  });

  it("files an older finalized assessment as history and leaves the current one alone", async () => {
    await importPayload(
      buildExportPayload({ assessments: [{ score: 4, updatedAt: "2027-01-01T00:00:00.000Z" }] })
    );

    const result = await importPayload(
      buildExportPayload({
        assessments: [{ score: 2, updatedAt: "2020-01-01T00:00:00.000Z" }],
      })
    );

    expect(result.importedAsHistory).toBe(1);
    expect((await db.capabilityAssessments.toArray())[0]!.score).toBe(4);
    expect((await db.assessmentHistory.toArray())[0]!.score).toBe(2);
  });

  it("targets the finalized row when a capability also has one in progress", async () => {
    // `.first()` on the capabilityCode index returns an arbitrary row, so this used
    // to be able to update the in-progress one and leave two finalized rows behind.
    const finalizedId = await seedFinalizedAssessment({ level: 2 });
    await editAssessment(finalizedId);
    await db.capabilityAssessments.update(finalizedId, { status: "finalized", score: 2 });

    const capability = firstCapability();
    const inProgressId = "extra-in-progress";
    await db.capabilityAssessments.add({
      id: inProgressId,
      capabilityCode: capability.code,
      businessArea: capability.businessArea,
      processName: capability.processName,
      status: "in_progress",
      tags: [],
      blueprintVersion: "3.0",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await importPayload(
      buildExportPayload({
        assessments: [{ score: 5, updatedAt: "2027-01-01T00:00:00.000Z" }],
      })
    );

    const finalized = (await db.capabilityAssessments.toArray()).filter(
      (a) => a.status === "finalized"
    );
    expect(finalized).toHaveLength(1);
    expect(finalized[0]!.id).toBe(finalizedId);
    expect(finalized[0]!.score).toBe(5);
  });

  it("preserves rating identity so local attachments survive a merge", async () => {
    const id = await seedFinalizedAssessment({ level: 2 });
    await seedAttachment(id, 0, "local-evidence.txt");
    const ratingIdsBefore = (await db.ratings.toArray()).map((r) => r.id).sort();

    await importPayload(
      buildExportPayload({
        assessments: [{ score: 5, updatedAt: "2027-01-01T00:00:00.000Z" }],
        ratings: [{ level: 5 }],
      })
    );

    expect((await db.ratings.toArray()).map((r) => r.id).sort()).toEqual(ratingIdsBefore);
    expect(await findOrphanedAttachments()).toEqual([]);
    expect(await findDanglingAttachmentIds()).toEqual([]);
  });

  it("warns when a merge replaces more local answers than it supplies", async () => {
    await seedFinalizedAssessment({ level: 3 });

    const result = await importPayload(
      buildExportPayload({
        assessments: [{ score: 5, updatedAt: "2027-01-01T00:00:00.000Z" }],
        ratings: [{ level: 5 }],
      })
    );

    expect(result.warnings.join(" ")).toMatch(/replaced \d+ local answer/i);
  });
});

describe("importFromJson — atomicity", () => {
  it("commits nothing when a later stage fails", async () => {
    await seedFinalizedAssessment();
    await db.tags.add({
      id: "collide",
      name: "#existing",
      usageCount: 1,
      lastUsed: new Date(),
    });

    // Captured after all setup, so any difference is attributable to the import.
    const before = await databaseFingerprint();

    const secondCapability = getCapabilities()[1]!;
    const payload = buildExportPayload({
      assessments: [
        {
          id: "new-one",
          capabilityCode: secondCapability.code,
          processName: secondCapability.processName,
          businessArea: secondCapability.businessArea,
          updatedAt: "2027-01-01T00:00:00.000Z",
        },
      ],
      ratings: [{ capabilityAssessmentId: "new-one" }],
    });

    // Force a mid-transaction failure by making the history table reject a write.
    const original = db.assessmentHistory.add.bind(db.assessmentHistory);
    (payload.data as Record<string, unknown>).history = [
      {
        id: "h1",
        capabilityCode: secondCapability.code,
        snapshotDate: "2026-01-01T00:00:00.000Z",
        tags: [],
        score: 3,
        ratings: [{ questionIndex: 0, level: 3, notes: "", attachmentIds: [] }],
        blueprintVersion: "3.0",
      },
    ];
    db.assessmentHistory.add = (() => {
      throw Object.assign(new Error("forced"), { name: "ConstraintError" });
    }) as unknown as typeof db.assessmentHistory.add;

    try {
      const result = await importPayload(payload);

      expect(result.success).toBe(false);
      // The message must describe the constraint, not leak Dexie's wording.
      expect(result.errors.join(" ")).toMatch(/conflicts with data already stored/i);
      // Nothing was committed, so a retry cannot double-import.
      expect(await databaseFingerprint()).toBe(before);
    } finally {
      db.assessmentHistory.add = original;
    }
  });
});

describe("importFromJson — tag handling", () => {
  const tagEntry = (name: string, usageCount = 99) => ({
    id: "imported-tag",
    name,
    usageCount,
    lastUsed: "2026-01-01T00:00:00.000Z",
  });

  it("normalizes imported tag names so they cannot duplicate by case", async () => {
    await importPayload(
      buildExportPayload({ assessments: [{ tags: ["#provider"] }], tags: [tagEntry("#Provider")] })
    );

    expect((await db.tags.toArray()).map((t) => t.name)).toEqual(["#provider"]);
  });

  it("derives usage counts rather than trusting the file", async () => {
    await importPayload(
      buildExportPayload({
        assessments: [{ tags: ["#wave1"] }],
        tags: [tagEntry("#wave1", 999999)],
      })
    );

    const tag = (await db.tags.toArray()).find((t) => t.name === "#wave1");
    expect(tag!.usageCount).toBe(1);
  });

  it("does not fail the import when an imported tag id collides", async () => {
    await db.tags.add({
      id: "imported-tag",
      name: "#unrelated",
      usageCount: 1,
      lastUsed: new Date(),
    });

    const result = await importPayload(
      buildExportPayload({ assessments: [{ tags: ["#wave1"] }], tags: [tagEntry("#wave1")] })
    );

    expect(result.success).toBe(true);
  });
});

describe("importFromJson — reporting", () => {
  it("reports validation adjustments as warnings, not silent success", async () => {
    const result = await importPayload(
      buildExportPayload({ assessments: [{ score: 42 }], ratings: [{ level: 99 }] })
    );

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect((await db.capabilityAssessments.toArray())[0]!.score).toBeUndefined();
    expect((await db.ratings.toArray())[0]!.level).toBeNull();
  });

  it("imports a history-only file", async () => {
    const payload = buildExportPayload({
      history: [
        {
          id: "h-only",
          capabilityCode: firstCapability().code,
          snapshotDate: "2026-01-01T00:00:00.000Z",
          tags: [],
          score: 3,
          ratings: [{ questionIndex: 0, level: 3, notes: "", attachmentIds: [] }],
          blueprintVersion: "3.0",
        },
      ],
    });
    (payload.data as Record<string, unknown>).assessments = [];
    (payload.data as Record<string, unknown>).ratings = [];

    const result = await importPayload(payload);

    expect(result.success).toBe(true);
    expect(await db.assessmentHistory.count()).toBe(1);
  });

  it("does not resurrect an assessment that was deleted locally", async () => {
    // History survives assessment deletion by design; re-importing must not use it
    // to recreate the deleted assessment.
    const id = await startAssessment(firstCapability().code);
    await db.capabilityAssessments.delete(id);

    const payload = buildExportPayload();
    (payload.data as Record<string, unknown>).assessments = [];
    (payload.data as Record<string, unknown>).ratings = [];

    await importPayload(payload);

    expect(await db.capabilityAssessments.count()).toBe(0);
  });
});
