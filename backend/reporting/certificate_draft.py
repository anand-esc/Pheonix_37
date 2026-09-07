"""BSA 2023 §63 Certificate-Draft Generator.

This module generates a **certificate draft** under Section 63 of the
Bharatiya Sakshya Adhiniyam 2023. It does **not** issue a certificate.
The draft is a structured, machine-readable set of facts assembled from
a completed pipeline run; it requires human review and signature by a
person in a responsible official position before it is legally valid.

Scope
-----
- Part A: custodian/operator fields from ``CustodyFacts``
- Part B: expert/technical fields from ``CustodyFacts`` (hashes, methodology,
  recovery confidence, tools used) and optionally an ``EvidenceItem`` for
  supplemental AI-triage detail.

Outputs
-------
Both PDF and HTML are produced from a single ``CertificateDraft`` Pydantic
model — the field-population logic is not duplicated across renderers.

Vendor wording
--------------
All vendor-status labels use the exact wording from the project's support
matrix (see docs and mission brief). Do not modify label strings without
updating the matrix reference.

Legal wording
-------------
- Never claim this tool "issues a legal certificate."
- Never claim it grants "court admissibility."
- Always say it generates a "certificate draft" that supports procedural
  requirements.
- DPDP Act 2023 §17(1)(c) applies narrowly to exemptions for state
  intelligence / law-enforcement data processing — do not overstate its scope.

References
----------
- BSA 2023 §63 (electronic evidence certificate)
- Chandrabhan Sudam Sanap v. State of Maharashtra (2025 INSC 116)
- DPDP Act 2023 §17(1)(c) (data-processing exemption for state agencies)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Vendor-status label map — must match the project's support matrix exactly.
# ---------------------------------------------------------------------------
_VENDOR_STATUS_LABELS: dict[str, str] = {
    "VALIDATED": (
        "Native parser, tested against synthetic and reference samples "
        "(validated prototype)"
    ),
    "GENERIC_FALLBACK": (
        "No published video-storage-format documentation found; "
        "handled via generic carving"
    ),
    "RESEARCH_TARGET": (
        "No sufficiently detailed, independently reproducible public "
        "specification identified"
    ),
}

_LEGAL_BASIS = (
    "This certificate draft is prepared to support the procedural requirements "
    "of Section 63 of the Bharatiya Sakshya Adhiniyam 2023, which provides for "
    "a certificate that identifies the device, its operator, the method by which "
    "the electronic record was produced, and its integrity as shown by hash "
    "values.\n\n"
    "Processing of the source material for the purposes of this forensic "
    "examination falls within the exemptions available to authorised "
    "law-enforcement and intelligence-gathering functions under Section 17(1)(c) "
    "of the Digital Personal Data Protection Act 2023. That exemption is "
    "limited in scope: it applies only to processing by or for state agencies "
    "acting within their lawful mandate and does not constitute a general "
    "licence to process personal data.\n\n"
    "This draft does not by itself render the evidence admissible. Admissibility "
    "is determined by the court on the basis of the completed, signed certificate "
    "and all other relevant circumstances. The tool that generated this draft "
    "supports procedural documentation — it does not decide admissibility.\n\n"
    "This draft requires human review and signature by a responsible person "
    "before it can serve as a valid certificate under BSA 2023 Section 63."
)


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


class _PartA(BaseModel):
    """Part A — device identity and custody fields (BSA §63 Part A)."""

    model_config = ConfigDict(extra="forbid")

    case_id: str
    evidence_id: str
    source_device_info: str
    source_path: str
    declared_vendor: str
    vendor_validation_status: str
    vendor_validation_status_label: str
    detection_confidence: float
    detection_rationale: list[str]
    operator_id: str
    acquisition_id: str
    started_utc: str
    finished_utc: str | None
    acquisition_status: str
    custody_notes: list[str]
    read_only_acquisition: bool
    method_description: str
    adapter: str
    adapter_is_fallback: bool
    adapter_reason: str
    recovery_method: str | None
    stages: list[str]
    platform: str
    python_version: str


class _HashFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: str
    algorithm: str
    hex_digest: str
    timestamp_utc: str


class _FragmentFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fragment_id: str
    byte_offset_start: int
    byte_offset_end: int
    sha256: str | None
    codec_info: str
    recovery_method: str
    confidence_score: float
    confidence_rationale: str
    channel_id: str | None
    estimated_seconds: float | None
    duration_basis: str | None
    complete: bool | None


class _ChannelFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel_id: str
    declared_resolution: str | None
    declared_frame_rate: float | None
    rationale: str


class _PartB(BaseModel):
    """Part B — expert/technical fields (hashes, methodology, recovery)."""

    model_config = ConfigDict(extra="forbid")

    image_sha256: str
    image_md5: str
    image_bytes: int
    verification_matched: bool
    integrity_statement: str
    hash_lineage: list[_HashFact]
    recovery_hash: str | None
    encrypted_artifacts: int
    image_encrypted: bool
    fragment_count: int
    channel_count: int
    estimated_footage_seconds: float | None
    channels: list[_ChannelFact]
    fragments: list[_FragmentFact]


class _SignatureBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    certifying_person_name: str
    designation: str
    responsible_for: str
    place: str
    date: str
    signature: str
    note: str


class CertificateDraft(BaseModel):
    """Top-level certificate draft document — fed to both PDF and HTML renderers."""

    model_config = ConfigDict(extra="forbid")

    # Metadata
    document_title: str = Field(
        default="Electronic Evidence Certificate Draft",
    )
    draft_reference: str
    generated_utc: str
    tool_name: str
    tool_version: str
    disclaimer: str
    legal_basis_statement: str = Field(default=_LEGAL_BASIS)

    # Content
    part_a: _PartA
    part_b: _PartB
    limitations: list[str]
    signature_block: _SignatureBlock


# ---------------------------------------------------------------------------
# Builder — single data-population step
# ---------------------------------------------------------------------------


def build_certificate_draft(
    facts: Any,
    *,
    evidence_item: Any | None = None,  # reserved for future wiring — currently unused
    draft_reference: str | None = None,
) -> CertificateDraft:
    """Populate a ``CertificateDraft`` from a ``CustodyFacts`` object.

    Parameters
    ----------
    facts:
        A ``CustodyFacts`` instance (from ``backend.pipeline.custody``).
        Must be the real object, not a raw dict.
    evidence_item:
        Optional ``EvidenceItem`` for supplemental detail. Currently reserved;
        all required Part B fields are already available through ``CustodyFacts``.
        # MOCK — replace once evidence_model.py round-trip through pipeline is
        # confirmed and any extra EvidenceItem fields are needed here.
    draft_reference:
        Optional human-readable draft ID. Auto-generated as a UUID4 slug if
        not supplied.

    Raises
    ------
    ValueError
        If ``facts.integrity.verification_matched`` is ``False`` — a certificate
        draft must not be generated from a failed or unverified image.
    ValueError
        If any required field on ``facts`` is missing or ``None`` where a value
        is mandatory.
    """
    # Guard: never certify a failed acquisition
    if not facts.integrity.verification_matched:
        raise ValueError(
            "Cannot generate a certificate draft: integrity.verification_matched "
            "is False. The source image hash did not match the verification hash "
            "after writing. This image must not be relied on and must not be "
            "certified. See facts.integrity.statement for details."
        )

    # Guard: required custody fields
    _require(facts.custody.operator_id, "custody.operator_id")
    _require(facts.custody.acquisition_id, "custody.acquisition_id")
    _require(facts.custody.started_utc, "custody.started_utc")
    _require(facts.source.source_device_info, "source.source_device_info")
    _require(facts.source.case_id, "source.case_id")
    _require(facts.integrity.image_sha256, "integrity.image_sha256")

    # Guard: limitations must be present
    if not facts.limitations:
        raise ValueError(
            "Cannot generate a certificate draft: facts.limitations is empty. "
            "A limitations section is mandatory — a draft that hides what the "
            "tool could not determine is worse than useless in court."
        )

    ref = draft_reference or f"DRAFT-{str(uuid.uuid4()).split('-')[0].upper()}"

    # -- Part A ---------------------------------------------------------------
    vs = facts.source.vendor_validation_status
    part_a = _PartA(
        case_id=facts.source.case_id,
        evidence_id=facts.source.evidence_id,
        source_device_info=facts.source.source_device_info,
        source_path=facts.source.source_path,
        declared_vendor=facts.source.declared_vendor,
        vendor_validation_status=vs,
        vendor_validation_status_label=_VENDOR_STATUS_LABELS.get(
            vs,
            f"{vs} — status label not recognised; see project support matrix",
        ),
        detection_confidence=facts.source.detection_confidence,
        detection_rationale=list(facts.source.detection_rationale),
        operator_id=facts.custody.operator_id,
        acquisition_id=facts.custody.acquisition_id,
        started_utc=_fmt_dt(facts.custody.started_utc),
        finished_utc=(
            _fmt_dt(facts.custody.finished_utc)
            if facts.custody.finished_utc is not None
            else None
        ),
        acquisition_status=facts.custody.acquisition_status,
        custody_notes=list(facts.custody.notes),
        read_only_acquisition=facts.method.read_only_acquisition,
        method_description=facts.method.description,
        adapter=facts.method.adapter,
        adapter_is_fallback=facts.method.adapter_is_fallback,
        adapter_reason=facts.method.adapter_reason,
        recovery_method=facts.method.recovery_method,
        stages=list(facts.method.stages),
        platform=facts.tooling.platform,
        python_version=facts.tooling.python_version,
    )

    # -- Part B ---------------------------------------------------------------
    hash_lineage = [
        _HashFact(
            stage=h.stage,
            algorithm=h.algorithm,
            hex_digest=h.hex_digest,
            timestamp_utc=_fmt_dt(h.timestamp_utc),
        )
        for h in facts.integrity.hash_lineage
    ]

    channels = [
        _ChannelFact(
            channel_id=ch["channel_id"],
            declared_resolution=ch.get("declared_resolution"),
            declared_frame_rate=ch.get("declared_frame_rate"),
            rationale=ch.get("rationale", ""),
        )
        for ch in facts.contents.channels
    ]

    fragments = [
        _FragmentFact(
            fragment_id=f.fragment_id,
            byte_offset_start=f.byte_offset_start,
            byte_offset_end=f.byte_offset_end,
            sha256=f.sha256,
            codec_info=f.codec_info,
            recovery_method=f.recovery_method,
            confidence_score=f.confidence_score,
            confidence_rationale=f.confidence_rationale,
            channel_id=f.channel_id,
            estimated_seconds=f.estimated_seconds,
            duration_basis=f.duration_basis,
            complete=f.complete,
        )
        for f in facts.contents.fragments
    ]

    part_b = _PartB(
        image_sha256=facts.integrity.image_sha256,
        image_md5=facts.integrity.image_md5,
        image_bytes=facts.integrity.image_bytes,
        verification_matched=facts.integrity.verification_matched,
        integrity_statement=facts.integrity.statement,
        hash_lineage=hash_lineage,
        recovery_hash=facts.integrity.recovery_hash,
        encrypted_artifacts=facts.integrity.encrypted_artifacts,
        image_encrypted=facts.integrity.image_encrypted,
        fragment_count=facts.contents.fragment_count,
        channel_count=facts.contents.channel_count,
        estimated_footage_seconds=facts.contents.estimated_footage_seconds,
        channels=channels,
        fragments=fragments,
    )

    # -- Signature block -------------------------------------------------------
    sb = facts.signature_block
    sig = _SignatureBlock(
        certifying_person_name=sb.get("certifying_person_name", ""),
        designation=sb.get("designation", ""),
        responsible_for=sb.get("responsible_for", ""),
        place=sb.get("place", ""),
        date=sb.get("date", ""),
        signature=sb.get("signature", ""),
        note=sb.get("note", ""),
    )

    return CertificateDraft(
        draft_reference=ref,
        generated_utc=datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S"),
        tool_name=facts.tooling.tool_name,
        tool_version=facts.tooling.tool_version,
        disclaimer=facts.disclaimer,
        part_a=part_a,
        part_b=part_b,
        limitations=list(facts.limitations),
        signature_block=sig,
    )


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------


def render_html(draft: CertificateDraft, output_path: str | Path) -> Path:
    """Render the certificate draft as an HTML file.

    The HTML template is at
    ``backend/reporting/templates/certificate.html.jinja2``.
    The ``DRAFT — REQUIRES SIGNATURE`` banner is part of the template and
    cannot be suppressed.

    Returns the path that was written.
    """
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    template_dir = Path(__file__).parent / "templates"
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(["html", "jinja2"]),
    )

    # Custom filter: human-readable file sizes
    def _filesizeformat(value: int) -> str:
        for unit in ("B", "KiB", "MiB", "GiB"):
            if value < 1024:
                return f"{value:.1f} {unit}"
            value /= 1024  # type: ignore[assignment]
        return f"{value:.1f} TiB"

    env.filters["filesizeformat"] = _filesizeformat

    tmpl = env.get_template("certificate.html.jinja2")
    # Render with the full draft model dict so all fields are template-accessible
    html = tmpl.render(draft=draft)

    output_path = Path(output_path)
    output_path.write_text(html, encoding="utf-8")
    return output_path


def render_pdf(draft: CertificateDraft, output_path: str | Path) -> Path:
    """Render the certificate draft as a PDF file using ReportLab.

    A prominent red ``DRAFT — REQUIRES SIGNATURE`` header appears on every
    page. The document is formatted for A4 paper.

    Returns the path that was written.
    """
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        HRFlowable,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    output_path = Path(output_path)
    W, H = A4

    # ── Styles ──────────────────────────────────────────────────────────────
    base = getSampleStyleSheet()

    def _style(name: str, **kw: Any) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    DRAFT_RED = colors.HexColor("#b91c1c")
    LABEL_BG = colors.HexColor("#f0f0e8")
    WARN_BG = colors.HexColor("#fff8e1")
    MONO = "Courier"

    s_title = _style(
        "DraftTitle",
        fontSize=16,
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
        spaceAfter=4,
    )
    s_subtitle = _style(
        "DraftSubtitle",
        fontSize=10,
        fontName="Helvetica-Oblique",
        alignment=TA_CENTER,
        spaceAfter=2,
    )
    s_refline = _style(
        "RefLine", fontSize=8, alignment=TA_CENTER, textColor=colors.grey, spaceAfter=6
    )
    s_section = _style(
        "SectionHead",
        fontSize=9,
        fontName="Helvetica-Bold",
        textColor=colors.white,
        backColor=colors.HexColor("#333333"),
        spaceBefore=8,
        spaceAfter=4,
        leftIndent=4,
        rightIndent=4,
    )
    s_label = _style(
        "FieldLabel",
        fontSize=8,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#333333"),
    )
    s_value = _style("FieldValue", fontSize=8, leading=11)
    s_mono = _style("MonoValue", fontSize=7, fontName=MONO, leading=10, wordWrap="CJK")
    s_list = _style("ListItem", fontSize=8, leading=12, leftIndent=14, spaceAfter=1)
    s_legal = _style(
        "LegalText",
        fontSize=8,
        leading=12,
        alignment=TA_JUSTIFY,
        backColor=colors.HexColor("#f8f8f0"),
    )
    s_disclaimer = _style(
        "Disclaimer",
        fontSize=8,
        leading=11,
        fontName="Helvetica-Oblique",
        textColor=colors.HexColor("#78350f"),
        backColor=WARN_BG,
    )
    s_sig_label = _style(
        "SigLabel",
        fontSize=7,
        textColor=colors.grey,
        fontName="Helvetica-Oblique",
    )

    def _hr() -> HRFlowable:
        return HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey)

    def _field_row(label: str, value: str, mono: bool = False) -> list:
        vs = s_mono if mono else s_value
        return [Paragraph(label, s_label), Paragraph(value or "[not recorded]", vs)]

    # ── On-page header / footer (watermark + draft stamp) ─────────────────
    def _on_page(canvas, doc: Any) -> None:
        canvas.saveState()
        # Diagonal watermark
        canvas.setFont("Helvetica-Bold", 72)
        canvas.setFillColorRGB(0.85, 0.1, 0.1, alpha=0.07)
        canvas.translate(W / 2, H / 2)
        canvas.rotate(35)
        canvas.drawCentredString(0, 0, "DRAFT")
        canvas.restoreState()
        # Top banner
        canvas.saveState()
        canvas.setFillColor(DRAFT_RED)
        canvas.rect(0, H - 22 * mm, W, 22 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawCentredString(
            W / 2,
            H - 14 * mm,
            "⚠  DRAFT — REQUIRES HUMAN REVIEW AND SIGNATURE — NOT A VALID CERTIFICATE  ⚠",
        )
        canvas.restoreState()
        # Bottom page number
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.grey)
        canvas.drawCentredString(
            W / 2,
            10 * mm,
            f"Draft ref: {draft.draft_reference}  ·  "
            f"Generated {draft.generated_utc} UTC  ·  "
            f"Page {doc.page}",
        )
        canvas.restoreState()

    # ── Build story ─────────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        topMargin=28 * mm,
        bottomMargin=18 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    story: list[Any] = []
    pa = draft.part_a
    pb = draft.part_b

    # Header
    story += [
        Paragraph("BHARATIYA SAKSHYA ADHINIYAM 2023 — SECTION 63", s_subtitle),
        Paragraph(draft.document_title.upper(), s_title),
        Paragraph("Certificate Draft — Pending Review and Signature", s_subtitle),
        Paragraph(
            f"Draft Ref: {draft.draft_reference} &nbsp;|&nbsp; "
            f"Generated: {draft.generated_utc} UTC &nbsp;|&nbsp; "
            f"Tool: {draft.tool_name} {draft.tool_version}",
            s_refline,
        ),
        HRFlowable(width="100%", thickness=1.5, color=colors.black),
        Spacer(1, 4),
        Paragraph(draft.disclaimer, s_disclaimer),
        Spacer(1, 8),
    ]

    # ── PART A ──────────────────────────────────────────────────────────────
    story.append(Paragraph("PART A — DEVICE IDENTITY AND CUSTODY", s_section))
    story.append(Spacer(1, 4))

    a_rows: list[list] = [
        _field_row("Case ID", pa.case_id),
        _field_row("Evidence ID", pa.evidence_id, mono=True),
        _field_row("Source Device", pa.source_device_info),
        _field_row("Source Path", pa.source_path, mono=True),
        _field_row("Declared Vendor", pa.declared_vendor),
        _field_row("Vendor Support Status", pa.vendor_validation_status_label),
        _field_row(
            "Detection Confidence", f"{pa.detection_confidence * 100:.0f}%"
        ),
        _field_row(
            "Detection Rationale",
            "\n".join(f"• {r}" for r in pa.detection_rationale),
        ),
        _field_row("Acquisition Operator", pa.operator_id),
        _field_row("Acquisition ID", pa.acquisition_id, mono=True),
        _field_row("Acquisition Started (UTC)", pa.started_utc),
        _field_row(
            "Acquisition Finished (UTC)",
            pa.finished_utc or "[not recorded]",
        ),
        _field_row("Acquisition Status", pa.acquisition_status),
        _field_row(
            "Custody Notes",
            "; ".join(pa.custody_notes) if pa.custody_notes else "[none]",
        ),
        _field_row(
            "Read-Only Acquisition",
            "Yes" if pa.read_only_acquisition else "NO — FLAG FOR REVIEW",
        ),
        _field_row("Method", pa.method_description),
        _field_row("Adapter Used", pa.adapter, mono=True),
        _field_row(
            "Generic Fallback?",
            f"Yes — {pa.adapter_reason}" if pa.adapter_is_fallback else "No",
        ),
        _field_row("Pipeline Stages", " → ".join(pa.stages)),
        _field_row("Platform", f"{pa.platform} (Python {pa.python_version})"),
    ]

    t_a = Table(
        a_rows,
        colWidths=[4.5 * cm, None],
        repeatRows=0,
    )
    t_a.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), LABEL_BG),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#fafaf8")]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#dddddd")),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    story.append(t_a)
    story.append(Spacer(1, 10))

    # ── PART B ──────────────────────────────────────────────────────────────
    story.append(Paragraph("PART B — TECHNICAL INTEGRITY AND RECOVERY", s_section))
    story.append(Spacer(1, 4))

    footage = (
        f"{pb.estimated_footage_seconds:.2f} seconds"
        if pb.estimated_footage_seconds is not None
        else "[not determined]"
    )
    enc_label = (
        f"{pb.encrypted_artifacts} fragment(s)"
        + (" + full image" if pb.image_encrypted else "")
    )
    b_rows: list[list] = [
        _field_row("Source Image SHA-256", pb.image_sha256, mono=True),
        _field_row("Source Image MD5", pb.image_md5, mono=True),
        _field_row(
            "Image Size",
            f"{_human_size(pb.image_bytes)} ({pb.image_bytes:,} bytes)",
        ),
        _field_row(
            "Verification Matched",
            "YES — copy verified against source hash"
            if pb.verification_matched
            else "NO — IMAGE MUST NOT BE RELIED ON",
        ),
        _field_row("Integrity Statement", pb.integrity_statement),
        _field_row("Recovery Hash", pb.recovery_hash or "[not recorded]", mono=True),
        _field_row("Encrypted Artifacts", enc_label),
        _field_row("Recovered Fragments", str(pb.fragment_count)),
        _field_row("Probable Channels", str(pb.channel_count)),
        _field_row("Estimated Footage", footage),
    ]
    t_b = Table(b_rows, colWidths=[4.5 * cm, None])
    t_b.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), LABEL_BG),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#fafaf8")]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#dddddd")),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    story.append(t_b)
    story.append(Spacer(1, 8))

    # Hash lineage sub-table
    story.append(
        Paragraph(
            "Hash Lineage — all pipeline stages (plaintext before encryption):",
            s_label,
        )
    )
    story.append(Spacer(1, 3))
    hl_data = [["Stage", "Algorithm", "Hex Digest", "Timestamp (UTC)"]] + [
        [h.stage, h.algorithm, h.hex_digest, h.timestamp_utc]
        for h in pb.hash_lineage
    ]
    t_hl = Table(
        hl_data,
        colWidths=[3.5 * cm, 1.8 * cm, 8.5 * cm, None],
        repeatRows=1,
    )
    t_hl.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e0")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("FONTNAME", (2, 1), (2, -1), MONO),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafaf8")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ])
    )
    story.append(t_hl)
    story.append(Spacer(1, 8))

    # Channel summary
    if pb.channels:
        story.append(Paragraph("Channel Summary:", s_label))
        story.append(Spacer(1, 3))
        ch_data = [["Channel ID", "Resolution", "Frame Rate", "Rationale"]] + [
            [
                ch.channel_id,
                ch.declared_resolution or "[not declared]",
                f"{ch.declared_frame_rate} fps" if ch.declared_frame_rate else "[not declared]",
                ch.rationale or "",
            ]
            for ch in pb.channels
        ]
        t_ch = Table(ch_data, colWidths=[2.8 * cm, 2.2 * cm, 2.2 * cm, None], repeatRows=1)
        t_ch.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafaf8")]),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ])
        )
        story.append(t_ch)
        story.append(Spacer(1, 8))

    # Fragment inventory
    if pb.fragments:
        story.append(Paragraph("Recovered Fragment Inventory:", s_label))
        story.append(Spacer(1, 3))
        fr_data = [["#", "Fragment ID", "Byte Range", "Codec", "Channel", "Est. Dur.", "Conf.", "SHA-256"]] + [
            [
                str(i + 1),
                f.fragment_id,
                f"{f.byte_offset_start}–{f.byte_offset_end}",
                f.codec_info,
                f.channel_id or "[unattributed]",
                f"{f.estimated_seconds:.2f}s" if f.estimated_seconds else "[N/A]",
                f"{f.confidence_score * 100:.0f}%",
                f.sha256 or "[not hashed]",
            ]
            for i, f in enumerate(pb.fragments)
        ]
        t_fr = Table(
            fr_data,
            colWidths=[0.5 * cm, 2.4 * cm, 2.4 * cm, 2.8 * cm, 1.8 * cm, 1.2 * cm, 0.9 * cm, None],
            repeatRows=1,
        )
        t_fr.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 6),
                ("FONTNAME", (1, 1), (1, -1), MONO),
                ("FONTNAME", (7, 1), (7, -1), MONO),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafaf8")]),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ])
        )
        story.append(t_fr)
        story.append(
            Paragraph(
                "Confidence scores are structural (reconstruction completeness), not content authenticity claims.",
                s_refline,
            )
        )
        story.append(Spacer(1, 8))

    # ── LIMITATIONS ─────────────────────────────────────────────────────────
    story.append(Paragraph("LIMITATIONS — VERBATIM FROM PIPELINE", s_section))
    story.append(Spacer(1, 4))
    for lim in draft.limitations:
        story.append(Paragraph(f"⚠  {lim}", s_list))
    story.append(Spacer(1, 10))

    # ── LEGAL BASIS ──────────────────────────────────────────────────────────
    story.append(Paragraph("LEGAL BASIS", s_section))
    story.append(Spacer(1, 4))
    story.append(Paragraph(draft.legal_basis_statement, s_legal))
    story.append(Spacer(1, 10))

    # ── SIGNATURE BLOCK ──────────────────────────────────────────────────────
    story.append(Paragraph("SIGNATURE BLOCK — FOR COMPLETION BY RESPONSIBLE PERSON", s_section))
    story.append(Spacer(1, 6))
    sb = draft.signature_block
    sig_rows = [
        [
            [Paragraph("Full Name of Certifying Person", s_sig_label),
             Paragraph(sb.certifying_person_name or "___________________________", s_value)],
            [Paragraph("Official Designation / Rank", s_sig_label),
             Paragraph(sb.designation or "___________________________", s_value)],
        ],
        [
            [Paragraph("Responsible For (relation to device)", s_sig_label),
             Paragraph(sb.responsible_for or "___________________________", s_value)],
            [Paragraph("Place", s_sig_label),
             Paragraph(sb.place or "___________________________", s_value)],
        ],
        [
            [Paragraph("Date (DD/MM/YYYY)", s_sig_label),
             Paragraph(sb.date or "___  /  ___  /  _______", s_value)],
            [Paragraph("Signature (with seal if applicable)", s_sig_label),
             Paragraph(sb.signature or "___________________________", s_value)],
        ],
    ]
    t_sig = Table(sig_rows, colWidths=[None, None])
    t_sig.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
        ])
    )
    story.append(t_sig)
    story.append(Spacer(1, 6))
    story.append(Paragraph(sb.note, s_disclaimer))

    # Build
    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return output_path


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------


def generate_draft(
    facts_path: str | Path,
    *,
    output_dir: str | Path,
    evidence_item: Any | None = None,
    draft_reference: str | None = None,
) -> dict[str, Path]:
    """Generate a BSA §63 certificate draft in both PDF and HTML formats.

    Parameters
    ----------
    facts_path:
        Path to the ``custody_facts.json`` produced by a pipeline run.
    output_dir:
        Directory to write ``certificate_draft.pdf`` and
        ``certificate_draft.html`` into. Created if it does not exist.
    evidence_item:
        Optional ``EvidenceItem`` — see ``build_certificate_draft`` for details.
        # MOCK — replace once evidence_model.py is confirmed merged and any
        # extra EvidenceItem fields are needed here.
    draft_reference:
        Optional draft ID string. Auto-generated if not provided.

    Returns
    -------
    dict with keys ``pdf`` and ``html`` mapping to the output ``Path`` objects.

    Raises
    ------
    ValueError
        If the custody facts represent a failed/unverified acquisition, or if
        required fields are missing. Fails loudly — never silently.
    FileNotFoundError
        If ``facts_path`` does not exist.
    """
    from backend.pipeline.custody import load_custody_facts

    facts_path = Path(facts_path)
    if not facts_path.exists():
        raise FileNotFoundError(f"custody_facts.json not found: {facts_path}")

    facts = load_custody_facts(facts_path)
    draft = build_certificate_draft(
        facts, evidence_item=evidence_item, draft_reference=draft_reference
    )

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = render_pdf(draft, output_dir / "certificate_draft.pdf")
    html_path = render_html(draft, output_dir / "certificate_draft.html")

    return {"pdf": pdf_path, "html": html_path}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require(value: Any, field: str) -> None:
    """Raise if ``value`` is None or an empty string."""
    if value is None or value == "":
        raise ValueError(
            f"Cannot generate certificate draft: required field '{field}' is "
            f"missing or empty in the custody facts. Ensure the pipeline run "
            f"completed correctly before attempting to generate a draft."
        )


def _fmt_dt(dt: Any) -> str:
    """Format a datetime (or ISO string) to a readable UTC string."""
    if dt is None:
        return "[not recorded]"
    if hasattr(dt, "strftime"):
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return str(dt)


def _human_size(nbytes: int) -> str:
    """Return a human-readable file size string."""
    for unit in ("B", "KiB", "MiB", "GiB"):
        if nbytes < 1024:
            return f"{nbytes:.1f} {unit}"
        nbytes //= 1024
    return f"{nbytes:.1f} TiB"


# ---------------------------------------------------------------------------
# CLI convenience — run directly to generate a sample draft
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Generate a BSA §63 certificate draft (PDF + HTML) from a custody_facts.json"
    )
    parser.add_argument("facts_path", help="Path to custody_facts.json")
    parser.add_argument(
        "--out",
        default="certificate_output",
        help="Output directory (default: ./certificate_output)",
    )
    parser.add_argument("--ref", default=None, help="Optional draft reference string")
    args = parser.parse_args()

    try:
        paths = generate_draft(args.facts_path, output_dir=args.out, draft_reference=args.ref)
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print(f"[OK] PDF:  {paths['pdf']}")
        print(f"[OK] HTML: {paths['html']}")
        print("\nOpen the HTML in a browser to visually verify the draft.")
    except (ValueError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
