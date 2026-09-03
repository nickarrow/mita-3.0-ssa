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
   * Answered ratings that refer to a question that actually exists.
   *
   * A rating identifies its question by array position, and a row whose index is at or
   * beyond the question count is unreachable: no card renders it, so it cannot be seen,
   * changed or deleted through the UI. Counting it anyway let an invisible answer
   * satisfy the completeness gate and enter the finalized score — a published result
   * partly composed of an answer the user could not look at.
   *
   * Clamping alone did not cover this. `Math.min(answered, total)` prevents a figure
   * above 100% but still lets an unreachable row substitute for a real unanswered one.
   *
   * `totalQuestions` is optional because two call sites have no reason to know it; when
   * omitted, no range filter is applied.
   */
  const answeredInRange = (totalQuestions?: number): Rating[] => {
    if (!ratings) return [];
    return ratings.filter(
      (r) => r.level !== null && (totalQuestions === undefined || r.questionIndex < totalQuestions)
    );
  };

  /**
   * Progress as a percentage of questions answered, clamped to 0-100.
   *
   * Clamped as well as range-filtered: the compound index on ratings is not declared
   * unique, so two answers on one question is representable and would otherwise report
   * more than 100%. `useScores.progressFor` applies the same two rules.
   */
  const getProgress = (totalQuestions: number): number => {
    if (!ratings || totalQuestions === 0) return 0;
    const answered = answeredInRange(totalQuestions).length;
    return Math.round((Math.min(answered, totalQuestions) / totalQuestions) * 100);
  };

  /**
   * Get count of answered questions. Pass `totalQuestions` to exclude rows pointing
   * past the end of the question list.
   */
  const getAnsweredCount = (totalQuestions?: number): number => {
    return answeredInRange(totalQuestions).length;
  };

  /**
   * Check if all questions are answered
   */
  const isComplete = (totalQuestions: number): boolean => {
    return getAnsweredCount(totalQuestions) >= totalQuestions;
  };

  /**
   * Calculate average score. Pass `totalQuestions` to exclude unreachable rows.
   */
  const getAverageScore = (totalQuestions?: number): number | null => {
    const answered = answeredInRange(totalQuestions);
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
