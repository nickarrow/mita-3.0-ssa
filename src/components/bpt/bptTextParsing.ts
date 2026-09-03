/**
 * Parsing for the lightly-marked-up strings in BPT records.
 *
 * The upstream dataset stores nested structure inside single strings, using a
 * newline plus indent for depth and a marker glyph for decoration. Its schema
 * documentation states the two rules this module implements:
 *
 *   "Treat the marker as decoration and the indent as the structure."
 *   "Parse on relative indent, not on a fixed width."
 *
 * Separate from the components that render the result so it can be unit tested
 * without a DOM, and because a file that exports both components and helpers breaks
 * React Fast Refresh.
 */

/**
 * A single parsed line of BPT text.
 *
 * Ordered list items (`1.`, `a.`, `iii.`) share one type and carry their marker
 * rather than getting a type each. They render identically — marker then text — and
 * the previous three separate types had no render branch at all, so the marker was
 * matched, dropped, and the line emitted as an unmarked paragraph. That silently
 * flattened 119 lettered and 16 roman items in the corpus, including the conditional
 * branches in the provider-screening steps.
 */
export interface ParsedLine {
  type: "paragraph" | "note" | "bullet" | "dash" | "check" | "ordered";
  content: string;
  /**
   * Literal leading-space count, not a depth.
   *
   * Depth is resolved per block by `resolveIndentDepths`, because upstream documents
   * indent widths as non-uniform across the corpus (1, 2 and 4 spaces all occur) and
   * instructs consumers to parse on relative indent. A fixed `floor(spaces / 2)`
   * mapped a one-space indent to depth 0, rendering 77 nested lines flush with their
   * parent.
   */
  rawIndent: number;
  /** The list marker exactly as published, e.g. "1.", "a.", "iii.". */
  marker?: string;
}

/**
 * Map the distinct leading-space widths in one block to consecutive depths.
 *
 * Relative, per block: upstream's guidance is that increasing indent signals
 * increasing depth, but the absolute widths carry no meaning and are inconsistent
 * between records. Ranking the widths that actually occur turns {0, 1, 2, 4} into
 * {0, 1, 2, 3} without hardcoding any of them.
 */
export function resolveIndentDepths(lines: readonly ParsedLine[]): Map<number, number> {
  // Block-level elements are excluded from the ranking. `note` is pinned to depth 0
  // and would otherwise contribute a width of 0 to a block that is entirely indented,
  // pushing every real line one level right. `paragraph` is excluded because prose is
  // not list structure: three descriptions in the corpus carry a single stray leading
  // space from PDF extraction, which relative ranking would promote to a full level and
  // render inset for no semantic reason.
  const widths = [
    ...new Set(
      lines
        .filter((line) => line.type !== "note" && line.type !== "paragraph")
        .map((line) => line.rawIndent)
    ),
  ].sort((a, b) => a - b);
  return new Map(widths.map((width, depth) => [width, depth]));
}

/** Classify one line, or return null for blank lines. */
export function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const rawIndent = line.length - line.trimStart().length;

  // NOTE: callout. Pinned to depth 0: it is a block-level aside, not a list item.
  if (trimmed.startsWith("NOTE:")) {
    return {
      type: "note",
      content: trimmed.replace(/^NOTE:\s*/, ""),
      rawIndent: 0,
    };
  }

  // Unordered markers carry no depth of their own. Upstream is explicit that the
  // marker is decoration and the indent is the structure, so none of these adjust the
  // indent — doing so previously double-counted depth against the whitespace that
  // already encoded it.
  const checkMatch = trimmed.match(/^✓\s*(.+)$/);
  if (checkMatch) {
    return { type: "check", content: checkMatch[1], rawIndent };
  }

  const bulletMatch = trimmed.match(/^•\s*(.+)$/);
  if (bulletMatch) {
    return { type: "bullet", content: bulletMatch[1], rawIndent };
  }

  const dashMatch = trimmed.match(/^[-–]\s*(.+)$/);
  if (dashMatch) {
    return { type: "dash", content: dashMatch[1], rawIndent };
  }

  // Ordered items keep their published marker. Roman is tested before lettered
  // because a single "i." matches both patterns and the roman reading is correct in
  // this corpus, where roman sublists appear beneath lettered ones.
  //
  // Whitespace after the dot is required, not optional. With `\s*`, "3.2 million
  // records" parsed as marker "3." plus content "2 million records" — and because the
  // marker was then discarded, the line rendered as "2 million records". All 143
  // genuine list items in the corpus have whitespace after the marker and no line
  // starts with a decimal, so requiring it only rejects the false positives.
  const romanMatch = trimmed.match(/^(i{1,3}|iv|vi{0,3}|ix|x)\.\s+(.+)$/i);
  if (romanMatch) {
    return { type: "ordered", content: romanMatch[2], marker: `${romanMatch[1]}.`, rawIndent };
  }

  const letterMatch = trimmed.match(/^([a-z])\.\s+(.+)$/i);
  if (letterMatch) {
    return { type: "ordered", content: letterMatch[2], marker: `${letterMatch[1]}.`, rawIndent };
  }

  const numberMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numberMatch) {
    return { type: "ordered", content: numberMatch[2], marker: `${numberMatch[1]}.`, rawIndent };
  }

  return { type: "paragraph", content: trimmed, rawIndent };
}
