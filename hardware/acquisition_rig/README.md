# Acquisition rig: SOP, runbook and demo fallback

This directory holds everything needed to take a DVR/NVR hard disk from the
bench to an encrypted, hash-chained set of recovered fragments, and to keep
the demo going if the hardware does not cooperate.

## 1. Bench setup (physical)

| Item | Purpose |
|---|---|
| Forensic write blocker (SATA/USB bridge with write blocking) | Guarantees nothing is written to the evidence disk. Software read-only opening is a second line of defence, never the first. |
| SATA dock or adapter cables | Connect the DVR disk to the acquisition laptop. |
| Acquisition laptop with Python 3.11+ and this repository | Runs `run_demo_pipeline.py`. Needs administrator/root rights to open raw devices. |
| Destination storage with at least 1.2x the disk capacity | Holds the image, fragments and vault. |
| Evidence label, case form, camera/phone | Photograph the disk serial and connections before touching anything. |

Simulation note: the build environment for this branch has no bench, so
every run so far used `simulate_dvr.py`. The code path for a raw device is the
same (`\\.\PhysicalDriveN` on Windows, `/dev/sdX` on Linux); only the source
path changes.

## 2. Standard operating procedure

1. Photograph the recorder, the disk label and serial. Fill in the case id
   and operator id on the evidence form.
2. Power the recorder off. Remove the disk. Never boot the recorder with the
   disk connected once it is evidence: recorders overwrite freely.
3. Connect the disk through the write blocker. Confirm the blocker's
   read-only indicator before connecting to the laptop.
4. Identify the device path:
   * Windows: `wmic diskdrive list brief` or Disk Management; use
     `\\.\PhysicalDriveN`.
   * Linux: `lsblk -o NAME,SIZE,MODEL,SERIAL`; use `/dev/sdX`.
5. Set the two secrets the crypto and ledger layers require. They have no
   defaults on purpose - the tool refuses to run rather than encrypt with a
   guessable key:

   ```
   Windows : $env:PHOENIX_MASTER_SECRET = "<case passphrase>"
             $env:PHOENIX_LEDGER_SECRET = "<ledger signing secret>"
   Linux   : export PHOENIX_MASTER_SECRET=<case passphrase>
             export PHOENIX_LEDGER_SECRET=<ledger signing secret>
   ```

   Use the values your team agreed for the case; do not commit them. Running
   with `--no-encrypt` skips the crypto layer entirely if you only need the
   recovery output.

6. Run the pipeline (as administrator/root):

   ```
   python hardware/acquisition_rig/run_demo_pipeline.py --source \\.\PhysicalDrive2 --case CASE-042 --operator op-amritansh --out E:\phoenix\CASE-042 --device-info "Hikvision DS-7204, WD10PURX SN WCC4..."
   ```

   The script images the device read-only, hashes SHA-256 and MD5 while
   streaming, verifies the image from disk, writes the custody sidecar,
   detects the vendor, carves fragments, exports them, hashes each one again
   and encrypts them into `vault/`. Every step emits an event that is written
   to `run_transcript.json`.
7. Record the printed image SHA-256 on the evidence form. That value is the
   identity of the evidence from now on.
8. Disconnect the disk, bag it, and store the destination folder on the case
   share. The `evidence.img.acquisition.json` sidecar and
   `pipeline_result.json` are the machine-readable custody record.

If intake fails, the sidecar still exists with `status = FAILED` and the
reason. Do not delete it; it is part of the record. Fix the cause (rights,
cable, destination space) and run again into a new output folder.

## 3. Demo runbook

Before the demo:

```
python hardware/acquisition_rig/simulate_dvr.py --layout wfs --size 32M   # Hikvision-shaped image
python hardware/acquisition_rig/run_demo_pipeline.py                      # full live run into out/run/
```

Two layouts are available:

* `--layout wfs` builds a **Hikvision-shaped** image: a master sector with the
  vendor magic at 0x210, a `HIKBTREE` index page that lists only the
  recordings the recorder still knows about, and fixed data blocks. Recordings
  deleted from the index are still on the disk, which is the point of the
  demo: the index says six, the disk holds eight, and the carver recovers all
  eight. It is synthetic and clearly marked as such, never presented as a
  dump from a real unit.
* `--layout flat` (default) builds the simpler generic layout, useful for the
  other vendor marker variants (`--vendor dahua|avi|mp4|mpegts|none`).

During the demo, show `out/run/run_transcript.json` (or the console output)
and the `vault/` directory. The transcript lists the detection rationale,
every carved fragment with its byte range, codec and confidence rationale,
the hash lineage, and every event in order.

If anything goes wrong on stage:

```
python hardware/acquisition_rig/run_demo_pipeline.py --fallback
```

replays `fallback_run/run_transcript.json`, committed from a real run of this
pipeline on a 32 MiB Hikvision-shaped image, and clearly labelled as a replay
in the output. `fallback_run/custody_facts.json` from the same run is
committed beside it for the certificate-draft demo.

## 4. What the pipeline proves

* The source is opened read-only and its hash is computed while streaming,
  before any other code sees the bytes.
* The image on disk is re-hashed and must match the streamed hash.
* Deleted recordings (present on disk, absent from the recorder index) are
  recovered byte for byte; the simulator's manifest lets you verify that.
* Every fragment is hashed before encryption; ciphertext hashes are recorded
  separately, so tampering with either is detectable.
* Every stage emits events that a signed ledger can subscribe to.
* `custody_facts.json` collects everything a BSA section 63 certificate draft
  needs, including a limitations list that is never empty and a signature
  block left deliberately blank.

## 5. Files

| File | Role |
|---|---|
| `simulate_dvr.py` | Builds a synthetic DVR disk image plus manifest into `out/` (ignored by git). `--layout wfs` gives the Hikvision-shaped variant. |
| `run_demo_pipeline.py` | Runs `backend.pipeline.runner.run_pipeline` on a source and prints a summary; `--fallback` replays the committed transcript. |
| `fallback_run/run_transcript.json` | Committed transcript of a successful run for the demo fallback. |
| `fallback_run/custody_facts.json` | Certificate-draft input pack from the same run. |
| `out/` | Generated images and run outputs; never committed. |
