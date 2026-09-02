/**
 * Tag usage bookkeeping.
 *
 * `Tag.usageCount` is derived data: it means "how many assessments carry this
 * tag", and it drives autocomplete ordering. Because it is derived, it is always
 * recomputed from the assessments table rather than adjusted incrementally.
 *
 * Two earlier approaches were wrong. Incrementing per write counted save events,
 * so one tag on one assessment could reach a count of 8. Recomputing only the tags
 * being saved fixed that but could never *decrease* a count, because a tag removed
 * from its last assessment is by definition absent from the list passed in, so it
 * stayed pinned to the top of the suggestions forever.
 *
 * Lives in services rather than in a hook because the import pipeline needs it too.
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "./db";

/**
 * Recompute `usageCount` for every tag, and register any newly seen names.
 *
 * One pass over assessments, so O(assessments + tags).
 *
 * @param touchedNames Names to register if unknown, and to stamp `lastUsed` on.
 * @param withinTransaction Set when already inside a Dexie `rw` transaction whose
 *   scope covers `tags` and `capabilityAssessments`, to avoid opening a nested one.
 */
export async function refreshTagUsage(
  touchedNames: readonly string[] = [],
  withinTransaction = false
): Promise<void> {
  const run = async () => {
    const now = new Date();
    const assessments = await db.capabilityAssessments.toArray();

    const counts = new Map<string, number>();
    for (const assessment of assessments) {
      for (const tag of assessment.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const touched = new Set(touchedNames);
    const existingTags = await db.tags.toArray();
    const known = new Set(existingTags.map((t) => t.name));

    for (const tag of existingTags) {
      const usageCount = counts.get(tag.name) ?? 0;
      const shouldTouch = touched.has(tag.name);
      if (tag.usageCount !== usageCount || shouldTouch) {
        await db.tags.update(tag.id, {
          usageCount,
          lastUsed: shouldTouch ? now : tag.lastUsed,
        });
      }
    }

    for (const name of touched) {
      if (known.has(name)) continue;
      await db.tags.add({
        id: uuidv4(),
        name,
        usageCount: counts.get(name) ?? 0,
        lastUsed: now,
      });
    }
  };

  if (withinTransaction) {
    await run();
    return;
  }

  await db.transaction("rw", [db.tags, db.capabilityAssessments], run);
}
