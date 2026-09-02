import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
import { getCapabilityByCode, getCapabilities } from "../services/blueprint";
import type { CapabilityAssessment } from "../types";

export interface CapabilityScoreData {
  capabilityCode: string;
  score: number | null;
  assessmentId: string | null;
  assessmentDate: Date | null;
  tags: string[];
  status: "not_assessed" | "in_progress" | "finalized";
  questionProgress: number; // 0-100 percentage of questions answered
  /**
   * Score from the previous finalized result, when a capability is currently
   * being re-assessed. Without this the dashboard would show "—" for a
   * capability that has a perfectly good prior result, making an in-flight edit
   * look like the assessment was lost.
   */
  previousScore: number | null;
  /** True when this in-progress assessment is a re-assessment of a prior result. */
  isReassessment: boolean;
}

/**
 * Hook for accessing maturity scores (v2.0)
 * Simplified since each capability now has its own assessment record
 */
export function useScores() {
  const scoreData = useLiveQuery(async () => {
    // Get all capability assessments
    const assessments = await db.capabilityAssessments.toArray();

    // Get all ratings for progress calculation
    const allRatings = await db.ratings.toArray();
    const ratingsByAssessment = new Map<string, number>();
    for (const rating of allRatings) {
      if (rating.level !== null) {
        const count = ratingsByAssessment.get(rating.capabilityAssessmentId) || 0;
        ratingsByAssessment.set(rating.capabilityAssessmentId, count + 1);
      }
    }

    // History snapshots, keyed by id. Only used to resolve an assessment's own
    // `editSnapshotId` — see the comment where previousScore is set.
    const history = await db.assessmentHistory.toArray();
    const historyById = new Map(history.map((h) => [h.id, h]));

    // Build a map of capability code -> score data
    // For each capability, we want the finalized assessment (if exists)
    // or the in-progress one (for status display)
    const capabilityScores = new Map<string, CapabilityScoreData>();

    // Group by capability code
    const byCapability = new Map<string, CapabilityAssessment[]>();
    for (const assessment of assessments) {
      const existing = byCapability.get(assessment.capabilityCode) || [];
      existing.push(assessment);
      byCapability.set(assessment.capabilityCode, existing);
    }

    // For each capability, determine the score data
    for (const [capabilityCode, capAssessments] of byCapability) {
      // Prefer finalized, then in-progress
      const finalized = capAssessments.find((a) => a.status === "finalized");
      const inProgress = capAssessments.find((a) => a.status === "in_progress");

      // Get total questions for this capability. An unknown capability code (a
      // retired code, or one from a different blueprint version via import) has no
      // question count; report 0 progress rather than dividing by a fake 1, which
      // would render values like 1100%.
      const capability = getCapabilityByCode(capabilityCode);
      const totalQuestions = capability?.bcm.maturity_model.capability_questions.length ?? 0;
      const progressFor = (assessmentId: string) => {
        if (totalQuestions === 0) return 0;
        const answeredCount = ratingsByAssessment.get(assessmentId) || 0;
        return Math.round((Math.min(answeredCount, totalQuestions) / totalQuestions) * 100);
      };

      if (finalized) {
        capabilityScores.set(capabilityCode, {
          capabilityCode,
          score: finalized.score ?? null,
          assessmentId: finalized.id,
          assessmentDate: finalized.finalizedAt || finalized.updatedAt,
          tags: finalized.tags,
          status: "finalized",
          questionProgress: progressFor(finalized.id),
          previousScore: null,
          isReassessment: false,
        });
      } else if (inProgress) {
        // A re-assessment keeps its prior result visible, resolved *only* through
        // this assessment's own `editSnapshotId`.
        //
        // Resolving by "newest snapshot for this capability" instead treated any
        // leftover history as a previous result. Since deleting an assessment
        // leaves its history behind, a deleted score would reappear on the
        // dashboard and back inside the business-area and overall averages.
        const priorSnapshot = inProgress.editSnapshotId
          ? historyById.get(inProgress.editSnapshotId)
          : undefined;

        capabilityScores.set(capabilityCode, {
          capabilityCode,
          score: null, // In-progress doesn't have a finalized score of its own
          assessmentId: inProgress.id,
          assessmentDate: inProgress.updatedAt,
          // The row's own tags, always. `editAssessment` preserves them, so an
          // empty list means the user cleared it - falling back to the snapshot's
          // tags there made tag removal look like it hadn't saved.
          tags: inProgress.tags,
          status: "in_progress",
          questionProgress: progressFor(inProgress.id),
          previousScore: priorSnapshot?.score ?? null,
          isReassessment: Boolean(priorSnapshot),
        });
      }
    }

    return { capabilityScores };
  }, []);

  /**
   * Capability codes this build of the blueprint knows about.
   *
   * Imported data can reference codes from a different blueprint version. Those
   * capabilities are invisible in the UI, so including them in aggregates produces
   * numbers the user cannot account for. Every aggregate getter filters through
   * this; the per-capability getters do not, so a direct lookup still works.
   */
  const knownCapabilityCodes = useMemo(() => new Set(getCapabilities().map((c) => c.code)), []);

  /** Iterate only score data for capabilities present in the current blueprint. */
  const knownScoreData = (): CapabilityScoreData[] => {
    if (!scoreData) return [];
    return [...scoreData.capabilityScores.values()].filter((d) =>
      knownCapabilityCodes.has(d.capabilityCode)
    );
  };

  /**
   * The score a capability currently counts as in aggregates.
   *
   * A capability mid-re-assessment still counts at its previous result: that result
   * stands until the re-assessment is finalized, so an area score should not
   * collapse the moment someone opens an assessment to edit it.
   */
  const effectiveScore = (data: CapabilityScoreData | undefined): number | null =>
    data?.score ?? data?.previousScore ?? null;

  /**
   * Get score data for a specific capability
   */
  const getCapabilityScoreData = (capabilityCode: string): CapabilityScoreData | undefined => {
    return scoreData?.capabilityScores.get(capabilityCode);
  };

  /**
   * Get just the score for a capability (null if not finalized)
   */
  const getCapabilityScore = (capabilityCode: string): number | null => {
    return scoreData?.capabilityScores.get(capabilityCode)?.score ?? null;
  };

  /**
   * Get average score for a business area
   */
  const getBusinessAreaScore = (capabilityCodes: string[]): number | null => {
    if (!scoreData) return null;

    const scores: number[] = [];
    for (const code of capabilityCodes) {
      const effective = effectiveScore(scoreData.capabilityScores.get(code));
      if (effective !== null) {
        scores.push(effective);
      }
    }

    if (scores.length === 0) return null;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg * 10) / 10;
  };

  /**
   * Get status for a capability
   */
  const getCapabilityStatus = (
    capabilityCode: string
  ): "not_assessed" | "in_progress" | "finalized" => {
    return scoreData?.capabilityScores.get(capabilityCode)?.status ?? "not_assessed";
  };

  /**
   * Get question progress for a capability (0-100)
   */
  const getCapabilityProgress = (capabilityCode: string): number => {
    return scoreData?.capabilityScores.get(capabilityCode)?.questionProgress ?? 0;
  };

  /**
   * Tags on a capability's current assessment, whatever its status.
   *
   * Restricting this to finalized assessments made every tag disappear the moment
   * a capability was opened for editing, which also emptied the dashboard filter.
   */
  const getCapabilityTags = (capabilityCode: string): string[] => {
    return scoreData?.capabilityScores.get(capabilityCode)?.tags ?? [];
  };

  /** Every tag in use across capabilities visible in this blueprint. */
  const getAllTagsInUse = (): string[] => {
    const tagSet = new Set<string>();
    for (const data of knownScoreData()) {
      for (const tag of data.tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort();
  };

  /** Capabilities carrying a specific tag. */
  const getCapabilitiesByTag = (tag: string): string[] => {
    return knownScoreData()
      .filter((data) => data.tags.includes(tag))
      .map((data) => data.capabilityCode);
  };

  /**
   * Get assessment counts by status
   */
  const getStatusCounts = (): {
    total: number;
    finalized: number;
    inProgress: number;
    notAssessed: number;
  } => {
    const totalCapabilities = getCapabilities().length;

    if (!scoreData)
      return {
        total: totalCapabilities,
        finalized: 0,
        inProgress: 0,
        notAssessed: totalCapabilities,
      };

    let finalized = 0;
    let inProgress = 0;

    for (const data of knownScoreData()) {
      if (data.status === "finalized") finalized++;
      else if (data.status === "in_progress") inProgress++;
    }

    const notAssessed = Math.max(0, totalCapabilities - finalized - inProgress);
    return { total: totalCapabilities, finalized, inProgress, notAssessed };
  };

  /**
   * Get overall average score across all finalized assessments
   */
  const getOverallScore = (): number | null => {
    if (!scoreData) return null;

    const scores: number[] = [];
    for (const data of knownScoreData()) {
      const effective = effectiveScore(data);
      if (effective !== null) {
        scores.push(effective);
      }
    }

    if (scores.length === 0) return null;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg * 10) / 10;
  };

  return {
    capabilityScores: scoreData?.capabilityScores ?? new Map(),
    getCapabilityScoreData,
    getCapabilityScore,
    getBusinessAreaScore,
    getCapabilityStatus,
    getCapabilityProgress,
    getCapabilityTags,
    getAllTagsInUse,
    getCapabilitiesByTag,
    getStatusCounts,
    getOverallScore,
  };
}
