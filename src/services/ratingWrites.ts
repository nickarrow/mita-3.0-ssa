/**
 * Rating persistence.
 *
 * Plain async functions over Dexie, with no React dependency, so they can be
 * tested directly. `useRatings` wraps them with the assessment id already bound.
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "./db";
import type { Rating } from "../types";

/**
 * Upsert a rating, writing only the fields explicitly provided.
 *
 * Field-scoped writes are the whole point. The level control and the notes field
 * save independently and can fire in either order — clicking a level blurs the
 * notes textarea, so both writes land at once. If either path also wrote the
 * *other* field it would overwrite it with whatever value it captured at render
 * time, silently discarding what the user had just typed. Pass only what changed.
 *
 * Wrapped in a transaction so concurrent calls cannot both miss the existing row
 * and insert duplicates.
 *
 * Returns the rating id, which the attachment flow needs.
 */
export async function upsertRating(
  capabilityAssessmentId: string,
  questionIndex: number,
  changes: { level?: 1 | 2 | 3 | 4 | 5 | null; notes?: string }
): Promise<string | undefined> {
  const now = new Date();
  let ratingId: string | undefined;

  await db.transaction("rw", [db.ratings, db.capabilityAssessments], async () => {
    const existing = await db.ratings
      .where("[capabilityAssessmentId+questionIndex]")
      .equals([capabilityAssessmentId, questionIndex])
      .first();

    if (existing) {
      const update: Partial<Rating> = { updatedAt: now };
      if (changes.level !== undefined) {
        update.level = changes.level;
        // Confirming a level resolves the carry-forward suggestion. Editing notes
        // alone must not, or the "Previously: Level N" hint would disappear before
        // the user has actually re-confirmed the rating.
        update.carriedForward = false;
      }
      if (changes.notes !== undefined) {
        update.notes = changes.notes;
      }
      await db.ratings.update(existing.id, update);
      ratingId = existing.id;
    } else {
      ratingId = uuidv4();
      const rating: Rating = {
        id: ratingId,
        capabilityAssessmentId,
        questionIndex,
        level: changes.level ?? null,
        notes: changes.notes ?? "",
        carriedForward: false,
        attachmentIds: [],
        updatedAt: now,
      };
      await db.ratings.add(rating);
    }

    await db.capabilityAssessments.update(capabilityAssessmentId, { updatedAt: now });
  });

  return ratingId;
}

/** Set the maturity level for a question, leaving notes untouched. */
export function setRatingLevel(
  capabilityAssessmentId: string,
  questionIndex: number,
  level: 1 | 2 | 3 | 4 | 5 | null
): Promise<string | undefined> {
  return upsertRating(capabilityAssessmentId, questionIndex, { level });
}

/** Set the notes for a question, leaving the selected level untouched. */
export function setRatingNotes(
  capabilityAssessmentId: string,
  questionIndex: number,
  notes: string
): Promise<string | undefined> {
  return upsertRating(capabilityAssessmentId, questionIndex, { notes });
}

/**
 * Ensure a rating row exists for a question without changing its values.
 * Used when attaching a file to an otherwise untouched question.
 */
export function ensureRating(
  capabilityAssessmentId: string,
  questionIndex: number
): Promise<string | undefined> {
  return upsertRating(capabilityAssessmentId, questionIndex, {});
}

/** How many questions have a confirmed level. */
export async function countAnswered(capabilityAssessmentId: string): Promise<number> {
  const ratings = await db.ratings
    .where("capabilityAssessmentId")
    .equals(capabilityAssessmentId)
    .toArray();
  return ratings.filter((r) => r.level !== null).length;
}
