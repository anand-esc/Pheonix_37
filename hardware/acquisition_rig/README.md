# Acquisition Rig: Standard Operating Procedure (SOP) and Fallback Protocols

This directory contains the necessary components and documentation to securely transition a DVR/NVR hard disk from a physical evidence bench into an encrypted, hash-chained repository of recovered video fragments. It also contains synthetic fallback mechanisms to ensure continuous operation during demonstrations in the event of hardware failure.

## 1. Physical Bench Setup

| Component | Forensic Purpose |
|---|---|
| **Forensic Write Blocker** | SATA/USB bridge hardware guaranteeing zero-byte writes to the evidence disk. Hardware blocking is mandatory; software read-only mounting is considered a secondary control. |
| **SATA Interconnects** | Cables and docks to interface the DVR disk with the acquisition workstation. |
| **Acquisition Workstation** | Configured with Python 3.11+ and this repository. Requires administrative or root privileges to mount raw block devices. |
| **Destination Storage** | Formatted storage media with a minimum of 1.2x the source disk capacity to house the image, exported fragments, and the encrypted vault. |
| **Documentation Tools** | Evidence labels, chain-of-custody forms, and a camera for photographic documentation of serial numbers and physical state prior to acquisition. |

*Note for simulated environments:* The current build environment utilizes `simulate_dvr.py` due to the absence of physical bench hardware. The execution path for a physical block device remains identical (`\\.\PhysicalDriveN` on Windows, `/dev/sdX` on Linux).

## 2. Standard Operating Procedure (SOP)

1. **Physical Documentation:** Photograph the recording unit, the storage disk label, and all serial numbers. Document the `case_id` and `operator_id` on the official evidence intake form.
2. **Media Extraction:** Disconnect power from the recording unit. Extract the internal storage disk. Under no circumstances should the recorder be booted with the evidence disk attached, as DVR operating systems routinely overwrite data upon initialization.
3. **Hardware Interfacing:** Connect the extracted disk to the forensic write blocker. Verify the blocker's read-only indicator LED is active prior to connecting the USB interface to the acquisition workstation.
4. **Device Identification:**
   * **Windows:** Execute `wmic diskdrive list brief` or utilize Disk Management to identify the target as `\\.\PhysicalDriveN`.
   * **Linux:** Execute `lsblk -o NAME,SIZE,MODEL,SERIAL` to identify the target as `/dev/sdX`.
5. **Cryptographic Initialization:** Initialize the mandatory cryptographic secrets for the vault and ledger subsystems. The pipeline will strictly refuse to execute rather than default to insecure fallback keys.
   * **Windows:**
     ```powershell
     $env:PHOENIX_MASTER_SECRET = "<authorized_case_passphrase>"
     $env:PHOENIX_LEDGER_SECRET = "<authorized_ledger_signing_secret>"
     ```
   * **Linux:**
     ```bash
     export PHOENIX_MASTER_SECRET="<authorized_case_passphrase>"
     export PHOENIX_LEDGER_SECRET="<authorized_ledger_signing_secret>"
     ```
   *Note: These secrets must be agreed upon per case protocol and never committed to version control. To execute a strict recovery without cryptographic wrapping, append the `--no-encrypt` flag.*
6. **Pipeline Execution:** Execute the acquisition script with administrative/root privileges:
   ```bash
   python hardware/acquisition_rig/run_demo_pipeline.py --source \\.\PhysicalDrive2 --case CASE-042 --operator op-amritansh --out E:\phoenix\CASE-042 --device-info "Hikvision DS-7204, WD10PURX SN WCC4..."
   ```
   *Execution Flow:* The script images the device in a read-only stream, simultaneously computing SHA-256 and MD5 hashes. It subsequently verifies the image from disk, generates the custody sidecar, executes format detection, recovers fragments, re-hashes each fragment, and encrypts the output into the `vault/` directory. All operational events are logged to `run_transcript.json`.
7. **Identity Registration:** Manually transcribe the terminal-output SHA-256 hash onto the physical evidence form. This hash constitutes the cryptographic identity of the evidence.
8. **Custody Securing:** Disconnect the disk, place it in an anti-static evidence bag, and transfer the destination folder to the secure case network share. The `evidence.img.acquisition.json` sidecar and `pipeline_result.json` serve as the machine-readable custody record.

*Failure Protocol:* Should the intake phase fail, the generated sidecar will reflect `status = FAILED` alongside the failure rationale. This file must be retained as part of the permanent audit record. Rectify the hardware or permission fault and initiate a new pipeline run into a distinct output directory.

## 3. Demonstration Protocols

To initialize a demonstration environment without physical hardware:

```bash
# Generate a synthetic WFS-compliant image (32 MiB)
python hardware/acquisition_rig/simulate_dvr.py --layout wfs --size 32M
# Execute the live acquisition pipeline
python hardware/acquisition_rig/run_demo_pipeline.py
```

### Synthetic Layout Configurations

* `--layout wfs`: Generates a synthetic Hikvision-compliant structure, including a master sector with valid magic bytes at 0x210, a `HIKBTREE` index page, and populated data blocks. The index intentionally omits specific recordings that remain present on the block device, demonstrating the carver's ability to recover deleted data circumventing the native filesystem index. This artifact is strictly marked as synthetic.
* `--layout flat` (default): Generates a generic block layout suitable for testing alternative format signatures (e.g., `--vendor dahua|avi|mp4|mpegts|none`).

### Failsafe Replay Execution

In the event of demonstration environment instability, a deterministic replay mechanism is available:

```bash
python hardware/acquisition_rig/run_demo_pipeline.py --fallback
```

This command parses `fallback_run/run_transcript.json` (a verified execution on a 32 MiB synthetic WFS image) and outputs the simulated log. The output explicitly declares its replay status to maintain transparency. The associated `fallback_run/custody_facts.json` is utilized to demonstrate the certificate-drafting module.

## 4. Forensic Guarantees

* **Read-Only Enforcement:** The source device is mounted in a strictly read-only mode, and the primary cryptographic hash is computed inline before any downstream processing logic is invoked.
* **Integrity Verification:** The target image written to disk is subsequently read and hashed to guarantee parity with the streamed source.
* **Orphaned Data Recovery:** Deleted media present on the block device but absent from the vendor index is verifiably recovered.
* **Cryptographic Wrapping:** All recovered fragments are hashed in plaintext prior to AES-256-GCM encryption. Ciphertext hashes are tracked independently to detect tampering at either layer.
* **Event Auditing:** All pipeline operations emit structured events to the immutable hash-chained ledger.
* **Legal Compliance:** The `custody_facts.json` artifact generates all prerequisite data for a BSA Section 63 certificate draft, enforcing mandatory disclosure of limitations and requiring explicit human attestation.

## 5. Artifact Directory

| Artifact | Function |
|---|---|
| `simulate_dvr.py` | Generates synthetic physical disk images and associated manifests into the `out/` directory. |
| `run_demo_pipeline.py` | CLI orchestrator for `backend.pipeline.runner.run_pipeline`; supports `--fallback` replay functionality. |
| `fallback_run/run_transcript.json` | Cryptographically verified execution transcript utilized for failsafe demonstrations. |
| `fallback_run/custody_facts.json` | Certificate-draft input parameters derived from the fallback run. |
| `out/` | Ephemeral directory for generated images and pipeline outputs (excluded from version control). |
