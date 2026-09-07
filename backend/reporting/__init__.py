"""Reporting package — certificate-draft generator for BSA 2023 §63.

This package generates certificate **drafts** only. It does not issue
certificates, does not grant admissibility, and does not sign anything.
Every output requires human review and signature.
"""

from backend.reporting.certificate_draft import (
    CertificateDraft,
    build_certificate_draft,
    generate_draft,
    render_html,
    render_pdf,
)

__all__ = [
    "CertificateDraft",
    "build_certificate_draft",
    "generate_draft",
    "render_html",
    "render_pdf",
]
