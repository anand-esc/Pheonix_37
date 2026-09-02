# Acquisition-side pipeline runner

Owner: `feat/acquisition-recovery` branch. Code: `backend/pipeline/runner.py`.

`run_pipeline(source, case_id=..., operator_id=..., out_dir=...)` chains the
modules on this branch into one auditable run:

| Step | Module | Output | Events |
|---|---|---|---|
| 1 intake | `backend.acquisition.acquire` | `<out>/evidence.img` + `.acquisition.json` sidecar | `intake_started`, `intake_completed` / `intake_failed` |
| 2 detection | `backend.detection.FormatDetector`, `resolve_adapter` | `DetectionReport`, `AdapterResolution` | `format_detected`, `adapter_resolved` |
| 3 recovery | vendor adapter if importable, else `GenericCarverAdapter` | `EvidenceItem` fragments; `<out>/fragments/*.h264` | `recovery_started`, `recovery_completed`, `fragment_exported` |
| 4 hash-then-encrypt | shared `CryptoProvider` (`PhoenixCryptoProvider` by default) | `<out>/vault/*.enc` | `encryption_completed` |
| 5 persist | runner | `<out>/pipeline_result.json`, `<out>/run_transcript.json` | |

## Hash lineage

`EvidenceItem.hash_lineage` ends up with, in order:

1. `intake` SHA-256 and MD5 (streamed while imaging),
2. `intake_verify` SHA-256 (re-read from the written image),
3. `pre_encryption/fragment_NNNN` SHA-256 per exported fragment, produced by
   `CryptoProvider.hash_plaintext` immediately before `encrypt`.

The runner refuses to encrypt a fragment whose pre-encryption hash differs
from the hash the carver computed from the image bytes. Ciphertext hashes are
kept in `PipelineResult.encrypted`, separate from plaintext lineage.

## Adapter routing

The vendor adapters live on other branches. When their modules are absent
the runner records `fallback = True` and uses the generic carver; when they
are present and export the expected class names (see
`docs/format_signatures.md`), their `parse()` result is merged into the
evidence item and no carving happens. Tests cover both paths with a stub.

## Outputs

`pipeline_result.json` is the full `PipelineResult` (acquisition record,
detection report, adapter summary, evidence item, carve result, exported and
encrypted artefacts, timings, events). `run_transcript.json` is the compact,
human-readable replay used by `hardware/acquisition_rig/run_demo_pipeline.py
--fallback`.

## Not in scope here

Ledger persistence of events (the ledger branch subscribes to the sink) and
report generation (reporting branch reads `pipeline_result.json`). The API
router exists (`backend/api/routes_acquisition.py`) but is not registered.

## Whole-image encryption

`encrypt_image=True` (default) also streams the whole image into
`<out>/vault/evidence.img.enc` with the crypto module's `encrypt_file`
(AES-256-GCM, nonce + ciphertext + tag, constant memory). The plaintext hash
is the intake SHA-256 already in the lineage; the ciphertext SHA-256 is
recorded in `PipelineResult.image_encrypted` and emitted as an
`encryption_completed` event with `fragment_index = -1`.

The public `CryptoProvider` interface is bytes-only, so the runner obtains
the case DEK through `PhoenixCryptoProvider._get_key_for_case`. If a provider
has no such hook the image step is skipped with a warning and fragments are
still encrypted through the public interface. A public `encrypt_file`-style
method on the provider would remove that seam; flagged for the crypto owner.
