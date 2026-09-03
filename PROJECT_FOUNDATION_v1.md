# MITA 3.0 Self-Assessment Tool — Project Foundation

> **Historical record — the v1.0 design, January 2026.** Superseded by
> `PROJECT_FOUNDATION_v2.md`, which replaced the multi-capability data model described here
> with one assessment per capability. Kept only as the record of what v1.0 was and why it was
> abandoned.
>
> **Do not use this as a reference for the current app.** Its data model
> (`Assessments`/`Assessment Capabilities` tables), its file tree and its screen specs all
> describe code that no longer exists. The tech-stack table is also out of date: the app runs
> React 19, React Router 7 and MUI 7, not 18/6/5. Capability counts here say 72; it is 76.
>
> For current state see [`README.md`](README.md) and the Current state section of
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## Overview

A Progressive Web App (PWA) enabling Medicaid agencies to self-assess their MITA (Medicaid Information Technology Architecture) maturity. The application is fully client-side, offline-first, and stores all data locally in the browser.

**Project Start Date:** January 7, 2026  
**Target Deployment:** GitHub Pages (`nickarrow.github.io/mita-3.0-ssa`)

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

### Assessments Table

```typescript
interface Assessment {
  id: string;                    // UUID
  name: string;                  // "Assessment - Jan 7, 2026"
  status: 'draft' | 'in_progress' | 'finalized';
  blueprintVersion: string;      // "3.0"
  createdAt: Date;
  updatedAt: Date;
  finalizedAt?: Date;
}
```

### Assessment Capabilities Table

```typescript
interface AssessmentCapability {
  id: string;                    // UUID
  assessmentId: string;          // FK to Assessment
  capabilityCode: string;        // "CM_Establish_Case"
  businessArea: string;          // "Care Management"
  processName: string;           // "Establish Case"
}
```

### Ratings Table

```typescript
interface Rating {
  id: string;                    // UUID
  assessmentId: string;          // FK to Assessment
  capabilityCode: string;        // "CM_Establish_Case"
  questionIndex: number;         // 0-based index into capability_questions
  level: 1 | 2 | 3 | 4 | 5 | null;
  notes: string;
  carriedForward: boolean;       // True if copied from previous assessment
  updatedAt: Date;
}
```

### Indexes

- `assessments`: by `status`, by `updatedAt`
- `assessmentCapabilities`: by `assessmentId`
- `ratings`: by `[assessmentId, capabilityCode]`

---

## Key Design Decisions

### 1. Assessment Granularity

**Decision:** Users rate each BCM question individually (not one rating per capability).

**Rationale:** This matches the BCM structure — each question has its own 5-level maturity scale. Provides granular data without inventing new criteria.

### 2. Assessment Lifecycle

```
draft → in_progress → finalized
```

| Status | Description |
|--------|-------------|
| `draft` | Just created, no ratings yet |
| `in_progress` | Has some ratings, actively being worked |
| `finalized` | Complete, represents "current" assessment |

**Finalized assessments can be edited** (for typo fixes, etc.). The `finalizedAt` timestamp records when it was marked complete; `updatedAt` tracks subsequent edits.

### 3. Data Carry-Forward

**Decision:** When creating a new assessment from a finalized one, copy all ratings with `carriedForward: true`.

**Rationale:** Industry standard for recurring assessments. Users get a starting point but are prompted to review (UI shows indicator on carried-forward items).

### 4. Capability Selection

**Decision:** Hierarchical picker — select business area first, then capabilities within it. Users can select capabilities from multiple areas.

**Future Enhancement:** Support "modern groupings" via a separate `category-mappings.json` file (not modifying original CMS data). This is deferred post-MVP.

### 5. Assessment Naming

**Decision:** Auto-generate date-based names with option to rename.

**Format:** `Assessment - Jan 7, 2026` (with suffix `(2)`, `(3)` for same-day duplicates)

**Rationale:** Reduces friction to start; users can rename for clarity.

### 6. Blueprint Versioning

**Decision:** Store `blueprintVersion` with each assessment. No migration between versions.

**Rationale:** If blueprint data changes, users start fresh assessments on new versions. Keeps implementation simple.

### 7. Notes

**Decision:** Per-question notes (not per-capability).

**Rationale:** More useful for documenting rationale ("We're Level 2 because we still use fax for X").

### 8. Progress Indicators

**Decision:** Show both overall assessment progress and per-capability progress.

**Calculation:** `(questions answered) / (total questions) * 100`

### 9. Mobile Experience

**Decision:** Fully responsive — works on phone, optimized for desktop/tablet.

**Implementation:** Collapsible sidebars, responsive layouts, touch-friendly controls.

### 10. Auto-Save & Navigation

**Decision:** All changes auto-save immediately. No "Save" button, no unsaved data warnings.

**Rationale:** Reduces cognitive load, prevents data loss, matches modern app expectations.

### 11. Status Transitions

**Decision:** Status automatically updates based on user actions:
- `draft` → `in_progress`: When first rating is saved
- `in_progress` → `finalized`: Manual action by user
- `finalized` → `finalized`: Edits allowed, status unchanged

### 12. Session Persistence

**Decision:** Remember last-viewed capability within an assessment session.

**Implementation:** Store `lastCapabilityCode` in localStorage keyed by assessment ID. On return, scroll/navigate to that capability.

---

## Application Structure

```
src/
├── components/              # Reusable UI components
│   ├── layout/              # AppBar, Sidebar, Layout wrappers
│   ├── assessment/          # Assessment-specific components
│   └── common/              # Buttons, Cards, Progress indicators
├── pages/                   # Route-level components
│   ├── Home.tsx             # Landing page
│   ├── Dashboard.tsx        # Assessment management
│   ├── NewAssessment.tsx    # Capability selection
│   └── Assessment.tsx       # Assessment flow
├── hooks/                   # Custom React hooks
│   ├── useAssessments.ts    # Assessment CRUD operations
│   ├── useRatings.ts        # Rating operations
│   └── useBlueprint.ts      # Blueprint data access
├── services/                # Data layer
│   ├── db.ts                # Dexie database setup
│   └── blueprint.ts         # Blueprint data utilities
├── data/                    # Bundled JSON files
│   ├── bcm/                 # All BCM JSON files
│   └── bpt/                 # All BPT JSON files
├── types/                   # TypeScript interfaces
│   ├── assessment.ts
│   ├── blueprint.ts
│   └── index.ts
├── theme/                   # MUI theme customization
│   └── index.ts
├── App.tsx                  # Router setup
├── main.tsx                 # Entry point
└── vite-env.d.ts            # Vite type declarations
```

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

### 2. Dashboard

**Purpose:** Assessment management hub.

**Features:**
- List of all assessments (cards or table)
- Status badges (draft, in progress, finalized)
- Progress bars (overall completion %)
- Last updated timestamps
- "New Assessment" button
- "Resume" action on in-progress assessments
- "View/Edit" action on finalized assessments
- "Delete" action with confirmation
- "Copy to New" action (creates new assessment with carried-forward data)

**Smart Defaults:**
- Most recent in-progress assessment highlighted
- Sort by `updatedAt` descending

### 3. New Assessment

**Purpose:** Select capabilities to assess.

**Features:**
- Assessment name field (pre-filled with auto-generated name)
- Hierarchical capability picker:
  - Expandable business area sections
  - Checkboxes for individual capabilities
  - "Select All" / "Deselect All" per area
- Selected count indicator
- "Create Assessment" button (disabled if nothing selected)
- Optional: "Copy from existing assessment" dropdown

### 4. Assessment (Main Workflow)

**Purpose:** The actual assessment experience.

**Layout:**
- **Left Sidebar** (collapsible on mobile):
  - List of selected capabilities grouped by business area
  - Progress indicator per capability (e.g., "3/5 questions")
  - Visual indicator for current capability
  - Overall progress at top
- **Main Content Area**:
  - Capability header (name, business area)
  - BPT summary section (collapsible):
    - Process description
    - Trigger events
    - Process steps
    - Results
  - BCM questions section:
    - Question text
    - 5 maturity level options (radio buttons or segmented control)
    - Level descriptions (expandable or tooltip)
    - Notes field (expandable textarea)
    - Carried-forward indicator (if applicable)
- **Auto-save:** Every change persists immediately to IndexedDB
- **Navigation:** Previous/Next capability buttons

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
| Dashboard (no assessments) | "No assessments yet. Create your first assessment to get started." + prominent CTA |
| Assessment sidebar (no capabilities) | Should not occur — assessment requires at least one capability |

### Confirmation Dialogs

| Action | Dialog Content |
|--------|----------------|
| Delete Assessment | "Delete [Assessment Name]? This will permanently remove all ratings and notes. This cannot be undone." |
| Finalize Assessment | "Mark [Assessment Name] as finalized? You can still edit it later if needed." |

### Toast/Snackbar Notifications

| Event | Message | Duration |
|-------|---------|----------|
| Assessment created | "Assessment created" | 3s |
| Assessment deleted | "Assessment deleted" | 3s |
| Assessment finalized | "Assessment finalized" | 3s |
| Rating saved | No toast (silent auto-save) | — |
| Offline detected | "You're offline. Changes are saved locally." | 5s |
| Back online | "You're back online." | 3s |

### Auto-Save Behavior

- Every rating change saves immediately to IndexedDB
- No explicit "Save" button needed
- Assessment `updatedAt` timestamp updates on each change
- Status automatically transitions from `draft` → `in_progress` on first rating

### Navigation Guards

- No unsaved data warnings needed (auto-save handles this)
- User can freely navigate between capabilities and pages
- Returning to an assessment resumes at the last viewed capability (store in session/local storage)

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
- No quota issues expected for typical usage

**If quota exceeded (edge case):**
- Show error toast: "Storage limit reached. Please delete old assessments."
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

### Phase Summary

| Phase | Description | Estimated | Actual | Status |
|-------|-------------|-----------|--------|--------|
| 1 | Project Setup & Infrastructure | 2 hours | 1.5 hours | ✅ Complete |
| 2 | Core Data Layer | 2 hours | — | ✅ Complete |
| 3 | UI Shell & Navigation | 2 hours | — | ✅ Complete |
| 4 | Assessment Creation | 2 hours | — | ✅ Complete |
| 5 | Assessment Workflow | 3 hours | — | ✅ Complete |
| 6 | Assessment Management | 1.5 hours | — | ✅ Complete |
| 7 | PWA & Offline | 1 hour | — | 🔄 In Progress |
| 8 | Polish & Deploy | 2 hours | — | ⬜ Not Started |
| **Total** | | **15.5 hours** | — | |

---

### Phase 1: Project Setup & Infrastructure
**Estimated:** 2 hours | **Actual:** 1.5 hours | **Status:** ✅ Complete

| Task | Status | Notes |
|------|--------|-------|
| Initialize Vite + React + TypeScript project | ✅ | |
| Configure MUI theme (conservative, gov-appropriate) | ✅ | |
| Set up React Router | ✅ | |
| Configure Dexie database schema | ✅ | |
| Set up vite-plugin-pwa | ✅ | |
| Bundle blueprint JSON data | ✅ | Copied from mita-open-blueprint |
| Create TypeScript interfaces | ✅ | |
| Set up GitHub Actions workflow | ✅ | |

---

### Phase 2: Core Data Layer
**Estimated:** 2 hours | **Actual:** (included in Phase 1) | **Status:** ✅ Complete

| Task | Status | Notes |
|------|--------|-------|
| Implement Dexie database service | ✅ | |
| Create assessment CRUD hooks | ✅ | |
| Create rating CRUD hooks | ✅ | |
| Create blueprint data access utilities | ✅ | |
| Implement auto-save logic | ✅ | |

---

### Phase 3: UI Shell & Navigation
**Estimated:** 2 hours | **Actual:** (included in Phase 1) | **Status:** ✅ Complete

| Task | Status | Notes |
|------|--------|-------|
| Create responsive layout component | ✅ | AppBar, collapsible sidebar |
| Implement Home page | ✅ | Privacy messaging |
| Implement Dashboard page (empty state) | ✅ | Assessment list |
| Set up routing | ✅ | |
| Implement toast/snackbar notifications | ⬜ | Deferred to polish phase |

---

### Phase 4: Assessment Creation
**Estimated:** 2 hours | **Actual:** (included in Phase 1) | **Status:** ✅ Complete

| Task | Status | Notes |
|------|--------|-------|
| Implement capability picker component | ✅ | Hierarchical by business area |
| Implement New Assessment page | ✅ | |
| Implement assessment naming logic | ✅ | Auto-generate with rename |
| Implement "Copy from existing" flow | ✅ | Carry-forward logic |

---

### Phase 5: Assessment Workflow
**Estimated:** 3 hours | **Actual:** (included in Phase 1) | **Status:** ✅ Complete

| Task | Status | Notes |
|------|--------|-------|
| Implement assessment sidebar | ✅ | Capability list with progress |
| Implement BPT display component | ✅ | Collapsible process details |
| Implement BCM question component | ✅ | Rating selector, notes |
| Implement maturity level selector | ✅ | Radio/segmented with descriptions |
| Implement progress indicators | ✅ | Per-capability and overall |
| Implement capability navigation | ✅ | Previous/Next buttons |

---

### Phase 6: Assessment Management
**Estimated:** 1.5 hours | **Actual:** (included in Phase 1) | **Status:** ✅ Complete

| Task | Status | Notes |
|------|--------|-------|
| Implement status transitions | ✅ | draft → in_progress → finalized |
| Implement "Finalize" action | ✅ | With confirmation dialog |
| Implement "Delete" action | ✅ | With confirmation dialog |
| Implement carried-forward indicators | ✅ | Visual cue in UI |

---

### Phase 7: PWA & Offline
**Estimated:** 1 hour | **Actual:** — | **Status:** 🔄 In Progress

| Task | Status | Notes |
|------|--------|-------|
| Test offline functionality | ⬜ | |
| Add PWA icons | ⬜ | 192x192, 512x512 |
| Test "Add to Home Screen" | ⬜ | |
| Verify service worker caching | ⬜ | |

---

### Phase 8: Polish & Deploy
**Estimated:** 2 hours | **Actual:** — | **Status:** ⬜ Not Started

| Task | Status | Notes |
|------|--------|-------|
| Responsive testing (mobile, tablet, desktop) | ⬜ | |
| Accessibility audit | ⬜ | Keyboard nav, screen readers |
| Error handling & edge cases | ⬜ | |
| Loading states | ⬜ | |
| Deploy to GitHub Pages | ⬜ | |
| End-to-end testing | ⬜ | |

---

## Future Enhancements (Post-MVP)

These are explicitly out of scope for MVP but documented for future consideration:

| Feature | Priority | Notes |
|---------|----------|-------|
| Modern capability groupings | High | Via `category-mappings.json` |
| JSON/PDF/CSV export | Medium | Export assessment results |
| Scoring visualizations | Medium | Charts, maturity heatmaps |
| Clear all data button | Medium | Settings page |
| Assessment comparison | Low | Side-by-side Q1 vs Q2 |
| Audit trail for edits | Low | Track who changed what |
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
| Carry-forward behavior? | Copy with `carriedForward` flag | Jan 7, 2026 |
| Can finalized be edited? | Yes, with `updatedAt` tracking | Jan 7, 2026 |
| Capability selection UX? | Hierarchical by business area | Jan 7, 2026 |
| Assessment naming? | Auto-generate date-based, allow rename | Jan 7, 2026 |
| Blueprint data loading? | Bundle into app (Option A) | Jan 7, 2026 |
| Notes granularity? | Per-question | Jan 7, 2026 |
| Progress indicators? | Both overall and per-capability | Jan 7, 2026 |
| Mobile experience? | Fully responsive | Jan 7, 2026 |
| Auto-save behavior? | Immediate save, no explicit button | Jan 7, 2026 |
| Status transitions? | Auto draft→in_progress, manual finalize | Jan 7, 2026 |
| Modern groupings? | Deferred post-MVP, use category-mappings.json | Jan 7, 2026 |

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
*Last updated: January 7, 2026*

---

## Related Documents

- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) — Detailed tracking of what's been built, deviations, and remaining work
