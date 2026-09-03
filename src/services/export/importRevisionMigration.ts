/**
 * Bring an imported payload's question indices up to the current blueprint revision.
 *
 * The Dexie upgrade covers data already in the browser. This covers the other way
 * stale indices arrive: a backup file, imported long after that upgrade ran. Nothing
 * about an old index is malformed — it is a small non-negative integer, in range for
 * the capability — so the validator accepts it and the merge writes answers onto the
 * wrong questions.
 *
 * Shares `resolveRecordRevision`, `pendingShiftsFor` and `migrateQuestionIndex` with
 * the Dexie upgrade, so the two paths cannot disagree about what the correction is or
 * how a sequence of boundaries composes.
 *
 * Runs after validation and before the merge, so everything downstream deals only in
 * current-revision indices.
 */

import { BLUEPRINT_REVISION } from "../../constants/blueprint";
import {
  isKnownRevision,
  migrateQuestionIndex,
  pendingShiftsFor,
  resolveRecordRevision,
} from "../blueprintRevision";
import type { ExportData } from "./types";

export interface PayloadMigrationResult {
  warnings: string[];
  /**
   * True when every record was left in a coordinate system this build understands,
   * so the merge may stamp the current revision on what it writes.
   *
   * False when any record declared a revision this build cannot place. Its indices
   * were not touched, so claiming they are current would mark data as needing no
   * migration when nobody has verified that — and the stamp is the only thing that
   * would ever prompt a re-examination.
   */
  allRecordsResolved: boolean;
}

/**
 * Rewrite `data` in place so every question index refers to the current extraction.
 *
 * In place because the payload is already a validated, freshly-built object owned by
 * the caller, and copying it would mean holding two copies of an entire assessment
 * history.
 */
export function migrateImportPayload(data: ExportData): PayloadMigrationResult {
  const warnings: string[] = [];
  const fileRevision = data.blueprintRevision;
  let allRecordsResolved = true;

  // Counted per capability code so a capability is named once, not once as a process
  // name (from its assessment) and again as a code (from its history), which read as
  // twice as many affected capabilities as there were.
  const movedByCapability = new Map<string, number>();
  const droppedByCapability = new Map<string, number>();
  const labels = new Map<string, string>();
  const bump = (map: Map<string, number>, code: string) => map.set(code, (map.get(code) ?? 0) + 1);

  for (const assessment of data.data.assessments) {
    labels.set(assessment.capabilityCode, assessment.processName);
  }

  // Ratings are a flat list, so group them by the capability they belong to before
  // applying a per-capability shift.
  const ratingsByAssessment = new Map<string, typeof data.data.ratings>();
  for (const rating of data.data.ratings) {
    const list = ratingsByAssessment.get(rating.capabilityAssessmentId) ?? [];
    list.push(rating);
    ratingsByAssessment.set(rating.capabilityAssessmentId, list);
  }

  const unresolvedRevisions = new Set<string>();

  for (const assessment of data.data.assessments) {
    const revision = resolveRecordRevision(assessment.blueprintRevision, fileRevision);

    if (!isKnownRevision(revision)) {
      // Written against an extraction we have no migration table for, so its indices
      // are in a coordinate system we cannot reason about. Import as-is and say so;
      // guessing would move them further from correct, not closer.
      allRecordsResolved = false;
      unresolvedRevisions.add(String(revision));
      continue;
    }

    const shifts = pendingShiftsFor(revision);
    const ratings = ratingsByAssessment.get(assessment.id) ?? [];
    const surviving: typeof ratings = [];

    for (const rating of ratings) {
      const next = migrateQuestionIndex(assessment.capabilityCode, rating.questionIndex, shifts);
      if (next === null) {
        bump(droppedByCapability, assessment.capabilityCode);
        continue;
      }
      if (next !== rating.questionIndex) bump(movedByCapability, assessment.capabilityCode);
      rating.questionIndex = next;
      surviving.push(rating);
    }

    ratingsByAssessment.set(assessment.id, surviving);
    assessment.blueprintRevision = BLUEPRINT_REVISION;
  }

  // Rebuild the flat list from the surviving per-assessment lists, preserving the
  // original ordering of assessments. Ratings whose assessment was not resolvable are
  // dropped by validation before this runs, so nothing is silently lost here.
  data.data.ratings = data.data.assessments.flatMap(
    (assessment) => ratingsByAssessment.get(assessment.id) ?? []
  );

  for (const entry of data.data.history) {
    const revision = resolveRecordRevision(entry.blueprintRevision, fileRevision);

    if (!isKnownRevision(revision)) {
      allRecordsResolved = false;
      unresolvedRevisions.add(String(revision));
      continue;
    }

    const shifts = pendingShiftsFor(revision);
    const surviving: typeof entry.ratings = [];
    for (const rating of entry.ratings) {
      const next = migrateQuestionIndex(entry.capabilityCode, rating.questionIndex, shifts);
      if (next === null) {
        bump(droppedByCapability, entry.capabilityCode);
        continue;
      }
      if (next !== rating.questionIndex) bump(movedByCapability, entry.capabilityCode);
      surviving.push({ ...rating, questionIndex: next });
    }
    entry.ratings = surviving;
    entry.blueprintRevision = BLUEPRINT_REVISION;
  }

  if (unresolvedRevisions.size > 0) {
    warnings.push(
      `This backup was created against a newer version of the MITA blueprint ` +
        `(${[...unresolvedRevisions].join(", ")}). Its answers were imported as-is; if ` +
        `any questions have moved since, some answers may be attached to the wrong ` +
        `question.`
    );
  }

  const nameFor = (code: string) => labels.get(code) ?? code;
  for (const [code, count] of movedByCapability) {
    warnings.push(
      `${nameFor(code)}: ${count} answer(s) were re-aligned because questions in this ` +
        `capability moved when the MITA blueprint was corrected.`
    );
  }
  for (const [code, count] of droppedByCapability) {
    warnings.push(
      `${nameFor(code)}: ${count} answer(s) were not imported because the question they ` +
        `answered no longer exists in the MITA blueprint.`
    );
  }

  return { warnings, allRecordsResolved };
}
