/**
 * Blueprint provenance and revision.
 *
 * `BCM.version` is CMS's framework version and is still "3.0" — correctly, since
 * CMS has published nothing new. But the *extraction* of that framework into JSON
 * has changed, and one of those changes moved question indices. Ratings are stored
 * by `questionIndex`, so the app needs its own marker for which extraction a
 * stored rating was made against. That is what these are for.
 *
 * Without this, old and new ratings are indistinguishable and answers silently
 * attach to the wrong questions.
 */

/**
 * Revision of the vendored extraction. Stamped onto assessments and history rows,
 * and written into exports.
 *
 * Bump this — and add a `BlueprintRevisionMigration` for it — whenever a re-sync
 * changes the number or order of questions for any capability. Do not bump it for
 * a sync that only corrects text: a needless bump costs a Dexie upgrade for every
 * user and buys nothing.
 */
export const BLUEPRINT_REVISION = "2026-09-02";

/**
 * Upstream commit the vendored data was taken from. Informational, but it is the
 * only way to tell precisely which extraction a build contains.
 *
 * Must match the commit recorded in `src/data/NOTICE.md`.
 */
export const BLUEPRINT_SOURCE_COMMIT = "19a7e6c4e82a93d66cf97f14f31afd542b6b45d5";

/**
 * Marker for data written before revisions were tracked.
 *
 * Rows and export payloads created by earlier builds carry no revision at all, so
 * absence is itself the signal: it means "extraction as of the 74-capability
 * dataset", which is exactly the data that needs remapping.
 */
export const PRE_REVISION = "pre-2026-09-02";
