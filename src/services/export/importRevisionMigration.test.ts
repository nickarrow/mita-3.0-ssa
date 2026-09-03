/**
 * Tests for re-aligning an imported payload's question indices.
 *
 * The Dexie upgrade covers data already in the browser. This covers the other way
 * stale indices arrive: a backup file, imported long after that upgrade ran. Nothing
 * about an old index is malformed, so the validator passes it and the merge writes
 * answers onto the wrong questions. These tests go through the real import entry
 * point and read the database back, because the bug being prevented is entirely
 * about what ends up stored.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { importFromJson } from "./importService";
import { validateImportPayload } from "./importValidation";
import { migrateImportPayload } from "./importRevisionMigration";
import { BLUEPRINT_REVISION, PRE_REVISION } from "../../constants/blueprint";
import { EXPORT_VERSION } from "../../constants/export";
import { getCapabilityByCode } from "../blueprint";
import { resetDatabase } from "../../test/helpers";

beforeEach(resetDatabase);

/**
 * An export payload for a capability affected by the 2026-09-02 shifts, with
 * `answers` given in the *old* coordinate system.
 */
function payloadFor(
  capabilityCode: string,
  answers: number[],
  options?: { blueprintRevision?: string; history?: number[] }
): Record<string, unknown> {
  const capability = getCapabilityByCode(capabilityCode)!;
  const assessment: Record<string, unknown> = {
    id: "assessment-1",
    capabilityCode,
    businessArea: capability.businessArea,
    processName: capability.processName,
    status: "finalized",
    tags: [],
    blueprintVersion: "3.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    finalizedAt: "2026-01-02T00:00:00.000Z",
    score: 3,
  };
  if (options?.blueprintRevision) assessment.blueprintRevision = options.blueprintRevision;

  return {
    exportVersion: EXPORT_VERSION,
    exportDate: "2026-01-02T00:00:00.000Z",
    appVersion: "3.0",
    blueprintVersion: "3.0",
    ...(options?.blueprintRevision ? { blueprintRevision: options.blueprintRevision } : {}),
    scope: "full",
    data: {
      assessments: [assessment],
      ratings: answers.map((index) => ({
        id: `rating-${index}`,
        capabilityAssessmentId: "assessment-1",
        questionIndex: index,
        level: 3,
        // Names the old index, so a mis-mapping is visible in the content.
        notes: `old-q${index}`,
        carriedForward: false,
        attachmentIds: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      })),
      history: options?.history
        ? [
            {
              id: "history-1",
              capabilityCode,
              snapshotDate: "2026-01-01T00:00:00.000Z",
              tags: [],
              score: 3,
              ratings: options.history.map((index) => ({
                questionIndex: index,
                level: 3,
                notes: `hist-old-q${index}`,
                attachmentIds: [],
              })),
              blueprintVersion: "3.0",
            },
          ]
        : [],
      tags: [],
      attachments: [],
    },
    metadata: {
      totalAssessments: 1,
      totalRatings: answers.length,
      totalHistory: options?.history ? 1 : 0,
      totalAttachments: 0,
      businessAreas: [capability.businessArea],
      capabilities: [capabilityCode],
    },
  };
}

async function storedRatings() {
  const rows = await db.ratings.toArray();
  return rows
    .sort((a, b) => a.questionIndex - b.questionIndex)
    .map((r) => [r.questionIndex, r.notes] as const);
}

describe("importing a pre-revision file", () => {
  it("re-aligns answers for a capability whose questions moved", async () => {
    const result = await importFromJson(
      JSON.stringify(payloadFor("PE_Prepare_REOMB", [0, 1, 2, 9]))
    );

    expect(result.success).toBe(true);
    expect(await storedRatings()).toEqual([
      [0, "old-q0"],
      [1, "old-q1"],
      [3, "old-q2"],
      [10, "old-q9"],
    ]);
  });

  it("drops an answer whose question no longer exists", async () => {
    const result = await importFromJson(
      JSON.stringify(payloadFor("EE_Enroll_Provider", [0, 11, 12]))
    );

    expect(result.success).toBe(true);
    expect(await storedRatings()).toEqual([
      [0, "old-q0"],
      [11, "old-q11"],
    ]);
  });

  it("tells the user their answers were moved", async () => {
    const result = await importFromJson(JSON.stringify(payloadFor("PE_Prepare_REOMB", [2, 9])));

    expect(result.warnings.some((w) => /re-aligned/i.test(w))).toBe(true);
  });

  it("tells the user when an answer was discarded", async () => {
    const result = await importFromJson(JSON.stringify(payloadFor("EE_Enroll_Provider", [12])));

    expect(result.warnings.some((w) => /no longer exists/i.test(w))).toBe(true);
  });

  it("stamps the current revision on what it writes", async () => {
    await importFromJson(JSON.stringify(payloadFor("PE_Prepare_REOMB", [0])));

    const [assessment] = await db.capabilityAssessments.toArray();
    expect(assessment.blueprintRevision).toBe(BLUEPRINT_REVISION);
  });

  it("re-aligns history snapshots carried in the file", async () => {
    // Local row is newer, so the imported one lands in history rather than current.
    await importFromJson(JSON.stringify(payloadFor("PE_Prepare_REOMB", [0], { history: [2, 9] })));

    const [entry] = await db.assessmentHistory.toArray();
    expect(entry.ratings.map((r) => [r.questionIndex, r.notes])).toEqual([
      [3, "hist-old-q2"],
      [10, "hist-old-q9"],
    ]);
  });

  it("leaves an unaffected capability untouched", async () => {
    await importFromJson(JSON.stringify(payloadFor("CM_Establish_Case", [0, 1, 9])));

    expect(await storedRatings()).toEqual([
      [0, "old-q0"],
      [1, "old-q1"],
      [9, "old-q9"],
    ]);
  });
});

describe("importing a current-revision file", () => {
  it("does not touch indices that are already correct", async () => {
    const result = await importFromJson(
      JSON.stringify(
        payloadFor("PE_Prepare_REOMB", [0, 2, 10], { blueprintRevision: BLUEPRINT_REVISION })
      )
    );

    expect(result.success).toBe(true);
    // A second migration would push these to 0, 3, and out of range.
    expect(await storedRatings()).toEqual([
      [0, "old-q0"],
      [2, "old-q2"],
      [10, "old-q10"],
    ]);
  });

  it("emits no re-alignment warnings", async () => {
    const result = await importFromJson(
      JSON.stringify(
        payloadFor("PE_Prepare_REOMB", [0, 2], { blueprintRevision: BLUEPRINT_REVISION })
      )
    );

    expect(result.warnings.some((w) => /re-aligned|no longer exists/i.test(w))).toBe(false);
  });
});

describe("importing a file from a newer build", () => {
  it("imports as-is and says so rather than guessing", async () => {
    const result = await importFromJson(
      JSON.stringify(payloadFor("PE_Prepare_REOMB", [0, 2], { blueprintRevision: "2099-01-01" }))
    );

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => /newer version of the MITA blueprint/i.test(w))).toBe(true);
    expect(await storedRatings()).toEqual([
      [0, "old-q0"],
      [2, "old-q2"],
    ]);
  });

  it("does not store an index past the end of the question list", async () => {
    // The bug this guards: `questionCountAtRevision` reported the *pre-revision* count
    // (13 for EE_Enroll_Provider) for a revision it could not place, so validation
    // admitted index 12 — while the migration, which does check the revision, declined to
    // touch it. The row was then invisible in the UI but counted toward progress and
    // averaged into the finalized score.
    const result = await importFromJson(
      JSON.stringify(payloadFor("EE_Enroll_Provider", [0, 12], { blueprintRevision: "2099-01-01" }))
    );

    expect(result.success).toBe(true);
    const questionCount =
      getCapabilityByCode("EE_Enroll_Provider")!.bcm.maturity_model.capability_questions.length;
    for (const [index] of await storedRatings()) {
      expect(index).toBeLessThan(questionCount);
    }
  });

  it("does not claim the current revision for data it did not re-align", async () => {
    // The stamp is the marker that says "these indices need no migration". Writing it on
    // a record the migration skipped means nothing will ever revisit it.
    await importFromJson(
      JSON.stringify(payloadFor("PE_Prepare_REOMB", [0], { blueprintRevision: "2099-01-01" }))
    );

    const [assessment] = await db.capabilityAssessments.toArray();
    expect(assessment.blueprintRevision).not.toBe(BLUEPRINT_REVISION);
  });

  it("treats a garbage revision string the same as a future one", async () => {
    const result = await importFromJson(
      JSON.stringify(
        payloadFor("EE_Enroll_Provider", [0, 12], { blueprintRevision: "!!!not-a-revision!!!" })
      )
    );

    expect(result.warnings.some((w) => /newer version of the MITA blueprint/i.test(w))).toBe(true);
    expect((await storedRatings()).every(([index]) => index < 12)).toBe(true);
  });
});

describe("file-level revision as a fallback", () => {
  it("re-aligns when the file says pre-revision and records say nothing", async () => {
    const result = await importFromJson(
      JSON.stringify(payloadFor("PE_Prepare_REOMB", [2, 9], { blueprintRevision: PRE_REVISION }))
    );

    expect(result.success).toBe(true);
    expect(await storedRatings()).toEqual([
      [3, "old-q2"],
      [10, "old-q9"],
    ]);
  });

  it("validation and migration agree when the file says current and records say nothing", async () => {
    // These previously disagreed: validation bounded against the *old* count using the
    // record's absent revision, while the migration resolved the file's "current" and
    // concluded nothing was pending. Answers stayed on the wrong questions, silently.
    const payload = payloadFor("PE_Prepare_REOMB", [2, 10], {
      blueprintRevision: BLUEPRINT_REVISION,
    });
    const result = await importFromJson(JSON.stringify(payload));

    expect(result.success).toBe(true);
    // Treated as already-current, so untouched — and index 10 is valid in the new
    // 11-question list, so it must not be rejected either.
    expect(await storedRatings()).toEqual([
      [2, "old-q2"],
      [10, "old-q10"],
    ]);
  });
});

describe("duplicate answers for one question", () => {
  it("keeps one and reports the rest", async () => {
    // The compound index is not unique, so both would be written. `getRating` resolves
    // with `find`, so the UI would show an arbitrary one while the others stayed
    // invisible, counted toward progress, and fed the finalized average.
    const payload = payloadFor("CM_Establish_Case", [0, 1]) as {
      data: { ratings: Record<string, unknown>[] };
    };
    payload.data.ratings.push({
      ...payload.data.ratings[0],
      id: "rating-dup",
      notes: "duplicate",
      level: 5,
    });

    const result = await importFromJson(JSON.stringify(payload));

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => /duplicate answer/i.test(w))).toBe(true);
    const stored = await storedRatings();
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map(([index]) => index)).size).toBe(2);
  });
});

describe("warning wording", () => {
  it("names each affected capability once, not once per table", async () => {
    // Rating warnings were keyed by process name and history warnings by capability
    // code, so one capability produced two warnings under two different names — reading
    // as twice as many affected capabilities as there were.
    const result = await importFromJson(
      JSON.stringify(payloadFor("PE_Prepare_REOMB", [2], { history: [2] }))
    );

    const realigned = result.warnings.filter((w) => /re-aligned/i.test(w));
    expect(realigned).toHaveLength(1);
    expect(realigned[0]).toContain("Prepare REOMB");
    expect(realigned[0]).not.toContain("PE_Prepare_REOMB");
  });
});

describe("migrateImportPayload directly", () => {
  it("treats an explicit pre-revision marker the same as an absent one", () => {
    const withMarker = validateImportPayload(
      payloadFor("PE_Prepare_REOMB", [2], { blueprintRevision: PRE_REVISION })
    );
    const withoutMarker = validateImportPayload(payloadFor("PE_Prepare_REOMB", [2]));

    migrateImportPayload(withMarker.data!);
    migrateImportPayload(withoutMarker.data!);

    expect(withMarker.data!.data.ratings[0].questionIndex).toBe(
      withoutMarker.data!.data.ratings[0].questionIndex
    );
  });

  it("is idempotent for a payload already at the current revision", () => {
    const { data } = validateImportPayload(payloadFor("PE_Prepare_REOMB", [0, 2, 10]));
    migrateImportPayload(data!);
    const afterFirst = data!.data.ratings.map((r) => r.questionIndex);
    migrateImportPayload(data!);

    expect(data!.data.ratings.map((r) => r.questionIndex)).toEqual(afterFirst);
  });

  it("keeps ratings for assessments it could not resolve out of the way", () => {
    const { data } = validateImportPayload(payloadFor("PE_Prepare_REOMB", [0, 2]));
    // Validation drops orphans, so the surviving list only contains resolvable rows.
    const before = data!.data.ratings.length;
    migrateImportPayload(data!);
    expect(data!.data.ratings).toHaveLength(before);
  });
});
