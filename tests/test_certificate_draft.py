"""Tests for the BSA §63 certificate-draft generator.

Tests are organised in four groups:
- data model / builder (build_certificate_draft)
- guard / failure cases (loud errors on bad input)
- HTML renderer (render_html)
- PDF renderer (render_pdf)
- end-to-end integration via generate_draft (uses the real fallback-run sample)

No test touches custody.py, evidence_model.py, or any other module outside
backend/reporting/.
"""

from __future__ import annotations

import json
import re
import zlib
from datetime import UTC, datetime
from pathlib import Path

import pytest

from backend.pipeline.custody import CustodyFacts, load_custody_facts
from backend.reporting.certificate_draft import (
    CertificateDraft,
    build_certificate_draft,
    generate_draft,
    render_html,
    render_pdf,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

FALLBACK_RUN = (
    Path(__file__).parent.parent
    / "hardware"
    / "acquisition_rig"
    / "fallback_run"
    / "custody_facts.json"
)


@pytest.fixture(scope="module")
def real_facts() -> CustodyFacts:
    """Load the committed real-run sample (CASE-DEMO-001)."""
    return load_custody_facts(FALLBACK_RUN)


@pytest.fixture(scope="module")
def real_draft(real_facts) -> CertificateDraft:
    return build_certificate_draft(real_facts, draft_reference="TEST-DRAFT-001")


@pytest.fixture()
def facts_dict(real_facts) -> dict:
    """A mutable copy of the real facts as a plain dict, for mutation tests."""
    return json.loads(real_facts.to_json())


# ---------------------------------------------------------------------------
# Helper: load a CustodyFacts from a mutated dict
# ---------------------------------------------------------------------------

def _facts_from(d: dict) -> CustodyFacts:
    return CustodyFacts.model_validate(d)


# ---------------------------------------------------------------------------
# Group 1 — data model and builder
# ---------------------------------------------------------------------------


class TestBuildCertificateDraft:
    def test_returns_certificate_draft_instance(self, real_draft):
        assert isinstance(real_draft, CertificateDraft)

    def test_part_a_case_id(self, real_draft):
        assert real_draft.part_a.case_id == "CASE-DEMO-001"

    def test_part_a_evidence_id(self, real_draft):
        assert real_draft.part_a.evidence_id.startswith("ev-acq-")

    def test_part_a_operator_id(self, real_draft):
        assert real_draft.part_a.operator_id == "op-amritansh"

    def test_part_a_acquisition_timestamps_present(self, real_draft):
        assert real_draft.part_a.started_utc
        assert real_draft.part_a.finished_utc

    def test_part_a_read_only_acquisition_is_true(self, real_draft):
        assert real_draft.part_a.read_only_acquisition is True

    def test_part_a_method_description_is_non_empty(self, real_draft):
        assert len(real_draft.part_a.method_description) > 50

    def test_part_a_vendor_status_label_matches_validated(self, real_draft):
        # VALIDATED → should say "Native parser"
        assert "Native parser" in real_draft.part_a.vendor_validation_status_label

    def test_part_b_sha256_matches_source(self, real_draft):
        assert real_draft.part_b.image_sha256 == (
            "09aeda3863bcc977fef8b6faecbeece6c4e64f1afd9125c9031eb1b25c3f2100"
        )

    def test_part_b_verification_matched_true(self, real_draft):
        assert real_draft.part_b.verification_matched is True

    def test_part_b_fragment_count_matches_source(self, real_draft):
        assert real_draft.part_b.fragment_count == 8

    def test_part_b_channel_count_matches_source(self, real_draft):
        assert real_draft.part_b.channel_count == 3

    def test_part_b_hash_lineage_is_non_empty(self, real_draft):
        assert len(real_draft.part_b.hash_lineage) >= 3  # intake SHA, MD5, verify

    def test_part_b_hash_lineage_first_stage_is_intake(self, real_draft):
        assert real_draft.part_b.hash_lineage[0].stage == "intake"

    def test_part_b_fragments_list_matches_count(self, real_draft):
        assert len(real_draft.part_b.fragments) == real_draft.part_b.fragment_count

    def test_part_b_all_fragments_have_sha256(self, real_draft):
        assert all(f.sha256 for f in real_draft.part_b.fragments)

    def test_part_b_all_fragments_have_confidence_rationale(self, real_draft):
        assert all(f.confidence_rationale for f in real_draft.part_b.fragments)

    def test_limitations_are_non_empty(self, real_draft):
        assert len(real_draft.limitations) >= 1

    def test_limitations_verbatim_includes_confidence_clause(self, real_draft):
        combined = " ".join(real_draft.limitations)
        assert "structural" in combined

    def test_signature_block_all_fields_blank_except_note(self, real_draft):
        sb = real_draft.signature_block
        blank_fields = [
            sb.certifying_person_name,
            sb.designation,
            sb.responsible_for,
            sb.place,
            sb.date,
            sb.signature,
        ]
        assert all(v == "" for v in blank_fields), (
            "Signature block must be fully blank — never pre-filled by the pipeline"
        )

    def test_signature_block_note_references_bsa(self, real_draft):
        assert "section 63" in real_draft.signature_block.note.lower()

    def test_draft_reference_is_used(self, real_draft):
        assert real_draft.draft_reference == "TEST-DRAFT-001"

    def test_auto_draft_reference_generated_when_not_supplied(self, real_facts):
        draft = build_certificate_draft(real_facts)
        assert draft.draft_reference.startswith("DRAFT-")

    def test_disclaimer_says_not_a_certificate(self, real_draft):
        assert "not a certificate" in real_draft.disclaimer.lower()
        assert "unsigned" in real_draft.disclaimer.lower()

    def test_legal_basis_references_bsa_63(self, real_draft):
        assert "Section 63" in real_draft.legal_basis_statement

    def test_legal_basis_references_dpdp_17_1_c(self, real_draft):
        assert "17(1)(c)" in real_draft.legal_basis_statement

    def test_legal_basis_does_not_claim_admissibility(self, real_draft):
        lower = real_draft.legal_basis_statement.lower()
        # Must disclaim, not claim
        assert "does not" in lower or "not" in lower
        assert "admissib" in lower

    def test_document_says_draft_requires_signature(self, real_draft):
        # The module-level disclaimer string must contain "requires signature" concept
        lower = real_draft.disclaimer.lower()
        assert "review" in lower and "signature" in lower

    def test_vendor_fallback_status_label(self, facts_dict):
        facts_dict["source"]["vendor_validation_status"] = "GENERIC_FALLBACK"
        facts = _facts_from(facts_dict)
        draft = build_certificate_draft(facts)
        assert "generic carving" in draft.part_a.vendor_validation_status_label

    def test_vendor_research_status_label(self, facts_dict):
        facts_dict["source"]["vendor_validation_status"] = "RESEARCH_TARGET"
        facts = _facts_from(facts_dict)
        draft = build_certificate_draft(facts)
        assert "No sufficiently detailed" in draft.part_a.vendor_validation_status_label

    def test_unrecognised_vendor_status_gets_safe_fallback_label(self, facts_dict):
        facts_dict["source"]["vendor_validation_status"] = "UNKNOWN_STATUS"
        facts = _facts_from(facts_dict)
        draft = build_certificate_draft(facts)
        assert "support matrix" in draft.part_a.vendor_validation_status_label

    def test_no_blockchain_terminology_in_output(self, real_draft):
        full = real_draft.model_dump_json()
        assert "blockchain" not in full.lower()

    def test_document_title_is_present(self, real_draft):
        assert real_draft.document_title


# ---------------------------------------------------------------------------
# Group 2 — guard / failure cases
# ---------------------------------------------------------------------------


class TestBuildCertificateDraftGuards:
    def test_raises_on_verification_mismatch(self, facts_dict):
        facts_dict["integrity"]["verification_matched"] = False
        facts_dict["integrity"]["statement"] = (
            "Verification did not match: this image must not be relied on."
        )
        facts = _facts_from(facts_dict)
        with pytest.raises(ValueError, match="verification_matched"):
            build_certificate_draft(facts)

    def test_raises_on_empty_operator_id(self, facts_dict):
        facts_dict["custody"]["operator_id"] = ""
        facts = _facts_from(facts_dict)
        with pytest.raises(ValueError, match="operator_id"):
            build_certificate_draft(facts)

    def test_raises_on_none_operator_id(self, facts_dict):
        # Pydantic will reject None for a str field — ensure we get a loud error
        with pytest.raises(Exception):
            facts_dict["custody"]["operator_id"] = None
            _facts_from(facts_dict)

    def test_raises_on_empty_acquisition_id(self, facts_dict):
        facts_dict["custody"]["acquisition_id"] = ""
        facts = _facts_from(facts_dict)
        with pytest.raises(ValueError, match="acquisition_id"):
            build_certificate_draft(facts)

    def test_raises_on_empty_case_id(self, facts_dict):
        facts_dict["source"]["case_id"] = ""
        facts = _facts_from(facts_dict)
        with pytest.raises(ValueError, match="case_id"):
            build_certificate_draft(facts)

    def test_raises_on_empty_image_sha256(self, facts_dict):
        facts_dict["integrity"]["image_sha256"] = ""
        facts = _facts_from(facts_dict)
        with pytest.raises(ValueError, match="image_sha256"):
            build_certificate_draft(facts)

    def test_raises_on_empty_limitations(self, facts_dict):
        facts_dict["limitations"] = []
        facts = _facts_from(facts_dict)
        with pytest.raises(ValueError, match="limitations"):
            build_certificate_draft(facts)

    def test_generate_draft_raises_on_missing_file(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            generate_draft(tmp_path / "nonexistent.json", output_dir=tmp_path / "out")

    def test_generate_draft_propagates_verification_failure(self, tmp_path, facts_dict):
        facts_dict["integrity"]["verification_matched"] = False
        facts_dict["integrity"]["statement"] = (
            "Verification did not match: this image must not be relied on."
        )
        bad_path = tmp_path / "bad.json"
        bad_path.write_text(json.dumps(facts_dict), encoding="utf-8")
        with pytest.raises(ValueError, match="verification_matched"):
            generate_draft(bad_path, output_dir=tmp_path / "out")


# ---------------------------------------------------------------------------
# Group 3 — HTML renderer
# ---------------------------------------------------------------------------


class TestRenderHtml:
    @pytest.fixture(scope="class")
    def html_path(self, real_draft, tmp_path_factory):
        out = tmp_path_factory.mktemp("html") / "cert.html"
        render_html(real_draft, out)
        return out

    @pytest.fixture(scope="class")
    def html(self, html_path):
        return html_path.read_text(encoding="utf-8")

    def test_output_file_created(self, html_path):
        assert html_path.exists()
        assert html_path.stat().st_size > 10_000

    def test_html_is_valid_structure(self, html):
        assert "<!DOCTYPE html>" in html
        assert "<html" in html
        assert "</html>" in html

    def test_draft_banner_is_present_and_prominent(self, html):
        assert "DRAFT" in html
        assert "REQUIRES HUMAN REVIEW AND SIGNATURE" in html.upper()
        assert "NOT A VALID CERTIFICATE" in html.upper()
        # Banner must appear early — within first 5 KB
        assert "draft-banner" in html[:5000]

    def test_draft_watermark_present(self, html):
        assert "draft-watermark" in html

    def test_part_a_heading_present(self, html):
        assert "PART A" in html.upper()

    def test_part_b_heading_present(self, html):
        assert "PART B" in html.upper()

    def test_case_id_rendered(self, html):
        assert "CASE-DEMO-001" in html

    def test_sha256_rendered(self, html):
        assert "09aeda3863bcc977fef8b6faecbeece6c4e64f1afd9125c9031eb1b25c3f2100" in html

    def test_md5_rendered(self, html):
        assert "dfc758ac05a041b7320ad452d4f95bd8" in html

    def test_operator_id_rendered(self, html):
        assert "op-amritansh" in html

    def test_verification_ok_text_rendered(self, html):
        assert "copy verified against source hash" in html

    def test_limitations_section_present(self, html):
        assert "LIMITATIONS" in html.upper()

    def test_at_least_one_limitation_rendered(self, html):
        assert "structural" in html  # the confidence-score limitation

    def test_signature_block_present(self, html):
        assert "SIGNATURE BLOCK" in html.upper()

    def test_legal_basis_section_present(self, html):
        assert "LEGAL BASIS" in html.upper()

    def test_dpdp_reference_present(self, html):
        assert "Digital Personal Data Protection Act" in html

    def test_bsa_reference_present(self, html):
        assert "Bharatiya Sakshya Adhiniyam" in html

    def test_hash_lineage_table_header_present(self, html):
        assert "Hash Lineage" in html

    def test_fragment_inventory_header_present(self, html):
        assert "Fragment Inventory" in html or "Fragment" in html

    def test_not_a_certificate_disclaimer_present(self, html):
        assert "not a valid certificate" in html.lower() or (
            "not a certificate" in html.lower()
        )

    def test_render_html_returns_path(self, real_draft, tmp_path):
        out = tmp_path / "cert.html"
        returned = render_html(real_draft, out)
        assert returned == out

    def test_html_is_utf8_encoded(self, html_path):
        # Should not raise when read as UTF-8
        content = html_path.read_text(encoding="utf-8")
        assert content


# ---------------------------------------------------------------------------
# Group 4 — PDF renderer
# ---------------------------------------------------------------------------


def _decode_pdf_streams(pdf_bytes: bytes) -> bytes:
    """Extract and decode ASCII85+Flate content from a ReportLab PDF."""

    def ascii85_decode(data: bytes) -> bytes:
        data = data.replace(b"\n", b"").replace(b"\r", b"").replace(b" ", b"")
        if data.endswith(b"~>"):
            data = data[:-2]
        result = []
        i = 0
        while i < len(data):
            if data[i : i + 1] == b"z":
                result.extend([0, 0, 0, 0])
                i += 1
                continue
            chunk = data[i : i + 5]
            padding = 5 - len(chunk) if len(chunk) < 5 else 0
            chunk = chunk + b"u" * padding
            value = 0
            for c in chunk:
                value = value * 85 + (c - 33)
            decoded = []
            for _ in range(4):
                decoded.append(value & 0xFF)
                value >>= 8
            decoded.reverse()
            result.extend(decoded[: 4 - padding])
            i += 5
        return bytes(result)

    streams = re.findall(rb"stream\n(.*?)endstream", pdf_bytes, re.DOTALL)
    all_text = b""
    for s in streams:
        try:
            all_text += zlib.decompress(ascii85_decode(s.strip()))
        except Exception:
            all_text += s
    return all_text


class TestRenderPdf:
    @pytest.fixture(scope="class")
    def pdf_path(self, real_draft, tmp_path_factory):
        out = tmp_path_factory.mktemp("pdf") / "cert.pdf"
        render_pdf(real_draft, out)
        return out

    @pytest.fixture(scope="class")
    def pdf_bytes(self, pdf_path):
        return pdf_path.read_bytes()

    @pytest.fixture(scope="class")
    def pdf_text(self, pdf_bytes):
        return _decode_pdf_streams(pdf_bytes)

    def test_output_file_created(self, pdf_path):
        assert pdf_path.exists()
        assert pdf_path.stat().st_size > 5_000

    def test_valid_pdf_header(self, pdf_bytes):
        assert pdf_bytes[:4] == b"%PDF"

    def test_three_pages_produced(self, pdf_bytes):
        pages = re.findall(rb"/Type\s*/Page\b", pdf_bytes)
        assert len(pages) == 3

    def test_standard_fonts_embedded(self, pdf_bytes):
        fonts = re.findall(rb"/BaseFont\s*/(\w[\w-]*)", pdf_bytes)
        font_names = {f.decode() for f in fonts}
        assert "Helvetica" in font_names
        assert "Helvetica-Bold" in font_names
        assert "Courier" in font_names

    def test_draft_text_in_content(self, pdf_text):
        assert b"DRAFT" in pdf_text

    def test_case_id_in_content(self, pdf_text):
        assert b"CASE-DEMO-001" in pdf_text

    def test_sha256_prefix_in_content(self, pdf_text):
        assert b"09aeda38" in pdf_text

    def test_operator_id_in_content(self, pdf_text):
        assert b"amritansh" in pdf_text

    def test_part_a_heading_in_content(self, pdf_text):
        assert b"PART A" in pdf_text

    def test_part_b_heading_in_content(self, pdf_text):
        assert b"PART B" in pdf_text

    def test_limitations_heading_in_content(self, pdf_text):
        assert b"LIMITATION" in pdf_text

    def test_signature_block_heading_in_content(self, pdf_text):
        assert b"SIGNATURE" in pdf_text

    def test_bsa_reference_in_content(self, pdf_text):
        assert b"Bharatiya" in pdf_text or b"BHARATIYA" in pdf_text

    def test_draft_banner_text_in_content(self, pdf_text):
        assert b"REQUIRES HUMAN REVIEW" in pdf_text

    def test_render_pdf_returns_path(self, real_draft, tmp_path):
        out = tmp_path / "cert.pdf"
        returned = render_pdf(real_draft, out)
        assert returned == out


# ---------------------------------------------------------------------------
# Group 5 — end-to-end via generate_draft
# ---------------------------------------------------------------------------


class TestGenerateDraft:
    @pytest.fixture(scope="class")
    def outputs(self, tmp_path_factory):
        out_dir = tmp_path_factory.mktemp("generate")
        return generate_draft(FALLBACK_RUN, output_dir=out_dir)

    def test_returns_pdf_and_html_keys(self, outputs):
        assert "pdf" in outputs
        assert "html" in outputs

    def test_pdf_file_exists(self, outputs):
        assert outputs["pdf"].exists()

    def test_html_file_exists(self, outputs):
        assert outputs["html"].exists()

    def test_pdf_is_named_certificate_draft(self, outputs):
        assert outputs["pdf"].name == "certificate_draft.pdf"

    def test_html_is_named_certificate_draft(self, outputs):
        assert outputs["html"].name == "certificate_draft.html"

    def test_creates_output_dir_if_missing(self, tmp_path):
        new_dir = tmp_path / "new" / "nested" / "dir"
        assert not new_dir.exists()
        generate_draft(FALLBACK_RUN, output_dir=new_dir)
        assert new_dir.exists()

    def test_custom_draft_reference_propagates(self, tmp_path):
        paths = generate_draft(
            FALLBACK_RUN,
            output_dir=tmp_path / "ref_test",
            draft_reference="CUSTOM-REF-XYZ",
        )
        html = paths["html"].read_text(encoding="utf-8")
        assert "CUSTOM-REF-XYZ" in html
