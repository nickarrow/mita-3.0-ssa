/**
 * Tests for the ZIP import path and attachment restore.
 *
 * This path had no coverage at all, which is how the duplication below survived: the
 * JSON merge is idempotent and well tested, so re-importing a backup *looked* safe,
 * while the attachment restore — which runs after the merge, outside its transaction —
 * stored another copy of every blob each time.
 *
 * These go through the real `exportAsZip`/`importFromZip` pair rather than fixtures, so
 * the filename encoding that links an archive entry back to its question is exercised
 * in both directions.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { exportAsZip } from "./exportService";
import { importFromZip } from "./importService";
import {
  findDanglingAttachmentIds,
  findOrphanedAttachments,
  resetDatabase,
  seedAttachment,
  seedFinalizedAssessment,
} from "../../test/helpers";

beforeEach(resetDatabase);

/** A full-scope ZIP of whatever is currently in the database. */
function backup(): Promise<Blob> {
  return exportAsZip({ scope: "full", format: "zip", stateName: "Testland" });
}

async function attachmentSummary() {
  const rows = await db.attachments.toArray();
  return rows.map((a) => `${a.fileName}:${a.fileSize}`).sort();
}

describe("ZIP round-trip", () => {
  it("restores an attachment onto the question it came from", async () => {
    const assessmentId = await seedFinalizedAssessment({ level: 4 });
    await seedAttachment(assessmentId, 2, "evidence-q3.txt");
    const zip = await backup();

    // Wipe and restore, the actual recovery scenario.
    await resetDatabase();
    const result = await importFromZip(zip);

    expect(result.success).toBe(true);
    expect(result.attachmentsRestored).toBe(1);

    const [attachment] = await db.attachments.toArray();
    const rating = await db.ratings.get(attachment.ratingId);
    expect(attachment.fileName).toBe("evidence-q3.txt");
    expect(rating?.questionIndex).toBe(2);
    expect(rating?.attachmentIds).toContain(attachment.id);
  });

  it("leaves no orphaned blobs or dangling links", async () => {
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "a.txt");
    await seedAttachment(assessmentId, 1, "b.txt");
    const zip = await backup();

    await resetDatabase();
    await importFromZip(zip);

    expect(await findOrphanedAttachments()).toEqual([]);
    expect(await findDanglingAttachmentIds()).toEqual([]);
  });

  it("preserves the stored blob contents", async () => {
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "evidence.txt");
    const zip = await backup();

    await resetDatabase();
    await importFromZip(zip);

    const [attachment] = await db.attachments.toArray();
    expect(await attachment.blob.text()).toBe("evidence data");
  });
});

describe("re-importing the same ZIP", () => {
  it("does not store a second copy of every file", async () => {
    // The regression: each re-import added another full set of blobs and appended
    // another id to `rating.attachmentIds`, so recovering from a backup twice silently
    // doubled storage use with no way to tell the copies apart or remove them.
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "a.txt");
    await seedAttachment(assessmentId, 1, "b.txt");
    const zip = await backup();

    const before = await attachmentSummary();
    await importFromZip(zip);
    const afterFirst = await attachmentSummary();
    await importFromZip(zip);
    const afterSecond = await attachmentSummary();

    expect(afterFirst).toEqual(before);
    expect(afterSecond).toEqual(before);
    expect(await db.attachments.count()).toBe(2);
  });

  it("does not append duplicate ids to the rating", async () => {
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "a.txt");
    const zip = await backup();

    await importFromZip(zip);
    await importFromZip(zip);

    // Filtered in memory: `attachmentIds` is an array field and is not indexed.
    const all = await db.ratings.toArray();
    const ratings = all.filter((r) => r.attachmentIds.length > 0);
    expect(ratings).toHaveLength(1);
    for (const rating of ratings) {
      expect(new Set(rating.attachmentIds).size).toBe(rating.attachmentIds.length);
      expect(rating.attachmentIds).toHaveLength(1);
    }
    expect(await findDanglingAttachmentIds()).toEqual([]);
  });

  it("says the files were already attached rather than staying silent", async () => {
    // Re-importing a backup is a normal recovery action; silence here reads as "the
    // files were lost".
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "a.txt");
    const zip = await backup();

    await importFromZip(zip);
    const second = await importFromZip(zip);

    expect(second.attachmentsRestored).toBe(0);
    expect(second.warnings.some((w) => /already attached/i.test(w))).toBe(true);
  });

  it("still restores a file that is genuinely missing", async () => {
    // Dedupe must not become "skip everything on a second run": a file deleted since
    // the backup should come back.
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "a.txt");
    await seedAttachment(assessmentId, 1, "b.txt");
    const zip = await backup();

    await importFromZip(zip);
    // Simulate the user deleting one file after the backup was taken.
    const toDelete = (await db.attachments.toArray()).find((a) => a.fileName === "b.txt")!;
    const owner = await db.ratings.get(toDelete.ratingId);
    await db.attachments.delete(toDelete.id);
    await db.ratings.update(toDelete.ratingId, {
      attachmentIds: (owner?.attachmentIds ?? []).filter((id) => id !== toDelete.id),
    });

    const result = await importFromZip(zip);

    expect(result.attachmentsRestored).toBe(1);
    expect(await attachmentSummary()).toEqual(["a.txt:12", "b.txt:12"]);
  });

  it("treats same-name files on different questions as distinct", async () => {
    // Dedupe is scoped to the target rating, not global: the same document can legitimately
    // be evidence for more than one question.
    const assessmentId = await seedFinalizedAssessment();
    await seedAttachment(assessmentId, 0, "shared.txt");
    await seedAttachment(assessmentId, 1, "shared.txt");
    const zip = await backup();

    await importFromZip(zip);

    expect(await db.attachments.count()).toBe(2);
  });
});

describe("malformed archives", () => {
  it("rejects something that is not a ZIP", async () => {
    const result = await importFromZip(new Blob(["not a zip at all"]));

    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/could not be opened as a ZIP/i);
  });

  it("rejects a ZIP with no data.json", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("readme.txt", "nothing useful here");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await importFromZip(blob);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/not a MITA assessment backup/i);
  });

  it("writes nothing when the archive is unreadable", async () => {
    await seedFinalizedAssessment();
    const before = await db.capabilityAssessments.count();

    await importFromZip(new Blob(["garbage"]));

    expect(await db.capabilityAssessments.count()).toBe(before);
  });
});
