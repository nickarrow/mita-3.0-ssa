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

/** True when a `process_steps` element is a numbered step rather than a scenario heading. */
export function isNumberedStep(entry: string): boolean {
  return /^\d+\.\s/.test(entry);
}

/**
 * Split `process_steps` into scenarios.
 *
 * `process_steps` is a flat array mixing two kinds of element: a numbered step, and a
 * scenario heading transcribed verbatim from the source PDF that labels the steps
 * following it. Whether an element is a heading is a property of the element, not of any
 * line within it, which is why this lives here and not in `parseLine` — that sees one line
 * at a time and cannot tell a heading from the first line of a step body.
 *
 * Upstream restored these headings in the 2026-09-09 extraction; there are now 20 across 12
 * of the 76 records, and `FM_Manage_Fund` has four scenarios in one array. Before this they
 * fell through to `parseLine` as plain paragraphs and rendered as step prose,
 * indistinguishable from the body of the preceding step.
 *
 * The previous implementation looked for a `--- Alternate Path: X ---` delimiter. That
 * convention no longer appears anywhere in the corpus (verified: zero occurrences), so that
 * branch was dead and is replaced rather than kept alongside.
 *
 * A section with no steps is still emitted, so a trailing heading — which three records have
 * — is not silently dropped. The one section never emitted is an empty leading one, for a
 * record that opens with a heading, as `EE_Determine_Member_Eligibility` does.
 */
export function groupStepsByScenario(
  steps: readonly string[]
): { heading: string | null; steps: string[] }[] {
  type Section = { heading: string | null; steps: string[] };
  const isEmpty = (s: Section) => s.heading === null && s.steps.length === 0;

  const sections: Section[] = [];
  let current: Section = { heading: null, steps: [] };

  for (const entry of steps) {
    if (isNumberedStep(entry)) {
      current.steps.push(entry);
      continue;
    }
    // A heading closes the section before it and opens a new one.
    if (!isEmpty(current)) sections.push(current);
    current = { heading: entry, steps: [] };
  }
  if (!isEmpty(current)) sections.push(current);

  return sections;
}

/**
 * Split a scenario heading into a short label and any guidance that follows it.
 *
 * Most headings are a bare scenario name ("Manage FFP", "Capitation Payment"). Three are a
 * paragraph of CMS guidance 278–422 characters long, and every one of those leads with a
 * short label and a colon ("Alternate Path:", "Alternate Business Process Path:"). Splitting
 * on the first colon therefore emphasises the label without setting a whole paragraph in
 * bold.
 *
 * The length guard matters: without it, a heading with a colon late in a sentence would put
 * most of itself in the label. No colon, or a late one, means the whole string is the label —
 * correct for every short heading in the corpus.
 */
export function splitScenarioHeading(text: string): { label: string; body: string } {
  const colon = text.indexOf(":");
  if (colon > 0 && colon <= 40) {
    return { label: text.slice(0, colon + 1), body: text.slice(colon + 1).trim() };
  }
  return { label: text.trim(), body: "" };
}
