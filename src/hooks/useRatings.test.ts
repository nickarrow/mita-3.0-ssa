/**
 * Tests for rating persistence.
 *
 * The reason `useRatings` writes field-scoped updates is that the level control and
 * the notes field save independently and can fire in either order. These tests pin
 * that behaviour: they are the regression guard for notes being silently destroyed
 * by clicking a rating.
 *
 * `upsertRating` is exported separately from the hook so it can be exercised
 * without rendering a component — it touches only Dexie.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../services/db";
import {
  setRatingLevel,
  setRatingNotes,
  ensureRating,
  countAnswered,
} from "../services/ratingWrites";
import { firstCapability, resetDatabase } from "../test/helpers";
import { startAssessment } from "../services/assessmentLifecycle";

let assessmentId: string;

beforeEach(async () => {
  await resetDatabase();
  assessmentId = await startAssessment(firstCapability().code);
});

const readRating = (questionIndex: number) =>
  db.ratings
    .where("[capabilityAssessmentId+questionIndex]")
    .equals([assessmentId, questionIndex])
    .first();

describe("field-scoped writes", () => {
  it("stores a level with no notes", async () => {
    await setRatingLevel(assessmentId, 0, 4);

    const rating = await readRating(0);
    expect(rating!.level).toBe(4);
    expect(rating!.notes).toBe("");
  });

  it("stores notes with no level", async () => {
    await setRatingNotes(assessmentId, 0, "rationale");

    const rating = await readRating(0);
    expect(rating!.level).toBeNull();
    expect(rating!.notes).toBe("rationale");
  });

  it("keeps notes when a level is written afterwards", async () => {
    // The original defect: the level write carried a stale notes value captured at
    // render time and overwrote whatever had just been typed.
    await setRatingNotes(assessmentId, 0, "must survive");
    await setRatingLevel(assessmentId, 0, 5);

    const rating = await readRating(0);
    expect(rating!.level).toBe(5);
    expect(rating!.notes).toBe("must survive");
  });

  it("keeps the level when notes are written afterwards", async () => {
    await setRatingLevel(assessmentId, 0, 2);
    await setRatingNotes(assessmentId, 0, "added later");

    const rating = await readRating(0);
    expect(rating!.level).toBe(2);
    expect(rating!.notes).toBe("added later");
  });

  it("preserves both fields under interleaved writes in either order", async () => {
    await Promise.all([
      setRatingNotes(assessmentId, 0, "concurrent notes"),
      setRatingLevel(assessmentId, 0, 3),
    ]);

    const rating = await readRating(0);
    expect(rating!.level).toBe(3);
    expect(rating!.notes).toBe("concurrent notes");
  });

  it("creates exactly one row per question however many times it is written", async () => {
    await setRatingLevel(assessmentId, 0, 1);
    await setRatingLevel(assessmentId, 0, 2);
    await setRatingNotes(assessmentId, 0, "a");
    await setRatingNotes(assessmentId, 0, "b");

    expect(await db.ratings.where("capabilityAssessmentId").equals(assessmentId).count()).toBe(1);
    const rating = await readRating(0);
    expect(rating!.level).toBe(2);
    expect(rating!.notes).toBe("b");
  });

  it("creates one row per question under concurrent writes to different questions", async () => {
    await Promise.all([
      setRatingLevel(assessmentId, 0, 1),
      setRatingLevel(assessmentId, 1, 2),
      setRatingLevel(assessmentId, 2, 3),
    ]);

    expect(await db.ratings.where("capabilityAssessmentId").equals(assessmentId).count()).toBe(3);
  });
});

describe("carry-forward suggestions", () => {
  it("clears the suggestion flag when a level is confirmed", async () => {
    await setRatingLevel(assessmentId, 0, 3);
    const rating = await readRating(0);
    await db.ratings.update(rating!.id, {
      level: null,
      previousLevel: 3,
      carriedForward: true,
    });

    await setRatingLevel(assessmentId, 0, 4);

    const updated = await readRating(0);
    expect(updated!.level).toBe(4);
    expect(updated!.carriedForward).toBe(false);
  });

  it("keeps the suggestion flag when only notes change", async () => {
    // Editing notes is not confirming a rating, so the "Previously: Level N" hint
    // must survive it.
    await setRatingLevel(assessmentId, 0, 3);
    const rating = await readRating(0);
    await db.ratings.update(rating!.id, {
      level: null,
      previousLevel: 3,
      carriedForward: true,
    });

    await setRatingNotes(assessmentId, 0, "still deciding");

    const updated = await readRating(0);
    expect(updated!.carriedForward).toBe(true);
    expect(updated!.previousLevel).toBe(3);
    expect(updated!.level).toBeNull();
  });
});

describe("ensureRating", () => {
  it("creates an empty row without asserting an answer", async () => {
    const ratingId = await ensureRating(assessmentId, 4);

    const rating = await readRating(4);
    expect(rating!.id).toBe(ratingId);
    expect(rating!.level).toBeNull();
    expect(rating!.notes).toBe("");
  });

  it("returns the existing row and changes nothing", async () => {
    await setRatingLevel(assessmentId, 0, 5);
    await setRatingNotes(assessmentId, 0, "keep me");

    await ensureRating(assessmentId, 0);

    const rating = await readRating(0);
    expect(rating!.level).toBe(5);
    expect(rating!.notes).toBe("keep me");
  });
});

describe("assessment timestamp", () => {
  it("advances updatedAt on every write", async () => {
    const before = (await db.capabilityAssessments.get(assessmentId))!.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));

    await setRatingLevel(assessmentId, 0, 3);

    const after = (await db.capabilityAssessments.get(assessmentId))!.updatedAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("countAnswered", () => {
  it("counts only questions with a level", async () => {
    await setRatingLevel(assessmentId, 0, 3);
    await setRatingNotes(assessmentId, 1, "notes only");
    await ensureRating(assessmentId, 2);

    expect(await countAnswered(assessmentId)).toBe(1);
  });
});
