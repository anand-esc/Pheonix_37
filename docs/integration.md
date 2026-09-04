# Integrating with the acquisition-side pipeline

One page for teammates. Everything below lives on `feat/acquisition-recovery`;
nothing here requires changes to that branch.

## Vendor adapters (Hikvision, Dahua)

Detection routes by vendor name to a module and class, imported lazily:

| Vendor | Import that must work | Class |
|---|---|---|
| Hikvision | `from backend.adapters.hikvision import HikvisionAdapter` | `HikvisionAdapter` |
| Dahua | `from backend.adapters.dahua import DahuaAdapter` | `DahuaAdapter` |

Requirements: subclass `backend.core.interfaces.BaseAdapter`, constructible
with no arguments, exported from the package `__init__.py`. If the class is
named differently, change one line in `ADAPTER_FOR_VENDOR`
(`backend/detection/signatures.py`). Until the module exists, runs fall back
to the generic carver and record `fallback = True`; nothing breaks.

What the runner does with your `parse()` result: copies `channels`,
`fragments` and `metadata` into the evidence item that already carries the
intake hashes. Your adapter does not need to hash or encrypt anything.

Optional: if your adapter wants to emit events, accept `sink`, `case_id` and
`evidence_id` keyword arguments and call `backend.pipeline.events.emit`.
The runner constructs vendor adapters with no arguments today, so this is a
follow-up, not a requirement.

## Ledger (Satya)

Subscribe once and every stage's events arrive in order:

```python
from backend.pipeline.events import InMemoryEventSink

sink = InMemoryEventSink()
sink.subscribe(lambda e: ledger.write_event(e.event_type, e.model_dump(mode="json")))
run_pipeline(source, case_id=..., operator_id=..., out_dir=..., sink=sink)
```

Or implement the `EventSink` protocol (one method, `emit(event)`) and pass
your own object as `sink`. Event names and payload fields are tabulated in
`docs/acquisition.md`. Payload values are plain JSON types. A subscriber that
raises is logged and does not stop the pipeline.

Useful anchors for chaining: `intake_completed.sha256` (image identity),
`recovery_completed.recovery_hash` (all fragments), and each
`encryption_completed.ciphertext_sha256`.

## Reporting and certificate draft (Varsha)

Read, in order of convenience:

1. `<out_dir>/pipeline_result.json`: the full `PipelineResult`
   (`backend/pipeline/runner.py`). Contains the acquisition record, detection
   report with rationale lines, adapter decision, evidence item with
   `hash_lineage`, carve result with per-fragment features and rationale,
   exported and encrypted artefacts, per-stage timings, and all events.
2. `<out_dir>/evidence.img.acquisition.json`: the custody sidecar alone
   (fields in `docs/acquisition.md`).
3. `<out_dir>/run_transcript.json`: the compact human-readable version.

Strings to quote verbatim in a report: `detection.rationale` (list),
`fragments[i].confidence_rationale`, `vendor_info.validation_status`.

## Frontend (Shayanna)

`backend/api/routes_acquisition.py` is an `APIRouter` that is not yet
registered. Once `main.py` includes it:

| Method and path | Purpose |
|---|---|
| `POST /acquisition/runs` (`?wait=true` to block) | start a run; body `source_path, case_id, operator_id, out_dir, device_info, encrypt` |
| `GET /acquisition/runs` | list jobs |
| `GET /acquisition/runs/{job_id}` | status, `bytes_read` for a progress bar, last event, summary |
| `GET /acquisition/runs/{job_id}/result` | full `PipelineResult` (409 until finished) |
| `GET /acquisition/runs/{job_id}/events` | ordered events |
| `POST /acquisition/detect` | signature scan of a file only |

Polling `GET /runs/{job_id}` every second is enough for the prototype.

## Crypto (Suryansh)

The runner uses the shared `CryptoProvider` exactly as specified:
`hash_plaintext(data, stage)` then `encrypt(data, case_id)` per fragment.
Whole-image encryption uses `backend.crypto.encryption.encrypt_file` with
the case DEK; see `docs/pipeline.md` for how the key is obtained and what
would make that cleaner.

## AI triage (Suryansh)

Exported fragments are raw Annex-B `.h264`/`.h265` elementary streams under
`<out_dir>/fragments/`, and lossless MP4 views under `<out_dir>/playable/`.
OpenCV with an FFmpeg backend reads either.

Set `DetectionResult.fragment_id` to the `Fragment.fragment_id` of the
fragment the detection came from. The carver derives it from the fragment's
own bytes (`frag-<first 16 hex of its SHA-256>`), so it is stable across
re-runs and across machines, unlike a random UUID. The same id appears in
`PipelineResult.playable[].fragment_id` and in
`EvidenceItem.metadata["fragment_NNNN_id"]`.

## Running it

```
python hardware/acquisition_rig/simulate_dvr.py
python hardware/acquisition_rig/run_demo_pipeline.py
python -m pytest -q
```
