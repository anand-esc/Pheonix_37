import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, AlertCircle } from "lucide-react";
import { getCase, getCaseFragments, formatBytes } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";

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

  const statusMap = {
    "Intake": "pending",
    "Processing": "pending",
    "Recovered": "validated",
    "Reported": "validated",
  };

  return (
    <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
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
          statusLabel={caseData?.status}
        />

        <div style={{
          marginBottom: "1.5rem", padding: "1rem",
          background: "var(--phx-red-tint)", border: "1px solid var(--phx-red)",
          borderRadius: "var(--phx-radius)", display: "flex", gap: 12
        }}>
          <AlertCircle size={20} style={{ color: "var(--phx-red)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-ink)" }}>
            <strong style={{ color: "var(--phx-red)" }}>SCOPE NOTE — ANCHOR ALIGNMENT NOT AVAILABLE</strong>
            <p style={{ marginTop: 4, color: "var(--phx-text-secondary)" }}>
              Manual cross-camera frame alignment requires backend endpoints for anchor storage
              (/api/case/{id}/anchors POST/GET). Timeline shows recovered fragments with estimated
              timing from SPS VUI. This is a documented scope limitation, not a defect.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div style={{
            padding: "3rem", textAlign: "center",
            background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
            borderRadius: "var(--phx-radius)"
          }}>
            <Loader2 className="phx-spinner" size={32} style={{ color: "var(--phx-navy)", margin: "0 auto 12px" }} />
            <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-text-muted)" }}>
              LOADING TIMELINE DATA...
            </div>
          </div>
        ) : (
          <div style={{
            background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
            borderRadius: "var(--phx-radius)", overflow: "hidden"
          }}>
            <div style={{
              padding: "1rem 1.5rem", borderBottom: "1px solid var(--phx-border)",
              display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12
            }}>
              <div style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.875rem", fontWeight: 500, color: "var(--phx-ink)" }}>
                Channel Tracks & Time Axis
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem" }}>
                <LegendItem color="var(--phx-gold)" label="Recovered" />
                <LegendItem color="var(--phx-navy)" label="Validated" />
                <LegendItem color="var(--phx-text-muted)" label="Generic Fallback" />
                <LegendItem color="var(--phx-navy-2)" label="Research Target" />
              </div>
            </div>

            <div style={{ padding: "1.5rem" }}>
              <div className="phx-time-ruler" style={{
                height: 40, background: "var(--phx-navy-tint)", border: "1px solid var(--phx-border)",
                borderRadius: "var(--phx-radius)", position: "relative", marginBottom: 16,
                fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem", color: "var(--phx-text-secondary)"
              }}>
                {ticks.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: "absolute", left: `${t.pct}%`, top: 0, bottom: 0,
                      transform: "translateX(-50%)", display: "flex", flexDirection: "column",
                      alignItems: "center"
                    }}
                  >
                    <span style={{ marginTop: 4 }}>{t.label}</span>
                    <div style={{ width: 1, height: 12, background: "var(--phx-border)", marginTop: 4 }} />
                  </div>
                ))}
              </div>

              <div className="phx-tracks" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(channelGroups).map(([channelName, fragList]) => (
                  <div key={channelName} style={{
                    background: "var(--phx-navy-tint)", border: "1px solid var(--phx-border)",
                    borderRadius: "var(--phx-radius)", padding: "1rem"
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 8, fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem"
                    }}>
                      <span style={{ fontWeight: 600, color: "var(--phx-navy)" }}>{channelName}</span>
                      <span style={{ color: "var(--phx-text-secondary)" }}>{fragList.length} Fragments</span>
                    </div>

                    <div style={{
                      position: "relative", height: 60, background: "var(--phx-paper)",
                      border: "1px solid var(--phx-border)", borderRadius: "var(--phx-radius)",
                      overflow: "hidden"
                    }}>
                      {fragList.map((frag) => {
                        const pSeg = parsedTimeSegments.find((p) => p.fragment_id === frag.fragment_id);
                        const leftPct = pSeg && pSeg.startMs > 0 ? ((pSeg.startMs - minTimeMs) / totalRangeMs) * 100 : 0;
                        const widthPct = pSeg && pSeg.endMs > pSeg.startMs ? Math.max(4, ((pSeg.endMs - pSeg.startMs) / totalRangeMs) * 100) : 4;

                        let blockColor = "var(--phx-border)";
                        let textColor = "var(--phx-text-secondary)";
                        let statusLabel = frag.recovery_method || "UNKNOWN";

                        if (frag.recovery_method?.includes("VALIDATED") || frag.recovery_method === "DHAV_PARSER") {
                          blockColor = "var(--phx-gold)";
                          textColor = "var(--phx-navy)";
                          statusLabel = "Validated";
                        } else if (frag.recovery_method?.includes("GENERIC") || frag.recovery_method === "annexb_nal_carve") {
                          blockColor = "var(--phx-navy)";
                          textColor = "var(--phx-on-navy)";
                          statusLabel = "Generic Fallback";
                        } else if (frag.recovery_method?.includes("RESEARCH")) {
                          blockColor = "var(--phx-navy-2)";
                          textColor = "var(--phx-on-navy)";
                          statusLabel = "Research Target";
                        }

                        return (
                          <div
                            key={frag.fragment_id}
                            style={{
                              position: "absolute", top: 4, bottom: 4,
                              left: `${Math.max(0, Math.min(96, leftPct))}%`,
                              width: `${Math.min(100 - leftPct, widthPct)}%`,
                              background: blockColor, color: textColor,
                              borderRadius: "2px", padding: "2px 8px",
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem",
                              cursor: "pointer", whiteSpace: "nowrap"
                            }}
                            title={`${frag.fragment_id}: ${frag.confidence_rationale || "No rationale"} (${((frag.confidence_score || 0) * 100).toFixed(0)}%)`}
                          >
                            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {frag.fragment_id?.slice(0, 12)}
                            </span>
                            <span style={{ fontSize: "0.65rem", opacity: 0.8, marginLeft: 8 }}>
                              {statusLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {Object.keys(channelGroups).length === 0 && !isLoading && (
          <div style={{
            padding: "3rem", textAlign: "center",
            background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
            borderRadius: "var(--phx-radius)", marginTop: "1.5rem"
          }}>
            <Clock size={48} style={{ color: "var(--phx-text-muted)", marginBottom: 12 }} />
            <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1.1rem", color: "var(--phx-ink)", marginBottom: 4 }}>
              No Timeline Data
            </h3>
            <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-text-secondary)" }}>
              No fragments with timing metadata found for this case.
            </p>
          </div>
        )}
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

function LegendItem({ color, label }) {
  return (
    <span style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 8px", background: "var(--phx-navy-tint)",
      borderRadius: "var(--phx-radius)"
    }}>
      <span style={{ width: 12, height: 12, borderRadius: 2, background: color }} />
      <span>{label}</span>
    </span>
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