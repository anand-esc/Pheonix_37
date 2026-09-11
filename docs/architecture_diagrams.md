# Architecture and pipeline diagrams

Both diagrams render on GitHub. The same pair, laid out for presentation, is at
[docs/MANUAL_TESTING.md](MANUAL_TESTING.md) for the operating instructions.

## System architecture

Everything runs on the examiner's machine. The backend binds the loopback
interface only, and the desktop shell starts it as a child process it also kills
on exit, so there is no moment when evidence is reachable from the network.

```mermaid
flowchart TB
    subgraph desktop["Desktop"]
        shell["Electron main process<br/><i>spawns the backend · CSP · navigation locked</i>"]
        ui["React renderer — one API layer<br/><i>every request carries X-Operator-ID</i>"]
    end

    subgraph api["API — 127.0.0.1:8000 only"]
        gate{{"RBAC gate — deny by default<br/><i>no header → 401 · wrong role → 403</i>"}}
        rcases["Cases<br/>list · detail · delete"]
        racq["Acquisition<br/>runs · detect"]
        rledger["Ledger<br/>chain · verify"]
        rcert["Certificate<br/>draft · download"]
    end

    subgraph engine["Engine"]
        runner["Pipeline runner<br/><i>orders the stages, writes the run directory</i>"]
        acq["Acquisition<br/>read-only imager"]
        det["Detection<br/>signature scan"]
        adapters["Adapters<br/>Hikvision · Dahua · generic carver"]
        crypto["Crypto<br/>AES-256-GCM"]
        report["Reporting<br/>BSA §63 draft"]
    end

    store[("case_store/&lt;case&gt;/run/<br/>evidence.img · fragments/ · playable/<br/>vault/ · custody_facts.json")]
    ledger[("Audit ledger<br/>HMAC-SHA256, hash-chained")]

    shell -->|loads dist/index.html| ui
    shell -.->|spawns child process| api
    ui -->|HTTP| gate
    gate --> rcases & racq & rledger & rcert
    racq -->|starts a run| runner
    runner --> acq & det & adapters & crypto & report
    runner -->|writes| store
    runner -.->|events| ledger
    rledger -.-> ledger
```

The gate is the only way in. A permission is bound to a route when the route is
registered, never read from the request, so a manipulated query string cannot
widen what a caller may do. The run directory, not any in-memory table, is what
survives a restart.

## Pipeline flow

Plaintext is hashed before it is written and again before it is encrypted, so the
digest in the certificate always names bytes that existed on the disk. Where the
tool cannot be certain, it falls back rather than stopping.

```mermaid
flowchart TB
    src([Source: disk image, video file, or raw device])

    intake["<b>1 · Intake</b> — read-only copy<br/>streamed to evidence.img"]
    hash1{{"SHA-256 + MD5 over the stream<br/>re-read after write, digests compared"}}

    detect["<b>2 · Detection</b> — bounded signature scan<br/><i>never decodes video</i>"]
    choose{"Vendor parser usable?<br/><i>present, and it found recordings</i>"}
    vendor["Vendor parser<br/>Hikvision WFS · Dahua DHAV"]

    carveA["<b>3A · Container pass</b><br/>whole MP4 / AVI files, walked box by box"]
    carveB["<b>3B · Annex-B pass</b><br/>NAL runs, skipping what pass A claimed"]

    export["<b>4 · Export</b> — write each exhibit"]
    hash2{{"the written file is re-hashed;<br/>a mismatch aborts the run"}}

    play["<b>5 · Playable views</b>, then optional AI triage<br/><i>the view is a copy, never the exhibit</i>"]

    seal["<b>6 · Seal the vault</b><br/>per-case key, Argon2id-wrapped"]
    hash3{{"hashed again immediately before encryption"}}

    close["<b>7 · Close the run</b><br/>custody facts · result · transcript"]

    src --> intake --> hash1 --> detect --> choose
    choose -->|yes| vendor --> export
    choose -->|"no — fall back, and record why"| carveA --> carveB --> export
    export --> hash2 --> play --> seal --> hash3 --> close
```

A copied `.mp4` keeps its NAL units length-prefixed inside `mdat` and carries no
Annex-B start codes, so pass 3A is the only way such a file comes back whole. Pass
3B then scans everything pass 3A did not claim, which is what a recorder writes to
its own disk.

The hash points are the integrity chain: intake, post-write verification, export
re-hash, pre-encryption. Break any one of those links and the digest in the
certificate stops naming bytes anyone can check.

## Role permissions

Bound at route registration, enforced on every request.

| Role | Permissions | Can |
|---|---|---|
| `INVESTIGATOR` | `VIEW_EVIDENCE`, `RUN_CARVING`, `ANALYZE_TIMELINE` | create and delete cases, start acquisition, run detection |
| `TECHNICAL_EXPERT` | `VALIDATE_PARSER`, `GENERATE_CERT_DRAFT`, `EXPORT_REPORT` | run detection, generate the certificate draft |
| `AUDITOR` | `READ_LEDGER`, `VERIFY_INTEGRITY`, `AUDIT_LOGS` | verify the chain, run the tamper demonstration |
| `COURT_EXPORT` | `EXPORT_BUNDLE`, `VIEW_CERTIFICATE` | read the case, download the certificate |
