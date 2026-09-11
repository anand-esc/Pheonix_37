import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, ArrowLeft, Cpu, Film, GitCommit, Layers, Shield } from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { ProvenanceChain } from "../components/ProvenanceChain";
import { LedgerDemo } from "../components/LedgerDemo";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { getCase, getCaseFragments, detectFormat, getCaseLedger } from "../api";
import { useRole } from "../context/RoleContext";

export function AnalysisPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, can } = useRole();

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

  // detection runs on the acquired image inside the case store, never on
  // the original source device
  const imagePath = caseData?.evidence?.imagePath || "";
  const canDetect = Boolean(imagePath) && (can("RUN_CARVING") || can("VALIDATE_PARSER"));

  const handleDetectFormat = async () => {
    if (!canDetect) return;
    try {
      setDetectError(null);
      const fmt = await detectFormat(imagePath);
      setFormatData(fmt);
    } catch (err) {
      setDetectError(err.message || "Format detection failed");
    }
  };

  return (
    <div className="space-y-6">
      <CaseNavigationTabs />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 space-y-6 pb-16">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/cases")}
            className="inline-flex items-center gap-2 text-[11px] font-medium text-phx-muted hover:text-phx-cyan transition-colors bg-transparent border-none cursor-pointer font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-phx-muted">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-phx-amber/10 text-phx-amber border border-[rgba(240,169,58,0.2)] font-mono">
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
          <p className="text-[11px] text-phx-secondary leading-relaxed">
            Deep signature format parsing, missing NAL-unit carving, and real-time court-admissible cryptographic provenance chain verification.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-phx-border pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("provenance")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "provenance"
                ? "bg-phx-cyan/10 text-phx-cyan border-phx-cyan/20 font-semibold"
                : "text-phx-muted hover:text-phx-secondary hover:bg-phx-panel-lighter border-transparent"
            }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Provenance Chain</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-phx-cyan/10 text-phx-cyan font-mono font-semibold">
              CORE LINK
            </span>
          </button>
          <button
            onClick={() => setActiveTab("detection")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "detection"
                ? "bg-phx-cyan/10 text-phx-cyan border-phx-cyan/20 font-semibold"
                : "text-phx-muted hover:text-phx-secondary hover:bg-phx-panel-lighter border-transparent"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Format Detection</span>
          </button>
          <button
            onClick={() => setActiveTab("fragments")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "fragments"
                ? "bg-phx-cyan/10 text-phx-cyan border-phx-cyan/20 font-semibold"
                : "text-phx-muted hover:text-phx-secondary hover:bg-phx-panel-lighter border-transparent"
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Recovered Fragments ({fragments.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "ledger"
                ? "bg-phx-cyan/10 text-phx-cyan border-phx-cyan/20 font-semibold"
                : "text-phx-muted hover:text-phx-secondary hover:bg-phx-panel-lighter border-transparent"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Audit Ledger ({ledgerEntries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("ledger-demo")}
            className={`px-4 py-2.5 rounded text-[11px] font-medium flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === "ledger-demo"
                ? "bg-phx-amber/10 text-phx-amber border-[rgba(240,169,58,0.2)] font-semibold"
                : "text-phx-muted hover:text-phx-secondary hover:bg-phx-panel-lighter border-transparent"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Ledger Demo</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-phx-amber/10 text-phx-amber font-mono font-semibold">
              DEMO
            </span>
          </button>
        </div>

        {isLoading && (
          <div className="data-panel p-12 flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-2 text-[11px] font-mono text-phx-cyan">
              <div className="w-1.5 h-1.5 rounded-full bg-phx-cyan animate-pulse" />
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
                      disabled={!canDetect}
                      title={imagePath ? "" : "Acquire evidence first"}
                      className="px-4 py-2.5 bg-phx-cyan/10 border border-phx-cyan/30 text-phx-cyan text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all font-mono hover:bg-phx-cyan/10"
                    >
                      <Play className="w-4 h-4" />
                      <span>RUN DETECTION</span>
                    </button>
                  </div>

                  {detectError && (
                    <div className="bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] rounded p-4 mb-4 text-[11px] text-phx-red font-mono">
                      {detectError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1 border-b border-phx-border pb-4 md:pb-0 md:border-r md:pr-4">
                      <span className="text-[10px] font-mono text-phx-muted uppercase tracking-wider block">Detected Manufacturer</span>
                      <div className="flex items-center gap-2.5 pt-1">
                        <span className="text-sm font-bold text-phx-primary">
                          {formatData?.vendor_info?.vendor_name || "—"}
                        </span>
                        {formatData?.vendor_info?.validation_status && (
                          <Badge label={formatData.vendor_info.validation_status} size="xs" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 border-b border-phx-border pb-4 md:pb-0 md:border-r md:pr-4">
                      <span className="text-[10px] font-mono text-phx-muted uppercase tracking-wider block">Filesystem Container</span>
                      <p className="text-sm font-mono text-phx-cyan pt-1">
                        {formatData?.vendor_info?.detected_format_signature || "—"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-phx-muted uppercase tracking-wider block">Detection Confidence</span>
                      <p className="text-sm font-medium text-phx-primary pt-1 font-mono">
                        {formatData?.confidence !== undefined ? `${(formatData.confidence * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  </div>

                  {formatData?.rationale && formatData.rationale.length > 0 && (
                    <div className="mt-6">
                      <span className="text-[10px] font-mono text-phx-muted uppercase tracking-wider block mb-2">Detection Rationale</span>
                      <ul className="space-y-1 text-[11px] text-phx-secondary">
                        {formatData.rationale.map((r, i) => (
                          <li key={i} className="font-mono bg-phx-deep p-2 rounded border border-phx-border">{r}</li>
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
                                <span className="font-mono font-bold text-phx-primary">{((frag.confidence_score || 0) * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="forensic-table td text-[10px] font-mono text-phx-secondary">
                              {frag.confidence_rationale || "—"}
                            </td>
                          </tr>
                        ))}
                        {fragments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-phx-muted font-mono">No fragments recovered.</td>
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
                            <td className="forensic-table td font-mono text-phx-cyan">{idx + 1}</td>
                            <td className="forensic-table td font-mono">{frag.fragment_id || `frag-${idx}`}</td>
                            <td className="forensic-table td font-mono">{frag.byte_offset_start || 0} – {frag.byte_offset_end || 0}</td>
                            <td className="forensic-table td font-mono">{(frag.byte_offset_end || 0) - (frag.byte_offset_start || 0)} bytes</td>
                            <td className="forensic-table td">{frag.codec_info || "—"}</td>
                            <td className="forensic-table td"><Badge label={frag.recovery_method || "GENERIC"} variant="slate" size="xs" /></td>
                            <td className="forensic-table td">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-phx-primary">{((frag.confidence_score || 0) * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="forensic-table td text-[10px] font-mono text-phx-secondary">{frag.confidence_rationale || "—"}</td>
                          </tr>
                        ))}
                        {fragments.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-phx-muted font-mono">No fragments recovered yet.</td>
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
                          <tr key={idx} className={entry.event_type === "GENESIS" ? "bg-phx-amber/10" : ""}>
                            <td className="forensic-table td font-mono text-phx-cyan">{entry.index}</td>
                            <td className="forensic-table td font-medium">
                              {entry.event_type === "GENESIS" && <span className="text-phx-amber font-bold">GENESIS</span>}
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
                            <td colSpan={7} className="py-8 text-center text-phx-muted font-mono">No ledger entries found.</td>
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