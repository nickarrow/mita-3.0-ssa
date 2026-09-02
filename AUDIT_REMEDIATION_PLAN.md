# Audit Remediation Plan

Findings from a Playwright browser audit of the running app on **September 1, 2026**. Every item below was
reproduced in a real browser against `npm run dev` (`http://localhost:5173/mita-3.0-ssa/`), not inferred
from reading code. Items marked **[verified]** include the exact reproduction.

This document is the working record for the remediation effort. It carries enough detail to resume work
from a cold start.

---

## Wave 7: review remediation (September 2, 2026)

After Waves 1-6, the change set was put through three independent review passes: a design-level review
of the diff, an adversarial red-team pass driving the real app, and a senior-engineer pre-merge review.
All three independently returned *needs changes*, and several of the defects they found were **in the
Wave 1-6 code itself**. Wave 7 fixes them and adds the test suite whose absence made them possible.

### Why they were missed

Worth recording, because the pattern matters more than the individual bugs:

- **The fix was built and not wired up.** `editSnapshotId` was added precisely because resolving history
  by date picks the wrong entry, then used inside `revertEdit` while the *caller* kept branching on the
  old heuristic. Verification exercised revert from a clean edit session, never the states where the two
  signals disagree.
- **Only the new path was tested.** The import validator's warnings were confirmed in the browser; its
  fatal errors were not, and `ImportDialog` never rendered `result.errors` at all. Every carefully
  worded rejection message was computed and discarded.
- **A safety improvement removed a safety net.** Wrapping the import in a transaction was right;
  deleting the per-item `try/catch` in the same edit made `result.errors` unreachable and let raw Dexie
  messages reach the user.

### 7A. Data destruction

| Defect | Fix |
|---|---|
| Revert-vs-delete decided by "does this capability have any history" | `Assessment.tsx` now derives `isEditSession` from `assessment.editSnapshotId`. Discarding a fresh assessment on a capability with unrelated history deleted it, marked it finalized from that snapshot, and destroyed the snapshot. |
| Deleting the snapshot behind an active edit turned Cancel into delete-everything | The dashboard refuses to delete a history entry referenced by an in-progress `editSnapshotId`, and explains why. |
| `editAssessment` wrote `score: 0` for a scoreless assessment | `AssessmentHistory.score` is now `number \| null`. A fabricated 0 rendered as "0.0", entered averages on a 1-5 scale, and was rejected by this app's own import validator on the way back in. |
| `previousScore` resolved through any leftover history | Resolved only via `editSnapshotId`. Deleting a finalized assessment no longer resurrects its score into the dashboard and averages. |
| Import derived a score from an unfinished local draft | Snapshots record the stored score or nothing. A two-question average could otherwise move the overall maturity number. |
| Clearing all tags looked like it hadn't saved | Removed the fallback to the prior snapshot's tags. |

### 7B. Import reporting and validation

- `result.errors` is rendered, with wording that distinguishes "nothing was imported" from "finished with
  problems". Every validation message is now reachable by a user.
- Per-item error handling restored *inside* the transaction: the failure is attributed to a named
  assessment, the transaction still aborts, and Dexie's wording is translated (`ConstraintError` becomes
  "it conflicts with data already stored in this browser").
- Newly reported instead of silent: orphaned answers, duplicate assessment ids, two assessments for one
  capability, a scored assessment with no verifiable answers, history entries with malformed answers, and
  merges that replace more local answers than they supply.
- Type errors are described as type errors — a score of `"4"` is no longer reported as out of range.
- Imported tags are held to the same rules as typed ones, and imported `usageCount` values are discarded
  and recomputed.
- Question-index bounds now apply to unknown capabilities too, via a sanity ceiling.
- The ZIP attachment restore resolves its target assessment the same way the merge does, and writes all
  matched files in one transaction.

### 7C. Lifecycle

- `finalizeAssessment` is transactional, and no longer writes a history snapshot referencing attachment
  blobs it is about to delete.
- `startAssessment` is idempotent per capability. Double-clicking "Start" created two in-progress rows,
  after which the finalized one was permanently masked and Edit disappeared.
- **Notes auto-save while typing** (600 ms debounce, plus a flush on unmount, `pagehide` and
  `visibilitychange`). Saving only on blur meant a reload or a browser Back silently discarded them —
  and nothing else in the app behaves that way.

### 7D. Mobile

- The expanded history row's `colSpan` follows the visible column count, and `HistoryPanel` wraps instead
  of forcing fixed-width columns. Expanding a row previously widened the table from 341 px to 767 px,
  undoing the column hiding on the exact interaction a user reaches for after tapping a row.
- Import result chips wrap; the dashboard header wraps; cells tighten at 320 px.

### 7E. Consistency

Tag rules centralised in `src/utils/tags.ts`; `usageCount` recomputed in one pass so it can decrease;
dead `useTags` writers removed; `getProgress` clamped like its counterpart; unknown-capability filtering
applied to every aggregate; `canvg` aliased alongside the other two; skip link `position: fixed`;
explicit icon `<link>` tags; blueprint lookups map-backed and the startup warning logged once;
export/import constants consolidated; progress bars use one ARIA pattern.

### 7F. Tests

`vitest` + `fake-indexeddb`, **108 tests** in four suites. `fake-indexeddb` is a real IndexedDB
implementation, so Dexie runs unmodified — transactions, compound indexes and all.

| Suite | Covers |
|---|---|
| `importValidation.test.ts` (54) | Every reject and coerce branch, boundaries (1 and 5 accepted, 0 and 6 not), optional collections, hostile input |
| `assessmentLifecycle.test.ts` (22) | Edit/revert round-trip, rating identity across revert, the negative discard case, tag counts up *and* down |
| `importService.test.ts` (19) | Merge matrix, atomicity via a forced mid-transaction failure, deterministic row resolution |
| `useRatings.test.ts` (13) | Field-scoped writes in both orders and concurrently — the notes-loss regression guard |

Making this possible required extracting the lifecycle and rating writes into
`src/services/assessmentLifecycle.ts` and `src/services/ratingWrites.ts`. Neither ever touched component
state; they sat inside hooks only by history, which meant reaching them required rendering a component.

### Verified after Wave 7

Every red-team reproduction was re-run in the browser:

| Repro | Before | After |
|---|---|---|
| Delete active edit snapshot, then Cancel | 1 assessment/10 ratings/2 attachments → 0 | Blocked with an explanation; history intact |
| Delete finalized, start fresh, Cancel | Finalized 2.0 with 10 unentered answers; history destroyed | Assessment deleted; history preserved |
| Double-click "Start" | 2 assessments, finalized row masked | 1 assessment |
| Type notes, reload | Notes gone | Notes persisted |
| Type notes, browser Back | Notes gone | Notes persisted |
| Unsupported version import | "Import completed with 1 error(s)", no text | "Nothing was imported — This file uses export version 2.0…" |
| Revert with attachments | Files orphaned | 0 orphaned, 0 dangling ids |
| Dashboard at 375 px with history expanded | Table 767 px, "•••" and "Start" off-screen | Table 341 px, no scroll, nothing off-screen |
| Import result dialog at 375 px | 2 of 3 chips clipped | Nothing off-screen |
| Page overflow at 320 px | 33 px | None |

`npm test` (108 passing), `tsc -b`, `eslint`, `prettier --check` and `npm run build` are all clean.
Total JS is now **548 KB gzipped**, down from 652 KB before Wave 6.

---

## Status: Waves 1-6 complete (September 2, 2026)

All six waves are implemented and re-verified in the browser. `tsc -b`, `eslint`, and `prettier --check`
are clean, the production build succeeds, and the app registers a service worker with all manifest icons
resolving.

**Post-fix verification highlights**
- Notes typed then interrupted by a rating click survive (`level: 3` **and** the note persisted).
- A capability being re-assessed keeps showing its previous score, tags and the tag filter.
- Revert leaves zero orphaned attachments and restores all ratings.
- Malformed imports are rejected with plain-language messages and write nothing.
- Out-of-range values are reported and discarded; overall score reads `3.4`, not `22.6`.
- PDF prints questions Q1-Q10 in order with the state name on the cover.
- Mobile (375px): tag field on-screen and usable, no overlaps, no horizontal scroll, "Start" reachable.
- Unknown routes and invalid assessment ids render recoverable error pages.
- Every route has a unique title and exactly one `<h1>`; nav landmark and skip link present.
- Zero console errors; the only warning is the intentional blueprint pairing diagnostic.

**Deliberately still open**
- **BP-1** (below): the two excluded capabilities need a filename fix in the upstream
  `mita-open-blueprint` repo. The app now warns about it in development instead of failing silently.
- Main chunk remains 2.58 MB raw / 549 KB gzipped, dominated by the eagerly inlined blueprint JSON.
  Route-level code splitting or lazy blueprint loading is the next meaningful win.
- Toast/snackbar notifications, manual assistive-technology testing, and the GitHub Pages deploy.

---

## Audit context (for cold-start recovery)

**Stack:** React 19 + MUI 7 + react-router-dom 7 + Dexie 4 (IndexedDB) + jsPDF 4 + JSZip 3. No backend,
no auth, no network I/O. All state is local to the browser.

**Router:** `BrowserRouter basename="/mita-3.0-ssa"`, `vite.config.ts` `base: '/mita-3.0-ssa/'`.
Dev URL is `http://localhost:5173/mita-3.0-ssa/`. Navigating to `/` without the basename renders nothing.

**Routes:** `/` Home, `/dashboard`, `/assessment/:id` (+`?mode=view`), `/processes`, `/processes/:code`,
`/import-export`, `/guide`. No catch-all.

**Data model:** `capabilityAssessments` (one row per capability, status `in_progress` | `finalized`),
`ratings` (FK `capabilityAssessmentId`, compound index `[capabilityAssessmentId+questionIndex]`,
`level` is `1..5 | null`), `assessmentHistory` (keyed by `capabilityCode`, **not** by assessment id),
`tags`, `attachments` (raw `Blob`). Dexie schema starts at v3; v4 is a no-op duplicate of v3; v5 adds
`attachments`. **There are no `.upgrade()` callbacks anywhere.**

**Useful debugging snippet** (works in Playwright `page.evaluate`):

```js
const req = indexedDB.open('MitaSSADatabase');
const d = await new Promise(r => { req.onsuccess = () => r(req.result); });
const get = s => new Promise(r => {
  const q = d.transaction(s, 'readonly').objectStore(s).getAll();
  q.onsuccess = () => r(q.result);
});
await get('capabilityAssessments'); // also: ratings, assessmentHistory, tags, attachments
```

**Playwright selector notes:**
- Dashboard rows only appear after clicking the business-area cell to expand; expansion resets on navigation.
- Attachment file inputs are `#attachment-upload-q{questionIndex}`.
- Import file input is `#import-file-input`.
- Rating rows are clicked via the visible `L{n}:` text, not the radio itself.
- `getByLabel('State Name')` is ambiguous; use `getByRole('textbox', { name: 'State Name' })`.

---

## Confirmed healthy (do not "fix" these)

These were tested and behave correctly. Several are listed as untested in `IMPLEMENTATION_STATUS.md`.

- **Scoring math is exact.** 10 questions summing to 32 produced `3.2`. Overall average of 5.0/1.0/3.0 produced `3.0`.
- **No duplicate ratings.** The compound index holds; rating 10 questions produced exactly 10 rows.
- **Keyboard rating works.** Arrow-key selection on a radio persists, because the radio's click event bubbles
  to the wrapper `Box` handler. An earlier hypothesis that this was broken was wrong.
- **Keyboard row expansion works** for the same bubbling reason (Enter expanded 9 → 13 rows).
- **Finalize gating** at `progress < 100` behaves correctly.
- **Carry-forward suggestions** work: `previousLevel` set, `level` nulled, `carriedForward` true, progress
  correctly resets to 0/10, Finalize correctly disabled.
- **Tag filter works.** Filtering narrowed to exactly the tagged capabilities; the summary chip
  recalculated to "2 of 2 finalized"; clearing restored the full list.
  *(As observed, options came only from finalized assessments. Wave 1.2 deliberately widened that to
  include in-progress work — see item 1.2 — because restricting it emptied the filter mid-edit. The
  filtering mechanism itself was and is sound.)*
- **History panel and HistoryViewDialog** render correctly, including the "Current" badge and full
  historical ratings with level descriptions and notes.
- **Import round-trip idempotency** is correct ("1 skipped — Identical to current assessment").
- **Unknown process code** degrades gracefully to the "Select a Process" empty state.
- **Mobile nav** hamburger, drawer, and Escape-to-close all work.
- **ZIP structure** is correct (`data.json`, `attachments/<capabilityCode>/<file>_<id>.<ext>`, `manifest.json`)
  and includes real blobs.
- **Attachment upload** stores blob, description, and back-reference correctly. File-type validation
  correctly rejects `.exe`.
- **Zero uncaught console errors** across the entire audit session.
- **`npm run build` passes** with a clean `tsc -b`.

---

## Set aside: upstream blueprint data issues

These are **data problems in the `mita-open-blueprint` source repo**, not app bugs. They should be fixed
there so every downstream consumer benefits. No app-side data edits are made by this plan.

### BP-1. Two capabilities silently disappear due to BCM/BPT filename mismatches [verified]

`src/data/` holds 76 BCM + 76 BPT files, but the app builds only **74** capabilities. `blueprint.ts`
emits a capability only `if (data.bcm && data.bpt)`, and two pairs never match because the filenames
disagree:

| Has BCM | Has BPT | Result |
|---|---|---|
| `CM_Manage_Treatment_Plans_and_Outcomes` | `CM_Manage_Treatment_Plan_and_Outcomes` | dropped |
| `PL_Maintain_Reference_Information` | `PL_Manage_Reference_Information` | dropped |

Note `Plans` vs `Plan` and `Maintain` vs `Manage`.

**Browser-verified impact:** Care Management shows **8** capabilities (should be 9), Plan Management shows
**7** (should be 8). Both capabilities are absent from the Dashboard and the Processes tree, and
`/processes/CM_Manage_Treatment_Plans_and_Outcomes` renders the empty state. The dashboard chip reads
"0 of 74 finalized".

**Upstream action:** decide the canonical name for each pair and rename so BCM and BPT agree. Fixing
either half of each pair immediately changes the app's total from 74 to 75, then 76, and shifts every
business-area and overall average.

**App-side action (in scope, Wave 5):** add a dev-time console warning when a capability code has one
half but not the other, so a mismatch can never again fail silently. The app should surface the problem,
not swallow it.

### BP-2. Process references that point at undefined processes [informational]

BPT predecessor/successor lists reference processes with no definition in the framework (e.g. "Receive
Inbound Transaction"). The app already handles this correctly — unresolved chips render italic/dimmed with
an explanatory tooltip. **No action needed in either repo**; recording it so it isn't mistaken for a bug.

---

## Wave 1 — Data loss (user work is being destroyed)

Highest priority. Each item silently loses work a user has already done.

### 1.1 Typed notes destroyed by clicking a rating [verified]

**Repro:** type `RACE-NOTES` into Q2's notes field, then click level `L4` without clicking away.
**Result:** DB holds `level: 4, notes: ""`. The note is gone.

**Cause:** `QuestionCard.tsx` `handleLevelChange` fires an un-awaited `saveRating(questionIndex, level, notes)`
where `notes` is the derived (pre-edit) value, while the textarea's blur fires a competing
`saveRating(questionIndex, level, localNotes)`. Both target the same compound-index row; last write wins.

**Fix:** make the level-change path never carry a stale notes value. Pass the live notes value, await the
writes, and drop `notes` from the level-change payload so the two writes can't clobber each other.

### 1.2 "Edit" then navigating away wipes the visible assessment [verified]

**Repro:** finalized capability (score 3.2, 4 tags) → ••• → Edit → click "Dashboard" in the nav.
**Result:** capability score "—", area score "—", tags gone from both rows, completion 0%, the tag filter
control disappears entirely, and the chip flips from "1 of 74 finalized" to "0 of 74". The only remaining
trace is the history panel.

**Cause:** `editAssessment` nulls every `level` and snapshots to history. `useScores` reports `score: null`
for `in_progress`, and `getAllTagsInUse`/`getCapabilityTags` only read finalized assessments.

**Fix:** treat "in progress with prior history" as a distinct, visible state rather than as "unassessed".
Surface the last finalized score and tags on the dashboard for a capability being re-assessed, and warn
before Edit that ratings will need re-confirming.

### 1.3 Revert permanently orphans attachments [verified]

**Repro:** upload an attachment to a finalized assessment being edited, then Cancel → Discard.
**Result:** every restored rating gets a **new UUID**, `rating.attachmentIds` comes back `[]`, and the
attachment row survives pointing at a rating that no longer exists. Confirmed
`orphanedAttachments: ["evidence-q1.txt"]` and zero occurrences in the UI. The blob is stranded in
IndexedDB with no UI path to view or delete it.

**Cause:** `revertEdit` deletes current ratings and recreates them with `uuidv4()`, breaking every
`Attachment.ratingId`. It never touches the `attachments` table.

**Fix:** preserve rating identity across a revert (restore by `questionIndex` onto the existing rating rows
rather than delete-and-recreate) and reconcile `attachmentIds` so uploads made during the edit session are
either kept or explicitly cleaned up. No blob should ever become unreachable.

### 1.4 Stale score retained on in-progress rows [verified]

After `editAssessment`, the row holds `status: "in_progress"` with `score: 3.2` and zero answered questions.
The score no longer describes the row's contents. Combined with 2.4 below, a stale score can surface as a
misleading number.

**Fix:** stop leaving a score on a row whose ratings have been nulled; derive displayed scores from the
last history snapshot instead (which pairs with 1.2).

---

## Wave 2 — Import/export integrity

Import is the only path by which foreign data enters the database. It currently trusts everything.

### 2.1 Import commits data, then reports failure [verified]

**Repro:** import a JSON with the `tags` key removed (`validateExportData` does not check it).
**Result:** the user sees the raw JS error **"data.data.tags is not iterable"**, which reads as a failure —
but the DB went from 1 → 2 assessments and 10 → 20 ratings.

**Cause:** `processImport` writes every assessment, *then* iterates `data.data.tags` and throws. There is no
transaction wrapping the import and no rollback. The tag/history loops sit outside the per-assessment
`try/catch`, so the error escapes after the writes have landed.

**Fix:** validate the full payload shape before any write (`tags`, `history`, `attachments` included), treat
missing optional collections as empty rather than fatal, and never surface a raw exception message as user
copy.

### 2.2 No field validation or range clamping [verified]

**Repro:** import a file declaring `score: 42`, `level: 99`, `questionIndex: 999`, and a `finalized`
assessment with only 3 of 10 ratings.
**Result:** all of it written, reported as **"Import completed successfully!"** The dashboard then rendered
capability score **42.0** and area/overall **22.6** on a 1–5 scale.

**Fix:** validate and reject (or clamp) `level` to 1–5, `score` to the valid range, `questionIndex` to the
capability's real question count, and `status` to the enum. Report rejected records instead of writing them.

### 2.3 Finalized assessments always display 100% completion [verified]

The 3-of-10-answered imported assessment displayed **100%**. `Dashboard.tsx` and `CapabilityProgressBar.tsx`
hardcode `status === "finalized" ? 100 : progress`. The display actively hides incompleteness.

**Fix:** show real answered/total progress regardless of status.

### 2.4 State Name is collected then discarded for ZIP and JSON [verified]

`StateNameDialog` says the name will be "included in the export". Verified **absent** from `data.json`,
`manifest.json`, and the ZIP filename. It only reaches the PDF (cover + footer). The ZIP dialog is
effectively a no-op, and JSON export never asks at all.

**Fix:** persist the state name into the export payload and manifest, and ask consistently across formats.

### 2.5 PDF prints questions out of order [verified]

Observed order: **Q9, Q10, Q8, Q6, Q3, Q4, Q1, Q7, Q2, Q5.** `pdfExport.ts` iterates ratings in DB order
rather than sorting by `questionIndex`. For a document intended for CMS submission this reads as unreliable.

**Fix:** sort by `questionIndex` before rendering. Also address the `"Capabilitie s"` mid-word break in the
summary table and the `"1 Attachments"` pluralization on the cover.

---

## Wave 3 — Mobile layout and routing dead ends

### 3.1 Assessment header is broken at phone widths [verified]

At **375×667** the sticky header fails several ways at once:
- The tag input container computes to **width 0** positioned at **x = 396 on a 375px viewport** — entirely
  off-screen. **Tagging is impossible on a phone.**
- "Show Process Details" overlaps the business-area overline text.
- The `h5` process title is clipped past the right edge.
- The progress bar and `0/10 (0%)` text collide with the title.

**Cause:** a single flex row pairs a `flexShrink: 0` title with a `flex: 1, minWidth: 0` tag box, so the long
title consumes all width and collapses the tag container.

**Tablet at 768px is fine** (tag box 232px, on-screen). The regression is specific to narrow viewports.

**Fix:** stack the header vertically below the `md` breakpoint so title, tags, and progress each get full width.

### 3.2 Primary action is off-screen on the mobile dashboard [verified]

The table is 546px inside a 343px container, so it scrolls horizontally. The **Completion and Action columns —
including the primary "Start" button — are off-screen** with no affordance indicating more columns exist.
The page body itself does not overflow, so the layout isn't broken, just unusable.

**Fix:** hide the lower-value columns at narrow widths so Score and Action remain visible.

### 3.3 Unknown routes render a blank white page [verified]

`/mita-3.0-ssa/totally-bogus-route` leaves `#root` **empty** — no header, no nav, no message, no escape.
Because every route is a child of `<Route path="/" element={<Layout/>}>`, an unmatched URL means `Layout`
never mounts. Console logs "No routes matched location".

**Fix:** add a catch-all route inside `Layout` with a real not-found page.

### 3.4 Invalid assessment IDs hang forever [verified]

`/assessment/not-a-real-id` sits on "Loading..." indefinitely with zero buttons in `main`. `Assessment.tsx`
renders the loading branch whenever `!assessment`, and a nonexistent id never resolves.

**Fix:** distinguish "still loading" from "resolved and absent", and show a recoverable error state.

---

## Wave 4 — Tags, correctness, and copy

### 4.1 Tag validation is dead code [verified]

`isValidTag` never gates anything. MUI's `freeSolo` Autocomplete `onChange` adds the typed value directly,
bypassing `commitTag`. Verified by persisting **`#!!bad tag!!`** — spaces and punctuation — which then
rendered on the dashboard and in the finalize dialog.

**Fix:** enforce validation on the single path that actually commits tags.

### 4.2 `usageCount` inflates [verified]

One tag applied to one assessment reached **`usageCount: 6`** (and 8 by the end of the session).
`updateTags` re-increments every tag on every call, and `Assessment.tsx` calls it again just before finalize.
The field measures writes, not usage, so autocomplete ordering degrades.

**Fix:** make the count reflect the number of assessments carrying the tag.

### 4.3 Tag input is unusably small [verified]

The input measures **144px** in the sticky header. Four chips stack vertically and truncate
(`#provid...`, `#!!bad t...`), leaving no room to type and inflating header height.

**Fix:** give the field a workable minimum width and let chips wrap sanely.

### 4.4 "Hide Attachments" is a no-op [verified]

Once any attachment exists, `attachmentsExpanded = attachments.length > 0 || manuallyExpanded` can never be
false. Verified: label and panel unchanged after clicking.

**Fix:** let the manual toggle actually control visibility.

### 4.5 Cancel dialog contradicts itself [verified]

Title reads **"Discard Assessment?"** while the body says the assessment **"will be restored to its previous
finalized state."** The title keys off `originalStatus`, the body off `hasHistory`, so they disagree whenever
a user resumes an abandoned edit. The alarming title discourages the one action that recovers their data.

**Fix:** derive both from the same condition and name the action for what it does.

### 4.6 Stale-closure expand toggles [verified]

`toggleArea`/`toggleCapability` build `new Set(expandedAreas)` from the closure instead of using functional
`setState`. Verified: clicking all 9 area rows within one tick expanded only the last.

**Fix:** use functional `setState`.

### 4.7 Capability count stated three different ways [verified]

README says **72** (with a per-area table that is also wrong), the Home page says **75+**, the app reports
**74**. Guide copy instructs clicking **"Start Assessment"** or **"Continue"**; the real controls are
**"Start"** and **"Resume"** (inside the ••• menu). The Dashboard subtitle is missing a word: *"Click on any
business area start, view, or edit…"*

**Fix:** derive counts from the blueprint service so they cannot drift, and correct the copy.

---

## Wave 5 — Accessibility

Measured on the Dashboard unless noted.

- **No `<h1>`** on Dashboard or Assessment (`h1` count 0). Assessment emits 11 sidebar `h6` elements before
  its `h5` title, and `QuestionCard` renders question text as `h6` via MUI `subtitle1`.
- **`document.title` is static** ("MITA Self-Assessment Tool") on all 7 routes.
- **No `<nav>` landmark** (count 0) and **no skip link**.
- **9 unnamed buttons in the tab order** — row expanders have no text, `aria-label`, or `title`. They *work*
  via keyboard (click bubbling) but announce as bare "button" and expose no `aria-expanded` state.
- **Focus indicator** on those expanders computes to `outline: none` with no `box-shadow`.
- **Zero `role="progressbar"` elements.** `StackedProgressBar` and `CapabilityProgressBar` have no ARIA and
  no text alternative.
- `html lang="en"` is correctly set.

Also in this wave: the dev-time blueprint pairing warning from **BP-1**.

Full WCAG conformance requires manual testing with assistive technology and expert review; this wave fixes
the mechanically detectable problems.

---

## Wave 6 — Build and PWA

### 6.1 The PWA cannot install [verified]

`public/` contains only `favicon.svg`. The generated manifest declares `pwa-192x192.png` and
`pwa-512x512.png`; **neither exists in `dist/` after a real build**. `index.html` references a missing
`apple-touch-icon.png`, and `includeAssets` lists `favicon.ico` and `mask-icon.svg` that don't exist. The dev
server returns `200 text/html` (SPA fallback) for the PNG paths and a hard `404` for `favicon.ico`.

The service worker itself generates correctly and precaches 8 entries (~2880 KiB), so **offline caching
works** — but "Add to Home Screen" cannot, despite the Home page and README marketing the app as installable.

The existing favicon is also off-brand: `#1565c0` blue versus the app's `#6B4E71` purple.

**Fix:** generate the real icon set from a brand-consistent source (`rsvg-convert` is available locally).

### 6.2 ~380 KB of unused dependencies ship [verified]

Build output: main chunk **2,565.70 kB** (543.63 kB gzip), total `dist` **2.9 MB**. Included are three of
jsPDF's optional dependencies for rendering HTML: `html2canvas` (201 kB), `canvg` (shipped as
`index.es`, 158 kB), and `dompurify` (shipped as `purify.es`, 22 kB). **Confirmed zero usage of
`html2canvas`, `canvg` or jsPDF's `.html()` anywhere in `src/`.**

`IMPLEMENTATION_STATUS.md` still claims ~1.7 MB, which is stale.

**Fix:** exclude all three from the bundle and refresh the documented figure.

### 6.3 Documentation accuracy

`IMPLEMENTATION_STATUS.md` marks several verified-working features as untested (tag filter, responsive) and
carries a stale bundle size. README carries wrong capability counts.

---

## Sequencing

Waves are ordered by user impact. Waves 1 and 2 protect data and should land first. Wave 3 fixes dead ends
and mobile usability. Waves 4–6 are correctness, accessibility, and delivery polish.

Verification after every wave: `npm run build` (includes `tsc -b`), `npm run lint`, plus targeted browser
re-tests of the specific repro steps recorded above.
