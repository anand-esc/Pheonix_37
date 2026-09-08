import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play, ArrowLeft, Cpu, Film, Loader2, GitCommit,
  HardDrive, Layers, CheckCircle2, XCircle, AlertCircle, Shield,
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { ProvenanceChain } from "../components/ProvenanceChain";
import { LedgerDemo } from "../components/LedgerDemo";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { HashDisplay } from "../components/HashDisplay";
import {
  getCase, getCaseFragments, detectFormat, getCaseLedger,
  formatBytes, mapBackendStatus
} from "../api";
import { useRole } from "../context/RoleContext";

export function AnalysisPage() {
  const { id } = useParams();
  const { role } = useRole();

  const [activeTab, setActiveTab] = useState("provenance");
  const [caseData, setCaseData] = useState(null);
  const [formatData, setFormatData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detectError, setDetectError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [c, frags, ledger] = await Promise.all([
          getCase(id),
          getCaseFragments(id),
          getCaseLedger(id).catch(() => []),
        ]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
          setLedgerEntries(ledger || []);
        }
      } catch (err) {
        console.error("Failed to load analysis data", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const handleDetectFormat = async () => {
    if (!caseData?.hasEvidence) return;
    try {
      setDetectError(null);
      const fmt = await detectFormat(caseData.evidence?.fileName || "");
      setFormatData(fmt);
    } catch (err) {
      setDetectError(err.message || "Format detection failed");
    }
  };

  const recoverySegments = fragments.filter(f => f.recovery_method && f.recovery_method !== "VALIDATED");

  return (
    <div className="space-y-6">
      <CaseNavigationTabs />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 space-y-6 pb-16">
        <div className="flex items-center justify-between">
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

        <div className="data-panel p-6">
          <SectionHeading
            title={`Video Analysis & Provenance — ${id}`}
            subtitle={caseData?.name || "DVR Forensic Case"}
            icon={Play}
            badge={<Badge label={caseData?.status || "Processing"} />}
          />
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Deep signature format parsing, missing NAL-unit carving, and real-time court-admissible cryptographic provenance chain verification.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--border)] pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("provenance")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "provenance"
                ? "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.2)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-panel-lighter)] border-transparent"
            }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Provenance Chain</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] font-mono font-semibold">
              CORE LINK
            </span>
          </button>
          <button
            onClick={() => setActiveTab("detection")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "detection"
                ? "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.2)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-panel-lighter)] border-transparent"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Format Detection</span>
          </button>
          <button
            onClick={() => setActiveTab("fragments")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "fragments"
                ? "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.2)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-panel-lighter)] border-transparent"
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Recovered Fragments ({fragments.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "ledger"
                ? "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.2)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-panel-lighter)] border-transparent"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Audit Ledger ({ledgerEntries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("ledger-demo")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "ledger-demo"
                ? "bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border-[rgba(240,169,58,0.2)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-panel-lighter)] border-transparent"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Ledger Demo</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] font-mono font-semibold">
              DEMO
            </span>
          </button>
        </div>

        {isLoading && (
          <div className="data-panel p-12 flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
              <span>LOADING CASE DATA...</span>
            </div>
          </div>
        )}

        {!isLoading && (
          <>
            {/* PROVENANCE CHAIN */}
            {activeTab === "provenance" && (
              <ProvenanceChain caseId={id} initialCaseData={caseData} />
            )}

            {/* FORMAT DETECTION */}
            {activeTab === "detection" && (
              <div className="space-y-6">
                <div className="data-panel p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <SectionHeading
                        title="Format Detection & Signature Parsing"
                        subtitle="Run bounded signature scan on the acquired image"
                        icon={Cpu}
                      />
                    </div>
                    <button
                      onClick={handleDetectFormat}
                      disabled={!caseData?.hasEvidence}
                      className="px-4 py-2.5 bg-[var(--accent-cyan)]/10 border border-[rgba(62,214,196,0.3)] text-[var(--accent-cyan)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-mono hover:bg-[var(--accent-cyan-dim)]"
                    >
                      <Play className="w-4 h-4" />
                      <span>RUN DETECTION</span>
                    </button>
                  </div>

                  {detectError && (
                    <div className="bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] rounded p-4 mb-4 text-[11px] text-[var(--accent-red)] font-mono">
                      {detectError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1 border-b border-[var(--border)] pb-4 md:pb-0 md:border-r md:pr-4">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Detected Manufacturer</span>
                      <div className="flex items-center gap-2.5 pt-1">
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                          {formatData?.vendor_info?.vendor_name || "—"}
                        </span>
                        {formatData?.vendor_info?.validation_status && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold">
                            {formatData.vendor_info.validation_status === 'VALIDATED' ? 'bg-[var(--accent-green-dim)] text-[var(--accent-green)] border border-[rgba(52,211,153,0.2)]' :
                             formatData.vendor_info.validation_status === 'GENERIC_FALLBACK' ? 'bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border border-[rgba(240,169,58,0.2)]' :
                             'bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border border-[rgba(62,214,196,0.2)]'}
                            {formatData.vendor_info.validation_status}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 border-b border-[var(--border)] pb-4 md:pb-0 md:border-r md:pr-4">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Filesystem Container</span>
                      <p className="text-sm font-mono text-[var(--accent-cyan)] pt-1">
                        {formatData?.vendor_info?.detected_format_signature || "—"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Detection Confidence</span>
                      <p className="text-sm font-medium text-[var(--text-primary)] pt-1 font-mono">
                        {formatData?.confidence !== undefined ? `${(formatData.confidence * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  </div>

                  {formatData?.rationale && formatData.rationale.length > 0 && (
                    <div className="mt-6">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block mb-2">Detection Rationale</span>
                      <ul className="space-y-1 text-[11px] text-[var(--text-secondary)]">
                        {formatData.rationale.map((r, i) => (
                          <li key={i} className="font-mono bg-[var(--bg-deep)] p-2 rounded border border-[var(--border)]">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* FRAGMENTS TABLE */}
                <div className="data-panel p-6 space-y-4">
                  <SectionHeading
                    title="Recovered Fragments (from pipeline)"
                    subtitle="Carved NAL units with confidence scoring and channel attribution"
                    icon={Film}
                  />
                  <div className="overflow-x-auto">
                    <table className="forensic-table">
                      <thead>
                        <tr>
                          <th className="forensic-table th">Fragment ID</th>
                          <th className="forensic-table th">Byte Range</th>
                          <th className="forensic-table th">Codec</th>
                          <th className="forensic-table th">Recovery Method</th>
                          <th className="forensic-table th">Confidence</th>
                          <th className="forensic-table th">Rationale</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {fragments.map((frag, idx) => (
                          <tr key={frag.fragment_id}>
                            <td className="forensic-table td font-mono">{frag.fragment_id || `frag-${idx}`}</td>
                            <td className="forensic-table td font-mono">{frag.byte_offset_start || 0} – {frag.byte_offset_end || 0}</td>
                            <td className="forensic-table td">{frag.codec_info || "—"}</td>
                            <td className="forensic-table td"><Badge label={frag.recovery_method || "GENERIC"} variant="slate" size="xs" /></td>
                            <td className="forensic-table td">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[var(--text-primary)]">{((frag.confidence_score || 0) * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="forensic-table td text-[10px] font-mono text-[var(--text-secondary)]">
                              {frag.confidence_rationale || "—"}
                            </td>
                          </tr>
                        ))}
                        {fragments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-[var(--text-muted)] font-mono">No fragments recovered.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* RECOVERED FRAGMENTS TAB */}
            {activeTab === "fragments" && (
              <div className="space-y-6">
                <div className="data-panel p-6">
                  <SectionHeading
                    title="All Recovered Fragments"
                    subtitle={fragments.length === 0 ? "Run pipeline to carve fragments" : `${fragments.length} fragments recovered`}
                    icon={Film}
                  />
                </div>
                <div className="data-panel p-6">
                  <div className="overflow-x-auto">
                    <table className="forensic-table">
                      <thead>
                        <tr>
                          <th className="forensic-table th">#</th>
                          <th className="forensic-table th">Fragment ID</th>
                          <th className="forensic-table th">Byte Offset</th>
                          <th className="forensic-table th">Length</th>
                          <th className="forensic-table th">Codec</th>
                          <th className="forensic-table th">Recovery</th>
                          <th className="forensic-table th">Confidence</th>
                          <th className="forensic-table th">Rationale</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {fragments.map((frag, idx) => (
                          <tr key={frag.fragment_id || idx}>
                            <td className="forensic-table td font-mono text-[var(--accent-cyan)]">{idx + 1}</td>
                            <td className="forensic-table td font-mono">{frag.fragment_id || `frag-${idx}`}</td>
                            <td className="forensic-table td font-mono">{frag.byte_offset_start || 0} – {frag.byte_offset_end || 0}</td>
                            <td className="forensic-table td font-mono">{(frag.byte_offset_end || 0) - (frag.byte_offset_start || 0)} bytes</td>
                            <td className="forensic-table td">{frag.codec_info || "—"}</td>
                            <td className="forensic-table td"><Badge label={frag.recovery_method || "GENERIC"} variant="slate" size="xs" /></td>
                            <td className="forensic-table td">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[var(--text-primary)]">{((frag.confidence_score || 0) * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="forensic-table td text-[10px] font-mono text-[var(--text-secondary)]">{frag.confidence_rationale || "—"}</td>
                          </tr>
                        ))}
                        {fragments.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-[var(--text-muted)] font-mono">No fragments recovered yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* AUDIT LEDGER */}
            {activeTab === "ledger" && (
              <div className="space-y-6">
                <div className="data-panel p-6">
                  <SectionHeading
                    title="Hash-Chained Audit Ledger"
                    subtitle={ledgerEntries.length === 0 ? "No ledger entries for this case" : `${ledgerEntries.length} entries (including GENESIS)`}
                    icon={Layers}
                  />
                </div>
                <div className="data-panel p-6">
                  <div className="overflow-x-auto">
                    <table className="forensic-table">
                      <thead>
                        <tr>
                          <th className="forensic-table th">#</th>
                          <th className="forensic-table th">Event Type</th>
                          <th className="forensic-table th">Operator</th>
                          <th className="forensic-table th">Timestamp (UTC)</th>
                          <th className="forensic-table th">Payload Hash</th>
                          <th className="forensic-table th">Prev Hash</th>
                          <th className="forensic-table th">Signature</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {ledgerEntries.map((entry, idx) => (
                          <tr key={idx} className={entry.event_type === "GENESIS" ? "bg-[var(--accent-amber-dim)]" : ""}>
                            <td className="forensic-table td font-mono text-[var(--accent-cyan)]">{entry.index}</td>
                            <td className="forensic-table td font-medium">
                              {entry.event_type === "GENESIS" && <span className="text-[var(--accent-amber)] font-bold">GENESIS</span>}
                              {entry.event_type !== "GENESIS" && entry.event_type}
                            </td>
                            <td className="forensic-table td font-mono">{entry.operator_id}</td>
                            <td className="forensic-table td font-mono">{entry.timestamp}</td>
                            <td className="forensic-table td font-mono">{entry.payload_hash}</td>
                            <td className="forensic-table td font-mono">{entry.prev_hash}</td>
                            <td className="forensic-table td font-mono">{entry.signature}</td>
                          </tr>
                        ))}
                        {ledgerEntries.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-[var(--text-muted)] font-mono">No ledger entries found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* LEDGER DEMO */}
            {activeTab === "ledger-demo" && (
              <div className="space-y-6">
                <LedgerDemo />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}