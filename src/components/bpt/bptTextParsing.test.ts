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
import { parseLine, resolveIndentDepths, type ParsedLine } from "./bptTextParsing";
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
