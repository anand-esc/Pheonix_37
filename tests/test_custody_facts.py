"""Custody facts: the certificate-draft input pack."""

import json

import pytest

from backend.pipeline.custody import (
    CUSTODY_NAME,
    build_custody_facts,
    load_custody_facts,
)
from backend.pipeline.runner import run_pipeline
from tests.fixtures.build_fixtures import SegmentSpec, build_dvr_image


@pytest.fixture(scope="module")
def run(tmp_path_factory):
    root = tmp_path_factory.mktemp("custody")
    src = root / "source.img"
    manifest = build_dvr_image(
        src,
        size_bytes=1024 * 1024,
        seed=11,
        vendor_variant="avi",
        segments=[
            SegmentSpec(frames=25, declared_fps=25.0),
            SegmentSpec(frames=25, deleted=True),  # no declared rate
            SegmentSpec(frames=25, declared_fps=25.0, truncate_bytes=9000),
        ],
    )
    result = run_pipeline(
        src,
        case_id="CASE-CUSTODY-1",
        operator_id="op-amritansh",
        out_dir=root / "run",
        device_info="synthetic Hikvision-marked disk",
    )
    return result, manifest, root / "run"


# ---------------------------------------------------------------------------
# Shape and honesty
# ---------------------------------------------------------------------------
def test_facts_are_written_next_to_the_result(run):
    _, _, out_dir = run
    path = out_dir / CUSTODY_NAME
    assert path.exists()
    facts = load_custody_facts(path)
    assert "not a certificate" in facts.disclaimer
    assert "unsigned" in facts.disclaimer
    raw = json.loads(path.read_text())
    assert set(raw) >= {
        "source",
        "custody",
        "method",
        "tooling",
        "integrity",
        "contents",
        "limitations",
        "signature_block",
    }


def test_source_and_custody_sections_match_the_run(run):
    result, _, _ = run
    facts = build_custody_facts(result)
    assert facts.source.case_id == "CASE-CUSTODY-1"
    assert facts.source.evidence_id == result.evidence_id
    assert facts.source.declared_vendor == "Generic AVI"
    assert facts.source.vendor_validation_status == "GENERIC_FALLBACK"
    assert facts.source.detection_rationale == result.detection.rationale
    assert facts.custody.operator_id == "op-amritansh"
    assert facts.custody.acquisition_id == result.acquisition.acquisition_id
    assert facts.custody.acquisition_status == "COMPLETED"
    assert facts.custody.notes == []


def test_integrity_section_carries_the_full_lineage(run):
    result, manifest, _ = run
    facts = build_custody_facts(result)
    integrity = facts.integrity
    assert integrity.image_sha256 == manifest.sha256
    assert integrity.image_md5 and len(integrity.image_md5) == 32
    assert integrity.image_bytes == manifest.size_bytes
    assert integrity.verification_matched is True
    assert integrity.verification_sha256 == manifest.sha256
    assert "identical to what was read" in integrity.statement
    stages = [h.stage for h in integrity.hash_lineage]
    assert stages[:3] == ["intake", "intake", "intake_verify"]
    assert any(s.startswith("pre_encryption/") for s in stages)
    assert integrity.recovery_hash == result.carve.recovery_hash
    assert integrity.image_encrypted is True
    assert integrity.encrypted_artifacts == 3


def test_method_section_states_read_only_and_names_the_adapter(run):
    result, _, _ = run
    facts = build_custody_facts(result)
    assert facts.method.read_only_acquisition is True
    assert "read-only" in facts.method.description
    assert "deleted from the recorder's index" in facts.method.description
    assert facts.method.adapter.endswith("GenericCarverAdapter")
    assert facts.method.adapter_is_fallback is True
    assert facts.method.recovery_method == "annexb_nal_carve"
    assert facts.method.stages == [t.stage for t in result.timings]


def test_contents_section_lists_every_fragment_with_its_rationale(run):
    result, manifest, _ = run
    facts = build_custody_facts(result)
    assert facts.contents.fragment_count == 3
    assert len(facts.contents.fragments) == 3
    ids = [f.fragment_id for f in facts.contents.fragments]
    assert ids == [f.fragment_id for f in result.evidence.fragments]
    assert [f.sha256 for f in facts.contents.fragments] == [
        s.sha256 for s in manifest.segments
    ]
    for fragment in facts.contents.fragments:
        assert fragment.confidence_rationale
        assert fragment.channel_id and fragment.channel_id.startswith("probable-")
        assert fragment.duration_basis in ("declared_fps", "assumed_fps", "unknown")
    assert facts.contents.channel_count == len(result.evidence.channels)
    assert all(c["rationale"] for c in facts.contents.channels)


def test_limitations_are_never_empty_and_state_the_real_gaps(run):
    result, _, _ = run
    facts = build_custody_facts(result)
    text = " | ".join(facts.limitations)
    assert facts.limitations
    assert "no validated native parser" in text  # Hikvision parser is a stub
    assert "No wall-clock time" in text
    assert "assume" in text  # one recording has no declared frame rate
    assert "end-of-stream" in text  # one recording was truncated
    assert "structural" in text  # confidence is not authenticity


def test_signature_block_is_present_but_blank(run):
    result, _, _ = run
    facts = build_custody_facts(result)
    block = facts.signature_block
    assert set(block) >= {"certifying_person_name", "designation", "signature", "note"}
    assert all(block[k] == "" for k in block if k != "note"), (
        "the pipeline must never pre-fill a signature"
    )
    assert "section 63" in block["note"]


def test_facts_round_trip_through_json(run):
    result, _, out_dir = run
    facts = build_custody_facts(result)
    again = load_custody_facts(out_dir / CUSTODY_NAME)
    assert again.source == facts.source
    assert again.integrity.hash_lineage == facts.integrity.hash_lineage
    assert again.contents.fragments == facts.contents.fragments


def test_failed_verification_is_stated_plainly(run, monkeypatch):
    result, _, _ = run
    broken = result.model_copy(deep=True)
    broken.acquisition.verification_hash.hex_digest = "0" * 64
    facts = build_custody_facts(broken)
    assert facts.integrity.verification_matched is False
    assert "must not be relied on" in facts.integrity.statement


# ---------------------------------------------------------------------------
# Case-level identities (investigator / custodian)
# ---------------------------------------------------------------------------
def test_case_identities_are_optional_and_absent_by_default(run):
    result, _, _ = run
    facts = build_custody_facts(result)
    assert facts.custody.operator_id == "op-amritansh"
    assert facts.custody.investigator_id is None
    assert facts.custody.custodian_id is None


def test_case_identities_are_carried_when_supplied(tmp_path):
    src = tmp_path / "source.img"
    build_dvr_image(src, size_bytes=512 * 1024, seed=12, vendor_variant="none")
    result = run_pipeline(
        src,
        case_id="CASE-IDS",
        operator_id="op-amritansh",
        investigator_id="inv-si-42",
        custodian_id="cus-malkhana-7",
        out_dir=tmp_path / "run",
        encrypt=False,
    )
    facts = build_custody_facts(result)
    # three distinct identities, kept apart
    assert facts.custody.operator_id == "op-amritansh"
    assert facts.custody.investigator_id == "inv-si-42"
    assert facts.custody.custodian_id == "cus-malkhana-7"
    # they reach the written file too
    written = load_custody_facts(tmp_path / "run" / CUSTODY_NAME)
    assert written.custody.investigator_id == "inv-si-42"
    assert written.custody.custodian_id == "cus-malkhana-7"
    # and none of them is treated as the certifying person
    assert all(v == "" for k, v in facts.signature_block.items() if k != "note"), (
        "case identities must never pre-fill the signature block"
    )
