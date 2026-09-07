# Phoenix Architecture

For the canonical project overview, core capabilities, and vendor support matrix, please refer to the main [README.md](../README.md).

## Pipeline Flow

```mermaid
flowchart TD
    subgraph Intake ["Intake Phase"]
        A["Raw Evidence Source\n(Disk Image / Physical Device)"]
        B["SHA-256 & MD5 Intake Hash\n(Computed during streaming read)"]
        A --> B
    end

    subgraph Parsing ["Format Detection & Parsing"]
        C{"Format Detector\n(Magic Bytes / Signature Engine)"}
        D["Hikvision Adapter\n(WFS Filesystem Parser)"]
        E["Dahua Adapter\n(DHFS/DHAV Parser)"]
        F["Generic NAL Carver\n(Vendor-Agnostic Fallback)"]
        
        B --> C
        C --> D
        C --> E
        C --> F
    end

    subgraph Representation ["Normalisation & Integrity"]
        G["Common Evidence Representation\n(Unified JSON Contract)"]
        H["Fragment Fingerprinting & Recovery Engine\n(NAL Carving + Metadata Tagging)"]
        I["Timestamp Normalisation\n(Per-Camera Offset Correction, Drift Flagging)"]
        J["Cryptographic Integrity Engine\n(Continuous SHA-256 Validation)"]

        D --> G
        E --> G
        F --> G
        G --> H
        G --> I
        G --> J
    end

    subgraph Analysis ["Analysis & Triage"]
        K["Cross-Camera Correlation Engine\n(Synchronised Timeline Assembly)"]
        L["AI-Driven Triage Module\n(YOLOv8-Nano: Person/Vehicle Detection ONLY)"]

        H --> K
        I --> K
        J --> K
        K --> L
    end

    subgraph Security ["Security & Governance Layer"]
        M1["AES-256-GCM Encrypted Vault\n(Per-Case DEK, Argon2id KEK)"]
        M2["Signed Tamper-Evident Ledger\n(Hash-Chained Event Auditing)"]
        M3["Role-Based Access Control\n(Strict Deny-By-Default Policies)"]
    end

    subgraph Output ["Reporting & Output Phase"]
        N["Legal Certificate Draft Generator\n(BSA Section 63 Compliant)"]
        O["Interactive Forensic Dashboard\n(React/Vite Client interface)"]
    end

    L --> M1
    L --> M2
    L --> M3
    M1 --> N
    M2 --> N
    M3 --> N
    N --> O

    classDef phase fill:#f9f9f9,stroke:#333,stroke-width:1px;
    class Intake,Parsing,Representation,Analysis,Security,Output phase;
```


## Completed Items

- **Item 2 (custody-facts verification):** `docs/custody_facts_verification.md` — cross-check of `custody_facts.json` fields against BSA §63 Part A requirements; gaps and inconsistencies flagged; all required fields confirmed present. Branch: `feat/certificate-draft-generator`.
- **Item 1 (certificate-draft generator):** `backend/reporting/certificate_draft.py` — BSA §63 certificate-draft generator producing PDF (3-page A4, ReportLab) and HTML (Jinja2) from a single `CertificateDraft` data model, fed by `CustodyFacts`; prominent DRAFT banner in both formats; fails loudly on unverified images or missing required fields. Branch: `feat/certificate-draft-generator`.
- **Item 6 (frontend styling):** BLOCKED — `frontend/dashboard`, `frontend/timeline`, and `frontend/video-viewer` contain only `.gitkeep` on `main`; Shayanna's components do not yet exist. No work performed; no components fabricated. See final summary report.

## Case intake: local source path, not browser upload

Decided 6 Sep 2026. Evidence enters the pipeline as a **local source path** —
a disk image file or a raw device such as `\.\PhysicalDrive2` or `/dev/sdb` —
passed to `POST /acquisition/runs` as `source_path`. There is no upload
endpoint and none is planned.

This is a deliberate scope decision, not a missing feature:

* A real acquisition attaches the evidence disk through a hardware write
  blocker and images it locally. The examiner already has the device in front
  of them; a browser upload would add a copy step, not a capability.
* Multi-terabyte recorder disks are not something a browser upload can handle
  responsibly (partial uploads, temp storage, size limits), and every one of
  those failure modes would sit between the evidence and its hash.
* The acquisition itself is what establishes integrity: `acquire()` opens the
  source read-only, hashes SHA-256 and MD5 while streaming, and re-hashes the
  written image to verify it. An upload would happen *before* that boundary
  and could not be certified the same way.

If a future deployment needs remote intake, the honest shape is an agent
running on the examiner's own machine that images locally and ships the
already-hashed image, not a file picker in the dashboard.
