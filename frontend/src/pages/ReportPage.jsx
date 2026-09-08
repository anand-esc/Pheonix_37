import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Loader2, ShieldCheck, FileText, HardDrive, Cpu, Terminal, ExternalLink, Copy } from "lucide-react";
import { getCase, getCaseFragments, formatBytes, formatDate, mapBackendStatus } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";
import ChainOfCustody from "../components/phoenix-ui-kit/ChainOfCustody";

export function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, can } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [c, frags] = await Promise.all([getCase(id), getCaseFragments(id)]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
        }
      } catch (err) {
        console.error("Failed to load case data", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const handlePrint = () => { window.print(); };
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); };

  const partA = caseData ? {
    caseId: caseData.case_id,
    caseName: caseData.title || "DVR Forensic Case",
    custodian: caseData.investigator_id || "Unassigned Examiner",
    status: caseData.status,
    evidenceHash: caseData.evidence?.hash || null,
    fileName: caseData.evidence?.fileName || null,
    fileSize: caseData.evidence?.fileSize || null,
    acquiredAt: caseData.evidence?.acquiredAt || null,
  } : null;

  const validatedCount = fragments.filter(f => f.recovery_method?.includes("VALIDATED") || f.recovery_method === "DHAV_PARSER").length;
  const fallbackCount = fragments.filter(f => f.recovery_method?.includes("GENERIC") || f.recovery_method === "annexb_nal_carve").length;
  const researchCount = fragments.filter(f => f.recovery_method?.includes("RESEARCH")).length;

  const statusMap = {
    "Intake": "pending",
    "Processing": "pending",
    "Recovered": "validated",
    "Reported": "validated",
  };

  if (isLoading) {
    return (
      <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <Loader2 className="phx-spinner" size={32} style={{ color: "var(--phx-navy)" }} />
              <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-text-muted)" }}>
                LOADING CERTIFICATE DATA...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <button
            onClick={() => navigate(`/cases/${id}`)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem",
              color: "var(--phx-text-secondary)", padding: 4
            }}
          >
            <ArrowLeft size={16} stroke={2} />
            <span>Back to Case Detail</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--phx-font-mono)", fontSize: "0.72rem", color: "var(--phx-text-muted)" }}>
            <span>Active Role:</span>
            <strong style={{ color: "var(--phx-ink)" }}>{role}</strong>
          </div>
        </div>

        <CaseHeader
          caseId={caseData?.case_id || id}
          title={caseData?.title || `Case ${id}`}
          status={statusMap[caseData?.status] || "pending"}
          statusLabel="BSA §63 Certificate Draft"
        />

        <div style={{
          marginBottom: "1.5rem", padding: "1rem",
          background: "var(--phx-navy-tint)", border: "1px solid var(--phx-border)",
          borderRadius: "var(--phx-radius)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center"
        }}>
          <Terminal size={20} style={{ color: "var(--phx-navy)" }} />
          <div style={{ flex: 1, minWidth: 240, fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-ink)" }}>
            <strong style={{ color: "var(--phx-navy)" }}>Certificate Generation via CLI</strong>
            <p style={{ marginTop: 4, color: "var(--phx-text-secondary)" }}>
              The BSA §63 certificate draft is generated by the backend CLI tool, not via API.
              Run the command below on the server where the pipeline output exists.
            </p>
          </div>
          <button
            onClick={() => copyToClipboard(
              `python -m backend.reporting.certificate_draft case_store/${id}/run/custody_facts.json --out certificate_output/${id}`
            )}
            style={{
              padding: "8px 16px", background: "var(--phx-navy)", color: "var(--phx-on-navy)",
              border: "none", borderRadius: "var(--phx-radius)",
              fontFamily: "var(--phx-font-sans)", fontSize: "0.78rem", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6
            }}
          >
            <Copy size={16} stroke={2} />
            <span>Copy CLI Command</span>
          </button>
        </div>

        <div style={{
          background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
          borderRadius: "var(--phx-radius)", padding: "2rem", fontFamily: "var(--phx-font-serif)"
        }}>
          <div style={{ textAlign: "center", marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--phx-border)" }}>
            <span style={{
              display: "inline-block", padding: "6px 12px",
              background: "rgba(18, 48, 73, 0.1)", color: "var(--phx-navy)",
              border: "1px solid var(--phx-navy)", borderRadius: "var(--phx-radius)",
              fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem", fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12
            }}>
              FORM BSA-63 (CERTIFICATE OF ELECTRONIC EVIDENCE)
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--phx-ink)", marginBottom: 8, lineHeight: 1.3 }}>
              BHARATIYA SAKSHYA ADHINIYAM 2023 — SECTION 63 COMPLIANCE
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--phx-text-secondary)", fontStyle: "italic", maxWidth: "600px", margin: "0 auto" }}>
              Official Certificate of Integrity and Chain-of-Custody for Surveillance DVR/NVR Media Records.
            </p>
            <p style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.72rem", color: "var(--phx-text-muted)", marginTop: 12 }}>
              Certificate Preview Generated: {new Date().toISOString()}
            </p>
          </div>

          <div className="phx-cert-section" style={{ marginBottom: "2rem" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--phx-border)"
            }}>
              <h3 style={{
                display: "flex", alignItems: "center", gap: 8,
                fontFamily: "var(--phx-font-sans)", fontSize: "0.75rem", fontWeight: 600,
                color: "var(--phx-navy)", textTransform: "uppercase", letterSpacing: "0.05em"
              }}>
                <HardDrive size={16} stroke={2} style={{ color: "var(--phx-gold)" }} />
                PART A — Device & Evidence Identification
              </h3>
              <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.65rem", color: "var(--phx-text-muted)" }}>
                (Source: Intake & Dashboard)
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <CertField label="Case Reference" value={partA.caseId} mono />
              <CertField label="Case Title" value={partA.caseName} />
              <CertField label="Investigator / Custodian" value={partA.custodian} mono />
              <CertField label="Pipeline Status" value={partA.status} />
              <CertField
                label="Primary Evidence Media Dump"
                value={partA.fileName ? `${partA.fileName} (${formatBytes(partA.fileSize)})` : "Evidence file not uploaded — acquisition incomplete"}
                mono
                error={!partA.fileName}
                subLabel={partA.fileName ? `Acquired: ${formatDate(partA.acquiredAt)}` : null}
              />
              <CertField
                label="Evidence Intake SHA-256 Digest"
                value={partA.evidenceHash || "Intake SHA-256 digest unavailable"}
                mono
                error={!partA.evidenceHash}
                isHash
              />
            </div>
          </div>

          <div className="phx-cert-section" style={{ marginBottom: "2rem" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--phx-border)"
            }}>
              <h3 style={{
                display: "flex", alignItems: "center", gap: 8,
                fontFamily: "var(--phx-font-sans)", fontSize: "0.75rem", fontWeight: 600,
                color: "var(--phx-navy)", textTransform: "uppercase", letterSpacing: "0.05em"
              }}>
                <Cpu size={16} stroke={2} style={{ color: "var(--phx-gold)" }} />
                PART B — Forensic Methodology & Lineage Attestation
              </h3>
              <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.65rem", color: "var(--phx-text-muted)" }}>
                (Source: Analysis Engine)
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <CertField
                label="Filesystem Identification"
                value="Format detection not yet run — see Analysis tab"
              />
              <CertField
                label="Analyzed Stream Segments"
                value={`${fragments.length} Total Segments`}
                subLabel={`${validatedCount} Validated • ${fallbackCount} Generic Fallback • ${researchCount} Research Target`}
              />
              <CertField
                label="Fragment Recovery Summary"
                value="No recovery attempts recorded — pipeline uses generic carving only"
              />
              <CertField
                label="Provenance Chain Lineage Hashes"
                value=""
                children={
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <LineageRow label="Link 1 (Intake Hash):" value={partA.evidenceHash ? truncateHash(partA.evidenceHash, 14) : "Incomplete"} />
                    <LineageRow label="Link 2 (Parsed Stream Hash):" value="Run detection on Analysis tab" />
                    <LineageRow label="Link 3 (Carved Segment Hash):" value="Available in pipeline output (custody_facts.json)" />
                  </div>
                }
              />
            </div>
          </div>

          <div className="phx-cert-section" style={{ marginBottom: "2rem" }}>
            <h3 style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "var(--phx-font-sans)", fontSize: "0.75rem", fontWeight: 600,
              color: "var(--phx-navy)", textTransform: "uppercase", letterSpacing: "0.05em",
              marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--phx-border)"
            }}>
              <ShieldCheck size={16} stroke={2} style={{ color: "var(--phx-gold)" }} />
              Forensic Examiner Attestation
            </h3>
            <p style={{ fontSize: "0.9rem", color: "var(--phx-text-secondary)", lineHeight: 1.7, marginBottom: 24, fontStyle: "italic" }}>
              "I hereby certify that the electronic record extracted from the DVR device described in Part A has been acquired, processed, and cryptographically verified in accordance with Bharatiya Sakshya Adhiniyam 2023 (BSA) Section 63 standards. The raw evidence SHA-256 intake digest remained un-tampered throughout the forensic analysis pipeline."
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32 }}>
              <AttestationLine label="System Custodian Signature (Part A)" name={partA.custodian} />
              <AttestationLine label="Technical Analyst Signature (Part B)" name="Technical Forensic Examiner" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center" }}>
          <button
            onClick={handlePrint}
            style={{
              padding: "10px 24px", background: "var(--phx-navy)", color: "var(--phx-on-navy)",
              border: "none", borderRadius: "var(--phx-radius)",
              fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8
            }}
          >
            <Printer size={18} stroke={2} />
            <span>Print / Export PDF</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .phx-spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function CertField({ label, value, mono = false, error = false, subLabel = null, isHash = false, children = null }) {
  return (
    <div style={{
      padding: "1rem", background: "var(--phx-navy-tint)", border: "1px solid var(--phx-border)",
      borderRadius: "var(--phx-radius)", display: "flex", flexDirection: "column", gap: 6
    }}>
      <span style={{
        fontFamily: "var(--phx-font-mono)", fontSize: "0.65rem",
        color: "var(--phx-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em"
      }}>
        {label}
      </span>
      {children ? (
        children
      ) : (
        <>
          <span style={{
            fontFamily: mono ? "var(--phx-font-mono)" : "var(--phx-font-serif)",
            fontSize: mono ? "0.82rem" : "0.95rem",
            fontWeight: mono ? 600 : 500,
            color: error ? "var(--phx-red)" : "var(--phx-ink)",
            wordBreak: mono ? "break-all" : "normal"
          }}>
            {value}
          </span>
          {subLabel && (
            <span style={{
              fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem",
              color: "var(--phx-text-muted)"
            }}>
              {subLabel}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function LineageRow({ label, value }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px",
      background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
      borderRadius: "var(--phx-radius-sm)", fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem"
    }}>
      <span style={{ color: "var(--phx-text-secondary)", fontFamily: "var(--phx-font-sans)", fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ color: "var(--phx-gold)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function AttestationLine({ label, name }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ height: 1, background: "var(--phx-border)" }} />
      <div>
        <span style={{
          fontFamily: "var(--phx-font-serif)", fontSize: "0.875rem",
          fontWeight: 600, color: "var(--phx-ink)"
        }}>
          {name}
        </span>
        <span style={{
          display: "block", marginTop: 2,
          fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem",
          color: "var(--phx-text-muted)"
        }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function truncateHash(hash, len = 8) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.substring(0, len)}...${hash.substring(hash.length - len)}`;
}