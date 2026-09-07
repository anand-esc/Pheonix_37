import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  Play, 
  ArrowLeft, 
  Cpu, 
  Film, 
  Loader2, 
  RefreshCw, 
  GitCommit, 
  HardDrive,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { ProvenanceChain } from "../components/ProvenanceChain";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { HashDisplay } from "../components/HashDisplay";
import { getCase, detectFormat, getSegments, recoverSegment } from "../mockApi";
import { useRole } from "../context/RoleContext";

export function AnalysisPage() {
  const { id } = useParams();
  const { role } = useRole();

  const [activeTab, setActiveTab] = useState("provenance");

  const [caseData, setCaseData] = useState(null);
  const [formatData, setFormatData] = useState(null);
  const [segments, setSegments] = useState([]);
  const [isDetecting, setIsDetecting] = useState(true);

  const [recoveryStates, setRecoveryStates] = useState({});

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setIsDetecting(true);
        const [c, fmt, segs] = await Promise.all([
          getCase(id),
          detectFormat(id),
          getSegments(id),
        ]);

        if (isMounted) {
          setCaseData(c);
          setFormatData(fmt);
          setSegments(segs || []);

          if (c && c.recoveries) {
            const initialRecStates = {};
            Object.entries(c.recoveries).forEach(([segId, recData]) => {
              initialRecStates[segId] = {
                isLoading: false,
                result: recData,
                error: null,
              };
            });
            setRecoveryStates(initialRecStates);
          }
        }
      } catch (err) {
        console.error("Failed to load analysis data", err);
      } finally {
        if (isMounted) setIsDetecting(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleRecoverSegment = async (segmentId) => {
    setRecoveryStates((prev) => ({
      ...prev,
      [segmentId]: { isLoading: true, result: null, error: null },
    }));

    try {
      const res = await recoverSegment(id, segmentId);
      setRecoveryStates((prev) => ({
        ...prev,
        [segmentId]: { isLoading: false, result: res, error: null },
      }));

      const updatedCase = await getCase(id);
      setCaseData(updatedCase);
    } catch (err) {
      setRecoveryStates((prev) => ({
        ...prev,
        [segmentId]: {
          isLoading: false,
          result: { status: "failed", confidence: 0, recoveredHash: null },
          error: err.message || "Recovery engine failed",
        },
      }));
    }
  };

  const recoverySegments = segments.filter((s) => s.deleted || s.corrupted);

  return (
    <div className="space-y-6">
      <CaseNavigationTabs />

      <div className="max-w-7xl mx-auto px-4 lg:px-8 space-y-6 pb-16">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <Link to="/cases" className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-sky-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-medium">
              {role}
            </span>
          </div>
        </div>

        {/* Case Info Banner */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-2xs">
          <SectionHeading
            title={`Video Analysis & Provenance — ${id}`}
            subtitle={caseData?.name || "DVR Forensic Case"}
            icon={Play}
            badge={<Badge label={caseData?.status || "Processing"} />}
          />
          <p className="text-xs text-slate-600 leading-relaxed">
            Deep signature format parsing, missing NAL-unit carving, and real-time court-admissible cryptographic provenance chain verification.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("provenance")}
            className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "provenance"
                ? "bg-sky-50 text-sky-800 border border-sky-200 font-semibold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <GitCommit className="w-4 h-4 text-sky-600" />
            <span>Provenance Chain</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-mono font-semibold">
              CORE LINK
            </span>
          </button>

          <button
            onClick={() => setActiveTab("detection")}
            className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "detection"
                ? "bg-sky-50 text-sky-800 border border-sky-200 font-semibold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Format Detection & Parsing</span>
          </button>

          <button
            onClick={() => setActiveTab("recovery")}
            className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "recovery"
                ? "bg-sky-50 text-sky-800 border border-sky-200 font-semibold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Segment Recovery ({recoverySegments.length})</span>
          </button>
        </div>

        {/* LOADING STATE */}
        {isDetecting && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-center shadow-2xs">
            <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Scanning DVR Magic Bytes...</h3>
              <p className="text-xs text-slate-500 font-mono">Running signature engine & filesystem parser...</p>
            </div>
          </div>
        )}

        {!isDetecting && (
          <>
            {/* PROVENANCE CHAIN (HERO FOCAL ELEMENT) */}
            {activeTab === "provenance" && (
              <ProvenanceChain caseId={id} initialCaseData={caseData} />
            )}

            {/* FORMAT DETECTION & PARSING */}
            {activeTab === "detection" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0 pr-4">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Detected Manufacturer
                      </span>
                      <div className="flex items-center gap-2.5 pt-1">
                        <span className="text-lg font-bold text-slate-900">
                          {formatData?.vendor || "Hikvision"}
                        </span>
                        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {formatData?.confidence || 94}% Confidence
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0 pr-4">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Filesystem Container
                      </span>
                      <p className="text-sm font-mono font-medium text-sky-800 pt-1">
                        {formatData?.fileSystem || "WFS v2.4 (Proprietary Disk Format)"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Identified Streams
                      </span>
                      <p className="text-sm font-medium text-slate-800 pt-1">
                        {segments.length} Total ({recoverySegments.length} Flagged for Recovery)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                  <SectionHeading
                    title="Identified Video Segments"
                    subtitle="Categorized by vendor parser support status"
                    icon={Film}
                  />

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-3 px-4">Channel ID</th>
                          <th className="py-3 px-4">Start Time</th>
                          <th className="py-3 px-4">End Time</th>
                          <th className="py-3 px-4">Size</th>
                          <th className="py-3 px-4">Validation Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {segments.map((seg) => (
                          <tr key={seg.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                              {seg.channel}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                              {seg.start}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                              {seg.end}
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 font-medium">
                              {formatBytes(seg.sizeBytes)}
                            </td>
                            <td className="py-3.5 px-4">
                              <MapExactBadge status={seg.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SEGMENT RECOVERY */}
            {activeTab === "recovery" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
                  <SectionHeading
                    title={`Deleted & Corrupted Segment Carving (${recoverySegments.length})`}
                    subtitle="3-stage carving progression pipeline (Raw Region ➔ NAL Carver ➔ Restored Segment)"
                    icon={Layers}
                  />
                </div>

                {recoverySegments.map((seg) => {
                  const state = recoveryStates[seg.id] || { isLoading: false, result: null, error: null };
                  const recResult = state.result;

                  return (
                    <div key={seg.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-2xs">
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sky-800 font-bold text-xs">{seg.id}</span>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-900 font-semibold text-xs">{seg.channel}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            {seg.start} ➔ {seg.end} ({formatBytes(seg.sizeBytes)})
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <MapExactBadge status={seg.status} />
                          {seg.deleted && <Badge label="Deleted" variant="rose" size="sm" />}
                          {seg.corrupted && <Badge label="Corrupted" variant="amber" size="sm" />}
                        </div>
                      </div>

                      {/* 3-STATE CARVING PROGRESSION */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="space-y-2">
                          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                            <span>1. Raw Sector Region</span>
                            <span className="text-[10px] text-slate-400 font-mono">0x4A00</span>
                          </div>
                          <div className="h-24 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center p-3 text-center space-y-1">
                            <HardDrive className="w-5 h-5 text-slate-400" />
                            <span className="text-[11px] font-mono text-slate-700 font-medium">Unallocated Sector</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                            <span>2. NAL Carving Engine</span>
                            <span className="text-[10px] text-slate-400 font-mono">H.264 PARSER</span>
                          </div>
                          <div className={`h-24 rounded-lg border flex flex-col items-center justify-center p-3 text-center space-y-1 transition-all ${
                            state.isLoading
                              ? "bg-sky-50 border-sky-300 animate-pulse"
                              : "bg-white border-slate-200"
                          }`}>
                            {state.isLoading ? (
                              <>
                                <Loader2 className="w-5 h-5 text-sky-600 animate-spin" />
                                <span className="text-[11px] font-mono text-sky-800 font-semibold">Carving Slice Headers...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-5 h-5 text-slate-400" />
                                <span className="text-[11px] font-mono text-slate-600 font-medium">Carver Ready</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
                            <span>3. Carved Result</span>
                            <span className="text-[10px] font-mono">
                              {recResult?.status === "success" && <span className="text-emerald-700 font-semibold">RESTORED</span>}
                              {recResult?.status === "failed" && <span className="text-rose-700 font-semibold">FAILED</span>}
                              {!recResult && <span className="text-slate-400">PENDING</span>}
                            </span>
                          </div>
                          
                          <div className={`h-24 rounded-lg border flex flex-col items-center justify-center p-3 text-center space-y-1 transition-all ${
                            recResult?.status === "success"
                              ? "bg-emerald-50/60 border-emerald-200"
                              : recResult?.status === "failed"
                              ? "bg-rose-50/60 border-rose-200"
                              : "bg-white border-slate-200"
                          }`}>
                            {recResult?.status === "success" && (
                              <>
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                <span className="text-[11px] font-semibold text-slate-900">Fragment Restored</span>
                                <span className="text-[10px] text-emerald-700 font-mono truncate max-w-[160px]">
                                  {truncateHash(recResult.recoveredHash)}
                                </span>
                              </>
                            )}

                            {recResult?.status === "failed" && (
                              <>
                                <XCircle className="w-5 h-5 text-rose-600" />
                                <span className="text-[11px] font-semibold text-rose-800">Unrecoverable Sector</span>
                              </>
                            )}

                            {!recResult && (
                              <>
                                <Film className="w-5 h-5 text-slate-400" />
                                <span className="text-[11px] text-slate-400">Awaiting Trigger</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* CONFIDENCE & RECOVER BUTTON */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                        <div className="w-full sm:w-80 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 font-medium">Carving Confidence:</span>
                            <span className="font-mono font-bold text-slate-900">
                              {recResult ? `${recResult.confidence}%` : "Not evaluated"}
                            </span>
                          </div>

                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                            <div
                              className={`h-full transition-all duration-500 ${
                                recResult
                                  ? recResult.status === "failed"
                                    ? "bg-rose-600"
                                    : recResult.confidence >= 70
                                    ? "bg-emerald-600"
                                    : "bg-amber-500"
                                  : "bg-slate-300"
                              }`}
                              style={{ width: `${recResult ? recResult.confidence : 0}%` }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => handleRecoverSegment(seg.id)}
                          disabled={state.isLoading}
                          className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                        >
                          {state.isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Carving Segment...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>{recResult ? "Re-Run Recovery" : "Recover Segment"}</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

function MapExactBadge({ status }) {
  const norm = (status || "").toLowerCase();
  if (norm === "validated") return <Badge label="Validated" variant="emerald" size="sm" />;
  if (norm === "fallback") return <Badge label="Generic Fallback" variant="amber" size="sm" />;
  if (norm === "research") return <Badge label="Research Target" variant="cyan" size="sm" />;
  return <Badge label={status} variant="slate" size="sm" />;
}

function truncateHash(hash, len = 6) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.substring(0, len)}...${hash.substring(hash.length - len)}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
