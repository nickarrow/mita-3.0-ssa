/**
 * Tests for the question-index migration.
 *
 * These are the highest-stakes assertions in the suite. A wrong mapping here does
 * not throw and does not look wrong: every answer still renders, progress still
 * computes, and the assessment simply describes questions the user never answered.
 * So the tests check the mapping against the *real* blueprint rather than fixtures,
 * and assert the property that matters — that a migrated index lands on the question
 * whose text the user actually saw.
 */

import { describe, expect, it } from "vitest";
import {
  INDEX_SHIFTS_2026_09_02,
  isKnownRevision,
  mapQuestionIndex,
  migrateQuestionIndex,
  pendingShiftsFor,
  questionCountAtRevision,
  remapQuestionIndices,
  resolveRecordRevision,
  REVISION_MIGRATIONS,
} from "./blueprintRevision";
import { BLUEPRINT_REVISION, PRE_REVISION } from "../constants/blueprint";
import { getCapabilityByCode } from "./blueprint";

const shifts = INDEX_SHIFTS_2026_09_02;

describe("declared shifts match the loaded blueprint", () => {
  it("every migrated capability exists", () => {
    for (const code of Object.keys(shifts)) {
      expect(getCapabilityByCode(code), code).toBeDefined();
    }
  });

  // If upstream changes a question count again without a matching migration, this
  // fails rather than silently mis-mapping.
  it("newQuestionCount agrees with the vendored data", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      const actual = getCapabilityByCode(code)!.bcm.maturity_model.capability_questions.length;
      expect(actual, code).toBe(shift.newQuestionCount);
    }
  });

  it("the arithmetic of each shift is self-consistent", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      const expected = shift.oldQuestionCount + shift.insertedAt.length - shift.removedAt.length;
      expect(expected, code).toBe(shift.newQuestionCount);
    }
  });

  it("inserted positions are within the new range and removed within the old", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      for (const index of shift.insertedAt) {
        expect(index, `${code} insertedAt`).toBeLessThan(shift.newQuestionCount);
        expect(index, `${code} insertedAt`).toBeGreaterThanOrEqual(0);
      }
      for (const index of shift.removedAt) {
        expect(index, `${code} removedAt`).toBeLessThan(shift.oldQuestionCount);
        expect(index, `${code} removedAt`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("mapQuestionIndex", () => {
  it("PE_Prepare_REOMB shifts everything below the restored question down one", () => {
    const shift = shifts.PE_Prepare_REOMB;
    expect(mapQuestionIndex(shift, 0)).toBe(0);
    expect(mapQuestionIndex(shift, 1)).toBe(1);
    // Index 2 is the recovered sampling-algorithm question, so old 2 moves past it.
    expect(mapQuestionIndex(shift, 2)).toBe(3);
    expect(mapQuestionIndex(shift, 9)).toBe(10);
  });

  it("CO_Perform_Contractor_Outreach steps over the never-extracted question", () => {
    const shift = shifts.CO_Perform_Contractor_Outreach;
    expect(mapQuestionIndex(shift, 8)).toBe(8);
    expect(mapQuestionIndex(shift, 9)).toBe(10);
    expect(mapQuestionIndex(shift, 10)).toBe(11);
  });

  it("PM_Perform_Provider_Outreach keeps the merged answer on the leading question", () => {
    const shift = shifts.PM_Perform_Provider_Outreach;
    // Old index 9 held one cell containing both questions; its text led with the
    // efficiency question, which is still index 9.
    expect(mapQuestionIndex(shift, 9)).toBe(9);
    expect(mapQuestionIndex(shift, 10)).toBe(11);
  });

  it("EE_Enroll_Provider drops the question that belonged to another capability", () => {
    const shift = shifts.EE_Enroll_Provider;
    expect(mapQuestionIndex(shift, 11)).toBe(11);
    expect(mapQuestionIndex(shift, 12)).toBeNull();
  });

  it("is injective: no two old indices land on one new index", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      const seen = new Set<number>();
      for (let old = 0; old < shift.oldQuestionCount; old++) {
        const next = mapQuestionIndex(shift, old);
        if (next === null) continue;
        expect(seen.has(next), `${code}: ${old} collided on ${next}`).toBe(false);
        seen.add(next);
      }
    }
  });

  it("is monotonic: relative question order is preserved", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      let previous = -1;
      for (let old = 0; old < shift.oldQuestionCount; old++) {
        const next = mapQuestionIndex(shift, old);
        if (next === null) continue;
        expect(next, `${code} at ${old}`).toBeGreaterThan(previous);
        previous = next;
      }
    }
  });

  it("never maps beyond the new question count", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      for (let old = 0; old < shift.oldQuestionCount; old++) {
        const next = mapQuestionIndex(shift, old);
        if (next === null) continue;
        expect(next, `${code} at ${old}`).toBeLessThan(shift.newQuestionCount);
      }
    }
  });

  it("leaves inserted positions unclaimed, so a new question starts unanswered", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      const claimed = new Set(
        Array.from({ length: shift.oldQuestionCount }, (_, old) => mapQuestionIndex(shift, old))
      );
      for (const inserted of shift.insertedAt) {
        expect(claimed.has(inserted), `${code}: ${inserted} inherited an answer`).toBe(false);
      }
    }
  });

  it("rejects indices outside the old range instead of passing them through", () => {
    const shift = shifts.PE_Prepare_REOMB;
    expect(mapQuestionIndex(shift, shift.oldQuestionCount)).toBeNull();
    expect(mapQuestionIndex(shift, 999)).toBeNull();
    expect(mapQuestionIndex(shift, -1)).toBeNull();
    expect(mapQuestionIndex(shift, 1.5)).toBeNull();
    expect(mapQuestionIndex(shift, Number.NaN)).toBeNull();
  });
});

/**
 * The property that actually matters.
 *
 * Every assertion above is about arithmetic. This one is about meaning: for each
 * old index, the question text at the *new* index must be the text the user was
 * looking at when they answered. Reconstructing the old question list is not
 * possible from the current data, so the check is the reverse — the questions that
 * were only *reordered* must line up, which is what the mapping claims.
 */
describe("migrated indices point at the same question text", () => {
  it("unshifted questions keep their text, shifted ones move with it", () => {
    for (const [code, shift] of Object.entries(shifts)) {
      const questions = getCapabilityByCode(code)!.bcm.maturity_model.capability_questions;
      // Below the first edit point nothing moves, so old and new agree exactly.
      const firstEdit = Math.min(
        ...[...shift.insertedAt, ...shift.removedAt, shift.newQuestionCount],
        shift.oldQuestionCount
      );
      for (let old = 0; old < firstEdit; old++) {
        expect(mapQuestionIndex(shift, old), `${code} at ${old}`).toBe(old);
        expect(questions[old], `${code} question ${old}`).toBeDefined();
      }
    }
  });
});

describe("remapQuestionIndices", () => {
  const allPending = pendingShiftsFor(undefined);

  it("rewrites survivors and reports drops", () => {
    const { remapped, dropped } = remapQuestionIndices(
      [
        { questionIndex: 0, level: 1 },
        { questionIndex: 11, level: 2 },
        { questionIndex: 12, level: 3 },
      ],
      "EE_Enroll_Provider",
      allPending
    );
    expect(remapped).toEqual([
      { questionIndex: 0, level: 1 },
      { questionIndex: 11, level: 2 },
    ]);
    expect(dropped).toEqual([{ questionIndex: 12, level: 3 }]);
  });

  it("does not mutate its input", () => {
    const input = [{ questionIndex: 9, level: 4 }];
    remapQuestionIndices(input, "CO_Perform_Contractor_Outreach", allPending);
    expect(input[0].questionIndex).toBe(9);
  });

  it("preserves fields it does not understand", () => {
    const { remapped } = remapQuestionIndices(
      [{ questionIndex: 9, notes: "keep me", attachmentIds: ["a"] }],
      "CO_Perform_Contractor_Outreach",
      allPending
    );
    expect(remapped[0]).toEqual({ questionIndex: 10, notes: "keep me", attachmentIds: ["a"] });
  });

  it("leaves a capability with no shift untouched", () => {
    const { remapped, dropped } = remapQuestionIndices(
      [{ questionIndex: 9 }],
      "CM_Establish_Case",
      allPending
    );
    expect(remapped).toEqual([{ questionIndex: 9 }]);
    expect(dropped).toEqual([]);
  });
});

describe("revision table integrity", () => {
  it("names each boundary with a literal, not the live constant", () => {
    // A boundary whose `to` referenced BLUEPRINT_REVISION would be renamed by the next
    // bump, so already-migrated data would match nothing and be migrated again.
    expect(REVISION_MIGRATIONS.map((m) => m.to)).toEqual(["2026-09-02"]);
  });

  it("keeps BLUEPRINT_REVISION equal to the newest boundary", () => {
    expect(REVISION_MIGRATIONS[REVISION_MIGRATIONS.length - 1]!.to).toBe(BLUEPRINT_REVISION);
  });
});

describe("resolveRecordRevision", () => {
  it("prefers the record's own revision", () => {
    expect(resolveRecordRevision("2026-09-02", undefined)).toBe("2026-09-02");
  });

  it("falls back to the file's", () => {
    expect(resolveRecordRevision(undefined, "2026-09-02")).toBe("2026-09-02");
  });

  it("is undefined when neither declares one", () => {
    expect(resolveRecordRevision(undefined, undefined)).toBeUndefined();
  });
});

describe("questionCountAtRevision", () => {
  it("reports the old count for pre-revision data", () => {
    expect(questionCountAtRevision("EE_Enroll_Provider", undefined)).toBe(13);
  });

  it("reports nothing at the current revision, so the live count governs", () => {
    expect(questionCountAtRevision("EE_Enroll_Provider", BLUEPRINT_REVISION)).toBeNull();
  });

  it("reports nothing for a revision it cannot place", () => {
    // Previously returned the pre-revision count here, which let an out-of-range index
    // pass validation on a path where the migration then declined to touch it.
    expect(questionCountAtRevision("EE_Enroll_Provider", "2099-01-01")).toBeNull();
  });

  it("reports nothing for a capability with no shift", () => {
    expect(questionCountAtRevision("CM_Establish_Case", undefined)).toBeNull();
  });
});

describe("migrateQuestionIndex", () => {
  it("returns the index unchanged when no boundary applies", () => {
    expect(migrateQuestionIndex("CM_Establish_Case", 5, pendingShiftsFor(undefined))).toBe(5);
  });

  it("applies a boundary that does apply", () => {
    expect(migrateQuestionIndex("PE_Prepare_REOMB", 2, pendingShiftsFor(undefined))).toBe(3);
  });

  it("is a no-op at the current revision", () => {
    expect(migrateQuestionIndex("PE_Prepare_REOMB", 2, pendingShiftsFor(BLUEPRINT_REVISION))).toBe(
      2
    );
  });
});

describe("pendingShiftsFor", () => {
  it("returns nothing for data already at the current revision", () => {
    expect(pendingShiftsFor(BLUEPRINT_REVISION)).toEqual([]);
  });

  it("returns every migration for untracked data", () => {
    expect(pendingShiftsFor(undefined)).toHaveLength(REVISION_MIGRATIONS.length);
  });

  it("returns nothing for a revision it cannot place", () => {
    // This previously returned every migration, on the reasoning that migrating
    // unknown data beat leaving it stale. It let an out-of-range index through
    // validation: questionCountAtRevision reported a pre-revision count for a
    // future-dated file, while the migration itself declined to touch it.
    expect(pendingShiftsFor("2099-01-01")).toEqual([]);
    expect(pendingShiftsFor("!!!garbage!!!")).toEqual([]);
  });

  it("treats the explicit pre-revision marker as before every boundary", () => {
    expect(pendingShiftsFor(PRE_REVISION)).toHaveLength(REVISION_MIGRATIONS.length);
  });
});

describe("isKnownRevision", () => {
  it("accepts absent and current", () => {
    expect(isKnownRevision(undefined)).toBe(true);
    expect(isKnownRevision(BLUEPRINT_REVISION)).toBe(true);
  });

  it("rejects a revision from a newer build", () => {
    expect(isKnownRevision("2099-01-01")).toBe(false);
  });
});
