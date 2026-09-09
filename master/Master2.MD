# Master2: Backend Architecture & Forensic Pipeline

This document details the backend execution flow, parsing strategy, and system architecture.

## Technology Stack
- **Language**: Python 3.11+
- **API Framework**: FastAPI
- **Parsing**: Struct manipulation for binary container formats (DHAV/DHFS).
- **Concurrency**: `asyncio` used for API routes, while intensive carving is largely CPU-bound.

## Core Pipeline (`pipeline/runner.py`)

The pipeline strictly guarantees that forensic integrity is not compromised during recovery.

### 1. Acquisition (`acquisition/imager.py`)
- Reads bits off physical devices or raw disk images.
- Implements a continuous stream-hash. The MD5 and SHA-256 identities of the raw evidence are computed *during* the read operation, preventing any tampering before hashing.

### 2. Format Detection & Resolution
- **Format Detector**: Scans the first segments of the image for Magic Bytes (`DHAV`, `DHFS`, etc.).
- **Adapter Resolution**: Maps detected signatures to a specific adapter.
  - If Dahua is detected, the native `DahuaAdapter` is loaded.
  - If a format is unknown, or if the adapter is merely a stub (like the current `HikvisionAdapter`), it dynamically falls back to the `GenericCarverAdapter`.

### 2. AI Triage (Stub / Not Connected)
*   **What it does:** Runs YOLOv8-nano against keyframes to detect broad categories (people, vehicles) without attempting facial recognition.
*   **State:** **Mock/Not Connected**. The YOLOv8 model is implemented (`backend/ai/triage.py`) but is not currently wired into the real pipeline (frame extraction -> YOLO -> DetectionResult -> API). Any UI implication or pitched capability of live detection boxes is currently a mock concept. This is a deliberate limitation before freeze.

### 3. Parsing & Recovery (Adapters)
- **Native Parser**: Extracts frames according to proprietary vendor specification, preserving exact sequence boundaries.
- **Generic Carver**: Blindly searches for H.264 (`0x00000001`) and H.265 NAL unit headers across the entire binary blob, extracting fragments probabilistically.
- **MP4 Wrapper**: The recovered raw `.h264` chunks are wrapped into a playable container so the browser frontend can display them without altering the underlying evidence.

### 4. API Layer (`api/main.py`)
- Unifies access to the `case_store`.
- Automatically loads the latest `pipeline_result.json` from the case's run directory.
- Exposes range-request streaming (`/api/case/{id}/fragments/{idx}/stream`) for efficient scrubbing in the UI.

## Design Philosophy
- **Confidence Scoring**: Every recovered fragment includes a `confidence_score` and `rationale`. A system that truthfully says "I am 50% sure this is a fragment based on a generic NAL header" is forensically superior to one that pretends a generic carve is a flawless native parse.
