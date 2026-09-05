# Acquisition, intake hashing and the pipeline event seam

Owner: acquisition / detection / fallback-recovery branch (`feat/acquisition-recovery`).

## What intake does

`backend.acquisition.acquire(source, destination, case_id=..., operator_id=..., device_info=...)`

1. Opens the source strictly read-only (`"rb"`, unbuffered). Nothing in this package can write to a source. Raw block devices (`\\.\PhysicalDriveN` on Windows, `/dev/sdX` on Linux) work when the process has administrator/root rights; without them an `AcquisitionPermissionError` is raised, never a silent partial read.
2. Streams the source into the image in 4 MiB chunks. While streaming, one SHA-256 and one MD5 hasher consume every chunk. These are the plaintext intake hashes. SHA-256 is the forensic identity used by every later stage; MD5 is recorded because the problem statement lists both.
3. After the last byte is written and fsynced, the image is re-hashed from disk (using the shared `backend.crypto.hashing.compute_sha256_file`). If it does not equal the streamed SHA-256, the run ends with `FAILED_VERIFICATION` and raises. An image that fails verification must never be used.
4. Writes a sidecar `<image>.acquisition.json` containing the full `AcquisitionRecord`. Failed runs also get a sidecar, with `status = FAILED` and a note explaining the failure, so partial images are never mistaken for complete ones.

`build_evidence_item(record, vendor_info)` turns a completed record into the shared `EvidenceItem`: the intake and verification `HashRecord`s become the first entries of `hash_lineage`, and the custody facts (acquisition id, operator, source path, bytes, time, tool version) go into `metadata` as strings.

## Sidecar fields (for the certificate-draft generator)

| Field | Meaning |
|---|---|
| `acquisition_id` | `acq-<uuid4>`, unique per run |
| `case_id`, `operator_id` | who acquired, for which case |
| `source_path`, `image_path`, `source_device_info` | what was imaged and where it went |
| `bytes_read` | bytes streamed from the source |
| `started_utc`, `finished_utc` | ISO-8601, UTC |
| `intake_hashes` | SHA-256 and MD5 `HashRecord`s at stage `intake` |
| `verification_hash` | SHA-256 `HashRecord` at stage `intake_verify` |
| `status` | `COMPLETED`, `FAILED`, or `FAILED_VERIFICATION` |
| `tool_version` | package version at acquisition time |
| `notes` | free-text reasons on failure |

## Failure cases covered by tests

Missing source, missing destination directory, write error mid-stream (disk full), verification mismatch, and raw-device access without rights.

## Pipeline event seam

`backend.pipeline.events` defines `PipelineEvent` and an `EventSink` protocol. Every stage on this branch emits events through a sink; the default `InMemoryEventSink` keeps them in order and supports `subscribe(callback)`. The ledger can attach a subscriber later and write each event as a chained entry without touching the emitting code.

Event names, in the order the demo pipeline emits them:

| Event | Emitted by | Key payload fields |
|---|---|---|
| `intake_started` | acquire | acquisition_id, source, destination, operator_id |
| `intake_completed` | acquire | bytes_read, sha256, md5, image_path, sidecar |
| `intake_failed` | acquire | reason, bytes_read |
| `format_detected` | detector | vendor, validation_status, confidence, matched |
| `adapter_resolved` | detector | adapter, fallback (bool) |
| `recovery_started` | carver | image_path |
| `recovery_completed` | carver | fragment_count, recovery_hash |
| `fragment_exported` | carver | index, byte_offset_start, byte_offset_end, sha256, out_path |
| `encryption_completed` | pipeline runner | plaintext_sha256, ciphertext_sha256 |

Payload values are plain JSON types so a ledger can hash them verbatim.
