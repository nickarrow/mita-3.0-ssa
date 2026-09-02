import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
import {
  deleteAssessment,
  discardAssessment,
  editAssessment,
  finalizeAssessment,
  revertEdit,
  startAssessment,
  updateTags,
} from "../services/assessmentLifecycle";
import type { CapabilityAssessment } from "../types";

// Re-exported so components can keep importing the lifecycle operations from the
// hook they already use, while the implementations live in a testable service.
export {
  deleteAssessment,
  discardAssessment,
  editAssessment,
  finalizeAssessment,
  revertEdit,
  startAssessment,
  updateTags,
};

/**
 * Hook for managing capability assessments (v2.0 model)
 * Each capability is assessed independently as a standalone record
 */
export function useCapabilityAssessments() {
  // Get all capability assessments
  const assessments = useLiveQuery(
    () => db.capabilityAssessments.orderBy("updatedAt").reverse().toArray(),
    []
  );

  /**
   * Get the current assessment for a capability (finalized or in-progress)
   */
  const getAssessmentForCapability = async (
    capabilityCode: string
  ): Promise<CapabilityAssessment | undefined> => {
    // First check for in-progress
    const inProgress = await db.capabilityAssessments
      .where("capabilityCode")
      .equals(capabilityCode)
      .filter((a) => a.status === "in_progress")
      .first();

    if (inProgress) return inProgress;

    // Then check for finalized
    return db.capabilityAssessments
      .where("capabilityCode")
      .equals(capabilityCode)
      .filter((a) => a.status === "finalized")
      .first();
  };

  /**
   * Get assessment status for a capability
   */
  const getCapabilityStatus = (
    capabilityCode: string
  ): "not_assessed" | "in_progress" | "finalized" => {
    if (!assessments) return "not_assessed";

    const inProgress = assessments.find(
      (a) => a.capabilityCode === capabilityCode && a.status === "in_progress"
    );
    if (inProgress) return "in_progress";

    const finalized = assessments.find(
      (a) => a.capabilityCode === capabilityCode && a.status === "finalized"
    );
    if (finalized) return "finalized";

    return "not_assessed";
  };

  /**
   * Get the latest finalized assessment for a capability
   */
  const getLatestFinalized = (capabilityCode: string): CapabilityAssessment | undefined => {
    return assessments?.find(
      (a) => a.capabilityCode === capabilityCode && a.status === "finalized"
    );
  };

  /**
   * Get in-progress assessment for a capability
   */
  const getInProgress = (capabilityCode: string): CapabilityAssessment | undefined => {
    return assessments?.find(
      (a) => a.capabilityCode === capabilityCode && a.status === "in_progress"
    );
  };

  return {
    assessments: assessments || [],
    startAssessment,
    editAssessment,
    finalizeAssessment,
    updateTags,
    deleteAssessment,
    discardAssessment,
    revertEdit,
    getAssessmentForCapability,
    getCapabilityStatus,
    getLatestFinalized,
    getInProgress,
  };
}

/**
 * Hook for a single capability assessment
 */
export function useCapabilityAssessment(assessmentId: string | undefined) {
  // useLiveQuery returns undefined both while the query is in flight and when the
  // record genuinely doesn't exist. Wrapping the result lets callers tell those
  // apart, so a bad id can show an error instead of an endless "Loading...".
  const initial: { resolved: boolean; assessment: CapabilityAssessment | undefined } = {
    resolved: false,
    assessment: undefined,
  };
  const result = useLiveQuery(
    async () => {
      if (!assessmentId) return { resolved: true, assessment: undefined };
      const assessment = await db.capabilityAssessments.get(assessmentId);
      return { resolved: true, assessment };
    },
    [assessmentId],
    initial
  );

  return {
    assessment: result.assessment,
    /** True when the lookup completed and no such assessment exists. */
    notFound: result.resolved && result.assessment === undefined,
  };
}
