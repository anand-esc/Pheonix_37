# Acquisition-Side Pipeline Architecture

**Component Owner:** Acquisition & Recovery Module  
**Source Location:** `backend/pipeline/runner.py`

The `run_pipeline` function acts as the primary orchestrator for the forensic acquisition process. It securely transitions evidence from physical or virtual media through a structured, auditable pipeline ensuring cryptographically verifiable outputs at every stage.

## Execution Stages

| Stage | Subsystem | Artefacts Generated | Emitted Ledger Events |
|---|---|---|---|
| **1. Intake** | `backend.acquisition.acquire` | `<out>/evidence.img`, `.acquisition.json` sidecar | `intake_started`, `intake_completed`, `intake_failed` |
| **2. Detection** | `backend.detection.FormatDetector`, `resolve_adapter` | `DetectionReport`, `AdapterResolution` | `format_detected`, `adapter_resolved` |
| **3. Recovery** | Vendor Adapter (if validated), else `GenericCarverAdapter` | `EvidenceItem` structures, `<out>/fragments/*.h264`, Lossless wrappers in `<out>/playable/` | `recovery_started`, `recovery_completed`, `fragment_exported` |
| **4. Cryptography** | `CryptoProvider` (AES-256-GCM) | `<out>/vault/evidence.img.enc`, `<out>/vault/*.enc` | `encryption_completed` |
| **5. Persistence** | Pipeline Orchestrator | `<out>/pipeline_result.json`, `<out>/run_transcript.json` | (Ledger Persistence) |

## Cryptographic Hash Lineage

The system maintains an unbroken chain of custody through the `hash_lineage` structure, ordered sequentially:

1. **Intake Hash:** SHA-256 and MD5 computed inline during the read-only streaming process.
2. **Verification Hash:** SHA-256 computed iteratively by re-reading the written destination image, ensuring target disk integrity.
3. **Pre-Encryption Hash:** SHA-256 computed on each exported fragment immediately prior to encryption via `CryptoProvider.hash_plaintext`.

The orchestrator enforces a strict fail-safe: it aborts encryption if the pre-encryption hash deviates from the hash computed by the recovery engine during carving. Ciphertext hashes are segregated into `PipelineResult.encrypted` to ensure the core forensic identity remains plaintext-derived.

## Vendor Adapter Routing

The pipeline dynamically resolves vendor-specific format adapters (e.g., Hikvision WFS, Dahua DHFS). If a target filesystem signature matches a validated adapter, the pipeline processes the data natively. In instances where an adapter is absent or validation fails, the system documents a `fallback = True` event and defaults to the robust `GenericCarverAdapter`. Both code paths are extensively validated by automated testing matrices.

## Output Structure

- **`pipeline_result.json`**: A comprehensive machine-readable compilation containing the acquisition record, format detection metrics, adapter resolution summary, generated evidence items, exported fragments, cryptographic metadata, operation timings, and an event log.
- **`run_transcript.json`**: A streamlined, human-auditable replay file, utilized by `run_demo_pipeline.py` to reconstruct forensic states accurately.

## Out-of-Scope Operations

This module exclusively handles extraction and immediate cryptographic securing. Persistent ledger commits and reporting generation (e.g., BSA Section 63 drafts) are handled asynchronously by downstream subsystems subscribing to the event sink. 

## Full-Image Encryption Procedures

When configured with `encrypt_image=True` (default behavior), the pipeline routes the entire acquired image into `<out>/vault/evidence.img.enc` utilizing AES-256-GCM with a unique nonce and constant-memory streaming. 

The encryption module records the resulting ciphertext SHA-256 in `PipelineResult.image_encrypted` and broadcasts an `encryption_completed` event flagged as `fragment_index = -1`. The system acquires the case-specific Data Encryption Key (DEK) via a protected interface; should the crypto provider lack this capability, the full-image encryption step is safely bypassed with an audited warning, while individual fragments remain encrypted.
