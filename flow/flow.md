# Phoenix Forensic Pipeline Flow

This document provides a detailed breakdown of the end-to-end system flow for the Phoenix Forensic Pipeline as illustrated in `flow.mmd` and `flow.png`.

## 1. Frontend (React/Vite)
The frontend serves as the investigator's interactive dashboard. It communicates via REST API endpoints (`api.js`) to the backend.
- **Case Dashboard**: The entry point where new DVR/NVR raw images are ingested. It polls the backend for progress.
- **Evidence Page**: A specialized view for examining recovered video fragments natively or via the lossless MP4 wrapper.
- **Timeline Page**: Provides a synchronized cross-camera temporal layout of the carved fragments.
- **Report Page**: Generates Indian BSA Section 63 compliant certificates based on the hash lineage produced by the backend.

## 2. Backend (FastAPI)
The backend is the core processing engine, heavily focused on deterministic evidence recovery and strict chain of custody.

### API Layer
- **`main.py`**: Handles incoming HTTP requests and routes them to pipeline initiation, ledger retrieval, or protected endpoints via RBAC checks.

### Forensic Pipeline (`runner.py`)
This is a unidirectional dataflow pipeline:
1. **Acquisition**: Ingests physical or raw disk image sources. Crucially, a rolling SHA-256/MD5 hash is taken *during* the read stream.
2. **Format Detection**: Reads Magic Bytes to determine the vendor signature (e.g., DHAV/DHFS).
3. **Adapter Resolution**: If a native parser exists (e.g., Dahua), it is loaded. If it's a stub (e.g., Hikvision) or unrecognized, it falls back to the **Generic Carver**.
4. **Fragment Recovery / Carver**: Slices H.264/H.265 NAL units out of the proprietary filesystem.
5. **MP4 Wrapper**: Wraps raw `.h264` streams into playable `.mp4` files for the browser (lossless view, not evidence itself).
6. **Crypto Provider**: Executes the Hash-then-Encrypt operation on all fragments and the main evidence image using AES-256-GCM.
7. **Persistence**: Saves the complete object structure, including `pipeline_result.json`.

### Security & Governance
- **Event Sink**: Every stage of the pipeline emits an event.
- **Audit Ledger**: The Event Sink commits events to a hash-chained ledger, preventing retroactive modification.
- **RBAC**: Strict role-based policies (Investigator, Technical Expert, Auditor, Court) govern access control.

## 3. Case Store (Storage)
The local filesystem acts as the database for active forensic cases (`case_store/<CASE_ID>/run/`):
- **Raw Image**: The original evidence file (`evidence.img`).
- **`fragments/`**: Plaintext `.h264` files used for cryptographic hashing and verification.
- **`playable/`**: The `.mp4` wrappers.
- **`vault/`**: All evidence fragments and the raw image encrypted with a case-specific Data Encryption Key.
- **`run_transcript.json`**: A log of every step, confidence score, and error emitted during the pipeline.
