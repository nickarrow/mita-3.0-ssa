/**
 * UI Constants
 *
 * Centralized magic numbers and UI configuration values.
 */

// ===========================================
// Layout
// ===========================================

/** Height of app header (used in calc for main content) */
export const HEADER_HEIGHT = 64;

// ===========================================
// Dashboard - History Panel
// ===========================================

/** Width of the "Current" badge column in history panel */
export const HISTORY_BADGE_WIDTH = 70;

/** Width of the date column in history panel */
export const HISTORY_DATE_WIDTH = 160;

/** Width of the score column in history panel */
export const HISTORY_SCORE_WIDTH = 80;

/** Width of action buttons (Start, •••) */
export const ACTION_BUTTON_WIDTH = 64;

/** Maximum tags to show before "+N more" */
export const MAX_VISIBLE_TAGS = 3;

/** Minimum width for tag filter input */
export const TAG_FILTER_MIN_WIDTH = 200;

/**
 * How long to wait after the last keystroke before persisting notes.
 *
 * Short enough that a reload or a browser Back cannot realistically lose work,
 * long enough to avoid a database write per character.
 */
export const NOTES_AUTOSAVE_DELAY_MS = 600;

/**
 * Minimum width for the tag input in the assessment header.
 *
 * Without a floor, the flex row let the process title consume all available
 * width and collapsed this field to ~144px on desktop (chips truncated, no room
 * to type) and to 0px off-screen on narrow phones.
 */
export const TAG_INPUT_MIN_WIDTH = 240;

// ===========================================
// Progress Bars
// ===========================================

/** Height of business area progress bar */
export const PROGRESS_BAR_HEIGHT_LARGE = 22;

/** Height of capability progress bar */
export const PROGRESS_BAR_HEIGHT_SMALL = 18;

/** Height of legend indicator */
export const LEGEND_INDICATOR_SIZE = 16;

/** Height of inline linear progress */
export const LINEAR_PROGRESS_HEIGHT = 8;

/** Stripe width variants for progress gradients */
export const PROGRESS_STRIPE_WIDTH = {
  large: 4, // Business area bars
  medium: 3, // Capability bars
  small: 2, // Legend indicator
} as const;

// ===========================================
// Assessment Page
// ===========================================

/** Default width of BPT sidebar */
export const SIDEBAR_DEFAULT_WIDTH = 600;

/** Number of rows for notes textarea */
export const NOTES_TEXTAREA_ROWS = 3;

/** Min width for question number label */
export const QUESTION_NUMBER_MIN_WIDTH = 24;

/** Progress container sizing */
export const PROGRESS_CONTAINER_MIN_WIDTH = 100;
export const PROGRESS_CONTAINER_MAX_WIDTH = 150;

/** Z-index for sticky header */
export const STICKY_HEADER_Z_INDEX = 10;

// ===========================================
// Chips
// ===========================================

/** Standard height for compact chips */
export const COMPACT_CHIP_HEIGHT = 20;

/** Font size for compact chips */
export const COMPACT_CHIP_FONT_SIZE = "0.65rem";

/** Min width for level badge chips */
export const LEVEL_BADGE_MIN_WIDTH = 70;

// ===========================================
// Lists
// ===========================================

/** Min width for list item icons */
export const LIST_ITEM_ICON_MIN_WIDTH = 32;

/** Min width for attachment list item icons */
export const ATTACHMENT_ICON_MIN_WIDTH = 40;
