import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
import * as writes from "../services/ratingWrites";
import type { Rating } from "../types";

/**
 * Hook for managing ratings within a capability assessment (v2.0)
 */
export function useRatings(capabilityAssessmentId: string | undefined) {
  const ratings = useLiveQuery(
    () =>
      capabilityAssessmentId
        ? db.ratings.where("capabilityAssessmentId").equals(capabilityAssessmentId).toArray()
        : [],
    [capabilityAssessmentId]
  );

  // The write implementations live in services/ratingWrites so they can be tested
  // without rendering a component. Bound here to this hook's assessment id.
  const setRatingLevel = (questionIndex: number, level: 1 | 2 | 3 | 4 | 5 | null) =>
    capabilityAssessmentId
      ? writes.setRatingLevel(capabilityAssessmentId, questionIndex, level)
      : Promise.resolve(undefined);

  const setRatingNotes = (questionIndex: number, notes: string) =>
    capabilityAssessmentId
      ? writes.setRatingNotes(capabilityAssessmentId, questionIndex, notes)
      : Promise.resolve(undefined);

  const ensureRating = (questionIndex: number) =>
    capabilityAssessmentId
      ? writes.ensureRating(capabilityAssessmentId, questionIndex)
      : Promise.resolve(undefined);

  /**
   * Get rating for a specific question
   */
  const getRating = (questionIndex: number): Rating | undefined => {
    return ratings?.find((r) => r.questionIndex === questionIndex);
  };

  /**
   * Progress as a percentage of questions answered, clamped to 0-100.
   *
   * Clamped because this drives the `progress < 100` gate on Finalize. The
   * compound index on ratings is not declared unique, so more answered rows than
   * questions is representable; without the clamp that would open the gate with
   * real questions still unanswered. `useScores.progressFor` clamps identically.
   */
  const getProgress = (totalQuestions: number): number => {
    if (!ratings || totalQuestions === 0) return 0;
    const answered = ratings.filter((r) => r.level !== null).length;
    return Math.round((Math.min(answered, totalQuestions) / totalQuestions) * 100);
  };

  /**
   * Get count of answered questions
   */
  const getAnsweredCount = (): number => {
    return ratings?.filter((r) => r.level !== null).length || 0;
  };

  /**
   * Check if all questions are answered
   */
  const isComplete = (totalQuestions: number): boolean => {
    return getAnsweredCount() >= totalQuestions;
  };

  /**
   * Calculate average score
   */
  const getAverageScore = (): number | null => {
    if (!ratings) return null;
    const answered = ratings.filter((r) => r.level !== null);
    if (answered.length === 0) return null;
    const sum = answered.reduce((acc, r) => acc + (r.level || 0), 0);
    return Math.round((sum / answered.length) * 10) / 10;
  };

  return {
    ratings: ratings || [],
    setRatingLevel,
    setRatingNotes,
    ensureRating,
    getRating,
    getProgress,
    getAnsweredCount,
    isComplete,
    getAverageScore,
  };
}
