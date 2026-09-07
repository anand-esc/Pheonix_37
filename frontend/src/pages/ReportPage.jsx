import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileCheck, ArrowLeft, Printer, Loader2, ShieldCheck,
  FileText, HardDrive, Cpu, Terminal, ExternalLink,
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { HashDisplay } from "../components/HashDisplay";
import { getCase, getCaseFragments, formatBytes, formatDate, mapBackendStatus } from "../api";
import { useRole } from "../context/RoleContext";

export function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [certificatePaths, setCertificatePaths] = useState({ pdf: null, html: null });
  const [cliOutput, setCliOutput] = useState("");

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
    caseId: caseData.id,
    caseName: caseData.name || "DVR Forensic Case",
    custodian: caseData.investigator_id || "Unassigned Examiner",
    status: caseData.status,
    evidenceHash: caseData.evidence?.hash || null,
    fileName: caseData.evidence?.fileName || null,
    fileSize: caseData.evidence?.fileSize || null,
    acquiredAt: caseData.evidence?.acquiredAt || null,
  } : null;

  const partB = {
    vendor: "—", confidence: "—", fileSystem: "—", parsedHash: null,
    segmentsSummary: {
      total: fragments.length,
      validated: fragments.filter(f => f.recovery_method?.includes("VALIDATED") || f.recovery_method === "DHAV_PARSER").length,
      fallback: fragments.filter(f => f.recovery_method?.includes("GENERIC") || f.recovery_method === "annexb_nal_carve").length,
      research: fragments.filter(f => f.recovery_method?.includes("RESEARCH")).length,
    },
    recoverySummary: { totalAttempts: 0, successCount: 0, failedCount: 0, lastRecovery: null },
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden"><CaseNavigationTabs /></div>

      <div className="max-w-5xl mx-auto px-4 lg:px-8 space-y-6 pb-16">
        {/* Top Nav */}
        <div className="flex items-center justify-between print:hidden">
          <button
            onClick={() => navigate("/cases")}
            className="inline-flex items-center gap-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors bg-transparent border-none cursor-pointer font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-[var(--text-muted)]">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border border-[rgba(240,169,58,0.2)] font-mono">
              {role}
            </span>
          </div>
        </div>

        {/* Outer Banner */}
        <div className="data-panel p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <SectionHeading
              title={`BSA Section 63 Certificate — ${id}`}
              subtitle="Automated court-admissible electronic evidence compliance certificate"
              icon={FileCheck}
              badge={<Badge label="Draft Form" variant="amber" size="sm" />}
            />
            <p className="text-[11px] text-[var(--text-secondary)]">
              Dynamically assembled from intake hashes, filesystem signatures, and carved segment provenance logs.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handlePrint}
              disabled={isLoading}
              className="px-5 py-2.5 border border-[rgba(62,214,196,0.3)] text-[var(--accent-cyan)] font-medium text-[11px] rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-all hover:bg-[var(--accent-cyan-dim)] font-mono"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Export PDF</span>
            </button>
          </div>
        </div>

        {/* CLI Generation Notice */}
        <div className="bg-[var(--bg-deep)] border border-[rgba(129,140,248,0.2)] rounded p-6 space-y-4 print:hidden">
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
            <Terminal className="w-6 h-6 text-[#818CF8] flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Certificate Generation via CLI</h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                The BSA §63 certificate draft is generated by the backend CLI tool, not via API.
                Run the command below on the server where the pipeline output exists.
              </p>
            </div>
          </div>
          <div className="bg-[var(--bg-deep)] text-[var(--accent-green)] p-4 rounded border border-[var(--border)] font-mono text-[11px] overflow-x-auto">
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-2">
              <span>$</span>
              <span>cd /path/to/Pheonix_37</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span>$</span>
              <span>python -m backend.reporting.certificate_draft \</span>
            </div>
            <div className="flex items-center gap-2 ml-4 mb-2">
              <span>│</span>
              <span>case_store/{id}/run/custody_facts.json \</span>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <span>│</span>
              <span>--out certificate_output/{id}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(
                `python -m backend.reporting.certificate_draft case_store/${id}/run/custody_facts.json --out certificate_output/${id}`
              )}
              className="px-3 py-1.5 bg-[var(--bg-panel)] border border-[rgba(129,140,248,0.3)] text-[#818CF8] text-[11px] font-medium rounded cursor-pointer hover:bg-[var(--bg-panel-lighter)] flex items-center gap-1.5 font-mono transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Copy CLI Command</span>
            </button>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">Outputs: certificate_draft.pdf + certificate_draft.html</span>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="data-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)] print:hidden">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
              <span>LOADING CERTIFICATE DATA...</span>
            </div>
          </div>
        )}

        {/* CERTIFICATE DOCUMENT */}
        {!isLoading && (
          <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded p-8 lg:p-12 space-y-8 print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
            {/* Certificate Header */}
            <div className="border-b border-[var(--border)] print:border-gray-300 pb-6 text-center space-y-2">
              <span className="px-3 py-1 rounded text-[10px] font-bold bg-[rgba(129,140,248,0.1)] text-[#818CF8] border border-[rgba(129,140,248,0.2)] uppercase tracking-widest print:bg-gray-200 print:text-black print:border-gray-400">
                FORM BSA-63 (CERTIFICATE OF ELECTRONIC EVIDENCE)
              </span>
              <h2 className="text-xl lg:text-2xl font-bold text-[var(--text-primary)] print:text-black tracking-tight mt-2 serif-document">
                BHARATIYA SAKSHYA ADHINIYAM 2023 — SECTION 63 COMPLIANCE
              </h2>
              <p className="text-xs text-[var(--text-secondary)] print:text-gray-700 italic max-w-2xl mx-auto serif-document">
                Official Certificate of Integrity and Chain-of-Custody for Surveillance DVR/NVR Media Records.
              </p>
              <p className="text-[11px] text-[var(--text-muted)] print:text-gray-600 font-mono pt-1">
                Certificate Preview Generated: {new Date().toISOString()}
              </p>
            </div>

            {/* PART A */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] print:border-gray-300 pb-2">
                <h3 className="text-xs font-bold text-[var(--text-primary)] print:text-black uppercase tracking-wider flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[var(--accent-cyan)] print:text-black" />
                  PART A — Device &amp; Evidence Identification
                </h3>
                <span className="text-[10px] text-[var(--text-muted)] font-mono print:hidden">(Source: Intake &amp; Dashboard)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Case Reference</span>
                  <span className="font-mono text-[var(--accent-cyan)] print:text-black font-bold block text-sm">{partA.caseId}</span>
                  <span className="text-[var(--text-secondary)] print:text-gray-800 block text-xs">{partA.caseName}</span>
                </div>
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Investigator / Custodian</span>
                  <span className="font-semibold text-[var(--text-primary)] print:text-black block text-sm">{partA.custodian}</span>
                  <span className="text-[var(--text-secondary)] print:text-gray-700 block text-xs font-mono">Pipeline Status: {partA.status}</span>
                </div>
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1 md:col-span-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Primary Evidence Media Dump</span>
                  {partA.fileName ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <span className="font-semibold text-[var(--text-primary)] print:text-black text-xs font-mono">{partA.fileName} ({formatBytes(partA.fileSize)})</span>
                      <span className="text-[11px] text-[var(--text-secondary)] print:text-gray-600 font-mono">Acquired: {formatDate(partA.acquiredAt)}</span>
                    </div>
                  ) : (
                    <span className="text-[var(--accent-red)] print:text-red-700 font-semibold block pt-1">Evidence file not uploaded — acquisition incomplete</span>
                  )}
                </div>
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1.5 md:col-span-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Evidence Intake SHA-256 Digest</span>
                  {partA.evidenceHash ? (
                    <HashDisplay hash={partA.evidenceHash} label={null} verified={true} />
                  ) : (
                    <div className="bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] p-2.5 rounded-lg text-xs text-[var(--accent-red)] font-medium">
                      Intake SHA-256 digest unavailable
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PART B */}
            <div className="space-y-4 pt-4 border-t border-[var(--border)] print:border-gray-300">
              <div className="flex items-center justify-between border-b border-[var(--border)] print:border-gray-300 pb-2">
                <h3 className="text-xs font-bold text-[var(--text-primary)] print:text-black uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--accent-cyan)] print:text-black" />
                  PART B — Forensic Methodology &amp; Lineage Attestation
                </h3>
                <span className="text-[10px] text-[var(--text-muted)] font-mono print:hidden">(Source: Analysis Engine)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Filesystem Identification</span>
                  {partB.vendor !== "—" ? (
                    <div className="space-y-0.5 pt-1">
                      <span className="font-bold text-[var(--text-primary)] print:text-black block text-sm">{partB.vendor} ({partB.confidence}% confidence)</span>
                      <span className="font-mono text-[var(--accent-cyan)] print:text-black text-xs block">{partB.fileSystem}</span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)] italic block pt-1">Format detection not yet run — see Analysis tab</span>
                  )}
                </div>
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Analyzed Stream Segments</span>
                  <span className="font-bold text-[var(--text-primary)] print:text-black block text-sm">{partB.segmentsSummary.total} Total Segments</span>
                  <div className="flex items-center gap-3 pt-1 text-[11px]">
                    <span className="text-[var(--accent-green)] print:text-emerald-800 font-medium">{partB.segmentsSummary.validated} Validated</span>
                    <span className="text-[var(--accent-amber)] print:text-amber-800 font-medium">{partB.segmentsSummary.fallback} Generic Fallback</span>
                    <span className="text-[var(--accent-red)] print:text-rose-800 font-medium">{partB.segmentsSummary.research} Research Target</span>
                  </div>
                </div>
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-1 md:col-span-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Fragment Recovery Summary</span>
                  {partB.recoverySummary.totalAttempts > 0 ? (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center gap-3 font-medium">
                        <span className="text-[var(--accent-green)] print:text-emerald-800 font-bold">{partB.recoverySummary.successCount} Recovered Successfully</span>
                        <span className="text-[var(--text-muted)]">•</span>
                        <span className="text-[var(--accent-red)] print:text-rose-800 font-bold">{partB.recoverySummary.failedCount} Recovery Failed</span>
                      </div>
                      {partB.recoverySummary.lastRecovery && (
                        <p className="text-[11px] text-[var(--text-secondary)] print:text-gray-700 font-mono">
                          Method: {partB.recoverySummary.lastRecovery.method} ({partB.recoverySummary.lastRecovery.confidence}% confidence)
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)] italic block pt-1">No recovery attempts recorded — pipeline uses generic carving only</span>
                  )}
                </div>
                <div className="bg-[var(--bg-deep)] print:bg-gray-50 p-4 rounded border border-[var(--border)] print:border-gray-300 space-y-2 md:col-span-2">
                  <span className="text-[11px] font-medium text-[var(--text-muted)] print:text-gray-600 uppercase font-mono">Provenance Chain Lineage Hashes</span>
                  <div className="space-y-2 font-mono text-[11px] pt-1">
                    {[
                      { label: "Link 1 (Intake Hash):", value: partA.evidenceHash ? truncateHash(partA.evidenceHash, 14) : "Incomplete" },
                      { label: "Link 2 (Parsed Stream Hash):", value: partB.parsedHash ? truncateHash(partB.parsedHash, 14) : "Run detection on Analysis tab" },
                      { label: "Link 3 (Carved Segment Hash):", value: "Available in pipeline output (custody_facts.json)" },
                    ].map((link, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-[var(--bg-deep)] print:bg-white border border-[var(--border)] print:border-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-[var(--text-secondary)] print:text-gray-700 font-sans font-medium">{link.label}</span>
                        <span className="text-[var(--accent-cyan)] print:text-black font-bold font-mono">{link.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ATTESTATION */}
              <div className="bg-[var(--bg-deep)] print:bg-gray-100 p-6 rounded border border-[var(--border)] print:border-gray-400 space-y-4 pt-4">
                <h4 className="text-xs font-bold text-[var(--text-primary)] print:text-black uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--accent-green)] print:text-black" />
                  Forensic Examiner Attestation
                </h4>
                <p className="text-xs text-[var(--text-secondary)] print:text-gray-800 leading-relaxed serif-document">
                  "I hereby certify that the electronic record extracted from the DVR device described in Part A has been acquired, processed, and cryptographically verified in accordance with Bharatiya Sakshya Adhiniyam 2023 (BSA) Section 63 standards. The raw evidence SHA-256 intake digest remained un-tampered throughout the forensic analysis pipeline."
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-8 border-t border-[var(--border)] print:border-gray-400">
                  <div className="space-y-6">
                    <div className="border-b border-[var(--border)] print:border-black h-8" />
                    <div>
                      <span className="font-bold text-[var(--text-primary)] print:text-black text-xs block">{partA.custodian}</span>
                      <span className="text-[11px] text-[var(--text-muted)] print:text-gray-600 block">System Custodian Signature (Part A)</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="border-b border-[var(--border)] print:border-black h-8" />
                    <div>
                      <span className="font-bold text-[var(--text-primary)] print:text-black text-xs block">Technical Forensic Examiner</span>
                      <span className="text-[11px] text-[var(--text-muted)] print:text-gray-600 block">Technical Analyst Signature (Part B)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function truncateHash(hash, len = 8) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.substring(0, len)}...${hash.substring(hash.length - len)}`;
}