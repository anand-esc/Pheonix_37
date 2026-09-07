# Phoenix Forensic Dashboard

The frontend component of the Phoenix architecture is an interactive, secure forensic dashboard built with React and Vite. It is designed to run within an Electron container to provide a desktop-grade, court-defensible analysis environment for investigators and technical experts.

## Core Capabilities

- **Evidence Intake & Case Management**: Monitor ongoing acquisitions and view real-time recovery progress metrics.
- **Synchronised Timeline Assembly**: Cross-camera correlation view, displaying temporally aligned fragments across multiple physical devices.
- **Tamper-Evident Provenance Tracking**: Visual representation of the cryptographic chain of custody, ensuring all rendered data maintains strict adherence to the underlying signed ledger.
- **Role-Based Access Control (RBAC)**: Interface enforces strict deny-by-default access. Only authorised personnel may trigger export or reporting actions.

## Architecture Guidelines

The frontend strictly acts as a presentation layer. It makes no forensic decisions, performs no hashing, and holds no decryption keys. All data is fetched securely from the Phoenix backend API, ensuring a firm boundary between evidence processing and visualization.
