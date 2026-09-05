# Custody facts: input for the certificate draft

Owner: `feat/acquisition-recovery` branch. Code: `backend/pipeline/custody.py`.
Output: `<out_dir>/custody_facts.json`, written by every pipeline run.

This file is **facts, not a certificate**. It is the structured input the
reporting owner turns into a BSA 2023 section 63 certificate draft, which a
responsible person then reviews and signs. Nothing in it is signed, and the
`signature_block` is deliberately blank.

## Sections

| Section | Answers | Notable fields |
|---|---|---|
| `source` | what was examined, and what the tool believes it is | `declared_vendor`, `vendor_validation_status`, `detection_confidence`, `detection_rationale` |
| `custody` | who did it and when | `operator_id`, `acquisition_id`, `started_utc`, `finished_utc`, `acquisition_status`, `notes` |
| `method` | how the copy and the recovery were done | `read_only_acquisition`, plain-English `description`, `adapter`, `adapter_is_fallback`, `adapter_reason`, `recovery_method`, `stages` |
| `tooling` | what produced it | `tool_version`, `python_version`, `platform`, run timestamps |
| `integrity` | why the content can be trusted | `image_sha256`, `image_md5`, `verification_matched`, full `hash_lineage`, `recovery_hash`, `statement` |
| `contents` | what is actually in the output | `fragment_count`, `channel_count`, `estimated_footage_seconds`, per-channel and per-fragment detail |
| `limitations` | what the run could **not** establish | never empty; see below |
| `signature_block` | the blanks a human fills in | all values empty except an explanatory `note` |

Each fragment in `contents.fragments` carries its `fragment_id` (stable across
re-runs), byte range, SHA-256, confidence score **and** the sentence-by-sentence
`confidence_rationale`, plus its probable channel and duration estimate with
the `duration_basis` that produced it.

## Limitations are mandatory

`limitations` is never empty. It always states that no wall-clock time is
recoverable from a bare bitstream, and that confidence scores are structural
(how completely a recording was reconstructed) and not a claim about
authenticity of content. It additionally records, when they apply:

* that no validated native parser was used and recovery was generic carving,
  with the reason the vendor adapter was not used;
* that the vendor name is a byte-signature inference, not a manufacturer
  confirmation, whenever the grade is not `VALIDATED`;
* how many recordings had no declared frame rate, so their durations rest on
  an assumption that scales directly with the true rate;
* how many recordings do not end at an end-of-stream marker;
* every note the timeline produced.

A draft that hides these is worse than useless in court, which is why they are
generated rather than left to the person writing the report.

## Failed runs

If post-write verification did not match, `integrity.verification_matched` is
`false` and `integrity.statement` reads "Verification did not match: this image
must not be relied on." A certificate draft must not be produced from such a
run.

## For the reporting owner

```python
from backend.pipeline.custody import load_custody_facts

facts = load_custody_facts(run_dir / "custody_facts.json")
facts.integrity.image_sha256      # the evidence identity
facts.limitations                 # print verbatim, do not summarise away
facts.signature_block             # the blanks the signatory completes
```

Field names or extra facts you need: ask and they get added here rather than
being re-derived in the report layer, so there is exactly one place where a
custody statement comes from.
