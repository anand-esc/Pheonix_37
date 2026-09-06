# Phoenix Architecture

For the canonical project overview, core capabilities, and vendor support matrix, please refer to the main [README.md](../README.md).

## Pipeline Flow

```mermaid
flowchart TD
    A[Raw Disk / Disk Image] --> B["SHA-256 Intake Hash\n(computed on plaintext)"]
    B --> C{Format Detector\nmagic bytes / signature engine}

    C --> D["Hikvision Adapter\nWFS Filesystem Parser"]
    C --> E["Dahua Adapter\nDHFS/DHAV Parser"]
    C --> F["Generic NAL Carver\nVendor-Agnostic Fallback"]

    D --> G[Common Evidence Representation]
    E --> G
    F --> G

    G --> H["Fragment Fingerprinting\n& Recovery Engine\nNAL carving + fragment tagging"]
    G --> I["Timestamp Normalisation\nper-camera offset correction\nUTC/IST handling, drift flagging"]
    G --> J["Integrity Hashing\nSHA-256 at every stage\nplaintext-first"]

    H --> K[Cross-Camera Correlation / Timeline]
    I --> K
    J --> K

    K --> L["AI Triage\nYOLOv8-nano\nperson / vehicle / object detection\nnever identification"]

    L --> M["Security Layer"]

    subgraph M["Security Layer"]
        M1["AES-256-GCM Encryption\nper-case DEK wrapped by Argon2id KEK"]
        M2["Signed Hash-Chained Audit Ledger\nevery pipeline event recorded"]
        M3["Role-Based Access Control\n4 roles, deny-by-default"]
    end

    M --> N["Legal Certificate-Draft Generator\nPart A: operator fields\nPart B: expert fields\ndraft only - requires human signature"]
```

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
