# MITA SS-A Implementation Status

This document tracks what has been implemented, deviations from the original plan, and rationale for changes made during development.

**Last Updated:** January 29, 2026

---

## Implementation Summary

| Category | Planned | Implemented | Notes |
|----------|---------|-------------|-------|
| v1.0 Core Features | 100% | 100% | All MVP features complete |
| v2.0 Redesign | 100% | 100% | Core refactor complete |
| v3.0 Features | 100% | 100% | Attachments, Export/Import, PDF |
| UI/UX | 100% | ~95% | Toast notifications deferred |
| PWA | 100% | ~70% | Icons and testing remaining |
| Deployment | 100% | 0% | Ready but not deployed |

---

## v3.0 Features Status (January 29, 2026)

Ported features from MITA 4.0 reference implementation, adapted for 3.0 data model.

### Phase 3.1: Attachments System ✅

| Task | Status | Notes |
|------|--------|-------|
| Add `Attachment` type | ✅ | Blob storage in IndexedDB |
| Add `attachments` table to database | ✅ | Schema v5 |
| Add `attachmentIds` to Rating type | ✅ | Links ratings to attachments |
| Create `useAttachments` hook | ✅ | CRUD operations for attachments |
| Create `AttachmentUpload` component | ✅ | Drag-drop, file validation, descriptions |
| Integrate into Assessment page | ✅ | Per-question attachment support |
| Update `useCapabilityAssessments` | ✅ | Delete attachments on assessment delete |

### Phase 3.2: Export Services ✅

| Task | Status | Notes |
|------|--------|-------|
| Create export types | ✅ | `ExportData`, `ExportOptions`, etc. |
| Create PDF styles | ✅ | Colors, margins, typography |
| Create JSON export | ✅ | Full data export |
| Create ZIP export | ✅ | JSON + attachments with manifest |
| Create PDF export | ✅ | Professional report with jsPDF |
| Add progress callbacks | ✅ | For UI feedback |

### Phase 3.3: Import Services ✅

| Task | Status | Notes |
|------|--------|-------|
| Create import service | ✅ | Handles JSON and ZIP files |
| Implement merge strategy | ✅ | Newer → current, older → history |
| Restore attachments from ZIP | ✅ | Extracts and stores blobs |
| Validate import data | ✅ | Version and structure checks |

### Phase 3.4: UI Pages ✅

| Task | Status | Notes |
|------|--------|-------|
| Create Import/Export page | ✅ | Stats, export options, import |
| Create Guide page | ✅ | How-to steps, data info, MITA info |
| Create StateNameDialog | ✅ | Prompts for state name on export |
| Create ImportDialog | ✅ | File selection, preview, progress |
| Update Home page | ✅ | "How It Works" section, privacy alert |

### Phase 3.5: Navigation Updates ✅

| Task | Status | Notes |
|------|--------|-------|
| Add Import/Export to nav | ✅ | Header navigation item |
| Add Guide to nav | ✅ | Header navigation item |
| Logo navigates to landing | ✅ | `/` route |
| Remove About nav item | ✅ | Landing page covers this |

---

## v2.0 Redesign Status (January 8, 2026)

Major architectural change from multi-capability assessments to single-capability assessments with tags.

### Phase 2.1: Data Model Refactor ✅

| Task | Status | Notes |
|------|--------|-------|
| Create `CapabilityAssessment` table schema | ✅ | Replaces Assessment + AssessmentCapability |
| Create `AssessmentHistory` table schema | ✅ | For snapshots |
| Create `Tags` table schema | ✅ | For autocomplete |
| Update `Ratings` table | ✅ | Now references `capabilityAssessmentId` |
| Database migration (v1 → v2) | ✅ | Simplified to v3 clean schema |
| Update TypeScript interfaces | ✅ | New types + legacy types preserved |
| Create `useCapabilityAssessments` hook | ✅ | CRUD operations |
| Create `useHistory` hook | ✅ | Snapshot and retrieval |
| Create `useTags` hook | ✅ | Tag management |
| Update `useRatings` hook | ✅ | Works with new model |
| Update `useScores` hook | ✅ | Works with new model |

### Phase 2.2: Dashboard Redesign ✅

| Task | Status | Notes |
|------|--------|-------|
| Update coverage table | ✅ | Shows all 72 capabilities |
| Add Tags column | ✅ | Chips from latest finalized + aggregated on business areas |
| Add action buttons (Assess/Resume/Edit) | ✅ | Replaced with menu system (v2.2) |
| Implement row expansion for history | ✅ | Shows past assessments + current with badge |
| Add tag filter bar | ✅ | Multi-select autocomplete |
| Remove assessment cards section | ✅ | No longer needed |
| Remove "New Assessment" button/link | ✅ | Assessments start from capability rows |
| Split Status into Status + Completion | ✅ | Progress bar + percentage (v2.2) |
| Add Action column header | ✅ | Clarifies menu purpose (v2.2) |
| Move expand arrows to left | ✅ | Consistency improvement (v2.2) |

### Phase 2.3: Assessment Page Redesign ✅

| Task | Status | Notes |
|------|--------|-------|
| Create BPT sidebar component | ✅ | Always visible, scrollable |
| Update layout: sidebar + main content | ✅ | BPT left, questions right |
| Create sticky header | ✅ | Name, area, tags, progress |
| Add tag input to sticky header | ✅ | Chips + autocomplete |
| Add help text for tags | ✅ | Explains tag purpose |
| Update finalize flow | ✅ | Returns to dashboard |
| Remove capability navigation | ✅ | Single capability only |
| Resizable sidebar | ✅ | Drag handle, 280-800px range |
| Collapsible sidebar | ✅ | Toggle button, thin collapsed state |
| Compact question layout | ✅ | Inline level descriptions (L1: text) |

### Phase 2.4: Tags System ✅

| Task | Status | Notes |
|------|--------|-------|
| Create TagInput component | ✅ | Chips + autocomplete |
| Implement tag autocomplete | ✅ | From previously used tags |
| Implement free-form tag entry | ✅ | Type + Enter, commits on blur |
| Display tags on dashboard | ✅ | Chip style |
| Implement dashboard tag filter | ✅ | Multi-select |

### Phase 2.5: History & Carry-Forward ✅

| Task | Status | Notes |
|------|--------|-------|
| Implement snapshot on edit | ✅ | Snapshots when clicking "Edit" on finalized |
| Implement history retrieval | ✅ | By capability code |
| Create history panel UI | ✅ | Date/time, score, tags list, "Current" badge |
| Implement carry-forward on Edit | ✅ | Changed to suggestions (v2.2) |
| Add carried-forward indicator | ✅ | Dashed border + "Previous" badge (v2.2) |
| Add HistoryViewDialog | ✅ | View full ratings/notes from snapshots (v2.2) |
| Add delete for history entries | ✅ | Remove individual snapshots (v2.2) |

### Phase 2.6: Cleanup & Integration ✅

| Task | Status | Notes |
|------|--------|-------|
| Remove NewAssessment page | ✅ | Deleted |
| Remove old assessment hooks | ✅ | Deleted useAssessments.ts |
| Update routing | ✅ | Removed /new route |
| Update header navigation | ✅ | Removed New Assessment link |
| Fix finalize race condition | ✅ | Moved editAssessment call to Dashboard |
| Fix tag saving | ✅ | Tags commit on Enter or blur |
| Remove debug console.log statements | ✅ | Cleaned up |

### Phase 2.8: Cancel/Discard & Deferred Edit ✅

| Task | Status | Notes |
|------|--------|-------|
| Add Close button | ✅ | Saves progress, returns to dashboard |
| Add Cancel button with confirmation | ✅ | Context-aware discard behavior |
| Implement deferred edit | ⬜ | Removed in v2.2 — editAssessment called from Dashboard |
| Add `discardAssessment()` hook | ✅ | Deletes in-progress assessment |
| Add `revertEdit()` hook | ✅ | Restores from history snapshot |
| Track dirty state in Assessment page | ✅ | `isDirty` and `originalStatus` |

### Phase 2.9: Dashboard & Carry-Forward Redesign (v2.2) ✅

| Task | Status | Notes |
|------|--------|-------|
| Split Status column | ✅ | Status (progress bar) + Completion (percentage) |
| Aggregated tags on business areas | ✅ | Shows combined tags from child capabilities |
| Replace action buttons with menu | ✅ | "Start" for new, "•••" menu for existing |
| Add view mode for assessments | ✅ | `?mode=view` query param |
| Add delete functionality | ✅ | Delete assessments and history entries |
| Carry-forward as suggestions | ✅ | Previous ratings shown as hints, not pre-filled |
| Add `previousLevel` to Rating type | ✅ | Stores suggestion for display |
| Fix duplicate ratings bug | ✅ | Compound index + transaction |
| Database upgraded to v4 | ✅ | For compound index on ratings |

### Phase 2.10: Navigation & Branding (v2.2) ✅

| Task | Status | Notes |
|------|--------|-------|
| Reorder navigation | ✅ | Dashboard first, About (was Home) second |
| Rename Home to About | ✅ | Clearer purpose |
| Logo navigates to Dashboard | ✅ | Dashboard is primary entry point |
| Right-align desktop nav | ✅ | Improved layout |
| Update Dashboard title | ✅ | "MITA State Self-Assessment Dashboard" |
| Improve Dashboard subtitle | ✅ | Better user guidance |

### Phase 2.7: PWA & Polish ⬜

| Task | Status | Notes |
|------|--------|-------|
| Add PWA icons | ⬜ | 192x192, 512x512 |
| Test offline functionality | ⬜ | |
| Responsive testing | ⬜ | |
| Toast notifications | ⬜ | |
| Deploy to GitHub Pages | ⬜ | |

---

## v2.0 Key Changes

### Data Model

**Before (v1.0):**
- `Assessment` → container with name, multiple capabilities
- `AssessmentCapability` → links assessment to capabilities
- `Rating` → linked to assessment + capability

**After (v2.0):**
- `CapabilityAssessment` → standalone record per capability
- `AssessmentHistory` → snapshots of finalized assessments (created when editing)
- `Tags` → for autocomplete suggestions
- `Rating` → linked to capability assessment only

### User Flow

**Before (v1.0):**
1. Click "New Assessment"
2. Select multiple capabilities
3. Name the assessment
4. Navigate between capabilities
5. Finalize entire assessment

**After (v2.0):**
1. View dashboard with all 72 capabilities
2. Click "Assess" on any capability → creates new assessment
3. Add tags (press Enter after each, or click away to commit)
4. Answer questions (auto-saved)
5. Finalize → returns to dashboard with updated score/tags
6. Click "Edit" to modify → snapshots current state to history first
7. Filter dashboard by tags to see custom views

### Navigation

**Before:** Home | Dashboard | New Assessment
**After (v2.0):** Home | Dashboard
**After (v2.2):** Dashboard | About (logo → Dashboard)

### Assessment Page Layout

**Before:** Left sidebar (capability list) + Main content (BPT header + questions)
**After:** Left sidebar (BPT details, always visible) + Main content (sticky header with tags + questions)

### Dashboard Actions

| Capability Status | Action | Behavior |
|-------------------|--------|----------|
| Not Assessed | "Start" button | Creates new CapabilityAssessment, navigates to assessment page |
| In Progress | "•••" menu | Resume, View, Delete options |
| Finalized | "•••" menu | Edit, View, Delete options |

### Assessment Page Actions (v2.1)

| Button | Behavior |
|--------|----------|
| Close | Saves progress, keeps `in_progress` status if dirty, returns to dashboard. Allows "Resume" later. |
| Cancel | Shows warning dialog, then discards changes. If editing finalized: reverts to previous state. If new in-progress: deletes entirely. |
| Finalize | Marks complete, calculates score, returns to dashboard. |

### Carry-Forward Behavior (v2.2)

**Before (v2.0-v2.1):** When editing a finalized assessment, all ratings were pre-filled with previous values and marked as `carriedForward: true`.

**After (v2.2):** Carry-forward is now implemented as **suggestions**:
- Previous ratings are stored in `previousLevel` field but `level` is set to `null`
- UI shows previous selection with dashed blue border and "Previous" badge
- User must explicitly re-confirm each rating (click to select)
- Progress accurately reflects only confirmed ratings
- Prevents accidental submission of stale data

---

## Bug Fixes During Implementation

### 1. Finalize Not Working (Race Condition)

**Problem:** After clicking Finalize, the assessment would remain "in_progress" in the database.

**Root Cause:** The Assessment page had a `useEffect` that automatically called `editAssessment()` when it detected a finalized assessment. This created a race condition:
1. User clicks Finalize → status set to `'finalized'`
2. React re-renders, `useLiveQuery` updates `assessment` object
3. Effect sees `status === 'finalized'` and calls `editAssessment()` → status back to `'in_progress'`
4. Navigation to dashboard happens

**Solution:** Removed the auto-edit effect from Assessment page. Instead, the Dashboard now calls `editAssessment()` BEFORE navigating when user clicks "Edit" button.

### 2. Tags Not Saving

**Problem:** Tags typed into the input field weren't being saved to the assessment.

**Root Cause:** The MUI Autocomplete with `freeSolo` mode requires explicit commitment of typed values. Users were typing tags and clicking away without pressing Enter.

**Solution:** 
- Added `onBlur` handler to commit pending input when user clicks away
- Updated help text to say "Press Enter after each tag"
- Tags now commit on Enter key OR on blur

### 3. History Not Showing After Edit

**Problem:** After editing a finalized assessment and re-finalizing, no history entry appeared.

**Root Cause:** The `finalizeAssessment` function looked for a *different* finalized assessment to snapshot. But when editing, we change the same record to `in_progress`, so there's no other finalized record to find.

**Solution:** Moved the snapshot logic to `editAssessment()`. Now when user clicks "Edit" on a finalized assessment:
1. Current state is snapshotted to `AssessmentHistory`
2. Status is set to `in_progress`
3. User makes changes
4. User finalizes (no snapshot needed, already done)

### 4. Duplicate Ratings Bug

**Problem:** Multiple rating records were being created for the same question when rapidly clicking or during edits.

**Root Cause:** Race condition in `setRating()` — multiple calls could create duplicate records before the first one completed.

**Solution:** 
- Added compound index `[capabilityAssessmentId+questionIndex]` to ratings table
- Wrapped rating operations in Dexie transaction
- Database upgraded to v4 for the new index

---

## Completed Features (v1.0 + v2.0)

### Project Infrastructure ✅

| Feature | Status | Implementation Details |
|---------|--------|------------------------|
| Vite + React + TypeScript | ✅ | React 19, TypeScript 5.9, Vite 7 |
| MUI Theme | ✅ | HourKeep theme (warm purple palette) |
| React Router | ✅ | v7 with basename for GitHub Pages |
| Dexie Database | ✅ | v4 with reactive hooks, compound indexes |
| PWA Plugin | ✅ | vite-plugin-pwa configured |
| Blueprint Data | ✅ | 72 BCM + 72 BPT files bundled |
| GitHub Actions | ✅ | Workflow file created |

### Data Layer ✅

| Feature | Status | Implementation Details |
|---------|--------|------------------------|
| Capability Assessment CRUD | ✅ | Single-capability model |
| Rating CRUD | ✅ | Per-question ratings with auto-save, compound index |
| Assessment History | ✅ | Snapshots on edit (before changes) |
| Tags System | ✅ | Autocomplete + free-form, commits on Enter/blur |
| Carry-forward | ✅ | Suggestions with previousLevel (v2.2) |
| Auto-save | ✅ | Immediate persistence |
| View mode | ✅ | Read-only assessment view (v2.2) |
| Delete functionality | ✅ | Delete assessments and history (v2.2) |

### Pages ✅

| Page | Status | Features |
|------|--------|----------|
| Home (About) | ✅ | Privacy messaging, feature cards, CTA |
| Dashboard | ✅ | Coverage table, tag filter, history expansion, action menus |
| Assessment | ✅ | BPT sidebar, tag input, questions, finalize, view mode |

### UI Components ✅

| Component | Status | Implementation Details |
|-----------|--------|------------------------|
| Layout | ✅ | Header nav (Dashboard-first), responsive, right-aligned desktop nav |
| Coverage Table | ✅ | Expandable rows, progress bar, completion %, scores, aggregated tags |
| BPT Sidebar | ✅ | Resizable (drag), collapsible, separate mobile/desktop widths |
| Tag Input | ✅ | Chips + autocomplete, commits on Enter/blur |
| Question Cards | ✅ | Compact inline levels, notes, suggestion indicators (dashed border) |
| History Panel | ✅ | Shows past assessments + current with badge, view/delete actions |
| HistoryViewDialog | ✅ | Full ratings/notes from snapshots (v2.2) |
| Action Menu | ✅ | Context menu for in-progress/finalized capabilities (v2.2) |

---

## File Structure (v3.0)

```
mita-3.0-ssa/
├── .github/workflows/deploy.yml
├── public/favicon.svg
├── src/
│   ├── components/
│   │   ├── assessment/
│   │   │   ├── AttachmentUpload.tsx    # v3.0 - new
│   │   │   └── index.ts                # v3.0 - new
│   │   ├── export/
│   │   │   ├── ImportDialog.tsx        # v3.0 - new
│   │   │   ├── StateNameDialog.tsx     # v3.0 - new
│   │   │   └── index.ts                # v3.0 - new
│   │   └── layout/Layout.tsx
│   ├── data/
│   │   ├── bcm/                 # 72 BCM JSON files
│   │   └── bpt/                 # 72 BPT JSON files
│   ├── hooks/
│   │   ├── useAttachments.ts            # v3.0 - new
│   │   ├── useCapabilityAssessments.ts  # v2.0 - updated v3.0
│   │   ├── useRatings.ts                # v2.0 - updated v3.0
│   │   ├── useScores.ts                 # v2.0 - updated v3.0
│   │   ├── useHistory.ts                # v2.0
│   │   └── useTags.ts                   # v2.0
│   ├── pages/
│   │   ├── Assessment.tsx       # v2.0 - updated v3.0
│   │   ├── Dashboard.tsx        # v2.0
│   │   ├── Guide.tsx            # v3.0 - new
│   │   ├── Home.tsx             # v3.0 - updated
│   │   └── ImportExport.tsx     # v3.0 - new
│   ├── services/
│   │   ├── blueprint.ts
│   │   ├── db.ts                # v5 schema (attachments)
│   │   └── export/              # v3.0 - new directory
│   │       ├── exportService.ts
│   │       ├── importService.ts
│   │       ├── index.ts
│   │       ├── pdfExport.ts
│   │       ├── pdfStyles.ts
│   │       └── types.ts
│   ├── theme/index.ts
│   ├── types/index.ts           # v3.0 - updated
│   ├── App.tsx                  # v3.0 - updated routes
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

**Added in v3.0:**
- `src/components/assessment/` directory
- `src/components/export/` directory
- `src/services/export/` directory
- `src/pages/Guide.tsx`
- `src/pages/ImportExport.tsx`
- `src/hooks/useAttachments.ts`

---

## Remaining Work

### PWA & Polish

| Task | Status | Priority |
|------|--------|----------|
| Create PWA icons (192x192, 512x512) | ⬜ | High |
| Test offline functionality | ⬜ | High |
| Test "Add to Home Screen" | ⬜ | Medium |
| Toast/snackbar notifications | ⬜ | Medium |
| Responsive testing | ⬜ | High |
| Accessibility audit | ⬜ | High |
| Deploy to GitHub Pages | ⬜ | High |
| Remove console.log debug statements | ✅ | Cleaned up |

---

## Known Issues & Technical Debt

### 1. Bundle Size Warning
- **Issue:** Bundle exceeds 500KB (currently ~1.7MB)
- **Cause:** 144 JSON files bundled into app
- **Impact:** Slower initial load
- **Mitigation:** Acceptable for offline-first PWA

### 2. Missing Toast Notifications
- **Issue:** No user feedback for actions (finalize, etc.)
- **Status:** Deferred to polish phase

### 3. Debug Console Logs
- **Issue:** Several `console.log` statements added during debugging
- **Status:** ✅ Removed (January 8, 2026)
- **Files cleaned:** `useCapabilityAssessments.ts`, `Dashboard.tsx`

---

## Testing Checklist (v2.0+)

### Functional Testing
- [x] Click "Start" on unassessed capability
- [x] Add tags during assessment (press Enter to commit)
- [x] Rate all questions
- [x] Add notes to questions
- [x] Finalize assessment
- [x] Verify return to dashboard
- [x] Verify score appears on dashboard
- [x] Verify tags appear on dashboard
- [x] Click "Resume" on in-progress (via menu)
- [x] Click "Edit" on finalized (via menu)
- [x] Verify history snapshot created on edit
- [x] Expand capability to see history
- [x] View mode shows read-only assessment
- [x] Delete assessment from menu
- [x] Delete history entry
- [x] Carry-forward shows as suggestions (not pre-filled)
- [ ] Filter dashboard by tags
- [ ] Clear tag filter
- [ ] Verify suggestion indicators on edited assessments

### Responsive Testing
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

---

## Changelog

### January 29, 2026 - v3.0 Attachments, Export/Import, PDF Reports

**Attachments System:**
- Added `Attachment` type with blob storage in IndexedDB
- Created `useAttachments` hook for CRUD operations
- Created `AttachmentUpload` component with drag-drop, file validation
- Integrated attachments into Assessment page (per-question)
- Database upgraded to v5 with attachments table
- Added `attachmentIds` field to Rating type

**Export Services:**
- Created comprehensive export service with JSON, ZIP, and PDF formats
- ZIP exports include JSON data + attachments folder with manifest
- PDF reports generated with jsPDF + jspdf-autotable
- Professional PDF layout with cover page, executive summary, business area details
- Progress callbacks for UI feedback during export

**Import Services:**
- Created import service supporting JSON and ZIP files
- Implemented "merge with history" strategy:
  - Newer imported data becomes current, existing moves to history
  - Older imported data added to history, current unchanged
- Automatic attachment restoration from ZIP backups
- Data validation for version and structure

**New Pages:**
- Import/Export page with stats summary, export options, import functionality
- Guide page with step-by-step instructions, data privacy info, MITA 3.0 overview
- StateNameDialog for prompting state name on exports
- ImportDialog with file selection, preview, and progress tracking

**Navigation Updates:**
- Added Import/Export and Guide to header navigation
- Logo now navigates to landing page (`/`)
- Removed About nav item (landing page covers this)
- Updated Home page with "How It Works" section and data privacy alert

**Dependencies Added:**
- jszip ^3.10.1 (ZIP file handling)
- jspdf ^4.0.0 (PDF generation)
- jspdf-autotable ^5.0.7 (PDF tables)

**Files Added:**
- `src/hooks/useAttachments.ts`
- `src/components/assessment/AttachmentUpload.tsx`
- `src/components/assessment/index.ts`
- `src/components/export/ImportDialog.tsx`
- `src/components/export/StateNameDialog.tsx`
- `src/components/export/index.ts`
- `src/services/export/types.ts`
- `src/services/export/pdfStyles.ts`
- `src/services/export/exportService.ts`
- `src/services/export/pdfExport.ts`
- `src/services/export/importService.ts`
- `src/services/export/index.ts`
- `src/pages/ImportExport.tsx`
- `src/pages/Guide.tsx`

**Files Modified:**
- `src/types/index.ts` - Added Attachment type, attachmentIds to Rating
- `src/services/db.ts` - Schema v5 with attachments table
- `src/hooks/useRatings.ts` - Initialize attachmentIds
- `src/hooks/useCapabilityAssessments.ts` - Delete attachments on assessment delete
- `src/hooks/useScores.ts` - Added getOverallScore, total to getStatusCounts
- `src/pages/Assessment.tsx` - Attachment integration
- `src/pages/Home.tsx` - How It Works section, privacy alert
- `src/components/layout/Layout.tsx` - Updated navigation
- `src/App.tsx` - Added new routes

---

### January 9, 2026 - v2.2 Dashboard Redesign & Carry-Forward Suggestions

**Dashboard Improvements:**
- Split Status column into Status (progress bar) and Completion (percentage)
- Added aggregated tags to business area rows from child capabilities
- Moved expand arrows to left of names for consistency
- Replaced action buttons with unified menu system:
  - "Start" button for not-assessed (direct action)
  - "•••" button for in-progress/finalized (opens context menu)
- Added "Action" column header for clarity
- Show current assessment in history panel with "Current" badge
- Added date/time to history entries with aligned columns

**Assessment Editing Changes:**
- Implemented carry-forward as suggestions instead of pre-filled values
- When editing finalized assessment, ratings show previous selection as highlighted hint but require user to re-confirm each rating
- Progress accurately reflects confirmed ratings, not carried-forward data
- Added `previousLevel` field to Rating type for suggestion display
- Visual indicators: dashed blue border and "Previous" badge on suggested level

**Other Improvements:**
- Added view mode for assessments (`?mode=view` query param)
- Added delete functionality for assessments and history entries
- Added HistoryViewDialog to show full ratings/notes from snapshots
- Fixed duplicate ratings bug with compound index and transaction
- Removed deferred edit logic (editAssessment now called from Dashboard)
- Database upgraded to v4 for compound index

**Navigation & Branding:**
- Reordered navigation items to prioritize Dashboard as primary entry point
- Renamed Home navigation item to About for clarity
- Updated logo click behavior to navigate to Dashboard instead of Home
- Right-aligned desktop navigation menu for improved layout
- Updated Dashboard page title to "MITA State Self-Assessment Dashboard"
- Improved Dashboard subtitle copy for better user guidance

---

### January 8, 2026 - v2.0 Assessment Flow Redesign

**Major Changes:**
- Switched from multi-capability to single-capability assessment model
- Dashboard is now the central hub for starting assessments
- Added tags system for organizing capabilities
- BPT moved from header to sidebar (always visible)
- Assessment history with snapshots (created when editing)

**UI/UX Improvements (Assessment Page):**
- Resizable BPT sidebar with drag handle (280-800px range)
- Collapsible sidebar with expand/collapse toggle
- Separate sidebar widths for desktop (600px) and mobile (320px)
- Compact question card layout with inline level descriptions (L1: text...)
- Reduced vertical whitespace for less scrolling

**Added:**
- `CapabilityAssessment` table (replaces Assessment + AssessmentCapability)
- `AssessmentHistory` table for snapshots
- `Tags` table for autocomplete
- `useCapabilityAssessments` hook with `startAssessment`, `editAssessment`, `finalizeAssessment`, `discardAssessment`, `revertEdit`
- `useHistory` hook
- `useTags` hook
- Tag input component with autocomplete (commits on Enter or blur)
- BPT sidebar component
- History panel in dashboard (expandable rows)
- Tag filter in dashboard
- Action buttons (Assess/Resume/Edit) per capability

**Changed:**
- Database schema to v3 (clean slate, removed legacy tables)
- Dashboard layout (removed assessment cards, added tag filter)
- Assessment page layout (BPT in sidebar, tags in header)
- Navigation (removed New Assessment link)
- `useRatings` hook (works with capabilityAssessmentId)
- `useScores` hook (works with new model)
- Edit flow: snapshots to history BEFORE editing, not on finalize

**Removed:**
- NewAssessment page
- useAssessments hook
- Multi-capability assessment flow
- Assessment cards on dashboard
- Capability navigation in assessment
- Auto-edit effect in Assessment page (was causing race condition)

**Fixed:**
- Finalize race condition (editAssessment was being called after finalize)
- Tags not saving (now commits on Enter or blur)
- History not appearing after edit (snapshot now happens on edit, not finalize)

---

### January 8, 2026 (PM) - v2.1 Cancel/Discard & Deferred Edit

**Added:**
- Close/Cancel/Finalize button trio on assessment page
- `discardAssessment()` hook function — deletes in-progress assessment entirely
- `revertEdit()` hook function — restores finalized assessment from history snapshot
- Cancel confirmation dialog with context-aware messaging
- Deferred edit logic — status only changes on first actual modification

**Changed:**
- Dashboard no longer calls `editAssessment()` when clicking "Edit" — just navigates
- Assessment page tracks `isDirty` and `originalStatus` for deferred edit
- History snapshot now created on first change, not on page load
- Cancel behavior varies by context:
  - Editing finalized with changes → reverts to previous finalized state
  - Editing finalized without changes → just navigates back  
  - New in-progress → deletes assessment entirely

**Fixed:**
- Edit without changes no longer creates unnecessary history entries
- Edit without changes no longer flips status to in_progress

**Removed:**
- Debug `console.log` statements from `useCapabilityAssessments.ts` and `Dashboard.tsx`

---

### January 7, 2026 - v1.0 Initial Implementation

**Added:**
- Complete project scaffolding
- All 4 main pages (Home, Dashboard, New Assessment, Assessment)
- Dexie database with 3 tables
- Blueprint data loading
- Assessment CRUD operations
- Rating system with auto-save
- Progress tracking
- Carry-forward functionality
- Coverage overview table
- HourKeep theme integration
- GitHub Actions deployment workflow

---

*This document should be updated as implementation progresses.*

---

## September 2026 — Browser Audit Remediation

A full browser-driven audit (Playwright, all seven routes) was run against the app and
the findings were remediated in six waves. See `AUDIT_REMEDIATION_PLAN.md` for the
findings, reproduction steps, and reasoning behind each fix.

### Data loss (Wave 1)

| Issue | Resolution |
|-------|-----------|
| Typed notes destroyed by clicking a rating | `useRatings` now exposes field-scoped writes (`setRatingLevel` / `setRatingNotes`), so neither path can overwrite the other's field with a stale value |
| "Edit" then navigating away hid the previous score, tags and tag filter | `editAssessment` records an `editSnapshotId`; `useScores` exposes `previousScore` so the dashboard keeps showing the prior result during a re-assessment |
| Revert orphaned attachments permanently | `revertEdit` restores ratings in place (matched on `questionIndex`) instead of recreating them with new ids, and rebuilds `attachmentIds` from the attachments table |
| Stale score retained on in-progress rows | `editAssessment` clears `score` and `finalizedAt`; the prior value lives in the history snapshot |
| Edit was destructive with no warning | Dashboard now confirms via a "Re-assess this capability?" dialog |

### Import/export integrity (Wave 2)

| Issue | Resolution |
|-------|-----------|
| Import committed data then reported failure | The whole merge runs in a single Dexie transaction — all-or-nothing |
| Raw JS errors surfaced as user copy | New `importValidation.ts` validates the payload before any write and returns plain-language messages |
| No field validation (accepted `score: 42`, `level: 99`, `questionIndex: 999`) | Every record is range-checked and normalized; rejected records are reported as warnings |
| Missing `tags` / `history` keys aborted the import | These collections are now optional |
| Tag import could throw `ConstraintError` after writing everything | Imported tags get fresh ids |
| Ambiguous assessment selection when a capability had two rows | Deterministic resolution (finalized, then in-progress) |
| Existing ratings destroyed with no history snapshot | Always snapshots when the local record has answered questions |
| Finalized assessments always displayed 100% completion | Real progress is shown for every status |
| State name collected then discarded for ZIP/JSON | Persisted into the export payload and manifest; JSON export now prompts too |
| PDF printed questions out of order | Ratings are sorted by `questionIndex` |

### Mobile and routing (Wave 3)

- Assessment header stacks vertically below `md`. The tag field was previously rendered
  0px wide and off-screen at phone widths, making tagging impossible on mobile.
- Dashboard hides Tags/Status/Completion below `md` so the primary action stays on-screen
  (the table previously overflowed and hid the "Start" button behind a horizontal scroll).
- Added a catch-all route. Unmatched URLs previously rendered a completely blank page with
  no header or navigation, because every route was a child of the layout route.
- Invalid assessment ids now show a recoverable error instead of an indefinite "Loading...".

### Correctness and copy (Wave 4)

- Tag validation is now enforced on the single commit path (`isValidTag` was dead code
  because MUI's `freeSolo` `onChange` bypassed it; `#!!bad tag!!` was accepted).
- `usageCount` is recomputed from the assessments table instead of incremented per write.
  It previously reached 8 for one tag on one assessment, corrupting autocomplete ordering.
- "Hide Attachments" now works (it could never collapse once a file existed).
- The cancel dialog's title, body and confirm label all derive from one condition. The
  title previously said "Discard Assessment?" above body text promising a restore.
- Expand toggles use functional `setState` (batched toggles were being dropped).
- Capability counts are derived from the blueprint service so they cannot drift.

### Accessibility (Wave 5)

- Exactly one `<h1>` per page; statistic values no longer render as headings.
- Per-route `document.title` via `usePageTitle`.
- `<nav>` landmark, skip link, and `#main-content` target.
- Row expanders, the `•••` action button and the logo have accessible names;
  expanders and the attachment toggle expose `aria-expanded`.
- Progress bars expose `role="progressbar"` / `role="img"` with text alternatives.
- Visible `:focus-visible` outline (focus previously computed to `outline: none`).

Full WCAG conformance still requires manual testing with assistive technology and expert
review; this wave addressed the mechanically detectable issues.

### Build and PWA (Wave 6)

- Generated the full icon set (`pwa-192x192`, `pwa-512x512`, a padded
  `pwa-maskable-512x512`, `apple-touch-icon`, `favicon.ico`, `mask-icon`). The manifest
  previously declared icons that did not exist, so the app could not be installed
  despite being marketed as installable. Icons now use the theme purple `#6B4E71`.
- `html2canvas`, `canvg` and `dompurify` are aliased to a stub: jsPDF pulls them in for its
  `.html()` renderer, which this app never uses. Total JS dropped from ~652 KB to
  ~548 KB gzipped, and `dist` from 2.9 MB to 2.6 MB.

---

## Wave 7 — Review remediation and test coverage

The Wave 1-6 change set was reviewed three ways (design review of the diff, an adversarial red-team pass
against the running app, and a senior pre-merge review). All three returned *needs changes*, and several
defects were in the Wave 1-6 code itself. See `AUDIT_REMEDIATION_PLAN.md` for the full account, including
why they were missed.

**Data destruction fixed**

- Revert-vs-delete now derives from `editSnapshotId` rather than "does this capability have any history".
  The old test meant discarding a *fresh* assessment on a capability with unrelated history restored that
  snapshot onto it, marked it finalized, and destroyed the snapshot.
- Deleting the history entry backing an in-progress re-assessment is blocked, with an explanation. It
  previously turned "Discard changes" into delete-everything.
- `AssessmentHistory.score` is now nullable, so nothing fabricates a score of 0 for a scoreless
  assessment. A 0 rendered as "0.0", entered averages on a 1-5 scale, and failed this app's own import
  validator on re-import.
- `previousScore` resolves only through the assessment's own snapshot, so deleting a finalized assessment
  no longer resurrects its score into the dashboard and the overall average.
- `finalizeAssessment` is transactional and no longer archives references to attachment blobs it deletes.
- `startAssessment` is idempotent per capability; double-clicking "Start" no longer creates two rows.

**Notes now auto-save while typing** (600 ms debounce, plus flush on unmount, `pagehide` and
`visibilitychange`). Saving only on blur meant a reload or browser Back silently discarded them.

**Import reporting fixed.** `result.errors` is actually rendered — previously every validation message
was computed and thrown away, leaving users with "Import completed with 1 error(s)" and no explanation.
Per-item error handling was restored inside the transaction, and Dexie's raw messages are translated.
Newly reported rather than silent: orphaned answers, duplicate ids, two assessments for one capability,
unverifiable scores, malformed history, and merges that replace more answers than they supply.

**Mobile.** Expanding a history row no longer widens the table from 341 px to 767 px (responsive
`colSpan` plus a wrapping `HistoryPanel`). Import result chips wrap. 320 px no longer overflows.

**Tests — `vitest` + `fake-indexeddb`, 108 tests in four suites.** `npm test` / `npm run test:watch`.
`fake-indexeddb` is a real IndexedDB implementation, so Dexie runs unmodified with no abstraction layer.

| Suite | Tests | Covers |
|-------|-------|--------|
| `importValidation.test.ts` | 54 | Every reject/coerce branch, boundaries, optional collections, hostile input |
| `assessmentLifecycle.test.ts` | 22 | Edit/revert round-trip, rating identity, the negative discard case, tag counts |
| `importService.test.ts` | 19 | Merge matrix, atomicity under forced failure, deterministic resolution |
| `useRatings.test.ts` | 13 | Field-scoped writes — the notes-loss regression guard |

This required extracting `src/services/assessmentLifecycle.ts` and `src/services/ratingWrites.ts` from
their hooks. Neither ever touched component state.

### Still outstanding

| Item | Notes |
|------|-------|
| Two capabilities excluded from the blueprint | Upstream data issue in `mita-open-blueprint` — BCM/BPT filename mismatch. The app now warns in development. |
| Main chunk exceeds 500 KB | 2.59 MB raw / 550 KB gzipped, dominated by the eagerly-inlined blueprint JSON. Acceptable for an offline-first PWA, but route-level code splitting or lazy blueprint loading is the next meaningful win. |
| No component/interaction tests | The four suites cover the data-integrity surface. UI behaviour is still verified by hand. |
| Toast/snackbar notifications | Still deferred |
| Manual assistive-technology testing | Not automatable |
| Deploy to GitHub Pages | Workflow exists, not yet run |
