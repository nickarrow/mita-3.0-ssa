/**
 * Question-index migration between blueprint extractions.
 *
 * A `Rating` identifies its question by `questionIndex`, a position in the
 * capability's `capability_questions` array. There is no question id, so the array
 * order is effectively part of the schema: if upstream inserts or removes a
 * question, every stored answer below that point now describes a different
 * question, and nothing in the data says so. The answers still render, still
 * count toward progress, and are simply wrong.
 *
 * The 2026-09-02 sync did exactly that to four capabilities. Every change was
 * content recovery against the source PDFs, not an editorial rewrite:
 *
 * | Capability                     | Change | Cause                                    |
 * |--------------------------------|--------|------------------------------------------|
 * | PE_Prepare_REOMB               | 10->11 | Two questions merged across a page break |
 * | PM_Perform_Provider_Outreach   | 11->12 | Same defect, pages 34-35                 |
 * | CO_Perform_Contractor_Outreach | 11->12 | A question was never extracted at all    |
 * | EE_Enroll_Provider             | 13->12 | Had absorbed a Disenroll Provider question |
 *
 * No question was reworded in place anywhere in the corpus, which is what makes a
 * positional remap sound rather than guesswork: all 816 unchanged question slots
 * kept their exact text, and every difference is either whitespace cleanup or a
 * shift caused by one of the edits below.
 *
 * Migrations are expressed as the *edit* upstream made, not as a precomputed
 * lookup table, because the edit is what can be checked against the upstream
 * changelog. The mapping is derived from it.
 */

import { BLUEPRINT_REVISION, PRE_REVISION } from "../constants/blueprint";

/**
 * One capability's shape change between two extractions.
 *
 * Positions are expressed in the coordinate system they are natural in:
 * `insertedAt` in *new* indices (where the new questions landed), `removedAt` in
 * *old* indices (which old questions ceased to exist). Mixing the two up is the
 * obvious way to get this wrong, so they are named for it.
 */
export interface CapabilityIndexShift {
  /** Question count in the previous extraction. Guards against silent drift. */
  oldQuestionCount: number;
  /** Question count in this extraction. */
  newQuestionCount: number;
  /** New-extraction indices that did not exist before. */
  insertedAt: readonly number[];
  /** Old-extraction indices that no longer exist. Answers here are dropped. */
  removedAt: readonly number[];
  /** Why, for the reader looking at a migration and wondering if it is right. */
  reason: string;
}

/** The shape changes introduced by the revision named in `BLUEPRINT_REVISION`. */
export const INDEX_SHIFTS_2026_09_02: Readonly<Record<string, CapabilityIndexShift>> = {
  PE_Prepare_REOMB: {
    oldQuestionCount: 10,
    newQuestionCount: 11,
    insertedAt: [2],
    removedAt: [],
    reason:
      "The standards question and the sampling-algorithm question were extracted as " +
      "one merged cell across a page break. Splitting them restored the sampling " +
      "question at index 2, shifting everything below it down one.",
  },
  PM_Perform_Provider_Outreach: {
    oldQuestionCount: 11,
    newQuestionCount: 12,
    insertedAt: [10],
    removedAt: [],
    reason:
      "The efficiency and accuracy questions were merged across pages 34-35. The " +
      "recovered accuracy question lands at index 10. The old merged answer is kept " +
      "at index 9, the efficiency question, whose text led the merged cell.",
  },
  CO_Perform_Contractor_Outreach: {
    oldQuestionCount: 11,
    newQuestionCount: 12,
    insertedAt: [9],
    removedAt: [],
    reason:
      "An entire question and all five of its maturity levels ('Effort to Perform; " +
      "Efficiency', source page 25) were never extracted. It is new at index 9, so " +
      "it is left unanswered rather than inheriting a neighbour's rating.",
  },
  EE_Enroll_Provider: {
    oldQuestionCount: 13,
    newQuestionCount: 12,
    insertedAt: [],
    removedAt: [12],
    reason:
      "Index 12 was a question belonging to Disenroll Provider, absorbed from a " +
      "shared page. It never described this capability, so its answer is dropped " +
      "rather than preserved.",
  },
};

/** A revision boundary and the shape changes it introduced. */
export interface BlueprintRevisionMigration {
  /** Revision this migration brings data *up to*. */
  to: string;
  shifts: Readonly<Record<string, CapabilityIndexShift>>;
}

/**
 * Every revision boundary, oldest first.
 *
 * Data is migrated by applying each entry whose `to` it has not yet reached, in
 * order. One entry today; the list is what keeps a second sync from having to
 * rediscover how the first one worked.
 *
 * `to` must be a **literal**, never `BLUEPRINT_REVISION`. Referencing the constant
 * makes the boundary's identity move when the constant does: after the next bump,
 * this entry would claim the new revision's name, so a row already stamped
 * `2026-09-02` would match no boundary, be treated as pre-revision, and have these
 * shifts applied a second time — moving every answer below an insert point again and
 * deleting a real answer. `ASSERT_REVISION_MATCHES_LAST_BOUNDARY` below ties the two
 * together without coupling them.
 */
export const REVISION_MIGRATIONS: readonly BlueprintRevisionMigration[] = [
  { to: "2026-09-02", shifts: INDEX_SHIFTS_2026_09_02 },
];

/**
 * Tie `BLUEPRINT_REVISION` to the newest boundary, at module load.
 *
 * Bumping the constant without appending a boundary (or vice versa) leaves data
 * stamped with a revision no migration can reach, and `pendingShiftsFor` would then
 * report "nothing pending" for data that needs migrating. Failing loudly at import is
 * better than discovering it from a user's corrupted ratings; a test also asserts it,
 * but a test only fails if someone runs it.
 */
const NEWEST_BOUNDARY = REVISION_MIGRATIONS[REVISION_MIGRATIONS.length - 1]?.to;
if (NEWEST_BOUNDARY !== BLUEPRINT_REVISION) {
  throw new Error(
    `Blueprint revision mismatch: BLUEPRINT_REVISION is "${BLUEPRINT_REVISION}" but the ` +
      `newest entry in REVISION_MIGRATIONS is "${NEWEST_BOUNDARY}". Bumping the revision ` +
      `requires appending a migration boundary describing what moved.`
  );
}

/**
 * Which extraction a record was written against.
 *
 * A single resolver because validation and migration must agree. They did not:
 * bounds-checking used the per-record revision alone while the migration used
 * per-record-then-file, so a payload whose file said "current" and whose records
 * said nothing was validated in old coordinates and then never migrated — storing
 * answers on the wrong questions with no warning at all.
 *
 * Per-record wins so a file assembled from mixed sources still migrates each record
 * by its own provenance; the file-level value is the fallback.
 */
export function resolveRecordRevision(
  recordRevision: string | undefined,
  fileRevision: string | undefined
): string | undefined {
  return recordRevision ?? fileRevision;
}

/**
 * Map an old question index to its new position, or `null` if the question no
 * longer exists.
 *
 * Walks the old indices in order, stepping over positions that are new in this
 * extraction. Deriving the mapping this way rather than storing it means the
 * declared edit and the applied mapping cannot disagree.
 *
 * Indices at or beyond `oldQuestionCount` return `null`. Such a row should not exist —
 * validation bounds imported indices against the question count for the extraction they
 * were written in — but passing one through unchanged would leave an answer pointing
 * past the end of the question list, where nothing renders it and nothing can remove it.
 */
export function mapQuestionIndex(shift: CapabilityIndexShift, oldIndex: number): number | null {
  if (!Number.isInteger(oldIndex) || oldIndex < 0) return null;
  if (oldIndex >= shift.oldQuestionCount) return null;
  if (shift.removedAt.includes(oldIndex)) return null;

  const inserted = new Set(shift.insertedAt);
  let newIndex = 0;
  for (let old = 0; old <= oldIndex; old++) {
    if (shift.removedAt.includes(old)) continue;
    while (inserted.has(newIndex)) newIndex++;
    if (old === oldIndex) return newIndex;
    newIndex++;
  }
  return null;
}

/**
 * Shape changes that apply when moving data from `fromRevision` to current.
 *
 * `undefined`/absent is treated as pre-revision data: rows written before the app
 * tracked revisions are, by definition, on the old extraction.
 *
 * Shifts from multiple boundaries are composed per capability rather than merged,
 * so callers apply them in sequence.
 */
export function pendingShiftsFor(
  fromRevision: string | undefined
): readonly Readonly<Record<string, CapabilityIndexShift>>[] {
  if (fromRevision === BLUEPRINT_REVISION) return [];

  // Absent or explicitly pre-revision both mean "before every boundary". Absence is
  // what older builds actually wrote; PRE_REVISION lets a payload say it outright
  // rather than relying on a missing field.
  if (fromRevision === undefined || fromRevision === PRE_REVISION) {
    return REVISION_MIGRATIONS.map((migration) => migration.shifts);
  }

  const boundaryIndex = REVISION_MIGRATIONS.findIndex((migration) => migration.to === fromRevision);

  // A revision this build cannot place — a newer build's export, or a corrupted
  // value — gets no shifts at all.
  //
  // This previously fell through to "apply everything", on the reasoning that
  // migrating unknown data beat leaving it stale. That was wrong, and reachable:
  // `questionCountAtRevision` would then report a *pre-revision* question count for
  // a future-dated file, so validation bounded an index against 13 questions where
  // the capability has 12, admitted it, and the migration — which does check
  // `isKnownRevision` — declined to touch it. The result was a stored answer past the
  // end of the question list, invisible in the UI but counted toward progress and
  // averaged into the finalized score.
  //
  // Returning nothing keeps every consumer in the current coordinate system, which is
  // the only one they can reason about. Callers report the situation via
  // `isKnownRevision`.
  if (boundaryIndex === -1) return [];

  return REVISION_MIGRATIONS.slice(boundaryIndex + 1).map((migration) => migration.shifts);
}

/** True when `revision` names a boundary this build knows how to migrate from. */
export function isKnownRevision(revision: string | undefined): boolean {
  return (
    revision === undefined ||
    revision === PRE_REVISION ||
    REVISION_MIGRATIONS.some((migration) => migration.to === revision)
  );
}

/**
 * Question count a capability had at `revision`, in that revision's own coordinates.
 *
 * Needed because bounds-checking an imported answer against the *current* question
 * count is checking it in the wrong coordinate system. EE_Enroll_Provider went from
 * 13 questions to 12, so a legitimate pre-revision answer to question 13 looks
 * out-of-range and is discarded before the migration that knows what to do with it
 * ever runs. Today that happens to reach the same outcome, but a future revision
 * that both removes and reorders would lose data that should have moved.
 *
 * Returns `null` when no shift applies, meaning the current count governs.
 */
export function questionCountAtRevision(
  capabilityCode: string,
  revision: string | undefined
): number | null {
  for (const shifts of pendingShiftsFor(revision)) {
    const shift = shifts[capabilityCode];
    // The first pending boundary is the oldest, so its `oldQuestionCount` is the
    // count in the coordinate system the data was written in.
    if (shift) return shift.oldQuestionCount;
  }
  return null;
}

/**
 * Carry one question index across every pending boundary for a capability.
 *
 * The single place a sequence of boundaries is composed. Both migration paths — the
 * Dexie upgrade and the import rewrite — go through this, so they cannot disagree
 * about the result. They previously each open-coded the loop, and did compose
 * differently: one re-read its rows per boundary, the other mapped repeatedly over a
 * stale in-memory copy, so a second boundary would have discarded the first's work.
 *
 * Returns `null` when the question ceased to exist at any boundary.
 */
export function migrateQuestionIndex(
  capabilityCode: string,
  questionIndex: number,
  shiftsByBoundary: readonly Readonly<Record<string, CapabilityIndexShift>>[]
): number | null {
  let index: number | null = questionIndex;
  for (const shifts of shiftsByBoundary) {
    const shift = shifts[capabilityCode];
    if (!shift) continue;
    if (index === null) return null;
    index = mapQuestionIndex(shift, index);
  }
  return index;
}

/**
 * Apply pending boundaries to a list of items carrying a question index.
 *
 * Returns the surviving items with indices rewritten and the ones whose question no
 * longer exists. Order is preserved; callers needing question order sort the result.
 */
export function remapQuestionIndices<T extends { questionIndex: number }>(
  items: readonly T[],
  capabilityCode: string,
  shiftsByBoundary: readonly Readonly<Record<string, CapabilityIndexShift>>[]
): { remapped: T[]; dropped: T[] } {
  const remapped: T[] = [];
  const dropped: T[] = [];
  for (const item of items) {
    const next = migrateQuestionIndex(capabilityCode, item.questionIndex, shiftsByBoundary);
    if (next === null) {
      dropped.push(item);
    } else {
      remapped.push({ ...item, questionIndex: next });
    }
  }
  return { remapped, dropped };
}
