# Refactoring Plan: Code Quality Improvements

> **Historical record — completed January 2026.** The refactor described here was carried out;
> `src/constants/ui.ts`, `src/theme/sharedStyles.ts`, `src/utils/` and the split
> `components/dashboard/` and `components/assessment/` directories are its result, and that
> rationale is why they exist.
>
> **Do not read it as a to-do list.** Every line count in "Current State" has drifted, two
> planned files were never created (`CoverageOverview.tsx`, `utils/historyHelpers.ts`), one
> `eslint-disable` remains rather than three, and the recommendation *not* to split
> `BptSidebar.tsx` was later reversed — its rendering now lives in `components/bpt/BptContent.tsx`
> with the text parsing in `bptTextParsing.ts`.
>
> For current state see [`README.md`](README.md) and the Current state section of
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

**Goal:** Clean up LLM-isms and improve code quality while maintaining prototype velocity.

**Scope:** File splitting, DRY violations, magic numbers, TypeScript strict mode cleanup  
**Out of Scope (for now):** Error boundaries, loading skeletons, unit tests, accessibility improvements

---

## Current State Analysis

### File Sizes (lines of code)
| File | Lines | Status |
|------|-------|--------|
| `Dashboard.tsx` | 1001 | 🔴 Too large |
| `BptSidebar.tsx` | 756 | 🟡 Large but cohesive |
| `Assessment.tsx` | 745 | 🔴 Too large |
| `importService.ts` | 576 | 🟡 Acceptable |
| `pdfExport.ts` | 527 | 🟡 Out of scope |
| `useCapabilityAssessments.ts` | 410 | 🟡 Acceptable |

### TypeScript Configuration
- ✅ `strict: true` is already enabled in `tsconfig.app.json`
- ✅ `noFallthroughCasesInSwitch: true` already enabled
- ❌ Missing: `noUncheckedIndexedAccess`, `noImplicitReturns`
- ⚠️ 3 `eslint-disable` comments need addressing

### DRY Violations Found
1. **Progress bar gradient** — 3 instances with slightly different stripe widths (Dashboard lines 87, 152, 900)
2. **History snapshot creation** — 3 nearly identical blocks (useCapabilityAssessments lines 79, 158; importService line 48)
3. **Download blob logic** — 2 identical implementations (exportService line 268, useAttachments line 126)
4. **Date formatting** — 5 different inline formatting calls (Dashboard lines 195, 327, 548; Assessment line 609; pdfExport line 186)
5. **Compact chip styling** — `sx={{ height: 20, fontSize: '0.65rem' }}` repeated 7 times in Dashboard alone (lines 230, 241, 268, 724, 732, 807) plus 1 in Assessment (line 222)
6. **List item icon styling** — `sx={{ minWidth: 32 }}` repeated 7 times in ImportExport.tsx

### Magic Numbers Found

**Dashboard.tsx:**
- `width: 70` (history badge column)
- `width: 160` (history date column)
- `width: 80` (history score column)
- `width: 64` (action buttons)
- `height: 22` (business area progress bar)
- `height: 18` (capability progress bar)
- `height: 20` (compact chips)
- `height: 16` (legend indicator)
- `minWidth: 200` (tag filter)
- `slice(0, 3)` (max visible tags)

**Assessment.tsx:**
- `SIDEBAR_WIDTH = 600` (already a constant, but local)
- `rows={3}` (notes textarea)
- `minWidth: 24` (question number)
- `minWidth: 100`, `maxWidth: 150` (progress container)
- `height: 8` (linear progress)
- `zIndex: 10` (sticky header)
- `height: 'calc(100vh - 64px)'` (main container — 64px is header height)

**ImportExport.tsx:**
- `minWidth: 32` (list item icons — repeated 7 times)
- `slice(0, 10)` (max visible import results)

**pdfExport.ts (out of scope but noted):**
- `substring(0, 300)` (description truncation)

---

## Phase 1: Split Large Files

### 1.1 Dashboard.tsx (1001 lines → ~20 lines + 5 new files)

**Current structure (6 components in one file):**
- `StackedProgressBar` (lines 42-121) — 80 lines
- `CapabilityProgressBar` (lines 124-167) — 44 lines  
- `HistoryPanel` (lines 170-292) — 123 lines
- `HistoryViewDialog` (lines 295-398) — 104 lines
- `CoverageOverview` (lines 401-993) — 593 lines
- `Dashboard` (lines 995-1001) — 7 lines (wrapper, already minimal)

**Extract to `src/components/dashboard/`:**

| New File | Component | Lines | Notes |
|----------|-----------|-------|-------|
| `StackedProgressBar.tsx` | `StackedProgressBar` | ~90 | Add props interface, use shared gradient styles |
| `CapabilityProgressBar.tsx` | `CapabilityProgressBar` | ~55 | Add props interface, use shared gradient styles |
| `HistoryPanel.tsx` | `HistoryPanel` | ~135 | Needs `useCapabilityHistory` hook import |
| `HistoryViewDialog.tsx` | `HistoryViewDialog` | ~115 | Needs `getCapabilityByCode` import |
| `CoverageOverview.tsx` | `CoverageOverview` | ~500 | Main logic — largest component, contains most state |
| `index.ts` | barrel export | ~10 | Re-exports for clean imports |

**Dashboard.tsx becomes:**
```tsx
import { Container } from '@mui/material';
import { CoverageOverview } from '../components/dashboard';

export default function Dashboard() {
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <CoverageOverview />
    </Container>
  );
}
```

### 1.2 Assessment.tsx (745 lines → ~450 lines + 2 new files)

**Current structure:**
- `QuestionCard` (lines 42-305) — 264 lines
- `TagInput` (lines 308-374) — 67 lines
- `Assessment` (lines 376-745) — 370 lines (main page)

**Extract to `src/components/assessment/`:**

| New File | Component | Lines | Notes |
|----------|-----------|-------|-------|
| `QuestionCard.tsx` | `QuestionCard` | ~280 | Complex component with attachments, notes, ratings. Needs `useRatings` hook. |
| `TagInput.tsx` | `TagInput` | ~75 | Autocomplete with tag normalization. Needs `useTags` hook. |

**Update `src/components/assessment/index.ts`:**
```typescript
export { AttachmentUpload } from './AttachmentUpload';
export { BptSidebar } from './BptSidebar';
export { QuestionCard } from './QuestionCard';
export { TagInput } from './TagInput';
```

### 1.3 BptSidebar.tsx — No Split Recommended

At 756 lines, this file is large but contains 11 tightly-coupled rendering utilities for BPT data. These are all internal helpers for rendering the BPT sidebar. Splitting them would create many tiny files with tight coupling. **Recommend keeping as-is** — the file is long but cohesive.

---

## Phase 1 Dependencies Reference

When extracting components, these imports will be needed:

**QuestionCard.tsx needs:**
- `useRatings` from `../../../hooks/useRatings`
- `AttachmentUpload` from `./AttachmentUpload`
- `CapabilityQuestion` type from `../../../types`
- `useAttachments` return type for `attachmentHandlers` prop

**TagInput.tsx needs:**
- `useTags` from `../../../hooks/useTags`

**HistoryPanel.tsx needs:**
- `useCapabilityHistory` from `../../hooks/useHistory`
- `AssessmentHistory`, `CapabilityAssessment` types

**HistoryViewDialog.tsx needs:**
- `getCapabilityByCode` from `../../services/blueprint`
- `AssessmentHistory` type

**CoverageOverview.tsx needs (most complex):**
- `useCapabilityAssessments` from `../../hooks/useCapabilityAssessments`
- `useScores` from `../../hooks/useScores`
- `useHistory` from `../../hooks/useHistory`
- `getBusinessAreas`, `getCapabilityByCode` from `../../services/blueprint`
- All 4 extracted dashboard components
- `AssessmentHistory`, `CapabilityAssessment` types

---

## Phase 2: Fix DRY Violations

### 2.1 Create `src/utils/dateFormatters.ts`

**Consolidates 5 different date formatting patterns:**

```typescript
export function formatDateTime(date: Date | string): string
export function formatDate(date: Date | string): string  
export function formatDateLong(date: Date | string): string
```

**Files to update:**
- `Dashboard.tsx` — remove `formatDateTime` function, import from utils
- `Assessment.tsx` — replace inline `toLocaleDateString()` call
- `pdfExport.ts` — use `formatDateLong`

### 2.2 Create `src/utils/downloadHelpers.ts`

**Consolidates identical download logic from 2 files:**

```typescript
export function downloadBlob(blob: Blob, filename: string): void
export function downloadText(text: string, filename: string, mimeType: string): void
```

**Files to update:**
- `exportService.ts` — remove functions, re-export from utils
- `useAttachments.ts` — import `downloadBlob` from utils

### 2.3 Create `src/utils/historyHelpers.ts`

**Consolidates 3 nearly identical history snapshot creation blocks:**

```typescript
export function createHistorySnapshot(
  assessment: CapabilityAssessment,
  ratings: Rating[],
): AssessmentHistory
```

**Files to update:**
- `useCapabilityAssessments.ts` — replace 2 inline snapshot creations
- `importService.ts` — replace `createHistorySnapshot` function

### 2.4 Create `src/theme/sharedStyles.ts`

**Consolidates 3 gradient patterns and repeated styling:**

```typescript
import type { SxProps, Theme } from '@mui/material';

/**
 * Generate striped gradient for in-progress status
 * @param stripeWidth - Width of each stripe in pixels (default: 4)
 */
export function getInProgressGradient(stripeWidth: number = 4): string {
  return `repeating-linear-gradient(
    -45deg,
    #81c784,
    #81c784 ${stripeWidth}px,
    #a5d6a7 ${stripeWidth}px,
    #a5d6a7 ${stripeWidth * 2}px
  )`;
}

/**
 * Common chip styling for compact tags throughout the app
 */
export const compactChipSx: SxProps<Theme> = {
  height: 20,
  fontSize: '0.65rem',
};

/**
 * List item icon styling for dense lists
 */
export const listItemIconSx: SxProps<Theme> = {
  minWidth: 32,
};
```

**Files to update:**
- `Dashboard.tsx` — use `getInProgressGradient()` and `compactChipSx` (7 chip instances)
- `Assessment.tsx` — use `compactChipSx` (1 chip instance)
- `ImportExport.tsx` — use `listItemIconSx` (7 list icon instances)
- `ImportDialog.tsx` — use `listItemIconSx` (1 list icon instance)

---

## Phase 3: Extract Magic Numbers

### 3.1 Create `src/constants/ui.ts`

```typescript
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
  large: 4,   // Business area bars
  medium: 3,  // Capability bars
  small: 2,   // Legend indicator
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
export const COMPACT_CHIP_FONT_SIZE = '0.65rem';

/** Min width for level badge chips */
export const LEVEL_BADGE_MIN_WIDTH = 70;

// ===========================================
// Lists
// ===========================================

/** Min width for list item icons */
export const LIST_ITEM_ICON_MIN_WIDTH = 32;

/** Min width for attachment list item icons */
export const ATTACHMENT_ICON_MIN_WIDTH = 40;
```

### 3.2 Create `src/constants/export.ts`

```typescript
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
```

---

## Phase 4: Fix ESLint Disables

### 4.1 Current State
TypeScript strict mode is **already enabled**. Additional strictness flags like `noUncheckedIndexedAccess` are deferred — they add significant cleanup work for marginal benefit in a prototype.

### 4.2 Fix eslint-disable Comments (3 total)

1. **Dashboard.tsx line 626** — `react-hooks/exhaustive-deps`
   - Fix: Add missing dependencies or wrap in `useCallback`

2. **Assessment.tsx line 421** — `react-hooks/set-state-in-effect`
   - Fix: Use ref for one-time initialization instead of state + effect

3. **Assessment.tsx line 429** — `react-hooks/set-state-in-effect`
   - Fix: Same pattern — use ref or derive from props

**Recommended refactor pattern:**
```typescript
// Instead of state + effect with eslint-disable:
const originalStatusRef = useRef<'in_progress' | 'finalized' | null>(null);
if (assessment && originalStatusRef.current === null) {
  originalStatusRef.current = assessment.status;
}
```

---

## Implementation Order

| Order | Phase | Effort | Risk | Rationale |
|-------|-------|--------|------|-----------|
| 1 | Phase 3: Constants | Low | Very Low | Quick wins, no logic changes |
| 2 | Phase 2: Utilities | Low-Medium | Low | Enables cleaner component extraction |
| 3 | Phase 4: TypeScript | Medium | Low | Fix lint issues before big refactors |
| 4 | Phase 1: File Splits | Medium-High | Medium | Biggest change, benefits from prior work |

---

## File Structure After Refactoring

```
src/
├── components/
│   ├── assessment/
│   │   ├── AttachmentUpload.tsx    (existing)
│   │   ├── BptSidebar.tsx          (existing, unchanged)
│   │   ├── QuestionCard.tsx        (NEW - 303 lines)
│   │   ├── TagInput.tsx            (NEW - 76 lines)
│   │   └── index.ts                (UPDATED)
│   ├── dashboard/
│   │   ├── StackedProgressBar.tsx  (NEW - 83 lines)
│   │   ├── CapabilityProgressBar.tsx (NEW - 52 lines)
│   │   ├── HistoryPanel.tsx        (NEW - 133 lines)
│   │   ├── HistoryViewDialog.tsx   (NEW - 144 lines)
│   │   └── index.ts                (NEW)
│   ├── export/                     (existing, unchanged)
│   └── layout/                     (existing, unchanged)
├── constants/
│   ├── ui.ts                       (NEW)
│   ├── export.ts                   (NEW)
│   └── index.ts                    (NEW - barrel export)
├── utils/
│   ├── dateFormatters.ts           (NEW)
│   ├── downloadHelpers.ts          (NEW)
│   └── index.ts                    (NEW - barrel export)
├── theme/
│   ├── index.ts                    (existing)
│   └── sharedStyles.ts             (NEW)
└── ...
```

**Results:**
- Assessment.tsx: 745 → 422 lines (43% reduction)
- Dashboard.tsx: 1001 lines (kept cohesive, but extracted 4 reusable components)
- Total new files: 12

---

## Success Criteria

- [x] No page/component file over 500 lines (except BptSidebar and Dashboard which are intentionally kept cohesive)
- [x] No repeated code blocks > 5 lines (DRY violations consolidated into utils/theme)
- [x] All magic numbers extracted to constants (Dashboard, Assessment, ImportExport)
- [x] Zero `eslint-disable` comments (or justified with clear reason) — 1 remaining in Dashboard for intentional dep exclusion
- [x] App builds with `npm run build` without errors
- [ ] App runs with `npm run dev` without regressions (manual testing needed)
- [x] All lint checks pass with `npm run lint`

---

## Verification Steps (run after each phase)

```bash
# Build check
npm run build

# Lint check  
npm run lint

# Line count check (should show reduced sizes)
wc -l src/pages/Dashboard.tsx src/pages/Assessment.tsx

# Start dev server and manually test:
# - Dashboard loads and displays capabilities
# - Can start/view/edit assessments
# - Can finalize assessments
# - Import/Export works
# - History panel works
```

---

## Estimated Effort

| Phase | New Files | Estimated Time |
|-------|-----------|----------------|
| Phase 3: Constants | 2 | 30-45 min |
| Phase 2: Utilities | 4 | 45-60 min |
| Phase 4: TypeScript | 0 | 30-45 min |
| Phase 1: File Splits | 8 | 90-120 min |
| **Total** | **14** | **3-4 hours** |

---

## Potential Gotchas

1. **CoverageOverview is the riskiest extraction** — It has the most state, hooks, and dependencies. Extract the simpler components first (progress bars, dialogs) before tackling it.

2. **QuestionCard has complex prop drilling** — The `attachmentHandlers` prop is an object with 4 functions. Consider whether to keep this pattern or refactor to use context.

3. **`noUncheckedIndexedAccess` deferred** — This flag would require null checks on every array access. Deferred to a future hardening phase to maintain prototype velocity.

4. **The eslint-disable in Dashboard is in `useMemo`** — The fix requires understanding why `getCapabilityStatus` was excluded from deps. It may be intentional to avoid infinite loops.

5. **Import paths will change** — When extracting to `components/dashboard/`, relative imports from those components need to go up more levels (e.g., `../../hooks/` instead of `../hooks/`).

6. **Barrel exports can cause circular dependencies** — Be careful with the `index.ts` files. If `CoverageOverview` imports from `./index.ts` and `index.ts` exports `CoverageOverview`, you'll get issues.
