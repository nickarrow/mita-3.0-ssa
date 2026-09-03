# MITA 3.0 SS-A — Feature Port Implementation Plan

> **Historical record — completed January 29, 2026.** Every task below shipped: attachments,
> JSON/ZIP/PDF export, import with merge, the Guide and Import/Export pages, and the
> navigation rework. The unchecked boxes are an artefact of the plan never being ticked off,
> not work outstanding. See Phases 3.1–3.5 of
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) for the outcome.
>
> **The `mita-4.0-reference/` directory this plan refers to no longer exists**, so none of the
> "Reference Files (4.0)" paths resolve. The dependencies it asks you to install
> (`jszip`, `jspdf`, `jspdf-autotable`) are already in `package.json`, the database is at v7
> rather than the v5 targeted here, and `csvExport.ts` was never created.
>
> Retained only as a record of what was ported and why. Safe to delete.

## Overview

This document outlines the implementation plan for porting key features from the MITA 4.0 SS-A Tool to the MITA 3.0 version. The 4.0 reference implementation is available at `mita-4.0-reference/` within this workspace.

**Date:** January 29, 2026  
**Current 3.0 Database Version:** v4  
**Target 3.0 Database Version:** v5 (adds attachments table)

---

## Features to Implement

| # | Feature | Priority | Estimated Effort |
|---|---------|----------|------------------|
| 1 | Landing Page & Navigation Update | High | 1.5 hours |
| 2 | Attachments System | High | 3 hours |
| 3 | Import/Export Page | High | 5 hours |
| 4 | Guide Page | Medium | 1 hour |
| 5 | Integration & Testing | High | 2.5 hours |
| **Total** | | | **13 hours** |

---

## Feature 1: Landing Page & Navigation Update

### Current State (3.0)
- Logo click → `/dashboard`
- Nav items: Dashboard, About (About points to `/`)
- Home page (`/`) exists with hero, features, CTA
- Index route renders Home component

### Target State
- Logo click → `/` (Landing page)
- Nav items: Dashboard, Import/Export, Guide (remove About)
- Landing page is the entry point for first-time visitors
- Enhanced Home.tsx with "How It Works" section and data privacy alert

### Implementation Tasks

| Task | Status | Notes |
|------|--------|-------|
| Update `Layout.tsx` — logo navigates to `/` | ⬜ | Change `navigate('/dashboard')` to `navigate('/')` |
| Update `Layout.tsx` — update navItems array | ⬜ | Dashboard, Import/Export, Guide |
| Update `Layout.tsx` — add icons for new nav items | ⬜ | ImportExportIcon, InfoOutlinedIcon |
| Update `Home.tsx` — add "How It Works" section | ⬜ | 3-step workflow explanation |
| Update `Home.tsx` — add data privacy alert | ⬜ | Warning about browser data |
| Verify `App.tsx` routes | ⬜ | `/` → Home already exists |

### Reference Files (4.0)
- `mita-4.0-reference/src/components/layout/Layout.tsx` — nav structure
- `mita-4.0-reference/src/pages/Landing.tsx` — hero, features, how it works

### Notes
- Current `Home.tsx` already has hero section, features grid, and CTA button
- Main additions needed: "How It Works" steps and Alert component for data warning

---

## Feature 2: Attachments System

### Current State (3.0)
- No attachment support
- Ratings have `notes` field only
- Database at version 4

### Target State
- Attachments stored in IndexedDB as Blobs
- Attachments linked to individual ratings (per-question)
- Upload/download/delete functionality
- Supported file types: PDF, Word, Excel, images, text (max 10MB)
- Attachments displayed in QuestionCard component

### Data Model Changes

```typescript
// New Attachment type (add to src/types/index.ts)
export interface Attachment {
  id: string;
  capabilityAssessmentId: string;
  ratingId: string;                // FK to Rating.id
  fileName: string;
  fileType: string;
  fileSize: number;
  blob: Blob;
  description?: string;
  uploadedAt: Date;
}

// Update Rating type — add attachmentIds field
export interface Rating {
  id: string;
  capabilityAssessmentId: string;
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5 | null;
  previousLevel?: 1 | 2 | 3 | 4 | 5;
  notes: string;
  carriedForward: boolean;
  attachmentIds: string[];         // NEW: array of attachment IDs
  updatedAt: Date;
}

// Update HistoricalRating — add attachmentIds for history snapshots
export interface HistoricalRating {
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5;
  notes: string;
  attachmentIds: string[];         // NEW: preserve attachment references
}
```

### Database Schema Changes

```typescript
// Fresh v2.0 schema - clean slate (currently at v4)
db.version(4).stores({
  capabilityAssessments: 'id, capabilityCode, status, updatedAt',
  ratings: 'id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]',
  assessmentHistory: 'id, capabilityCode, snapshotDate',
  tags: 'id, name, usageCount, lastUsed',
});

// v5: Add attachments table for file storage
db.version(5).stores({
  capabilityAssessments: 'id, capabilityCode, status, updatedAt',
  ratings: 'id, capabilityAssessmentId, [capabilityAssessmentId+questionIndex]',
  assessmentHistory: 'id, capabilityCode, snapshotDate',
  tags: 'id, name, usageCount, lastUsed',
  attachments: 'id, capabilityAssessmentId, ratingId, uploadedAt',  // NEW
});
```

### Implementation Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add `Attachment` type to `src/types/index.ts` | ⬜ | |
| Update `Rating` type with `attachmentIds: string[]` | ⬜ | Default to empty array |
| Update `HistoricalRating` type with `attachmentIds` | ⬜ | For history snapshots |
| Update database schema to v5 in `src/services/db.ts` | ⬜ | Add attachments table |
| Create `src/hooks/useAttachments.ts` | ⬜ | Port from 4.0, adapt for Rating |
| Create `src/components/assessment/AttachmentUpload.tsx` | ⬜ | Port from 4.0 |
| Create `src/components/assessment/index.ts` | ⬜ | Export AttachmentUpload |
| Update `QuestionCard` in `Assessment.tsx` | ⬜ | Add AttachmentUpload below notes |
| Update `useRatings.ts` — initialize attachmentIds | ⬜ | Default empty array on new ratings |
| Update `useCapabilityAssessments.ts` — handle attachments on delete | ⬜ | Delete attachments when assessment deleted |
| Handle attachments in history snapshots | ⬜ | Include attachmentIds in HistoricalRating |

### Attachment Constraints
- Max file size: 10MB per file
- Allowed types: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), images (PNG, JPEG, GIF), text
- Files stored as Blobs in IndexedDB
- Attachments deleted when parent assessment is deleted

### Reference Files (4.0)
- `mita-4.0-reference/src/hooks/useAttachments.ts` — hook implementation
- `mita-4.0-reference/src/components/assessment/AttachmentUpload.tsx` — UI component
- `mita-4.0-reference/src/services/db.ts` — schema reference
- `mita-4.0-reference/src/types/index.ts` — Attachment type definition

---

## Feature 3: Import/Export Page

### Current State (3.0)
- No import/export functionality
- No export services

### Target State
- New `/import-export` route and page
- Export formats: ZIP (complete backup), JSON (data only), PDF (report)
- Import formats: ZIP, JSON
- ZIP includes: data.json, attachments folder, manifest.json
- Import uses "merge with history" strategy (newer replaces, older to history)

### Export Data Structure (3.0 Specific)

```typescript
// src/services/export/types.ts

export type ExportScope = 'full' | 'business_area' | 'capability';
export type ExportFormat = 'json' | 'zip' | 'pdf';

export interface ExportOptions {
  scope: ExportScope;
  format: ExportFormat;
  businessArea?: string;           // For business_area scope
  capabilityCode?: string;         // For capability scope
  includeAttachments?: boolean;    // Default true for ZIP
  includeHistory?: boolean;        // Default true
  stateName?: string;              // For PDF/ZIP headers
}

export interface ExportData {
  exportVersion: string;           // "1.0"
  exportDate: string;              // ISO date
  appVersion: string;              // "3.0"
  blueprintVersion: string;        // "3.0" from BCM data
  scope: ExportScope;
  scopeDetails?: {
    businessArea?: string;
    capabilityCode?: string;
    capabilityName?: string;
  };
  data: {
    assessments: CapabilityAssessment[];
    ratings: RatingExport[];       // Ratings without Blob references
    history: AssessmentHistory[];
    tags: Tag[];
    attachments: AttachmentMetadata[];
  };
  metadata: {
    totalAssessments: number;
    totalRatings: number;
    totalHistory: number;
    totalAttachments: number;
    businessAreas: string[];
    capabilities: string[];
  };
}

// Rating export format (dates as ISO strings)
export interface RatingExport {
  id: string;
  capabilityAssessmentId: string;
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5 | null;
  previousLevel?: 1 | 2 | 3 | 4 | 5;
  notes: string;
  carriedForward: boolean;
  attachmentIds: string[];
  updatedAt: string;               // ISO date string
}

export interface AttachmentMetadata {
  id: string;
  capabilityAssessmentId: string;
  ratingId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description?: string;
  uploadedAt: string;              // ISO date string
}

export interface ImportResult {
  success: boolean;
  importedAsCurrent: number;
  importedAsHistory: number;
  skipped: number;
  attachmentsRestored: number;
  errors: string[];
  details: ImportItemResult[];
}

export interface ImportItemResult {
  capabilityCode: string;
  capabilityName: string;
  action: 'imported_current' | 'imported_history' | 'skipped' | 'error';
  reason?: string;
}

export type ExportProgressCallback = (progress: number, message: string) => void;
export type ImportProgressCallback = (progress: number, message: string) => void;
```

### ZIP File Structure

```
mita-backup-2026-01-29.zip
├── manifest.json                  # Export metadata
├── data.json                      # All assessment data
└── attachments/                   # Attachment files
    └── {capabilityCode}/
        └── {fileName}_{attachmentId}.{ext}
```

### PDF Report Structure (3.0 Specific)
- **Cover Page**: State name, overall maturity score, assessment stats
- **Executive Summary**: Business area scores table, dimension summary
- **Business Area Sections**: One section per business area with assessments
  - Capability subsections with:
    - Process name and description
    - Overall capability score
    - Question-by-question ratings with level descriptions
    - Notes (if any)
    - Attachments list (filenames only)

### Implementation Tasks

| Task | Status | Notes |
|------|--------|-------|
| Install dependencies | ⬜ | `jszip`, `jspdf`, `jspdf-autotable` |
| Create `src/services/export/` directory | ⬜ | |
| Create `types.ts` — export/import types | ⬜ | 3.0-specific structure |
| Create `pdfStyles.ts` — PDF styling constants | ⬜ | Port from 4.0 |
| Create `exportService.ts` — JSON/ZIP export | ⬜ | Adapt from 4.0 |
| Create `pdfExport.ts` — PDF generation | ⬜ | Significant adaptation for BCM |
| Create `importService.ts` — JSON/ZIP import | ⬜ | Adapt merge logic from 4.0 |
| Create `index.ts` — public API exports | ⬜ | |
| Create `src/components/export/` directory | ⬜ | |
| Create `ImportDialog.tsx` | ⬜ | Port from 4.0 |
| Create `StateNameDialog.tsx` | ⬜ | Port from 4.0 |
| Create `src/components/export/index.ts` | ⬜ | |
| Create `src/pages/ImportExport.tsx` | ⬜ | Adapt from 4.0 |
| Add route `/import-export` to `App.tsx` | ⬜ | |
| Update `useScores.ts` — add getOverallScore | ⬜ | For export page stats |

### Key Differences from 4.0 Implementation
| Aspect | 4.0 | 3.0 |
|--------|-----|-----|
| Assessment structure | Domains → Areas | Business Areas → Capabilities |
| Rating granularity | Per ORBIT aspect | Per BCM question |
| Maturity model | ORBIT (5 dimensions) | BCM (per-question levels) |
| Score calculation | Dimension averages | Question averages |
| PDF sections | Domain → Area → Dimension | Business Area → Capability → Questions |
| CSV export | CMS Maturity Profile format | Not included (future enhancement) |

### Reference Files (4.0)
- `mita-4.0-reference/src/pages/ImportExport.tsx` — page layout
- `mita-4.0-reference/src/services/export/exportService.ts` — export logic
- `mita-4.0-reference/src/services/export/importService.ts` — import logic
- `mita-4.0-reference/src/services/export/pdfExport.ts` — PDF generation
- `mita-4.0-reference/src/services/export/pdfStyles.ts` — styling constants
- `mita-4.0-reference/src/services/export/types.ts` — type definitions
- `mita-4.0-reference/src/components/export/ImportDialog.tsx` — import UI
- `mita-4.0-reference/src/components/export/StateNameDialog.tsx` — state name prompt

---

## Feature 4: Guide Page

### Current State (3.0)
- No dedicated guide page
- About page exists but is minimal

### Target State
- New `/guide` route
- Content: How to use the tool, understanding data, MITA 3.0 framework info
- Links to Dashboard and Import/Export pages
- Stub content initially, can be expanded later

### Guide Page Content Outline

1. **How to Use This Tool** (6 steps)
   - Start from the Dashboard
   - Select a capability to assess
   - Rate each BCM question (1-5 maturity levels)
   - Add notes and attachments as evidence
   - Finalize your assessment
   - Export your results

2. **Understanding Your Data**
   - Data stored locally in browser
   - Warning about clearing browser data
   - Backup recommendations
   - Link to Import/Export page

3. **About MITA 3.0**
   - Brief explanation of MITA framework
   - BCM (Business Capability Model) overview
   - Maturity levels 1-5 explanation
   - Link to CMS MITA resources

4. **Open Source**
   - GitHub repository link (if applicable)
   - Built with React, TypeScript, Material UI

### Implementation Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `src/pages/Guide.tsx` | ⬜ | Adapt structure from 4.0 About.tsx |
| Add route `/guide` to `App.tsx` | ⬜ | |
| Write "How to Use" section | ⬜ | 6-step workflow |
| Write "Understanding Your Data" section | ⬜ | Privacy, backup info |
| Write "About MITA 3.0" section | ⬜ | Framework overview |
| Add navigation links to other pages | ⬜ | Dashboard, Import/Export |

### Reference Files (4.0)
- `mita-4.0-reference/src/pages/About.tsx` — structure and content patterns

---

## Feature 5: Integration & Testing

### Implementation Tasks

| Task | Status | Notes |
|------|--------|-------|
| **Navigation Testing** | | |
| Test logo click → Home (Landing) | ⬜ | |
| Test Dashboard nav item | ⬜ | |
| Test Import/Export nav item | ⬜ | |
| Test Guide nav item | ⬜ | |
| Test mobile navigation drawer | ⬜ | |
| **Attachment Testing** | | |
| Test file upload (various types) | ⬜ | PDF, Word, Excel, images |
| Test file size validation (>10MB rejected) | ⬜ | |
| Test file type validation | ⬜ | Invalid types rejected |
| Test attachment download | ⬜ | |
| Test attachment delete | ⬜ | |
| Test attachments persist after page reload | ⬜ | |
| Test attachments deleted with assessment | ⬜ | |
| **Export Testing** | | |
| Test JSON export | ⬜ | Valid JSON, all data included |
| Test ZIP export | ⬜ | Contains data.json, manifest, attachments |
| Test ZIP export with attachments | ⬜ | Attachments in correct folders |
| Test PDF export | ⬜ | Renders correctly, all sections |
| Test export with no assessments | ⬜ | Graceful handling |
| Test export with in-progress only | ⬜ | |
| **Import Testing** | | |
| Test JSON import | ⬜ | |
| Test ZIP import | ⬜ | |
| Test ZIP import with attachments | ⬜ | Attachments restored |
| Test import merge — newer replaces current | ⬜ | |
| Test import merge — older goes to history | ⬜ | |
| Test import of duplicate data | ⬜ | Skipped correctly |
| Test import of invalid file | ⬜ | Error handling |
| **Round-Trip Testing** | | |
| Export → Import → Verify data integrity | ⬜ | All data preserved |
| Export → Import → Verify attachments | ⬜ | Attachments accessible |
| **Documentation** | | |
| Update `IMPLEMENTATION_STATUS.md` | ⬜ | Add new features |
| Update `PROJECT_FOUNDATION_v2.md` if needed | ⬜ | |

### Browser Testing Matrix
| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ⬜ | ⬜ |
| Firefox | ⬜ | ⬜ |
| Safari | ⬜ | ⬜ |
| Edge | ⬜ | — |

---

## Dependencies to Install

```bash
npm install jszip jspdf jspdf-autotable
```

**Note:** TypeScript types are included in these packages (no separate @types needed).

### Dependency Versions (from 4.0 reference)
- `jszip`: ^3.10.1
- `jspdf`: ^4.0.0  
- `jspdf-autotable`: ^5.0.7

---

## File Structure After Implementation

```
src/
├── components/
│   ├── assessment/
│   │   └── AttachmentUpload.tsx    # NEW
│   ├── export/
│   │   ├── ImportDialog.tsx        # NEW
│   │   ├── StateNameDialog.tsx     # NEW
│   │   └── index.ts                # NEW
│   └── layout/
│       └── Layout.tsx              # MODIFIED
├── hooks/
│   ├── useAttachments.ts           # NEW
│   └── ... (existing)
├── pages/
│   ├── Assessment.tsx              # MODIFIED (add attachments)
│   ├── Dashboard.tsx
│   ├── Guide.tsx                   # NEW
│   ├── Home.tsx                    # MODIFIED (enhance as landing)
│   └── ImportExport.tsx            # NEW
├── services/
│   ├── db.ts                       # MODIFIED (add attachments table)
│   ├── blueprint.ts
│   └── export/                     # NEW directory
│       ├── csvExport.ts            # NEW (optional, for future)
│       ├── exportService.ts        # NEW
│       ├── importService.ts        # NEW
│       ├── index.ts                # NEW
│       ├── pdfExport.ts            # NEW
│       ├── pdfStyles.ts            # NEW
│       └── types.ts                # NEW
├── types/
│   └── index.ts                    # MODIFIED (add Attachment type)
└── App.tsx                         # MODIFIED (add routes)
```

---

## Implementation Order

1. **Phase 1: Foundation** (1 hour)
   - Install dependencies
   - Update types (Attachment, Rating.attachmentIds)
   - Update database schema to v5

2. **Phase 2: Attachments** (2 hours)
   - Create useAttachments hook
   - Create AttachmentUpload component
   - Integrate into QuestionCard

3. **Phase 3: Export Services** (2 hours)
   - Create export types
   - Create exportService (JSON, ZIP)
   - Create pdfExport (PDF generation)

4. **Phase 4: Import Services** (1.5 hours)
   - Create importService
   - Implement merge logic

5. **Phase 5: UI Pages** (2.5 hours)
   - Create ImportExport page
   - Create ImportDialog, StateNameDialog
   - Create Guide page
   - Update Home page as Landing

6. **Phase 6: Navigation & Routes** (1 hour)
   - Update Layout.tsx navigation
   - Update App.tsx routes

7. **Phase 7: Testing & Polish** (2 hours)
   - End-to-end testing
   - Bug fixes
   - Documentation updates

---

## Notes

### Porting Strategy
- The 4.0 reference code is well-structured and can be largely ported with adaptations for the 3.0 data model
- Main adaptation needed: 4.0 uses ORBIT dimensions/aspects, 3.0 uses BCM questions
- PDF export will need significant adaptation to reflect BCM structure
- Import/export JSON structure will be different but follow same patterns
- Attachment system can be ported almost directly (change `orbitRatingId` → `ratingId`)

### Key Adaptations Required
| Component | 4.0 Reference | 3.0 Adaptation |
|-----------|---------------|----------------|
| `useAttachments.ts` | Uses `orbitRatingId` | Change to `ratingId` |
| `exportService.ts` | Exports ORBIT ratings | Export BCM ratings |
| `importService.ts` | Imports ORBIT structure | Import BCM structure |
| `pdfExport.ts` | Domain → Area → Dimension | Business Area → Capability → Questions |
| `AttachmentUpload.tsx` | Minimal changes | Update prop types |

### Testing Considerations
- Test with various file types and sizes for attachments
- Test import/export round-trip to ensure data integrity
- Test on multiple browsers (Chrome, Firefox, Safari, Edge)
- Test mobile responsiveness for new pages

---

*Document created: January 29, 2026*  
*Last updated: January 29, 2026*
