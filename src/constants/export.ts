/**
 * Export/Import Constants
 *
 * Configuration values for export and import operations.
 */

/**
 * Version stamped onto exports, and the versions this build can read.
 *
 * These live together because they are two halves of one compatibility contract:
 * bumping the written version without adding it to the readable list would make
 * the app unable to read its own exports.
 */
export const EXPORT_VERSION = "1.0";
export const SUPPORTED_EXPORT_VERSIONS = [EXPORT_VERSION];

/** Valid MITA maturity level range. A domain invariant, not a validation detail. */
export const MIN_MATURITY_LEVEL = 1;
export const MAX_MATURITY_LEVEL = 5;

/**
 * Sanity ceiling on question indices for capabilities this build doesn't know.
 *
 * Ordinarily an imported answer is bounds-checked against the capability's real
 * question count. That is impossible for an unrecognized capability code, so this
 * stops absurd values (`questionIndex: 999999999`) being written on the strength
 * of an unknown code alone. Well above the real maximum, which is 15.
 */
export const MAX_PLAUSIBLE_QUESTION_INDEX = 200;

/** Max characters for capability description before truncation in PDF */
export const PDF_DESCRIPTION_MAX_LENGTH = 300;

/** Maximum attachment file size (10MB) */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Tolerance for timestamp comparison during import (ms) */
export const TIMESTAMP_TOLERANCE_MS = 1000;

/** Tolerance for score comparison during import */
export const SCORE_TOLERANCE = 0.01;

/** Maximum import results to show before "and N more" */
export const MAX_VISIBLE_IMPORT_RESULTS = 10;
