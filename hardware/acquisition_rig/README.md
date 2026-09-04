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
5. Run the pipeline (as administrator/root):

   ```
   python hardware/acquisition_rig/run_demo_pipeline.py --source \\.\PhysicalDrive2 --case CASE-042 --operator op-amritansh --out E:\phoenix\CASE-042 --device-info "Hikvision DS-7204, WD10PURX SN WCC4..."
   ```

   The script images the device read-only, hashes SHA-256 and MD5 while
   streaming, verifies the image from disk, writes the custody sidecar,
   detects the vendor, carves fragments, exports them, hashes each one again
   and encrypts them into `vault/`. Every step emits an event that is written
   to `run_transcript.json`.
6. Record the printed image SHA-256 on the evidence form. That value is the
   identity of the evidence from now on.
7. Disconnect the disk, bag it, and store the destination folder on the case
   share. The `evidence.img.acquisition.json` sidecar and
   `pipeline_result.json` are the machine-readable custody record.

If intake fails, the sidecar still exists with `status = FAILED` and the
reason. Do not delete it; it is part of the record. Fix the cause (rights,
cable, destination space) and run again into a new output folder.

## 3. Demo runbook

Before the demo:

```
python hardware/acquisition_rig/simulate_dvr.py            # writes out/dvr_image.img (128 MiB)
python hardware/acquisition_rig/run_demo_pipeline.py       # full live run into out/run/
```

During the demo, show `out/run/run_transcript.json` (or the console output)
and the `vault/` directory. The transcript lists the detection rationale,
every carved fragment with its byte range, codec and confidence rationale,
the hash lineage, and every event in order.

If anything goes wrong on stage:

```
python hardware/acquisition_rig/run_demo_pipeline.py --fallback
```

replays `fallback_run/run_transcript.json`, a transcript committed from a
real run of the same pipeline on a simulated 16 MiB image. It is clearly
labelled as a replay in the output.

## 4. What the pipeline proves

* The source is opened read-only and its hash is computed while streaming,
  before any other code sees the bytes.
* The image on disk is re-hashed and must match the streamed hash.
* Deleted recordings (present on disk, absent from the recorder index) are
  recovered byte for byte; the simulator's manifest lets you verify that.
* Every fragment is hashed before encryption; ciphertext hashes are recorded
  separately, so tampering with either is detectable.
* Every stage emits events that a signed ledger can subscribe to.

## 5. Files

| File | Role |
|---|---|
| `simulate_dvr.py` | Builds a synthetic DVR disk image plus manifest into `out/` (ignored by git). |
| `run_demo_pipeline.py` | Runs `backend.pipeline.runner.run_pipeline` on a source and prints a summary; `--fallback` replays the committed transcript. |
| `fallback_run/run_transcript.json` | Committed transcript of a successful run for the demo fallback. |
| `out/` | Generated images and run outputs; never committed. |
