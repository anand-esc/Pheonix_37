# Custody-Facts Verification Note
## BSA 2023 §63 Part A Cross-Check

**Author:** Varsha (reporting branch)  
**Date:** 2026-09-06  
**Branch:** `feature/varsha-certificate-draft-generator`  
**Files reviewed:**
- `backend/pipeline/custody.py` (lines 42–155, Pydantic models; lines 156–380, builder logic)
- `hardware/acquisition_rig/fallback_run/custody_facts.json` (real pipeline output, CASE-DEMO-001)
- `docs/custody_facts.md` (ownership and field documentation)

**Purpose:** Confirm which fields in `custody_facts.json` can be safely drawn on by
the certificate-draft generator for Part A (custodian/operator fields). This note
gates the start of `backend/reporting/certificate_draft.py` implementation.

---

## What BSA §63 Requires in a Certificate

The Bharatiya Sakshya Adhiniyam 2023, Section 63 (the successor to the Evidence Act
§65-B) requires that a certificate produced by a person in a responsible official
position must state, in substance:

**Part A — Device and Custody Identity**
1. The device or computer that produced the electronic record
2. How the record was produced (method, tool, process)
3. Who was in control of the device at the relevant time
4. That the device was operating properly, or that any malfunction did not affect
   the record's integrity
5. The identity of the person certifying (name, designation, responsible position)

**Part B — Technical Forensic Detail**
6. Hash values proving integrity
7. The recovery methodology and its confidence
8. Any limitations or caveats the examiner identified

The Chandrabhan Sudam Sanap (2025 INSC 116) rejection turned specifically on the
absence of Part A — no one had certified who controlled the CCTV system or in what
state it was operating.

---

## Field-by-Field Verification

### Part A — Device and Custody Fields

| BSA §63 Part A Requirement | `custody_facts.json` Field(s) | `custody.py` Model | Present & Correct? |
|---|---|---|---|
| Device identity (what was examined) | `source.source_device_info` | `SourceFacts.source_device_info` | ✅ Correct |
| Declared vendor / format | `source.declared_vendor`, `source.detected_signature` | `SourceFacts.declared_vendor`, `SourceFacts.detected_signature` | ✅ Correct |
| Vendor support grade | `source.vendor_validation_status` | `SourceFacts.vendor_validation_status` | ✅ Correct — uses `ValidationStatus` enum values |
| Detection confidence + rationale | `source.detection_confidence`, `source.detection_rationale` | `SourceFacts.detection_confidence`, `SourceFacts.detection_rationale` | ✅ Correct |
| Case identifier | `source.case_id` | `SourceFacts.case_id` | ✅ Correct |
| Evidence identifier | `source.evidence_id` | `SourceFacts.evidence_id` | ✅ Correct |
| Source path (for chain-of-custody) | `source.source_path` | `SourceFacts.source_path` | ✅ Correct |
| Acquisition operator (who ran the process) | `custody.operator_id` | `CustodyFacts_Handling.operator_id` | ✅ Correct |
| Acquisition start timestamp | `custody.started_utc` | `CustodyFacts_Handling.started_utc` | ✅ Correct — UTC |
| Acquisition end timestamp | `custody.finished_utc` | `CustodyFacts_Handling.finished_utc` | ✅ Correct — nullable, correctly handled |
| Acquisition run identifier | `custody.acquisition_id` | `CustodyFacts_Handling.acquisition_id` | ✅ Correct |
| Acquisition completion status | `custody.acquisition_status` | `CustodyFacts_Handling.acquisition_status` | ✅ Correct — uses status enum |
| Any custody notes (non-standard events) | `custody.notes` | `CustodyFacts_Handling.notes` | ✅ Correct — list, may be empty |
| Method description (plain English) | `method.description` | `MethodFacts.description` | ✅ Correct — complete prose statement |
| Read-only acquisition assertion | `method.read_only_acquisition` | `MethodFacts.read_only_acquisition` (default `True`) | ✅ Correct |
| Adapter used | `method.adapter`, `method.adapter_is_fallback`, `method.adapter_reason` | `MethodFacts.*` | ✅ Correct — fallback and reason both recorded |
| Tool name and version | `tooling.tool_name`, `tooling.tool_version` | `ToolingFacts.tool_name`, `ToolingFacts.tool_version` | ✅ Correct |
| Platform | `tooling.platform`, `tooling.python_version` | `ToolingFacts.platform`, `ToolingFacts.python_version` | ✅ Correct |
| Run timestamps | `tooling.run_started_utc`, `tooling.run_finished_utc` | `ToolingFacts.run_started_utc`, `ToolingFacts.run_finished_utc` | ✅ Correct |
| Human signature blanks | `signature_block.*` | `CustodyFacts.signature_block` | ✅ Correct — all blank by design with note |
| **Certifying person identity** | `signature_block.certifying_person_name`, `signature_block.designation`, `signature_block.responsible_for` | `CustodyFacts.signature_block` | ⚠️ **Present as blanks** — filled by human at signing time. Correct approach. |
| **Investigator ID / Custodian ID** | **Not present in custody_facts** | Not mapped in `build_custody_facts()` | ⚠️ **Gap — see below** |

### Part B — Technical Integrity Fields

| Technical Requirement | `custody_facts.json` Field(s) | `custody.py` Model | Present & Correct? |
|---|---|---|---|
| Source image hash (SHA-256) | `integrity.image_sha256` | `IntegrityFacts.image_sha256` | ✅ Correct |
| Source image hash (MD5) | `integrity.image_md5` | `IntegrityFacts.image_md5` | ✅ Correct |
| Verification hash match | `integrity.verification_matched` | `IntegrityFacts.verification_matched` | ✅ Correct |
| Integrity prose statement | `integrity.statement` | `IntegrityFacts.statement` | ✅ Correct — switches to warning if mismatch |
| Full hash lineage | `integrity.hash_lineage` | `IntegrityFacts.hash_lineage` (list of `HashFact`) | ✅ Correct |
| Recovery hash | `integrity.recovery_hash` | `IntegrityFacts.recovery_hash` | ✅ Correct — nullable |
| Encryption applied | `integrity.encrypted_artifacts`, `integrity.image_encrypted` | `IntegrityFacts.encrypted_artifacts`, `IntegrityFacts.image_encrypted` | ✅ Correct |
| Fragment inventory | `contents.fragments` (full detail per fragment) | `ContentsFacts.fragments` (list of `FragmentFact`) | ✅ Correct |
| Channel inventory | `contents.channels` | `ContentsFacts.channels` | ✅ Correct |
| Limitations (mandatory) | `limitations` | `CustodyFacts.limitations` — produced by `_limitations()` | ✅ Correct — never empty by construction |

---

## Confirmed Fields — Certificate Generator May Safely Draw From

All fields listed as ✅ above are confirmed present in both `custody.py` model definitions
and in the real `custody_facts.json` output. The certificate draft may use them directly
via `load_custody_facts(path)` without any additional transformation.

In particular:
- `facts.source.source_device_info` — device identity ✅
- `facts.custody.operator_id` — who ran the acquisition ✅
- `facts.custody.started_utc` / `facts.custody.finished_utc` — acquisition timestamps ✅
- `facts.integrity.image_sha256` and `facts.integrity.verification_matched` — hash integrity ✅
- `facts.limitations` — print verbatim, never summarise ✅
- `facts.signature_block` — blanks for human completion ✅

---

## Gaps Found

### Gap 1 — `Case.investigator_id` and `Case.custodian_id` Not in CustodyFacts

`backend/core/evidence_model.py::Case` carries `investigator_id: str` and
`custodian_id: str` (see line 103–104). These identity fields represent who is
responsible for the case at the investigation level — distinct from `operator_id`,
which is who operated the forensic tool during acquisition.

`build_custody_facts()` in `custody.py` accepts a `PipelineResult`, not a `Case`.
`PipelineResult` carries `operator_id` (the tool operator) but does not expose
`Case.investigator_id` or `Case.custodian_id`. Neither field appears in
`custody_facts.json`.

**Impact on certificate draft:** The certifying person for BSA §63 is whoever
occupied a "responsible official position in relation to the device or its management"
— not necessarily the forensic tool operator. Currently this is handled by leaving
`signature_block.certifying_person_name`, `signature_block.designation`, and
`signature_block.responsible_for` blank for human completion. This is the correct
approach for a draft — the certificate is not valid until signed.

**Recommendation (flag, do not fix):** If the pipeline is extended to accept a
`Case` object, `build_custody_facts()` could include `investigator_id` and
`custodian_id` for traceability, even if the certifying person is still a human
decision. Raise with Sibam or the custody-chain owner.

### Gap 2 — No Multi-Person Chain-of-Custody Trail

`custody.custody.operator_id` records a single operator for the automated pipeline
run. In a real lab setting, the evidence may pass from a field officer to an analyst
to a senior examiner before going to court. None of this hand-off history is modelled
in the current schema.

**Impact on certificate draft:** Acceptable for the current demo scope — the
`signature_block` and any accompanying chain-of-custody paper trail handle this
outside the tool. Certificate draft correctly leaves the human-signed fields blank.

**Recommendation (flag, do not fix):** For production, a `custody_chain: list[HandoffRecord]`
field in `CustodyFacts_Handling` would capture this. Raise with the custody-chain owner.

---

## Inconsistencies Found (Non-Blocking)

### Inconsistency 1 — `CustodyFacts_Handling` Naming

`custody.py` line 56: `class CustodyFacts_Handling(BaseModel):`

All other models in the same file use clean PascalCase (`SourceFacts`, `MethodFacts`,
`ToolingFacts`, `IntegrityFacts`, `ContentsFacts`, `FragmentFact`, `CustodyFacts`).
This class uses a mixed underscore style. It does not affect functionality or
serialisation (Pydantic uses the field name `custody` in the JSON output, not the
class name), but it is inconsistent with the rest of the codebase.

**Do not fix** — this belongs to the custody-chain module owner. Flag for their
next clean-up pass.

### Inconsistency 2 — `hash_lineage` Has Duplicate Stage Names

In the real `custody_facts.json`, `integrity.hash_lineage` contains two entries with
`"stage": "intake"` — one for SHA-256 and one for MD5. The stage name alone does not
uniquely identify a hash entry; the `algorithm` field distinguishes them. This is
correct behaviour (both hashes are taken at the same pipeline stage), but the
certificate draft must render both and not deduplicate or hide either.

**Not a defect** — correctly handled by listing all `hash_lineage` entries verbatim.

---

## Conclusion — Cleared to Proceed

All required fields for Part A and Part B of the BSA §63 certificate draft are
present and correctly populated in `custody_facts.json`. The two identified gaps
(investigator ID and multi-person chain) are handled appropriately by the
`signature_block` design — they require human completion, not machine derivation.

**The certificate-draft generator implementation may now begin.**

The generator will:
- Use `load_custody_facts(path)` → `CustodyFacts` as its primary input
- Also accept a mock `EvidenceItem` (clearly marked as mock) for any additional
  Part B fields not yet available from custody_facts alone
- Reject any run where `facts.integrity.verification_matched is False` with a
  clear, loud error — such an image must not be certified

---

*This note does not modify `custody.py` or any other file outside the reporting scope.*
*Issues flagged here should be raised with the respective module owners at the next team sync.*
