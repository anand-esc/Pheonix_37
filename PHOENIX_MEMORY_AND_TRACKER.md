# PHOENIX — Project Memory & Status Tracker

> **How to use this file — read this first, every session.**
> **Part 1 (Master Context)** is the project's persistent memory. Paste it at the start of any fresh Antigravity session so the agent has full context without you re-explaining the project from scratch. Treat Part 1 as close to read-only — it only changes when a real architectural decision is made, not casually.
> **Part 2 (Status Tracker)** is a living document. Every time a task is completed, check the box, add a one-line note with the commit hash/date, and leave the line in place — don't delete history. Every session ends by appending a new entry to the Checkpoint Log at the bottom. This file is the single source of truth for "what's actually done" — not memory, not a chat transcript.

---

# PART 1 — MASTER CONTEXT (paste this block into any new agent session)

## Project Identity

**Phoenix** — Multi-Vendor DVR/NVR Forensic Analysis Tool. SIH26150, National Technical Research Organisation (NTRO), Blockchain & Cybersecurity theme, Smart India Hackathon 2026. Build window: 01–09 September 2026.

**Problem:** DVR/NVR footage is critical criminal evidence, but every vendor (Hikvision, Dahua, CP Plus, Honeywell, TP-Link, Godrej, Uniview, Matrix) uses a proprietary, undocumented format. Existing tools are foreign, closed-source, expensive, and legally opaque. In *Chandrabhan Sudam Sanap v. State of Maharashtra* (2025 INSC 116), the Supreme Court rejected CCTV evidence over a missing §65-B(4)-equivalent certificate — procedural custody documentation matters as much as recovery.

**Approach:** Deep validated native parsers for Hikvision + Dahua (highest market share, best-documented), a generic NAL-carving fallback for every other vendor, wrapped in a real security layer (encryption + hash-chained ledger + RBAC) and an India-first legal compliance layer (BSA §63 certificate draft, DPDP Act 2023 alignment).

## Non-Negotiable Positioning Guardrails

Never violate these, even in comments, mock data, or docstrings:
- Ledger is **never** called a "blockchain" — it's a permissioned, signed, hash-chained audit ledger. No multi-party consensus exists.
- Legal output is a **certificate draft**, never a "certificate" — always requires human signature.
- AI/YOLO output is **detection/triage only** — never identification.
- Vendor support is **honestly graded**: `VALIDATED` / `GENERIC_FALLBACK` / `RESEARCH_TARGET` — never uniform "supported" claims.
- Every hash is computed **on plaintext, before encryption**.

## Tech Stack (locked)

Python 3.11+ · Pydantic v2 · FastAPI · pytest · `pyproject.toml` (hatchling/PEP 621) · ruff + black · `cryptography` + `argon2-cffi` for crypto.

## Team (branch owner → real name)

| Letter | Name | Owns |
|---|---|---|
| A | Sibam (you) | Core architecture, evidence contract, interfaces, API layer, Hikvision native parser, team unblocking, integration checkpoint |
| B | Suryansh | Crypto/hashing backend, key management, AI triage model integration |
| C | Amritansh | Acquisition/intake, format detector, generic NAL carver, hardware rig |
| D | Varsha | Certificate-draft generator, docs, pitch deck, frontend styling |
| E | Shayanna | **Frontend only** (backend/API glue absorbed into Sibam's scope) |
| F | Satya Sarthak | Signed hash-chained ledger, RBAC, Dahua adapter (real implementation) |

## The Locked Evidence Contract (`backend/core/evidence_model.py`)

Pydantic v2 models, `extra="forbid"` on all of them. **Do not modify without explicit review** — every branch is built against this shape.

- `ValidationStatus(str, Enum)` — `VALIDATED` / `GENERIC_FALLBACK` / `RESEARCH_TARGET`
- `VendorInfo` — vendor name, detected signature, `ValidationStatus`
- `HashRecord` — pipeline stage, algorithm (default SHA-256), hex digest, UTC timestamp
- `Fragment` — `fragment_id: str` (auto UUID via `default_factory`), byte offsets, codec info, recovery method, `confidence_score` (0.0–1.0), `confidence_rationale`
- `ChannelInfo` — camera/channel ID, frame rate/resolution, nullable `clock_offset_seconds`
- `DetectionResult` — bounding box, object class, confidence, nullable `fragment_id` linking back to a `Fragment`
- `EvidenceItem` — ID, device info, `VendorInfo`, list of `ChannelInfo`, list of `Fragment`, list of `HashRecord` (full lineage), list of `DetectionResult`, free-form `metadata: dict[str, str]`
- `Case` — case ID, intake timestamp, investigator/custodian IDs (plain strings — identity resolution belongs to RBAC/ledger, not this model), list of `EvidenceItem`

## The Locked Interfaces (`backend/core/interfaces.py`)

Abstract base classes, `abc.ABC` + `@abstractmethod`. Cannot be instantiated directly.

- `BaseAdapter` — `detect(source_path) -> bool`, `parse(source_path) -> EvidenceItem`, `list_channels(source_path) -> list[ChannelInfo]`
- `RecoveryEngine` — `carve_fragments(source_path) -> list[Fragment]`, `score_confidence(fragment) -> float`
- `Ledger` — `write_event(event_type, payload) -> str`, `verify_chain() -> bool`, `get_history(case_id) -> list[dict]`
- `CryptoProvider` — `hash_plaintext(data, stage) -> HashRecord`, `encrypt(data, case_id) -> bytes`, `decrypt(data, case_id) -> bytes`

Ledger `event_type` strings are locked to: `intake`, `recovery`, `encryption`, `access`, `denial`, `export`, `report` — do not invent new ones without a heads-up to the team.

## Current Repo State (as of last verified session — see Checkpoint Log for date)

```
main branch has:
  backend/core/evidence_model.py, interfaces.py   [locked contract]
  backend/crypto/{hashing,encryption,key_manager,provider,async_utils}.py  [Suryansh, merged PR #2]
  backend/adapters/{hikvision,dahua}/__init__.py   [stubs only — NotImplementedError]
  backend/api/main.py, mock_data.py                [mock API layer, 5 endpoints, real SHA-256 chained ledger mock]
  pyproject.toml   [cryptography + argon2-cffi added]
  tests/  [28+ tests, all passing]

Other branches, not yet merged:
  feat/acquisition-recovery (Amritansh) — real generic_carver: adapter.py, carver.py,
    nal.py, scoring.py, mp4.py. Status: appears functional, not yet reviewed by us,
    not yet merged to main.
  feat/audit-ledger (Satya) — real ledger implementation status unconfirmed from our
    side; proposed InMemoryEventSink.subscribe() pattern for ledger event ingestion.
    DahuaAdapter real implementation also his, once he replaces the stub.

Not yet started (to our knowledge):
  Varsha — certificate draft, docs, pitch deck
  Shayanna — frontend (unblocked as of mock API merge — needs to confirm exact
    field/endpoint requirements against what was guessed in mock_data.py)
```

## Branch/Workflow Convention

Direct-to-`main` push: small, additive, non-contract-breaking changes (e.g. dependency fixes, additive fields with safe defaults). PR + review: anything larger, anything another branch will build directly on top of. Naming is inconsistent across branches (`feat/x` vs `feature/x`) — cosmetic, not worth mass-renaming mid-build.

---

# PART 2 — STATUS TRACKER (Sibam + Suryansh scope)

## Sibam — Done

- [x] Repo skeleton, `.gitignore`, `pyproject.toml`, initial commit — merged PR #1
- [x] `evidence_model.py` — full Common Evidence Representation, `extra="forbid"`, enum-based validation status
- [x] `interfaces.py` — all 4 ABCs, tested to block direct instantiation
- [x] `fragment_id` added to `Fragment` (auto-UUID) and confirmed present on `DetectionResult` — pushed to `main`
- [x] `HikvisionAdapter` stub (routing scaffold only, `NotImplementedError`) — tested, importable
- [x] `DahuaAdapter` stub (same pattern) — tested, importable — **created by Sibam, not Satya; message sent telling Satya to build on top of this file, not replace it**
- [x] Mock API layer, `backend/api/main.py` + `mock_data.py` — 5 endpoints, built from real Pydantic models, CORS enabled
- [x] Ledger hash format bug fixed — real `hashlib.sha256`, verified 64-char hex, chain-link verified programmatically (PASS)
- [x] `feature/api-mock-layer` — ready to merge / merge confirmed pending your click

## Sibam — Pending

- [ ] **Real Hikvision WFS native parser.** Currently a stub. *Recommendation: deprioritize — the plan's own MVP demo slice explicitly allows a synthetic Hikvision-shaped test image for the live demo. A fully-wired pipeline with fake input beats a real parser bolted onto a half-wired API.*
- [ ] **Video streaming endpoint** for the video viewer — range-request support so scrubbing/seeking works. Not started. Different from the existing JSON-metadata fragment endpoint.
- [ ] **Swap mock data for real pipeline calls** in `main.py`, once adapters/crypto/ledger are actually wired together end-to-end. Blocked on other branches landing first.
- [ ] **RBAC enforcement at the API layer** — how a role gets passed per-request and enforced deny-by-default. Blocked on Satya's real RBAC implementation.
- [ ] **Case intake/upload endpoint** — 🔴 **BLOCKED ON A DECISION, not on code.** Open question, unanswered: does the demo need to accept a live disk-image upload through the UI, or does the dashboard just display a pre-loaded case? This determines whether this is real work or gets explicitly cut. Resolve before Day 6–7.
- [ ] **Mid-build end-to-end integration checkpoint** — the plan explicitly assigns Sibam to force a rough, full pipeline run early (originally Day 6–7) to catch integration bugs while there's still time to fix them. Not yet run — worth scheduling deliberately, not letting it slip.
- [ ] **Get Shayanna's real endpoint/field requirements** and reconcile against the current mock shape — current endpoints are an educated guess, not her confirmed spec.
- [ ] **Review `feat/acquisition-recovery`** (Amritansh's real carver) before it merges — same audit rigor as the crypto branch got.
- [ ] **Review `feat/audit-ledger`** (Satya's real implementation) before it merges.

## Suryansh — Done

- [x] `hashing.py`, `encryption.py`, `key_manager.py`, `provider.py` — `PhoenixCryptoProvider` correctly subclasses `CryptoProvider`, matching sync signatures, verified via direct instantiation test
- [x] Random 256-bit DEK per case (`os.urandom(32)`, confirmed one per `case_id`)
- [x] KEK derived via Argon2id, OWASP-tuned params (`iterations=3, lanes=4, memory_cost=65536`)
- [x] Unique nonce per AES-GCM operation (`os.urandom(12)`, confirmed no reuse)
- [x] Hashing confirmed to happen on plaintext before encryption — traced through actual call path, not just comments
- [x] `test_crypto.py` — 9 tests, all passing
- [x] Async wrappers + hardware acceleration added as **additive** extras, confirmed not to break the required sync ABC methods
- [x] `pyproject.toml` dependencies (`cryptography`, `argon2-cffi`) fixed and pushed to `main`
- [x] Custom security exceptions + secure RAM key wiping
- [x] YOLOv8 detections mapped to strict Pydantic `DetectionResult` models
- [x] Argon2id salt uniqueness + DEK wrapping implemented in PhoenixCryptoProvider. Confirmed freshly generated salt and correct KEK derivation using PHOENIX_MASTER_SECRET. (Commit 96486ce, 2026-09-04)

## Suryansh — Pending
- [ ] Confirm whether the async/hardware-acceleration additions are actually being used anywhere yet, or sitting unused — not urgent, but worth knowing before claiming it as a feature in the pitch deck.

## Cross-Branch Dependencies Affecting Sibam (informational, not owned by Sibam)

- Amritansh's format-detector routing is now testable against both adapter stubs — confirm he's picked this up.
- Satya still owes: real `DahuaAdapter` internals (on top of Sibam's stub, not replacing it) + real ledger implementation + RBAC.
- Varsha hasn't started; will eventually need the mock data reconciled against real certificate-draft field requirements.

---

## CHECKPOINT LOG

*Append a new dated entry every session. Keep every prior entry — this is the project's audit trail, don't overwrite it.*

- **2026-09-01** — Core architecture merged (PR #1). Contract + interfaces locked.
- **2026-09-01/02** — Crypto branch merged (PR #2). Full audit passed: contract untouched, ABC satisfied, DEK/KEK/nonce all correct. `pyproject.toml` dependency gap found and fixed.
- **2026-09-02** — `fragment_id` added to contract, pushed to `main`. Hikvision + Dahua stubs created. Mock API layer built (5 endpoints), ledger hash format bug found and fixed, chain verified PASS. `feature/api-mock-layer` ready to merge.
- **2026-09-04** — Checked Argon2id salt uniqueness. Result: FAIL. KEK derivation and salt generation logic exists but is entirely orphaned and unused in PhoenixCryptoProvider. Tracker updated.
- **2026-09-04** — Fixed orphaned KEK derivation in PhoenixCryptoProvider. DEKs are now correctly wrapped using AES-GCM and an Argon2id KEK derived from PHOENIX_MASTER_SECRET + a fresh per-case salt. Secure RAM wiping shifted to clear DEKs post-decryption. Verified 29 tests pass end-to-end.
