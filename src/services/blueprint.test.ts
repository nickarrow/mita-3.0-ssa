/**
 * Tests for blueprint loading and BCM/BPT pairing.
 *
 * Pairing used to key on the filename, which meant two capabilities whose BCM and
 * BPT filenames disagreed were dropped: the app built 74 capabilities from 152 files
 * and those two vanished from the dashboard, the process tree and every average, with
 * no error anywhere. Pairing now keys on the upstream `process_id`, which is
 * identical on both halves by construction.
 *
 * These assert against the real vendored data, so a re-sync that breaks pairing or
 * moves a count fails here rather than in a user's browser.
 */

import { describe, expect, it } from "vitest";
import {
  getBusinessAreas,
  getBlueprintVersion,
  getCapabilities,
  getCapabilityByCode,
  getCapabilityByProcessName,
} from "./blueprint";

describe("pairing", () => {
  it("builds all 76 capabilities from 152 records", () => {
    expect(getCapabilities()).toHaveLength(76);
  });

  it("includes the two capabilities that filename pairing dropped", () => {
    // CMS spells these differently across its own appendices: the BCM said
    // "Treatment Plans" / "Maintain Reference" where the BPT said "Treatment Plan" /
    // "Manage Reference".
    expect(getCapabilityByCode("CM_Manage_Treatment_Plan_and_Outcomes")).toBeDefined();
    expect(getCapabilityByCode("PL_Manage_Reference_Information")).toBeDefined();
  });

  it("pairs every capability with matching process_ids on both halves", () => {
    for (const capability of getCapabilities()) {
      expect(capability.bcm.process_id, capability.code).toBe(capability.bpt.process_id);
    }
  });

  it("assigns a unique code to every capability", () => {
    const codes = getCapabilities().map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("never emits an empty code", () => {
    for (const capability of getCapabilities()) {
      expect(capability.code, capability.bcm.process_id).not.toBe("");
    }
  });

  it("keeps code and process_id equivalent up to case and separator", () => {
    // The app's code is filename-derived and persisted; process_id is upstream's
    // join key. They are not interchangeable strings: process_id also normalizes
    // punctuation, so OM_Calculate_Spend-Down_Amount becomes
    // OM_CALCULATE_SPEND_DOWN_AMOUNT. That is exactly why `code` stays
    // filename-derived — adopting process_id as the stored key would be a genuine
    // rename for that capability, not a case change, and would orphan its rows.
    for (const capability of getCapabilities()) {
      expect(capability.code.toUpperCase().replace(/-/g, "_"), capability.code).toBe(
        capability.bcm.process_id
      );
    }
  });
});

describe("business areas", () => {
  it("groups 76 capabilities across 9 areas", () => {
    const areas = getBusinessAreas();
    expect(areas).toHaveLength(9);
    expect(areas.reduce((sum, a) => sum + a.capabilities.length, 0)).toBe(76);
  });

  it("has the expected per-area counts", () => {
    const counts = Object.fromEntries(
      getBusinessAreas().map((a) => [a.name, a.capabilities.length])
    );
    expect(counts).toEqual({
      "Business Relationship Management": 4,
      "Care Management": 9,
      "Contractor Management": 9,
      "Eligibility and Enrollment Management": 8,
      "Financial Management": 19,
      "Operations Management": 9,
      "Performance Management": 5,
      "Plan Management": 8,
      "Provider Management": 5,
    });
  });

  it("maps every area to a real two-letter code, not a substring fallback", () => {
    // getBusinessAreas falls back to the first two characters of the name when an
    // area is missing from its lookup table, which would silently produce "CA" for
    // "Care Management" if upstream renamed an area.
    for (const area of getBusinessAreas()) {
      expect(area.code, area.name).toMatch(/^(BR|CM|CO|EE|FM|OM|PE|PL|PM)$/);
    }
  });
});

describe("capability shape", () => {
  it("every capability has at least one question with five levels", () => {
    for (const capability of getCapabilities()) {
      const questions = capability.bcm.maturity_model.capability_questions;
      expect(questions.length, capability.code).toBeGreaterThan(0);
      for (const question of questions) {
        expect(Object.keys(question.levels).sort()).toEqual([
          "level_1",
          "level_2",
          "level_3",
          "level_4",
          "level_5",
        ]);
      }
    }
  });

  it("totals 837 questions, matching the upstream dataset", () => {
    const total = getCapabilities().reduce(
      (sum, c) => sum + c.bcm.maturity_model.capability_questions.length,
      0
    );
    expect(total).toBe(837);
  });

  it("has the corrected question counts for the four repaired capabilities", () => {
    const countFor = (code: string) =>
      getCapabilityByCode(code)!.bcm.maturity_model.capability_questions.length;
    expect(countFor("PE_Prepare_REOMB")).toBe(11);
    expect(countFor("PM_Perform_Provider_Outreach")).toBe(12);
    expect(countFor("CO_Perform_Contractor_Outreach")).toBe(12);
    expect(countFor("EE_Enroll_Provider")).toBe(12);
  });

  it("carries the question-level notes upstream moved out of question text", () => {
    // Rendered by QuestionCard. Dropping them loses guidance that changes how a
    // question should be rated, e.g. spend-down having no level 4 or 5.
    const withNotes = getCapabilities().flatMap((c) =>
      c.bcm.maturity_model.capability_questions.filter((q) => q.note).map((q) => q.note!)
    );
    expect(withNotes).toHaveLength(6);
    expect(withNotes.some((note) => /no longer relevant at Levels 4 and 5/i.test(note))).toBe(true);
  });

  it("reports the CMS framework version, unchanged by re-extraction", () => {
    expect(getBlueprintVersion()).toBe("3.0");
  });
});

describe("lookup by process name", () => {
  it("resolves every capability's own name", () => {
    for (const capability of getCapabilities()) {
      expect(getCapabilityByProcessName(capability.processName)?.code, capability.processName).toBe(
        capability.code
      );
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(getCapabilityByProcessName("  establish case  ")?.code).toBe("CM_Establish_Case");
  });

  it("returns undefined for a name outside the framework", () => {
    // Drives the dimmed, tooltipped chips in the BPT predecessor/successor lists.
    expect(getCapabilityByProcessName("Receive Inbound Transaction")).toBeUndefined();
  });
});
