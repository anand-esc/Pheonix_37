import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Clock, ArrowLeft, Film, Loader2, AlertCircle } from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { getCase, getCaseFragments, formatBytes } from "../api";
import { useRole } from "../context/RoleContext";

export function TimelinePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadTimelineData = async () => {
      try {
        setIsLoading(true);
        const [c, frags] = await Promise.all([getCase(id), getCaseFragments(id)]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
        }
      } catch (err) {
        console.error("Failed to load timeline data", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadTimelineData();
    return () => { isMounted = false; };
  }, [id]);

  const channelGroups = fragments.reduce((acc, frag) => {
    const channel = frag.metadata?.channel || "unattributed";
    if (!acc[channel]) acc[channel] = [];
    acc[channel].push(frag);
    return acc;
  }, {});

  const parsedTimeSegments = fragments.map((f) => {
    const start = f.metadata?.estimated_start_utc || f.metadata?.start_time || "";
    const end = f.metadata?.estimated_end_utc || f.metadata?.end_time || "";
    return {
      ...f,
      startMs: parseTimestamp(start),
      endMs: parseTimestamp(end),
    };
  });

  const allStarts = parsedTimeSegments.map((s) => s.startMs).filter(t => t > 0);
  const allEnds = parsedTimeSegments.map((s) => s.endMs).filter(t => t > 0);
  const minTimeMs = allStarts.length > 0 ? Math.min(...allStarts) : Date.now();
  const maxTimeMs = allEnds.length > 0 ? Math.max(...allEnds) : Date.now() + 3600000;
  const totalRangeMs = Math.max(1, maxTimeMs - minTimeMs);

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const timeMs = minTimeMs + (totalRangeMs / (tickCount - 1)) * i;
    return {
      label: formatTimeTick(timeMs),
      pct: (i / (tickCount - 1)) * 100,
    };
  });

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
            title={`Multi-Track Timeline — ${id}`}
            subtitle={caseData?.name || "DVR Investigation"}
            icon={Clock}
            badge={<Badge label={caseData?.status || "Processing"} />}
          />
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Multi-channel fragment timeline view. Timestamps derived from SPS VUI timing or assumed frame rates.
            Manual anchor alignment not available in this version (requires backend endpoint).
          </p>
        </div>

        {isLoading ? (
          <div className="data-panel p-12 flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
              <span>LOADING TIMELINE DATA...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Scope Note — Deliberate Bordered Info Panel */}
            <div className="bg-[var(--bg-deep)] border border-[rgba(240,169,58,0.25)] rounded p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[var(--accent-amber)] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[11px] font-bold text-[var(--accent-amber)] font-mono">SCOPE NOTE — ANCHOR ALIGNMENT NOT AVAILABLE</h3>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                    Manual cross-camera frame alignment requires backend endpoints for anchor storage (/api/case/{id}/anchors POST/GET).
                    Timeline shows recovered fragments with estimated timing from SPS VUI. This is a documented scope limitation, not a defect.
                  </p>
                </div>
              </div>
            </div>

            {/* TIMELINE CONTAINER */}
            <div className="data-panel p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                <SectionHeading
                  title="Channel Tracks & Time Axis"
                  subtitle="Synchronized multi-channel surveillance stream tracks"
                  icon={Clock}
                />
                <div className="flex flex-wrap items-center gap-3 text-[10px] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--accent-cyan)] border border-[rgba(62,214,196,0.3)]" />
                    <span className="text-[var(--text-secondary)] font-mono">Recovered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--bg-panel-lighter)] border border-[var(--border)]" />
                    <span className="text-[var(--text-secondary)] font-mono">Validated</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--accent-amber-dim)] border border-[rgba(240,169,58,0.3)]" />
                    <span className="text-[var(--text-secondary)] font-mono">Generic Fallback</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--accent-cyan-dim)] border border-[rgba(62,214,196,0.3)]" />
                    <span className="text-[var(--text-secondary)] font-mono">Research Target</span>
                  </div>
                </div>
              </div>

              {/* TIME AXIS RULER */}
              <div className="space-y-4">
                <div className="relative h-7 bg-[var(--bg-deep)] rounded border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] px-4 flex items-center select-none">
                  {ticks.map((t, idx) => (
                    <div
                      key={idx}
                      className="absolute transform -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${t.pct}%` }}
                    >
                      <span>{t.label}</span>
                      <div className="w-px h-2 bg-[var(--border)] mt-0.5" />
                    </div>
                  ))}
                </div>

                {/* TRACK ROWS */}
                <div className="space-y-3">
                  {Object.entries(channelGroups).map(([channelName, fragList]) => (
                    <div key={channelName} className="bg-[var(--bg-deep)] p-4 rounded border border-[var(--border)] space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-[var(--text-primary)]">{channelName}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{fragList.length} Fragments</span>
                      </div>

                      <div className="relative h-12 bg-[var(--bg-panel)] rounded border border-[var(--border)] overflow-hidden">
                        {fragList.map((frag) => {
                          const pSeg = parsedTimeSegments.find((p) => p.fragment_id === frag.fragment_id);
                          const leftPct = pSeg && pSeg.startMs > 0 ? ((pSeg.startMs - minTimeMs) / totalRangeMs) * 100 : 0;
                          const widthPct = pSeg && pSeg.endMs > pSeg.startMs ? Math.max(6, ((pSeg.endMs - pSeg.startMs) / totalRangeMs) * 100) : 6;

                          let blockStyle = "bg-[var(--bg-panel-lighter)] text-[var(--text-secondary)] border-[var(--border)]";
                          let statusLabel = frag.recovery_method || "UNKNOWN";

                          if (frag.recovery_method?.includes("VALIDATED") || frag.recovery_method === "DHAV_PARSER") {
                            blockStyle = "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-[rgba(52,211,153,0.3)]";
                            statusLabel = "Validated";
                          } else if (frag.recovery_method?.includes("GENERIC") || frag.recovery_method === "annexb_nal_carve") {
                            blockStyle = "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.3)]";
                            statusLabel = "Generic Fallback";
                          } else if (frag.recovery_method?.includes("RESEARCH")) {
                            blockStyle = "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.3)]";
                            statusLabel = "Research Target";
                          }

                          return (
                            <div
                              key={frag.fragment_id}
                              style={{
                                left: `${Math.max(0, Math.min(92, leftPct))}%`,
                                width: `${Math.min(100 - leftPct, widthPct)}%`,
                              }}
                              className={`absolute top-1 bottom-1 rounded border px-2 py-1 flex items-center justify-between text-[10px] font-mono cursor-pointer ${blockStyle}`}
                              title={`${frag.fragment_id}: ${frag.confidence_rationale || "No rationale"} (${((frag.confidence_score || 0) * 100).toFixed(0)}%)`}
                            >
                              <span className="font-bold truncate">{frag.fragment_id?.slice(0, 12)}</span>
                              <span className="text-[9px] opacity-90 hidden sm:inline">{statusLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function parseTimestamp(ts) {
  if (!ts) return 0;
  try {
    const clean = ts.replace(" IST", "").replace(" ", "T");
    return new Date(clean).getTime() || 0;
  } catch { return 0; }
}

function formatTimeTick(timeMs) {
  try {
    const d = new Date(timeMs);
    const hrs = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${hrs}:${mins}`;
  } catch { return "00:00"; }
}