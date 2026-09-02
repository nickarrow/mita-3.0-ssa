# MITA 3.0 State Self-Assessment Tool

A Progressive Web App (PWA) enabling Medicaid agencies to self-assess their IT maturity against the MITA 3.0 (Medicaid Information Technology Architecture) framework.

🔗 **[Live Demo](https://naretakis.github.io/mita-3.0-ssa/)**

## Overview

This tool allows state Medicaid agencies to evaluate their current IT capabilities across the business capabilities defined in the MITA 3.0 framework. All data is stored locally in your browser—nothing is transmitted to any server.

### Key Features

- **74 Business Capabilities** — Assess maturity across all MITA 3.0 business areas
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
| Care Management | 8 |
| Contractor Management | 9 |
| Eligibility and Enrollment Management | 8 |
| Financial Management | 19 |
| Operations Management | 9 |
| Performance Management | 5 |
| Plan Management | 7 |
| Provider Management | 5 |
| **Total** | **74** |

> **Note:** The source blueprint contains 76 BCM and 76 BPT files, but two capabilities
> are currently excluded because their BCM and BPT filenames use mismatched capability
> codes (`Treatment_Plans` vs `Treatment_Plan`, and `Maintain_Reference` vs
> `Manage_Reference`). A capability requires both files to be usable. This is a data
> issue in the upstream [MITA Open Blueprint](https://github.com/naretakis/mita-open-blueprint)
> repository; the app logs a console warning in development when it detects unpaired
> codes. Once the filenames agree, the count rises to 76 with no app changes needed.

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
git clone https://github.com/naretakis/mita-3.0-ssa.git
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

### Testing

Tests run under [Vitest](https://vitest.dev/) against
[`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB), a real in-memory IndexedDB
implementation. Because the app talks to Dexie directly with no abstraction layer, the data-layer tests
exercise the same code paths the browser does, including transactions and compound indexes.

Coverage is concentrated on the data-integrity surface — import validation, the assessment lifecycle
(edit, revert, finalize) and rating persistence — because that is where a silent bug costs a user their
work. UI behaviour is verified by hand.

## Deployment

This project is configured for automatic deployment to GitHub Pages via GitHub Actions. Every push to `main` triggers a build and deploy.

## Data Source

Business Capability Models (BCM) and Business Process Templates (BPT) are sourced from the [MITA Open Blueprint](https://github.com/naretakis/mita-open-blueprint) project.

## License

This project is licensed under the GPL-3.0 License — see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
