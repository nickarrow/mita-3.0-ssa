/**
 * Tag normalization and validation.
 *
 * These live in one module because tags enter the app from three places — the
 * assessment tag field, `startAssessment`'s initial tags, and imported files —
 * and every one of them must agree on what a tag looks like. When the rules were
 * duplicated per call site they drifted: one path lowercased and another didn't,
 * so `#Deloitte` and `#deloitte` could both exist as separate tags, and the
 * import path skipped validation entirely.
 */

/** Longest permitted tag, excluding the leading "#". */
export const MAX_TAG_LENGTH = 40;

/**
 * Canonical form: trimmed, lowercased, exactly one leading "#".
 *
 * Lowercasing is what makes tags case-insensitive for equality, so it must happen
 * before any comparison or storage.
 */
export function normalizeTag(name: string): string {
  const trimmed = name.trim().toLowerCase().replace(/^#+/, "");
  return `#${trimmed}`;
}

/**
 * Accepts a tag if, ignoring a leading "#", it starts with a letter or digit and
 * contains only letters, digits, hyphens and underscores, within the length limit.
 *
 * Deliberately strict: tags are used as filter keys and rendered as compact chips,
 * so whitespace, punctuation and unbounded length all cause real problems
 * downstream.
 */
export function isValidTag(name: string): boolean {
  const bare = name.trim().replace(/^#+/, "");
  if (bare.length === 0 || bare.length > MAX_TAG_LENGTH) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9-_]*$/.test(bare);
}

/**
 * Normalize a list of tags, dropping invalid entries and duplicates while
 * preserving order.
 */
export function normalizeTagList(names: readonly string[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    if (!isValidTag(name)) continue;
    const normalized = normalizeTag(name);
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

/** Split a list into accepted (normalized) and rejected (original) entries. */
export function partitionTags(names: readonly string[]): {
  accepted: string[];
  rejected: string[];
} {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const name of names) {
    if (!name.trim()) continue;
    if (!isValidTag(name)) {
      rejected.push(name.trim());
      continue;
    }
    const normalized = normalizeTag(name);
    if (!accepted.includes(normalized)) {
      accepted.push(normalized);
    }
  }
  return { accepted, rejected };
}
