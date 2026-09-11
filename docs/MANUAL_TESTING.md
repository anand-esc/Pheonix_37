# Manual Testing Guide

How to bring the whole tool up, walk the main flows by hand, and confirm the
desktop client is really talking to the backend.

## 1. Start the backend

From the repository root:

```bash
# once
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"      # Windows
# .venv/bin/python -m pip install -e ".[dev]"       # Linux / macOS

# every run (demo mode: fixed demo keys, mock case when the store is empty)
set PHOENIX_DEMO_MODE=1                              # Windows
.venv\Scripts\python backend\run_server.py
```

For a real run set the two secrets instead of demo mode:

```bash
set PHOENIX_MASTER_SECRET=<32+ random characters>
set PHOENIX_LEDGER_SECRET=<32+ random characters>
```

The API listens on `http://127.0.0.1:8000` only. Open
`http://127.0.0.1:8000/docs` to see every route.

Every data route needs an `X-Operator-ID` header naming a registered operator:

| Operator id           | Role             | May do                                                  |
|-----------------------|------------------|---------------------------------------------------------|
| `investigator-01`     | INVESTIGATOR     | create/delete cases, start acquisition, run detection   |
| `technical-expert-01` | TECHNICAL_EXPERT | run detection, generate the certificate draft           |
| `auditor-01`          | AUDITOR          | ledger demo controls (tamper / restore)                 |
| `court-export-01`     | COURT_EXPORT     | view everything, download the certificate               |

Every registered operator can read case data. Anything else answers `401`
(no header) or `403` (unknown operator or missing permission).

## 2. Start the frontend

### Browser (development)

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173, proxies /api and /acquisition to the backend
```

### Desktop (Electron, development)

```bash
cd frontend
npm run electron:dev   # starts Vite, spawns backend/run_server.py from the project .venv
```

The dev window opens DevTools at the bottom; backend log lines are prefixed
`[backend]` in the terminal.

### Desktop (packaged)

```bash
cd frontend
npm run package:win    # or package:linux; needs pyinstaller in the .venv
```

## 3. Log in

Choose an operator from the dropdown and enter the demo PIN `ntro2026`. The
operator can be switched at any time from the header; the choice is what the
backend authorises, so switching role changes what the buttons allow.

## 4. Happy-path flows

### 4.1 Create a case

1. Dashboard → **New Case** → give it a title → **Create Case**.
2. Expected: you land on the case page, status `Intake`, no fragments yet.
3. Backend: `case_store/<CASE-ID>/case_meta.json` exists.

### 4.2 Acquire evidence and recover fragments

Make a synthetic recorder image first (no real hardware needed):

```bash
.venv\Scripts\python hardware\acquisition_rig\simulate_dvr.py --out D:\evidence --name dvr.img --size 64M
```

1. On the case page click **Start Acquisition** (or **Evidence Intake** for
   the full form), paste the image path, **Start Pipeline**.
2. Expected: a completion alert, then the **Fragments** tab lists recovered
   fragments with codec, confidence and rationale. Status becomes `Reported`
   (vault sealed).
3. Backend: `case_store/<CASE-ID>/run/` holds `evidence.img`, `fragments/`,
   `playable/`, `vault/`, `pipeline_result.json`, `custody_facts.json`,
   `run_transcript.json`.
4. A Hikvision-marked disk with no readable index falls back to the generic
   carver; the **Chain of Custody** tab shows `adapter resolved` twice.

### 4.3 Play a fragment

1. Click any fragment row.
2. Expected: the MP4 view plays; the sidebar shows byte range, recovery
   method and confidence. Seeking works (the backend answers Range requests).

### 4.4 Chain of custody

1. **Chain of Custody** tab.
2. Expected: `Genesis block` first, then intake, detection, adapter,
   recovery, export and encryption entries. Rows that came from the live
   ledger show payload/previous hashes; after a backend restart the same
   rows come from `run_transcript.json` and are marked unsigned.

### 4.5 Timeline

1. **Timeline** tab → **Open Full Timeline**.
2. Expected: probable channels on the left, fragments as bars positioned in
   seconds from the start of their channel, pie chart of recovery methods.
   The notes box repeats the backend's caveats (no wall-clock time, assumed
   frame rate).

### 4.6 Format detection and provenance

1. **Analysis** → **Format Detection** → **RUN DETECTION**.
2. Expected: vendor, signature and confidence with the rationale list.
   Requires Investigator or Technical Expert; Auditor gets a 403 message.
3. **Provenance Chain** shows the intake hash and the first sealed fragment
   hash from the evidence lineage.

### 4.7 Certificate draft

1. Switch operator to **Technical Expert** in the header.
2. **Certificate** tab → **Open Certificate Draft** → **Generate Certificate**.
3. Expected: success message; **Download PDF** saves
   `BSA63-Certificate-<CASE-ID>.pdf`. Any operator may download; only the
   Technical Expert may generate. The PDF is a draft with an empty signature block.

### 4.8 Ledger demo (audit trail tamper test)

1. Switch operator to **Auditor**.
2. **Analysis** → **Ledger Demo** → **Load chain** → **Verify** (valid) →
   **Tamper** block 1 → **Verify** (invalid, broken index shown) → **Restore**
   → **Verify** (valid).
3. As Investigator the tamper and restore buttons answer `403`.

### 4.9 Delete a case

1. As Investigator, **Delete Case** on the case page → confirm.
2. Expected: back on the dashboard, the case is gone and
   `case_store/<CASE-ID>/` is removed.

## 5. Verify frontend ↔ backend communication

- DevTools → **Network**: every request carries `X-Operator-ID`; case data
  answers `200` with JSON, the stream answers `200`/`206` with `video/mp4`.
- Stop the backend: the dashboard shows the load error, no data is faked
  (mock data appears only with `PHOENIX_DEMO_MODE=1` and an empty store).
- Change the operator to Court/Export and press **Start Acquisition**: the
  button is disabled in the UI and the API answers `403` if called directly.
- `curl -H "X-Operator-ID: investigator-01" http://127.0.0.1:8000/api/cases`
  lists the same cases the dashboard shows.

## 6. Automated checks

```bash
.venv\Scripts\python -m pytest -q          # backend: 272 tests
cd frontend && npx oxlint && npx vite build # frontend: lint + production bundle
```

## 7. Known limits

- Login is a demo PIN; the real gate is the operator header checked by the backend.
- AI triage runs only when the optional `ai` extras (`pip install -e ".[ai]"`)
  are installed; otherwise the stage is skipped and recorded as such.
- Raw device acquisition (`\\.\PhysicalDrive2`) needs an elevated backend,
  which is why the packaged Windows app requests administrator rights.
- Wall-clock timestamps are not available from a bare elementary stream;
  the timeline is relative to each channel.
