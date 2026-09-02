/**
 * Tests for the assessment lifecycle.
 *
 * The invariants here are the ones whose violation silently destroys user work, so
 * each test names the failure it guards against rather than just the happy path.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { getCapabilities } from "./blueprint";
import {
  discardAssessment,
  editAssessment,
  finalizeAssessment,
  revertEdit,
  startAssessment,
  updateTags,
} from "./assessmentLifecycle";
import {
  findDanglingAttachmentIds,
  findOrphanedAttachments,
  firstCapability,
  questionCountFor,
  resetDatabase,
  seedAttachment,
  seedFinalizedAssessment,
} from "../test/helpers";

beforeEach(resetDatabase);

describe("startAssessment", () => {
  it("creates one assessment for a capability", async () => {
    const id = await startAssessment(firstCapability().code);

    const rows = await db.capabilityAssessments.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.status).toBe("in_progress");
  });

  it("returns the existing assessment instead of creating a duplicate", async () => {
    // Double-clicking "Start" produced two in-progress rows for one capability,
    // after which the finalized one was permanently masked and Edit disappeared.
    const code = firstCapability().code;
    const [first, second] = await Promise.all([startAssessment(code), startAssessment(code)]);

    expect(await db.capabilityAssessments.count()).toBe(1);
    expect(first).toBe(second);
  });

  it("returns the finalized assessment rather than starting a parallel one", async () => {
    const existing = await seedFinalizedAssessment();
    expect(await startAssessment(firstCapability().code)).toBe(existing);
    expect(await db.capabilityAssessments.count()).toBe(1);
  });

  it("normalizes initial tags", async () => {
    const id = await startAssessment(firstCapability().code, ["Provider-Module", "#WAVE1"]);
    const row = await db.capabilityAssessments.get(id);
    expect(row!.tags).toEqual(["#provider-module", "#wave1"]);
  });

  it("rejects an unknown capability", async () => {
    await expect(startAssessment("ZZ_Not_Real")).rejects.toThrow(/not found/i);
  });
});

describe("editAssessment", () => {
  it("snapshots the result, clears the score, and converts answers to suggestions", async () => {
    const id = await seedFinalizedAssessment({ level: 3, tags: ["#wave1"] });

    await editAssessment(id);

    const row = await db.capabilityAssessments.get(id);
    expect(row!.status).toBe("in_progress");
    // The stored score no longer describes the row once every level is nulled.
    expect(row!.score).toBeUndefined();
    expect(row!.finalizedAt).toBeUndefined();
    expect(row!.editSnapshotId).toBeDefined();

    const history = await db.assessmentHistory.toArray();
    expect(history).toHaveLength(1);
    expect(history[0]!.score).toBe(3);
    expect(history[0]!.id).toBe(row!.editSnapshotId);

    const ratings = await db.ratings.where("capabilityAssessmentId").equals(id).toArray();
    expect(ratings.every((r) => r.level === null)).toBe(true);
    expect(ratings.every((r) => r.previousLevel === 3)).toBe(true);
    expect(ratings.every((r) => r.carriedForward)).toBe(true);
  });

  it("records the absence of a score rather than inventing one", async () => {
    // A 0 here would render as "0.0", enter the averages on a 1-5 scale, and be
    // rejected by this app's own import validator on the way back in.
    const id = await seedFinalizedAssessment();
    await db.capabilityAssessments
      .where("id")
      .equals(id)
      .modify((row) => {
        delete row.score;
      });

    await editAssessment(id);

    expect((await db.assessmentHistory.toArray())[0]!.score).toBeNull();
  });

  it("does nothing to an assessment that is already in progress", async () => {
    const id = await startAssessment(firstCapability().code);
    await editAssessment(id);

    expect(await db.assessmentHistory.count()).toBe(0);
    expect((await db.capabilityAssessments.get(id))!.editSnapshotId).toBeUndefined();
  });
});

describe("revertEdit", () => {
  it("restores levels, notes, score, status and tags from the snapshot", async () => {
    const id = await seedFinalizedAssessment({
      level: 4,
      tags: ["#wave1"],
      notesOnFirst: "original rationale",
    });
    await editAssessment(id);

    // Simulate a partial re-assessment before discarding it.
    const ratings = await db.ratings
      .where("capabilityAssessmentId")
      .equals(id)
      .sortBy("questionIndex");
    await db.ratings.update(ratings[0]!.id, { level: 1, notes: "session scribble" });

    await revertEdit(id);

    const row = await db.capabilityAssessments.get(id);
    expect(row!.status).toBe("finalized");
    expect(row!.score).toBe(4);
    expect(row!.tags).toEqual(["#wave1"]);
    expect(row!.editSnapshotId).toBeUndefined();

    const restored = await db.ratings
      .where("capabilityAssessmentId")
      .equals(id)
      .sortBy("questionIndex");
    expect(restored.every((r) => r.level === 4)).toBe(true);
    expect(restored[0]!.notes).toBe("original rationale");

    // The snapshot is consumed, not left behind as a duplicate of the current state.
    expect(await db.assessmentHistory.count()).toBe(0);
  });

  it("keeps rating identity so attachments are never orphaned", async () => {
    // Recreating ratings with fresh ids stranded every uploaded file: the blob
    // stayed in the database with no rating to reach it from and no UI path to it.
    const id = await seedFinalizedAssessment();
    await seedAttachment(id, 0, "before-edit.txt");
    await editAssessment(id);
    await seedAttachment(id, 1, "during-edit.txt");

    const idsBefore = (await db.ratings.where("capabilityAssessmentId").equals(id).toArray())
      .map((r) => r.id)
      .sort();

    await revertEdit(id);

    const idsAfter = (await db.ratings.where("capabilityAssessmentId").equals(id).toArray())
      .map((r) => r.id)
      .sort();

    expect(idsAfter).toEqual(idsBefore);
    expect(await findOrphanedAttachments()).toEqual([]);
    expect(await findDanglingAttachmentIds()).toEqual([]);
    expect(await db.attachments.count()).toBe(2);
  });

  it("is repeatable without accumulating state", async () => {
    const id = await seedFinalizedAssessment({ level: 2 });

    for (let round = 0; round < 2; round += 1) {
      await editAssessment(id);
      await revertEdit(id);

      const row = await db.capabilityAssessments.get(id);
      expect(row!.status).toBe("finalized");
      expect(row!.score).toBe(2);
      expect(await db.assessmentHistory.count()).toBe(0);
    }
  });

  it("restores from its own snapshot, not merely the newest one", async () => {
    // An imported snapshot with a later date used to win, so reverting restored
    // unrelated data and destroyed that imported record.
    const id = await seedFinalizedAssessment({ level: 2 });
    await editAssessment(id);
    const ownSnapshot = (await db.capabilityAssessments.get(id))!.editSnapshotId;

    await db.assessmentHistory.add({
      id: "imported-later",
      capabilityCode: firstCapability().code,
      snapshotDate: new Date("2099-01-01T00:00:00.000Z"),
      tags: ["#imported"],
      score: 5,
      ratings: [{ questionIndex: 0, level: 5, notes: "", attachmentIds: [] }],
      blueprintVersion: "3.0",
    });

    await revertEdit(id);

    const row = await db.capabilityAssessments.get(id);
    expect(row!.score).toBe(2);
    expect(row!.tags).not.toContain("#imported");
    // The unrelated entry survives; only this edit's own snapshot was consumed.
    expect(await db.assessmentHistory.get("imported-later")).toBeDefined();
    expect(await db.assessmentHistory.get(ownSnapshot!)).toBeUndefined();
  });
});

describe("discardAssessment", () => {
  it("removes the assessment, its ratings and its attachments", async () => {
    const id = await startAssessment(firstCapability().code);
    await db.ratings.add({
      id: "r1",
      capabilityAssessmentId: id,
      questionIndex: 0,
      level: 3,
      notes: "",
      carriedForward: false,
      attachmentIds: [],
      updatedAt: new Date(),
    });
    await seedAttachment(id, 0);

    await discardAssessment(id);

    expect(await db.capabilityAssessments.count()).toBe(0);
    expect(await db.ratings.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
  });

  it("leaves unrelated history for the same capability untouched", async () => {
    // The destructive pairing: a fresh assessment on a capability that happens to
    // have history must be discarded, never treated as an edit to be reverted.
    const code = firstCapability().code;
    await db.assessmentHistory.add({
      id: "pre-existing",
      capabilityCode: code,
      snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
      tags: [],
      score: 2,
      ratings: [{ questionIndex: 0, level: 2, notes: "", attachmentIds: [] }],
      blueprintVersion: "3.0",
    });

    const id = await startAssessment(code);
    expect((await db.capabilityAssessments.get(id))!.editSnapshotId).toBeUndefined();

    await discardAssessment(id);

    expect(await db.capabilityAssessments.count()).toBe(0);
    expect(await db.assessmentHistory.get("pre-existing")).toBeDefined();
  });
});

describe("finalizeAssessment", () => {
  it("stores the mean of the answered levels, rounded to one decimal", async () => {
    const code = firstCapability().code;
    const total = questionCountFor(code);
    const id = await startAssessment(code);

    // One level 5, the rest level 3.
    for (let index = 0; index < total; index += 1) {
      await db.ratings.add({
        id: `r${index}`,
        capabilityAssessmentId: id,
        questionIndex: index,
        level: index === 0 ? 5 : 3,
        notes: "",
        carriedForward: false,
        attachmentIds: [],
        updatedAt: new Date(),
      });
    }

    await finalizeAssessment(id);

    const expected = Math.round(((5 + 3 * (total - 1)) / total) * 10) / 10;
    const row = await db.capabilityAssessments.get(id);
    expect(row!.status).toBe("finalized");
    expect(row!.score).toBe(expected);
    expect(row!.finalizedAt).toBeInstanceOf(Date);
  });

  it("clears the edit pointer so the snapshot is no longer the previous result", async () => {
    const id = await seedFinalizedAssessment();
    await editAssessment(id);

    const ratings = await db.ratings.where("capabilityAssessmentId").equals(id).toArray();
    await Promise.all(ratings.map((r) => db.ratings.update(r.id, { level: 5 })));

    await finalizeAssessment(id);

    const row = await db.capabilityAssessments.get(id);
    expect(row!.editSnapshotId).toBeUndefined();
    expect(row!.score).toBe(5);
    // The snapshot itself is retained as history.
    expect(await db.assessmentHistory.count()).toBe(1);
  });

  it("archives a superseded finalized assessment without leaving unreachable files", async () => {
    // Two rows for one capability, which imported data can produce. Finalizing the
    // second archives and deletes the first, including its attachment blobs — the
    // history snapshot must not claim files that no longer exist.
    const capability = firstCapability();
    const superseded = await seedFinalizedAssessment({ level: 2 });
    await seedAttachment(superseded, 0, "old-evidence.txt");

    const replacementId = "replacement-assessment";
    const now = new Date();
    await db.capabilityAssessments.add({
      id: replacementId,
      capabilityCode: capability.code,
      businessArea: capability.businessArea,
      processName: capability.processName,
      status: "in_progress",
      tags: [],
      blueprintVersion: "3.0",
      createdAt: now,
      updatedAt: now,
    });
    await db.ratings.add({
      id: "replacement-rating",
      capabilityAssessmentId: replacementId,
      questionIndex: 0,
      level: 5,
      notes: "",
      carriedForward: false,
      attachmentIds: [],
      updatedAt: now,
    });

    await finalizeAssessment(replacementId);

    // The superseded row and its blob are gone, and a snapshot took its place.
    expect(await db.capabilityAssessments.get(superseded)).toBeUndefined();
    expect(await db.capabilityAssessments.count()).toBe(1);
    expect(await db.attachments.count()).toBe(0);

    const history = await db.assessmentHistory.toArray();
    expect(history).toHaveLength(1);
    expect(history[0]!.score).toBe(2);
    // No snapshot rating may reference a deleted blob.
    expect(history[0]!.ratings.every((r) => r.attachmentIds.length === 0)).toBe(true);

    expect(await findOrphanedAttachments()).toEqual([]);
    expect(await findDanglingAttachmentIds()).toEqual([]);
  });

  it("leaves no score when nothing was answered", async () => {
    const id = await startAssessment(firstCapability().code);
    await finalizeAssessment(id);
    expect((await db.capabilityAssessments.get(id))!.score).toBeUndefined();
  });
});

describe("updateTags", () => {
  it("normalizes tags on write", async () => {
    const id = await startAssessment(firstCapability().code);
    await updateTags(id, ["#WAVE1", "provider-module", "not a tag!"]);

    expect((await db.capabilityAssessments.get(id))!.tags).toEqual(["#wave1", "#provider-module"]);
  });

  it("counts a tag once per assessment carrying it", async () => {
    const codes = getCapabilities()
      .slice(0, 3)
      .map((c) => c.code);
    for (const code of codes) {
      const id = await startAssessment(code);
      await updateTags(id, ["#shared"]);
    }

    const tag = await db.tags.where("name").equals("#shared").first();
    expect(tag!.usageCount).toBe(3);
  });

  it("decreases the count when a tag is removed", async () => {
    // Recomputing only the tags still present meant a removed tag kept its old
    // count and stayed pinned to the top of the suggestions permanently.
    const id = await startAssessment(firstCapability().code);
    await updateTags(id, ["#shared"]);
    expect((await db.tags.where("name").equals("#shared").first())!.usageCount).toBe(1);

    await updateTags(id, []);

    expect((await db.tags.where("name").equals("#shared").first())!.usageCount).toBe(0);
  });

  it("does not inflate the count when the same tags are saved repeatedly", async () => {
    const id = await startAssessment(firstCapability().code);
    for (let i = 0; i < 5; i += 1) await updateTags(id, ["#wave1"]);

    expect((await db.tags.where("name").equals("#wave1").first())!.usageCount).toBe(1);
  });
});
