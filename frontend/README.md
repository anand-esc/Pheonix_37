# Phoenix Frontend & Desktop Client

The frontend component of the Phoenix architecture is an interactive, secure forensic dashboard built with **React**, **Tailwind CSS**, and **Vite**. It is wrapped in an **Electron** container to provide a desktop-grade, court-defensible analysis environment for forensic investigators and technical experts.

## Core Capabilities

- **Secure Authentication Gate**: Role-based access control (RBAC) login portal requiring an Operator ID and security PIN to access the toolkit.
- **Evidence Intake & Case Management**: Create cases, trigger local backend video acquisition pipelines (`run_pipeline`), and permanently wipe case ledgers and files from disk.
- **Synchronized Timeline Assembly**: Cross-camera correlation view, displaying temporally aligned video fragments across multiple physical devices.
- **Tamper-Evident Provenance Tracking**: Visual representation of the cryptographic chain of custody, ensuring all rendered data maintains strict adherence to the underlying signed ledger.
- **Automated Reporting & Export**: Generate court-admissible A4 PDF reports (BSA Sec 63 compliant) natively using Electron IPC APIs.

## Architecture Guidelines

The frontend strictly acts as a presentation layer. It makes no forensic decisions, performs no hashing, and holds no decryption keys. All data is fetched securely from the Phoenix backend API, ensuring a firm boundary between evidence processing and visualization.

### Automatic Process Management
When launched in desktop mode, the Electron `main.cjs` process automatically locates the Python virtual environment and **spawns the FastAPI backend silently in the background**. The Electron container manages the lifecycle of the backend, ensuring it is cleanly terminated when the application closes.

## Local Development

To run the full application (which automatically starts both the React UI and the Python FastAPI backend):

```bash
cd frontend
npm install
npm run electron:dev
```

### Key Technologies
- **React 18** (UI Components & Routing)
- **Vite** (Build Tooling & Hot Reloading)
- **Electron** (Desktop Window, Native PDF generation, Process Management)
- **Tailwind CSS** (Utility-first styling with SaaS "Indigo/Coral" theme)
- **Lucide React** (Standardised SVG Icons)
