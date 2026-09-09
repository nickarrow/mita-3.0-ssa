/**
 * Tests for BPT text parsing.
 *
 * Upstream documents the format these strings use, and both rules it states were
 * being broken:
 *
 *   "Treat the marker as decoration and the indent as the structure."
 *   "Parse on relative indent, not on a fixed width."
 *
 * The parser matched `a.` / `i.` / `1.` markers and then discarded them, with no
 * render branch for the resulting types, so 119 lettered and 16 roman items in the
 * corpus rendered as unmarked paragraphs. And depth came from `floor(spaces / 2)`,
 * which maps a one-space indent to 0 — the corpus uses 1, 2 and 4 spaces, so 77
 * nested lines rendered flush with their parent.
 *
 * The last block asserts against the real vendored data, so a future re-sync that
 * introduces a marker style or indent width we don't handle fails here.
 */

import { describe, expect, it } from "vitest";
import {
  groupStepsByScenario,
  isNumberedStep,
  parseLine,
  resolveIndentDepths,
  splitScenarioHeading,
  type ParsedLine,
} from "./bptTextParsing";
import { getCapabilities } from "../../services/blueprint";

const parse = (line: string) => parseLine(line)!;

describe("parseLine: ordered markers are preserved", () => {
  it("keeps a numbered marker", () => {
    expect(parse("1. Produce APD.")).toMatchObject({
      type: "ordered",
      marker: "1.",
      content: "Produce APD.",
    });
  });

  it("keeps a lettered marker", () => {
    expect(parse("  a. END: If validation fails, business process stops.")).toMatchObject({
      type: "ordered",
      marker: "a.",
      content: "END: If validation fails, business process stops.",
    });
  });

  it("keeps a roman marker", () => {
    expect(parse("    iii. Database Checks")).toMatchObject({
      type: "ordered",
      marker: "iii.",
      content: "Database Checks",
    });
  });

  it("reads a bare 'i.' as roman, matching the corpus", () => {
    // Roman is tested before lettered because roman sublists appear beneath
    // lettered ones in this data, so the roman reading is the correct one.
    expect(parse("    i. License verifications")).toMatchObject({ marker: "i." });
  });

  it("keeps multi-digit numbering", () => {
    expect(parse("12. Assess categorical risk.")).toMatchObject({ marker: "12." });
  });
});

describe("parseLine: unordered markers carry no depth of their own", () => {
  it.each([
    ["• Identify target members", "bullet"],
    ["✓ Verified", "check"],
    ["- Department of Motor Vehicles", "dash"],
    ["– en dash variant", "dash"],
  ])("%s parses as %s at its literal indent", (line, type) => {
    const parsed = parse(line);
    expect(parsed.type).toBe(type);
    expect(parsed.rawIndent).toBe(0);
  });

  it("reports the literal leading-space count, not a computed depth", () => {
    // Previously dash added +1 and check added +2 on top of floor(spaces/2), which
    // double-counted depth against the whitespace that already encoded it.
    expect(parse(" - one space").rawIndent).toBe(1);
    expect(parse("    - four spaces").rawIndent).toBe(4);
    expect(parse(" ✓ one space").rawIndent).toBe(1);
  });
});

describe("parseLine: other line types", () => {
  it("treats NOTE: as a block aside pinned to depth 0", () => {
    expect(parse("  NOTE: Something important")).toEqual({
      type: "note",
      content: "Something important",
      rawIndent: 0,
    });
  });

  it("falls back to paragraph", () => {
    expect(parse("Just prose.")).toMatchObject({ type: "paragraph", content: "Just prose." });
  });

  it("skips blank and whitespace-only lines", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("     ")).toBeNull();
  });

  it("does not mistake a decimal or a sentence for a marker", () => {
    expect(parse("3.2 million records").type).toBe("paragraph");
    expect(parse("Section 5. was amended").type).toBe("paragraph");
  });
});

describe("resolveIndentDepths: relative, not fixed-width", () => {
  const at = (widths: number[]) =>
    resolveIndentDepths(
      widths.map((rawIndent): ParsedLine => ({ type: "dash", content: "x", rawIndent }))
    );

  it("ranks the corpus widths 0/1/2/4 as consecutive depths", () => {
    const depths = at([0, 1, 2, 4]);
    expect([...depths.entries()]).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [4, 3],
    ]);
  });

  it("gives a one-space indent real depth", () => {
    // The whole point: floor(1/2) was 0, so these rendered flush with their parent.
    expect(at([0, 1]).get(1)).toBe(1);
  });

  it("is relative to the block, so a 0/4 block reads as two levels", () => {
    expect(at([0, 4]).get(4)).toBe(1);
  });

  it("is order-insensitive and deduplicates", () => {
    expect(at([4, 0, 2, 0, 4]).get(4)).toBe(2);
  });

  it("handles a flat block", () => {
    expect([...at([0, 0, 0]).entries()]).toEqual([[0, 0]]);
  });
});

describe("isNumberedStep", () => {
  it.each(["1. Receive request", "12. Assess categorical risk", "5.  extra space"])(
    "treats %j as a step",
    (entry) => expect(isNumberedStep(entry)).toBe(true)
  );

  it.each([
    "Manage FFP",
    "Capitation Payment",
    "Alternate Path:",
    "Alternate Scenario 1 - Auto Eligible",
    "Alternate Path - Additional Requests",
    // A CFR citation. Upstream had misparsed "42 CFR 435.330" into a step number and has
    // since removed it, but the rule must not classify one as a step if it returns.
    "435.330 Some eligibility provision",
    "3.2 million records",
  ])("treats %j as a heading", (entry) => expect(isNumberedStep(entry)).toBe(false));
});

describe("groupStepsByScenario", () => {
  const shape = (steps: string[]) =>
    groupStepsByScenario(steps).map((s) => [s.heading, s.steps.length]);

  it("returns one unlabelled section when there are no headings", () => {
    expect(shape(["1. a", "2. b", "3. c"])).toEqual([[null, 3]]);
  });

  it("handles a heading at the very start", () => {
    // EE_Determine_Member_Eligibility opens with one.
    expect(shape(["Full Eligibility Determination or Renewal", "1. a", "2. b"])).toEqual([
      ["Full Eligibility Determination or Renewal", 2],
    ]);
  });

  it("starts a new section at each heading", () => {
    expect(shape(["1. a", "Alternate Path:", "1. b", "2. c"])).toEqual([
      [null, 1],
      ["Alternate Path:", 2],
    ]);
  });

  it("keeps a trailing heading that labels no steps", () => {
    // Three records end with one. Dropping it would lose published guidance.
    expect(shape(["1. a", "Alternate Path: guidance"])).toEqual([
      [null, 1],
      ["Alternate Path: guidance", 0],
    ]);
  });

  it("handles four scenarios in one array, as FM_Manage_Fund has", () => {
    expect(
      shape(["Manage Fund", "1. a", "Manage FMAP", "1. b", "Manage FFP", "1. c", "Draw", "1. d"])
    ).toEqual([
      ["Manage Fund", 1],
      ["Manage FMAP", 1],
      ["Manage FFP", 1],
      ["Draw", 1],
    ]);
  });

  it("handles consecutive headings without inventing empty sections badly", () => {
    expect(shape(["A", "B", "1. x"])).toEqual([
      ["A", 0],
      ["B", 1],
    ]);
  });

  it("returns nothing for an empty array", () => {
    expect(groupStepsByScenario([])).toEqual([]);
  });

  it("preserves every entry exactly once", () => {
    const steps = ["Heading one", "1. a", "2. b", "Heading two", "1. c"];
    const flat = groupStepsByScenario(steps).flatMap((s) =>
      s.heading === null ? s.steps : [s.heading, ...s.steps]
    );
    expect(flat).toEqual(steps);
  });
});

describe("splitScenarioHeading", () => {
  it("keeps a bare scenario name whole", () => {
    expect(splitScenarioHeading("Manage FFP")).toEqual({ label: "Manage FFP", body: "" });
  });

  it("keeps a hyphenated name whole, since there is no colon", () => {
    expect(splitScenarioHeading("Alternate Scenario 1 - Auto Eligible")).toEqual({
      label: "Alternate Scenario 1 - Auto Eligible",
      body: "",
    });
  });

  it("splits a label from the guidance that follows it", () => {
    const { label, body } = splitScenarioHeading(
      "Alternate Path: For the authorization of some services, States may use the post-approval rather than the prior authorization business process."
    );
    expect(label).toBe("Alternate Path:");
    expect(body.startsWith("For the authorization")).toBe(true);
  });

  it("keeps a bare label with a trailing colon", () => {
    expect(splitScenarioHeading("Alternate Path:")).toEqual({ label: "Alternate Path:", body: "" });
  });

  it("does not split on a colon that appears late in a sentence", () => {
    // Without the length guard most of the heading would end up in the label.
    const text =
      "Determine whether the individual meets the requirements described above and then: proceed.";
    expect(splitScenarioHeading(text)).toEqual({ label: text, body: "" });
  });
});

describe("against the real vendored blueprint", () => {
  /** Every multi-line string the BPT renderer feeds through parseLine. */
  function* renderedBlocks() {
    for (const capability of getCapabilities()) {
      const details = capability.bpt.process_details;
      yield details.description;
      yield details.constraints;
      // ProcessSteps strips the leading "N. " and passes the remainder through.
      for (const step of details.process_steps) {
        yield step.replace(/^\d+\.\s*/, "");
      }
      yield* details.shared_data;
      yield* details.results;
      yield* details.failures;
      yield* details.performance_measures;
    }
  }

  it("every non-blank line parses to a known type", () => {
    const types = new Set<string>();
    for (const block of renderedBlocks()) {
      if (typeof block !== "string") continue;
      for (const line of block.split("\n")) {
        const parsed = parseLine(line);
        if (parsed) types.add(parsed.type);
      }
    }
    expect([...types].sort()).toEqual(["bullet", "check", "dash", "note", "ordered", "paragraph"]);
  });

  it("uses only indent widths that rank cleanly", () => {
    const widths = new Set<number>();
    for (const block of renderedBlocks()) {
      if (typeof block !== "string") continue;
      for (const line of block.split("\n")) {
        const parsed = parseLine(line);
        if (parsed) widths.add(parsed.rawIndent);
      }
    }
    // If a re-sync introduces a new width this fails, prompting a look at whether
    // relative ranking still expresses the intended hierarchy.
    expect([...widths].sort((a, b) => a - b)).toEqual([0, 1, 2, 4]);
  });

  it("no process_steps entry begins with a bare CFR-style citation", () => {
    // Upstream had misparsed "42 CFR 435.330" into a step numbered 435. Nothing crashed —
    // it rendered as step 435 in Determine Member Eligibility. Fixed upstream; asserted here
    // so a future extraction regression is caught by the suite rather than by a reader.
    for (const capability of getCapabilities()) {
      for (const entry of capability.bpt.process_details.process_steps) {
        expect(entry, `${capability.code}: ${entry.slice(0, 60)}`).not.toMatch(/^4\d{2}\.\d/);
      }
    }
  });

  it("step numbers restart per scenario, so they are not unique within a record", () => {
    // Documents why a step number must never be used as a key, id or anchor.
    const restarting = getCapabilities().filter((c) => {
      const nums = c.bpt.process_details.process_steps
        .filter(isNumberedStep)
        .map((s) => Number(s.match(/^(\d+)\./)![1]));
      return nums.some((n, i) => i > 0 && n <= nums[i - 1]!);
    });
    expect(restarting.length).toBeGreaterThan(0);
  });

  it("every scenario heading survives grouping and carries a non-empty label", () => {
    let headings = 0;
    for (const capability of getCapabilities()) {
      const steps = capability.bpt.process_details.process_steps;
      for (const section of groupStepsByScenario(steps)) {
        if (section.heading === null) continue;
        headings += 1;
        const { label } = splitScenarioHeading(section.heading);
        expect(label.trim(), capability.code).not.toBe("");
      }
    }
    // 20 across 12 records as of the 2026-09-09 extraction. A bare floor, so restoring
    // more headings upstream does not fail the suite.
    expect(headings).toBeGreaterThanOrEqual(20);
  });

  it("the counted step total excludes headings", () => {
    const cap = getCapabilities().find((c) => c.code === "EE_Determine_Member_Eligibility")!;
    const entries = cap.bpt.process_details.process_steps;
    expect(entries).toHaveLength(18);
    expect(entries.filter(isNumberedStep)).toHaveLength(16);
  });

  it("every ordered line in the corpus retains a marker", () => {
    let ordered = 0;
    for (const block of renderedBlocks()) {
      if (typeof block !== "string") continue;
      for (const line of block.split("\n")) {
        const parsed = parseLine(line);
        if (parsed?.type !== "ordered") continue;
        ordered++;
        expect(parsed.marker, line).toBeTruthy();
        expect(parsed.content, line).not.toBe("");
      }
    }
    // Guards against the fix silently regressing to zero ordered lines.
    expect(ordered).toBeGreaterThan(100);
  });
});
