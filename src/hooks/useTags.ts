import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/db";
import { isValidTag, normalizeTag } from "../utils/tags";
import type { Tag } from "../types";

/**
 * Hook for reading the tag vocabulary used for autocomplete.
 *
 * Read-only by design. Tag *counts* are owned by `refreshTagUsage` in
 * `useCapabilityAssessments`, which recomputes them from the assessments table
 * whenever tags change. This hook previously also carried its own `ensureTag`
 * writer and a `getTagsInUse` reader with different (finalized-only) semantics;
 * both were unreachable and had already drifted from the live implementations, so
 * they were removed rather than kept in sync.
 */
export function useTags() {
  // Get all tags sorted by usage count (most used first)
  const tags = useLiveQuery(() => db.tags.orderBy("usageCount").reverse().toArray(), []);

  /**
   * Get tag suggestions for autocomplete
   * Returns tags sorted by usage, optionally filtered by prefix
   */
  const getSuggestions = (prefix?: string): Tag[] => {
    if (!tags) return [];

    if (!prefix) return tags;

    const normalizedPrefix = prefix.toLowerCase().replace(/^#/, "");
    return tags.filter((t) => t.name.toLowerCase().replace(/^#/, "").startsWith(normalizedPrefix));
  };

  /**
   * Delete a tag from the vocabulary. Does not remove it from assessments; the
   * next `refreshTagUsage` will re-register it if any assessment still carries it.
   */
  const deleteTag = async (tagId: string): Promise<void> => {
    await db.tags.delete(tagId);
  };

  return {
    tags: tags || [],
    getSuggestions,
    deleteTag,
    // Re-exported so components have one obvious source for the rules.
    normalizeTag,
    isValidTag,
  };
}
