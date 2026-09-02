/**
 * Application identity.
 *
 * One source for the app's names so the document title, the header and the PWA
 * manifest cannot drift apart. `index.html` and `vite.config.ts` carry their own
 * copies because they are static and cannot import from `src/`; if you change
 * these, change those too.
 */

/** Full product name, used in document titles. */
export const APP_NAME = "MITA Self-Assessment Tool";

/** Short name for the header and other tight spaces. */
export const APP_SHORT_NAME = "MITA 3.0 SS-A";
