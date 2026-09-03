# MITA 3.0 State Self-Assessment Tool

A Progressive Web App (PWA) enabling Medicaid agencies to self-assess their IT maturity against the MITA 3.0 (Medicaid Information Technology Architecture) framework.

🔗 **[Live Demo](https://nickarrow.github.io/mita-3.0-ssa/)**

## Overview

This tool allows state Medicaid agencies to evaluate their current IT capabilities across the business capabilities defined in the MITA 3.0 framework. All data is stored locally in your browser—nothing is transmitted to any server.

### Key Features

- **76 Business Capabilities** — Assess maturity across all MITA 3.0 business areas
- **Offline-First** — Works without internet after initial load
- **Privacy-First** — All data stays in your browser (IndexedDB)
- **Assessment History** — Track changes over time with automatic snapshots
- **Tags & Filtering** — Organize assessments with custom tags
- **Process Documentation** — Built-in Business Process Templates (BPT) for context
- **Auto-Save** — Never lose your work

### Business Areas Covered

| Business Area | Capabilities |
|---------------|--------------|
| Business Relationship Management | 4 |
| Care Management | 9 |
| Contractor Management | 9 |
| Eligibility and Enrollment Management | 8 |
| Financial Management | 19 |
| Operations Management | 9 |
| Performance Management | 5 |
| Plan Management | 8 |
| Provider Management | 5 |
| **Total** | **76** |

All 76 capabilities from the source blueprint are covered, across 837 maturity
questions. Earlier releases covered 74: CMS spells two processes differently in its
own appendices, the BCM and BPT filenames disagreed as a result, and pairing the two
halves by filename silently dropped both. The halves are now paired on the upstream
`process_id`, which is identical across a pair by construction.

## Tech Stack

- **React 19** + TypeScript
- **Vite** — Build tooling
- **Material UI v7** — Component library
- **Dexie.js** — IndexedDB wrapper for local storage
- **vite-plugin-pwa** — Service worker & offline support
- **React Router v7** — Client-side routing

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/nickarrow/mita-3.0-ssa.git
cd mita-3.0-ssa

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run format` | Format `src/` with Prettier |
| `npm run sync:blueprint` | Check the vendored blueprint against upstream (dry run) |

### Testing

Tests run under [Vitest](https://vitest.dev/) against
[`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB), a real in-memory IndexedDB
implementation. Because the app talks to Dexie directly with no abstraction layer, the data-layer tests
exercise the same code paths the browser does, including transactions and compound indexes.
`src/test/setup.ts` also installs a minimal `FileReader`, which JSZip needs to read a `Blob` and Node
does not provide — without it the entire ZIP export/import path is untestable, which is how an
attachment-duplication bug once survived in the one code path that handles user files.

Coverage is concentrated on the data-integrity surface — import validation, the assessment lifecycle
(edit, revert, finalize), rating persistence, blueprint migrations and the export/import round trip —
because that is where a silent bug costs a user their work. UI behaviour is verified by hand in a
browser.

## Deployment

This project is configured for automatic deployment to GitHub Pages via GitHub Actions. Every push to `main` triggers a build and deploy.

## Data Source

Business Capability Models (BCM) and Business Process Templates (BPT) are sourced from the
[MITA Open Blueprint](https://github.com/nickarrow/mita-open-blueprint) project and vendored
verbatim into `src/data`. Provenance, the pinned upstream commit and the dataset's license are
recorded in [`src/data/NOTICE.md`](src/data/NOTICE.md). Do not hand-edit the JSON: fix it upstream
and re-sync, so every consumer gets the correction.

Run `npm run sync:blueprint` to compare the vendored copy against upstream. The script reports which
files changed and, more importantly, whether any capability's question count moved — a stored rating
identifies its question by array position, so a shift there invalidates existing answers and needs a
migration in `src/services/blueprintRevision.ts` plus a Dexie version bump. It refuses to write in
that case unless told the migration exists.

## License

This project is licensed under the GPL-3.0 License — see the [LICENSE](LICENSE) file for details.
The vendored MITA blueprint dataset in `src/data` is MIT licensed; see
[`src/data/NOTICE.md`](src/data/NOTICE.md). The underlying CMS MITA framework content is a
U.S. Government work in the public domain.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
