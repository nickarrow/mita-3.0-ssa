# MITA 3.0 Self-Assessment Tool — Project Foundation

> **Historical record — the v2.2 design, January 2026.** Kept because it is the only written
> record of *why* the app is shaped the way it is: one assessment per capability rather than a
> multi-capability container, per-question ratings, tags instead of a fixed taxonomy, and
> bundling the blueprint JSON rather than fetching it. The "Open Questions (Resolved)" table is
> worth reading before revisiting any of those.
>
> **The status tables and code snippets are stale.** Phases 2.1–2.7 are marked "Not Started"
> and are complete. The tech-stack table says React 18 / Router 6 / MUI 5; it is 19 / 7 / 7.
> Capability counts say 72; it is 76. `AssessmentHistory.score` is documented as `number` but
> is `number | null` — deliberately, so nothing fabricates a score of 0. The Application
> Structure lists `CoverageTable.tsx` and `CapabilityRow.tsx`, which were never built.
>
> **The embedded `deploy.yml` is not the shipped workflow** and must not be used to regenerate
> it: the real one also runs on pull requests and gates the deploy on lint, tests and a check
> that `dist/404.html` was emitted. That last gate is what keeps deep links working on GitHub
> Pages.
>
> For current state see [`README.md`](README.md) and the Current state section of
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## Overview

A Progressive Web App (PWA) enabling Medicaid agencies to self-assess their MITA (Medicaid Information Technology Architecture) maturity. The application is fully client-side, offline-first, and stores all data locally in the browser.

**Project Start Date:** January 7, 2026  
**Target Deployment:** GitHub Pages (`nickarrow.github.io/mita-3.0-ssa`)

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | Jan 7, 2026 | Initial MVP — multi-capability assessments |
| 2.0 | Jan 8, 2026 | Redesign — single-capability assessments, tags, dashboard-centric flow |
| 2.2 | Jan 9, 2026 | Dashboard redesign, carry-forward as suggestions, navigation updates |

---

## Core Principles

1. **Privacy First**: All data stays in the browser. No data transmitted or stored remotely.
2. **Offline First**: Full functionality after initial load, even without network.
3. **Accessibility**: Government-appropriate, conservative UI that works for policy audiences.
4. **Simplicity**: MVP scope — no feature creep.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Build Tool | Vite | Fast builds, native ESM, simpler than Next.js for static apps |
| Framework | React 18 | Industry standard, large ecosystem |
| Language | TypeScript | Type safety, better DX, catches errors early |
| Routing | React Router v6 | De facto standard for React SPAs |
| UI Library | Material UI (MUI) v5 | Conservative design, accessible, well-documented |
| State Management | React Context + Hooks | Sufficient for app complexity, no Redux overhead |
| Client Storage | Dexie.js | Clean API over IndexedDB, reactive queries |
| PWA | vite-plugin-pwa | Workbox-based, well-maintained, Vite-native |
| Hosting | GitHub Pages | Free, simple, fits static export model |
| CI/CD | GitHub Actions | Native to GitHub, straightforward deployment |

### Why Vite over Next.js?

Next.js excels at server-side rendering, API routes, and hybrid apps — features this project doesn't need. For a 100% client-side, static PWA:

- Vite has simpler configuration (no `output: "export"` workarounds)
- `vite-plugin-pwa` is more straightforward than `next-pwa`
- Smaller bundle size (no Next.js runtime)
- Faster development server
- "Just React" mental model — no server/client component distinctions

---

## Data Source

**Repository:** [github.com/nickarrow/mita-open-blueprint](https://github.com/nickarrow/mita-open-blueprint)

### Structure

```
data/
├── bcm/    # Business Capability Models (72 files)
│   ├── business_relationship_management/
│   ├── care_management/
│   ├── contractor_management/
│   ├── eligibility_and_enrollment_management/
│   ├── financial_management/
│   ├── operations_management/
│   ├── performance_management/
│   ├── plan_management/
│   └── provider_management/
└── bpt/    # Business Process Templates (72 files)
    └── [same structure as bcm/]
```

### Business Areas & Capability Counts

| Business Area | Code | Capabilities |
|---------------|------|--------------|
| Business Relationship Management | BR | 4 |
| Care Management | CM | 9 |
| Contractor Management | CO | 9 |
| Eligibility & Enrollment Management | EE | 4 |
| Financial Management | FM | 19 |
| Operations Management | OM | 9 |
| Performance Management | PE | 5 |
| Plan Management | PL | 8 |
| Provider Management | PM | 5 |
| **Total** | | **72** |

### BCM Structure (Maturity Assessment)

Each BCM file contains:
- `business_area`: High-level grouping
- `process_name`: Specific capability name
- `process_code`: Two-letter abbreviation
- `maturity_model.capability_questions[]`: Array of 4-15 questions
  - `category`: Question grouping
  - `question`: The assessment question
  - `levels`: Object with `level_1` through `level_5` descriptions

### BPT Structure (Process Documentation)

Each BPT file contains:
- `process_details.description`: Full process description
- `process_details.trigger_events[]`: What initiates the process
- `process_details.process_steps[]`: Ordered list of steps
- `process_details.results[]`: Expected outcomes
- `process_details.shared_data[]`: Data sources used
- `process_details.predecessor_processes[]`: Upstream processes
- `process_details.successor_processes[]`: Downstream processes

### Data Loading Strategy

**Decision:** Bundle all JSON into the app (Option A)

**Rationale:**
- Guarantees offline functionality immediately
- Simpler implementation (no fetch/cache logic)
- Total data size (~2-3MB) is acceptable for initial load
- Updates require app rebuild, but data changes infrequently

---

## Data Model (Dexie/IndexedDB)

> **v2.0 Redesign:** The data model has been simplified. Instead of a multi-capability "Assessment" container, each capability assessment is now a standalone record. This enables dashboard-centric workflows where users assess one capability at a time.

### CapabilityAssessment Table (Primary)

```typescript
interface CapabilityAssessment {
  id: string;                    // UUID
  capabilityCode: string;        // "CM_Establish_Case"
  businessArea: string;          // "Care Management"
  processName: string;           // "Establish Case"
  status: 'in_progress' | 'finalized';
  tags: string[];                // ["#provider-module", "#deloitte"]
  blueprintVersion: string;      // "3.0"
  createdAt: Date;
  updatedAt: Date;
  finalizedAt?: Date;
  score?: number;                // Calculated average (1-5) when finalized
}
```

### Ratings Table

```typescript
interface Rating {
  id: string;                    // UUID
  capabilityAssessmentId: string; // FK to CapabilityAssessment
  questionIndex: number;         // 0-based index into capability_questions
  level: 1 | 2 | 3 | 4 | 5 | null;
  previousLevel?: 1 | 2 | 3 | 4 | 5; // Suggested level from previous assessment (v2.2)
  notes: string;
  carriedForward: boolean;       // True if copied from previous assessment
  updatedAt: Date;
}
```

### AssessmentHistory Table (Snapshots)

```typescript
interface AssessmentHistory {
  id: string;                    // UUID
  capabilityCode: string;        // "CM_Establish_Case"
  snapshotDate: Date;            // When this version was finalized
  tags: string[];                // Tags at time of snapshot
  score: number;                 // Maturity score (1-5)
  ratings: HistoricalRating[];   // Full ratings snapshot
  blueprintVersion: string;
}

interface HistoricalRating {
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5;
  notes: string;
}
```

### Tags Table (Optional — for autocomplete)

```typescript
interface Tag {
  id: string;                    // UUID
  name: string;                  // "#provider-module" (stored with #)
  usageCount: number;            // For sorting autocomplete suggestions
  lastUsed: Date;
}
```

### Indexes

- `capabilityAssessments`: by `capabilityCode`, by `status`, by `updatedAt`
- `ratings`: by `capabilityAssessmentId`, compound index `[capabilityAssessmentId+questionIndex]` (v2.2)
- `assessmentHistory`: by `capabilityCode`, by `snapshotDate`
- `tags`: by `name`, by `usageCount`

### Data Flow

1. **New Assessment:** User clicks "Assess" on a capability → creates new `CapabilityAssessment` with `status: 'in_progress'`
2. **Rating:** Each question answer creates/updates a `Rating` record
3. **Finalize:** On finalize:
   - If previous finalized assessment exists, snapshot it to `AssessmentHistory`
   - Update `CapabilityAssessment` with `status: 'finalized'`, `finalizedAt`, calculated `score`
4. **Edit:** User clicks "Edit" on finalized → sets `status: 'in_progress'`
5. **Re-finalize:** On finalize after edit, snapshot previous version to history first

---

## Key Design Decisions

### 1. Assessment Granularity

**Decision:** Users rate each BCM question individually (not one rating per capability).

**Rationale:** This matches the BCM structure — each question has its own 5-level maturity scale. Provides granular data without inventing new criteria.

### 2. Single-Capability Assessment Model (v2.0)

**Decision:** Each capability is assessed independently as a standalone record. No multi-capability "assessment container."

**Rationale:** 
- Dashboard becomes the central hub — users see all 72 capabilities and their status at a glance
- Reduces friction to start — click a capability, start assessing
- Tags provide flexible grouping without rigid upfront selection
- Simpler mental model: "assess this capability" vs "create assessment, select capabilities, then assess"

### 3. Assessment Lifecycle

```
(not assessed) → in_progress → finalized → (edit) → in_progress → finalized
```

| Status | Description |
|--------|-------------|
| `in_progress` | Assessment started, actively being worked |
| `finalized` | Complete, represents "current" assessment for this capability |

**Edit flow:** When a user edits a finalized assessment, it returns to `in_progress`. On re-finalize, the previous version is snapshotted to history.

### 4. Tags for Custom Grouping (v2.0)

**Decision:** User-defined tags (e.g., `#provider-module`, `#deloitte`) attached to each capability assessment.

**Rationale:**
- Enables custom "views" of the dashboard (filter by tag)
- Supports organizational groupings (by module, vendor, project, etc.)
- More flexible than predefined categories
- Tags from the latest finalized assessment are displayed on the dashboard

**Implementation:**
- Chip-style input with autocomplete from previously used tags
- Multiple tags per assessment
- Help text explains purpose: "Tags help you organize and filter capabilities (e.g., #provider-module, #wave-1)"

### 5. Data Carry-Forward

**Decision (v2.0):** When editing a finalized assessment, copy all ratings and notes with `carriedForward: true`.

**Updated (v2.2):** Carry-forward is now implemented as **suggestions**:
- Previous ratings stored in `previousLevel` field, but `level` is set to `null`
- UI shows previous selection with visual hint (dashed border, "Previous" badge)
- User must explicitly re-confirm each rating
- Progress reflects only confirmed ratings, not suggestions

**Rationale:** Prevents accidental submission of stale data. Users see their previous answers as reference but must actively confirm each one.

### 6. Assessment History (v2.0)

**Decision:** Snapshot each finalized assessment to history before it's replaced.

**Rationale:**
- Enables viewing changes over time (score trends, tag changes)
- Supports audit/compliance needs
- History accessible from dashboard by expanding capability row

### 7. Blueprint Versioning

**Decision:** Store `blueprintVersion` with each assessment. No migration between versions.

**Rationale:** If blueprint data changes, users start fresh assessments on new versions. Keeps implementation simple.

### 8. Notes

**Decision:** Per-question notes (not per-capability).

**Rationale:** More useful for documenting rationale ("We're Level 2 because we still use fax for X").

### 9. Progress Indicators

**Decision:** Show progress within capability assessment (X of Y questions answered).

**Calculation:** `(questions answered) / (total questions) * 100`

### 10. Mobile Experience

**Decision:** Fully responsive — works on phone, optimized for desktop/tablet.

**Implementation:** Collapsible sidebar, responsive layouts, touch-friendly controls.

### 11. Auto-Save & Navigation

**Decision:** All changes auto-save immediately. No "Save" button, no unsaved data warnings.

**Rationale:** Reduces cognitive load, prevents data loss, matches modern app expectations.

### 12. Status Transitions

**Decision:** Status automatically updates based on user actions:
- `(none)` → `in_progress`: When assessment is started
- `in_progress` → `finalized`: Manual action by user
- `finalized` → `in_progress`: When user clicks "Edit"

### 13. Dashboard Actions (v2.0, updated v2.2)

**Decision (v2.0):** Three action states based on capability status:
- **"Assess"** — For capabilities never assessed
- **"Resume"** — For capabilities with in-progress assessment
- **"Edit"** — For capabilities with finalized assessment

**Updated (v2.2):** Replaced individual buttons with unified menu system:
- **"Start" button** — For capabilities never assessed (direct action)
- **"•••" menu** — For in-progress/finalized (opens context menu with Resume/Edit, View, Delete)

**Rationale:** Cleaner UI, consistent interaction pattern, added View and Delete options.

---

## Application Structure

```
src/
├── components/              # Reusable UI components
│   ├── layout/              # AppBar, Layout wrappers
│   ├── assessment/          # Assessment-specific components
│   │   ├── BptSidebar.tsx   # BPT details sidebar (v2.0)
│   │   ├── QuestionCard.tsx # BCM question with rating
│   │   └── TagInput.tsx     # Tag chips with autocomplete (v2.0)
│   └── dashboard/           # Dashboard components (v2.0)
│       ├── CoverageTable.tsx
│       ├── CapabilityRow.tsx
│       └── HistoryPanel.tsx # Expandable history view
├── pages/                   # Route-level components
│   ├── Home.tsx             # Landing page
│   ├── Dashboard.tsx        # Capability coverage hub (v2.0)
│   └── Assessment.tsx       # Single-capability assessment (v2.0)
├── hooks/                   # Custom React hooks
│   ├── useCapabilityAssessments.ts  # Assessment CRUD (v2.0)
│   ├── useRatings.ts        # Rating operations
│   ├── useHistory.ts        # Assessment history (v2.0)
│   ├── useTags.ts           # Tag management (v2.0)
│   └── useScores.ts         # Maturity score calculations
├── services/                # Data layer
│   ├── db.ts                # Dexie database setup
│   └── blueprint.ts         # Blueprint data utilities
├── data/                    # Bundled JSON files
│   ├── bcm/                 # All BCM JSON files
│   └── bpt/                 # All BPT JSON files
├── types/                   # TypeScript interfaces
│   └── index.ts
├── theme/                   # MUI theme customization
│   └── index.ts
├── App.tsx                  # Router setup
├── main.tsx                 # Entry point
└── vite-env.d.ts            # Vite type declarations
```

**Removed in v2.0:**
- `NewAssessment.tsx` — No longer needed; assessments start from dashboard
- Assessment sidebar with capability navigation — Single capability per assessment

---

## Screen Specifications

### 1. Home (Landing Page)

**Purpose:** Explain the tool, establish trust around privacy.

**Content:**
- Hero section with tool name and tagline
- Clear statement: "All data stays in your browser"
- "No accounts, no servers, no data collection"
- "Get Started" CTA → Dashboard
- Brief explanation of MITA and self-assessment purpose

### 2. Dashboard (v2.0 — Central Hub, updated v2.2)

**Purpose:** View all capabilities, their assessment status, and initiate assessments.

**Layout:**
- **Header:** App navigation (Dashboard, About) — Dashboard is primary entry point (v2.2)
- **Filter Bar:** Tag filter (multi-select chips), search by capability name
- **Coverage Table:** All 72 capabilities organized by business area

**Coverage Table Columns (v2.2):**
| Column | Description |
|--------|-------------|
| Business Area / Capability | Expandable rows; expand arrows on left; business areas show aggregated tags |
| Score | Maturity score (1-5) from latest finalized assessment, or "—" |
| Tags | Chips showing tags from latest finalized assessment |
| Status | Progress bar showing completion |
| Completion | Percentage of questions answered |
| Last Assessed | Date of latest finalized assessment |
| Action | "Start" button or "•••" menu |

**Row Expansion (Capability):**
- Clicking a capability row expands to show assessment history
- History shows: Date/time, Score, Tags for each past assessment
- Current assessment shown with "Current" badge (v2.2)
- "View" action to see full ratings/notes for any assessment (v2.2)
- "Delete" action to remove history entries (v2.2)

**Tag Filtering:**
- Multi-select tag filter at top of dashboard
- When tags selected, only capabilities with those tags (in latest finalized) are shown
- "Clear filters" to reset

**Empty State:**
- All 72 capabilities shown with "Not Assessed" status
- Prominent messaging: "Click 'Assess' on any capability to begin"

### 3. Assessment Page (v2.0 — Single Capability)

**Purpose:** Rate maturity questions for a single capability.

**Layout:**
- **Left Sidebar (BPT Reference):**
  - Process description
  - Trigger events
  - Process steps
  - Results
  - Scrollable, always visible during assessment
  - Collapsible on mobile

- **Main Content Area:**
  - **Sticky Header:**
    - Business area label
    - Capability name
    - Tag input (chips + autocomplete)
    - Help text: "Tags help you organize and filter capabilities (e.g., #provider-module, #wave-1)"
    - Progress indicator: "X of Y questions answered"
  - **Questions Section:**
    - Each BCM question as a card
    - Question text
    - 5 maturity level radio buttons with inline descriptions
    - Expandable notes textarea
    - Carried-forward indicator (if applicable)
  - **Footer:**
    - "Cancel" button (returns to dashboard, keeps draft)
    - "Finalize" button (with confirmation dialog)

**Finalize Confirmation Dialog:**
- "Finalize this assessment? This will become the current assessment for [Capability Name]. You can edit it later if needed."
- If editing a previously finalized assessment: "This will replace your previous assessment. The previous version will be saved to history."

**Auto-Save:**
- Every rating and note change saves immediately
- No explicit save button needed

### ~~4. New Assessment Page~~ (Removed in v2.0)

This page is no longer needed. Assessments are initiated directly from the dashboard by clicking "Assess" on a capability row.

### 5. Settings (Future)

**Deferred to post-MVP:**
- Clear all data button
- Export/import (out of scope per requirements)
- Theme preferences

---

## UI Patterns & Behaviors

### Empty States

| Screen | Empty State Message |
|--------|---------------------|
| Dashboard (no assessments) | All 72 capabilities shown with "Not Assessed" status. "Click 'Assess' on any capability to begin your first assessment." |
| Dashboard (tag filter, no matches) | "No capabilities match the selected tags." + "Clear filters" button |
| History panel (no history) | "No previous assessments. This is the first assessment for this capability." |

### Confirmation Dialogs

| Action | Dialog Content |
|--------|----------------|
| Finalize (first assessment) | "Finalize this assessment? This will become the current assessment for [Capability Name]. You can edit it later if needed." |
| Finalize (replacing previous) | "Finalize this assessment? This will replace your previous assessment for [Capability Name]. The previous version will be saved to history." |
| Delete Assessment | "Delete this assessment for [Capability Name]? This will permanently remove all ratings and notes. This cannot be undone." |

### Toast/Snackbar Notifications

| Event | Message | Duration |
|-------|---------|----------|
| Assessment started | "Assessment started for [Capability Name]" | 3s |
| Assessment finalized | "Assessment finalized" | 3s |
| Assessment deleted | "Assessment deleted" | 3s |
| Rating saved | No toast (silent auto-save) | — |
| Offline detected | "You're offline. Changes are saved locally." | 5s |
| Back online | "You're back online." | 3s |

### Auto-Save Behavior

- Every rating/note change saves immediately to IndexedDB
- No explicit "Save" button needed
- Assessment `updatedAt` timestamp updates on each change

### Tag Input Behavior

- Chip-style display for existing tags
- Autocomplete dropdown shows previously used tags (sorted by usage)
- Free-form entry allowed (type and press Enter)
- Tags stored with `#` prefix
- Help text visible: "Tags help you organize and filter capabilities (e.g., #provider-module, #wave-1)"

### Carry-Forward Behavior (v2.2 — Suggestions)

- When editing a finalized assessment:
  - Previous ratings stored in `previousLevel` field
  - `level` is set to `null` (not pre-filled)
  - UI shows previous selection with dashed blue border and "Previous" badge
  - User must click to confirm each rating
  - Progress reflects only confirmed ratings
- Notes are copied and editable
- Tags are copied and editable
- Prevents accidental submission of stale data

### Navigation Guards

- No unsaved data warnings needed (auto-save handles this)
- User can freely navigate away; draft is preserved
- "Cancel" on assessment page returns to dashboard (draft remains)

### Keyboard Navigation

- Tab through form controls in logical order
- Enter/Space to select maturity levels
- Arrow keys to navigate between maturity level options
- Escape to close modals/dialogs
- Focus indicators visible on all interactive elements

### Storage Considerations

**IndexedDB Quota:**
- Modern browsers provide 50MB+ for IndexedDB
- Our data footprint is minimal (text-based ratings and notes)
- History snapshots add some overhead but still well within limits
- No quota issues expected for typical usage

**If quota exceeded (edge case):**
- Show error toast: "Storage limit reached. Consider clearing old assessment history."
- Prevent new assessment creation until space freed

---

## PWA Configuration

### Service Worker Strategy

Using `vite-plugin-pwa` with Workbox:

```typescript
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
        }
      }
    ]
  },
  manifest: {
    name: 'MITA Self-Assessment Tool',
    short_name: 'MITA SS-A',
    description: 'Self-assess your Medicaid IT maturity',
    theme_color: '#1976d2',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
    ]
  }
})
```

### Offline Behavior

- App shell (HTML, JS, CSS) cached on first load
- All blueprint JSON bundled and cached
- IndexedDB data persists across sessions
- Full functionality without network after initial load

---

## GitHub Pages Deployment

### Configuration

```typescript
// vite.config.ts
export default defineConfig({
  base: '/mita-3.0-ssa/',  // Repository name
  // ...
})
```

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

## Development Phases

### Phase Summary (v1.0 — Completed)

| Phase | Description | Estimated | Actual | Status |
|-------|-------------|-----------|--------|--------|
| 1 | Project Setup & Infrastructure | 2 hours | 1.5 hours | ✅ Complete |
| 2 | Core Data Layer | 2 hours | — | ✅ Complete |
| 3 | UI Shell & Navigation | 2 hours | — | ✅ Complete |
| 4 | Assessment Creation | 2 hours | — | ✅ Complete |
| 5 | Assessment Workflow | 3 hours | — | ✅ Complete |
| 6 | Assessment Management | 1.5 hours | — | ✅ Complete |
| 7 | PWA & Offline | 1 hour | — | 🔄 Paused |
| 8 | Polish & Deploy | 2 hours | — | ⬜ Paused |

---

### Phase Summary (v2.0 — Assessment Flow Redesign)

| Phase | Description | Estimated | Actual | Status |
|-------|-------------|-----------|--------|--------|
| 2.1 | Data Model Refactor | 2 hours | — | ⬜ Not Started |
| 2.2 | Dashboard Redesign | 3 hours | — | ⬜ Not Started |
| 2.3 | Assessment Page Redesign | 3 hours | — | ⬜ Not Started |
| 2.4 | Tags System | 2 hours | — | ⬜ Not Started |
| 2.5 | History & Carry-Forward | 2 hours | — | ⬜ Not Started |
| 2.6 | Cleanup & Integration | 1.5 hours | — | ⬜ Not Started |
| 2.7 | PWA & Polish | 2 hours | — | ⬜ Not Started |
| **Total v2.0** | | **15.5 hours** | — | |

---

### Phase 2.1: Data Model Refactor
**Estimated:** 2 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Create new `CapabilityAssessment` table schema | ⬜ | Replace Assessment + AssessmentCapability |
| Create `AssessmentHistory` table schema | ⬜ | For snapshots |
| Create `Tags` table schema | ⬜ | For autocomplete |
| Update `Ratings` table to reference `capabilityAssessmentId` | ⬜ | |
| Create migration strategy for existing data | ⬜ | Or clean slate |
| Update TypeScript interfaces | ⬜ | |
| Create `useCapabilityAssessments` hook | ⬜ | CRUD operations |
| Create `useHistory` hook | ⬜ | Snapshot and retrieval |
| Create `useTags` hook | ⬜ | Tag management |

---

### Phase 2.2: Dashboard Redesign
**Estimated:** 3 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Update coverage table to show all 72 capabilities | ⬜ | With new columns |
| Add Tags column with chip display | ⬜ | From latest finalized |
| Add Last Assessed column | ⬜ | Date display |
| Implement action buttons (Assess/Resume/Edit) | ⬜ | Based on status |
| Implement row expansion for history | ⬜ | Replace BPT expansion |
| Create history panel component | ⬜ | Shows past assessments |
| Add tag filter bar | ⬜ | Multi-select chips |
| Implement tag filtering logic | ⬜ | Filter table rows |
| Remove assessment cards section | ⬜ | No longer needed |
| Remove "New Assessment" button/link | ⬜ | |

---

### Phase 2.3: Assessment Page Redesign
**Estimated:** 3 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Create BPT sidebar component | ⬜ | Always visible, scrollable |
| Update layout: sidebar + main content | ⬜ | Remove old sidebar |
| Create sticky header with capability info | ⬜ | Name, area, tags, progress |
| Add tag input to sticky header | ⬜ | Chips + autocomplete |
| Add help text for tags | ⬜ | |
| Update question cards layout | ⬜ | Full width in main area |
| Add progress indicator to header | ⬜ | X of Y questions |
| Update finalize flow | ⬜ | New confirmation dialogs |
| Implement cancel behavior | ⬜ | Return to dashboard |
| Remove capability navigation (prev/next) | ⬜ | Single capability only |

---

### Phase 2.4: Tags System
**Estimated:** 2 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Create TagInput component | ⬜ | Chips + autocomplete |
| Implement tag autocomplete from history | ⬜ | Sort by usage |
| Implement free-form tag entry | ⬜ | Type + Enter |
| Store tags with `#` prefix | ⬜ | |
| Update tag usage counts on save | ⬜ | For autocomplete sorting |
| Display tags on dashboard | ⬜ | Chip style |
| Implement dashboard tag filter | ⬜ | Multi-select |

---

### Phase 2.5: History & Carry-Forward
**Estimated:** 2 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Implement snapshot on finalize | ⬜ | Save to AssessmentHistory |
| Implement history retrieval | ⬜ | By capability code |
| Create history panel UI | ⬜ | Date, score, tags list |
| Implement "View Details" for history | ⬜ | Full ratings/notes |
| Implement carry-forward on Edit | ⬜ | Copy ratings + notes + tags |
| Add carried-forward visual indicator | ⬜ | Chip or icon |
| Test edit → finalize → history flow | ⬜ | |

---

### Phase 2.6: Cleanup & Integration
**Estimated:** 1.5 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Remove NewAssessment page | ⬜ | |
| Remove old assessment sidebar | ⬜ | |
| Update routing (remove /new-assessment) | ⬜ | |
| Update App.tsx routes | ⬜ | |
| Update header navigation | ⬜ | Remove New Assessment link |
| Clean up unused components | ⬜ | |
| Clean up unused hooks | ⬜ | |
| Update Home page CTA | ⬜ | Point to dashboard |
| Integration testing | ⬜ | Full flow |

---

### Phase 2.7: PWA & Polish
**Estimated:** 2 hours | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Add PWA icons (192x192, 512x512) | ⬜ | |
| Test offline functionality | ⬜ | |
| Test "Add to Home Screen" | ⬜ | |
| Responsive testing | ⬜ | Mobile, tablet, desktop |
| Accessibility audit | ⬜ | Keyboard nav, screen readers |
| Toast notifications | ⬜ | |
| Error handling | ⬜ | |
| Deploy to GitHub Pages | ⬜ | |

---

## Future Enhancements (Post-MVP)

These are explicitly out of scope for MVP but documented for future consideration:

| Feature | Priority | Notes |
|---------|----------|-------|
| Automated blueprint data sync | High | Pull BCM/BPT data from `mita-open-blueprint` GitHub repo during build (via postinstall script, git submodule, or GitHub Action) instead of manual copy |
| Modern capability groupings | High | Via `category-mappings.json` |
| JSON/PDF/CSV export | Medium | Export assessment results |
| Scoring visualizations | Medium | Charts, maturity heatmaps |
| Clear all data button | Medium | Settings page |
| Tag management page | Low | View/rename/delete tags globally |
| Assessment comparison | Low | Side-by-side historical comparison |
| Bulk operations | Low | Assess multiple capabilities at once |
| Multi-language support | Low | i18n |
| Authentication | Out of scope | Per requirements |
| Server-side storage | Out of scope | Per requirements |
| Data synchronization | Out of scope | Per requirements |

---

## Open Questions (Resolved)

| Question | Decision | Date |
|----------|----------|------|
| Next.js vs Vite? | Vite — simpler for static PWA | Jan 7, 2026 |
| Assessment granularity? | Per-question ratings | Jan 7, 2026 |
| Carry-forward behavior? | Copy ratings + notes + tags with `carriedForward` flag | Jan 7, 2026 |
| Can finalized be edited? | Yes, returns to in_progress, snapshots to history on re-finalize | Jan 8, 2026 |
| Capability selection UX? | Dashboard-centric — click capability to assess (v2.0) | Jan 8, 2026 |
| Assessment naming? | No longer needed — assessments identified by capability + date | Jan 8, 2026 |
| Blueprint data loading? | Bundle into app (Option A) | Jan 7, 2026 |
| Notes granularity? | Per-question | Jan 7, 2026 |
| Progress indicators? | Per-capability only (single capability per assessment in v2.0) | Jan 8, 2026 |
| Mobile experience? | Fully responsive | Jan 7, 2026 |
| Auto-save behavior? | Immediate save, no explicit button | Jan 7, 2026 |
| Status transitions? | in_progress ↔ finalized (no draft state in v2.0) | Jan 8, 2026 |
| Modern groupings? | Replaced by user-defined tags (v2.0) | Jan 8, 2026 |
| Multi-capability assessments? | Removed — single capability per assessment (v2.0) | Jan 8, 2026 |
| Tags scope? | Per capability assessment, dashboard shows latest finalized | Jan 8, 2026 |
| Tag management? | Inline only (autocomplete + free-form), no dedicated page | Jan 8, 2026 |
| Assessment history? | Snapshot on finalize, viewable from dashboard expansion | Jan 8, 2026 |
| Dashboard actions? | "Assess" / "Resume" / "Edit" based on status | Jan 8, 2026 |
| BPT location? | Sidebar during assessment (always visible) | Jan 8, 2026 |
| Re-assess vs Edit? | Single "Edit" action — creates new version on finalize | Jan 8, 2026 |

---

## References

- [MITA Open Blueprint Repository](https://github.com/nickarrow/mita-open-blueprint)
- [MITA Framework (CMS)](https://www.medicaid.gov/medicaid/data-systems/medicaid-information-technology-architecture/index.html)
- [Vite Documentation](https://vitejs.dev/)
- [Material UI Documentation](https://mui.com/)
- [Dexie.js Documentation](https://dexie.org/)
- [vite-plugin-pwa Documentation](https://vite-pwa-org.netlify.app/)

---

*Document created: January 7, 2026*  
*Last updated: January 9, 2026*

---

## Related Documents

- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) — Detailed tracking of what's been built, deviations, and remaining work
