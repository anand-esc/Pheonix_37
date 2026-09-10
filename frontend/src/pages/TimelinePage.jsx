import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, AlertCircle } from "lucide-react";
import { getCase, getCaseFragments } from "../api";
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
        if (isMounted) { setCaseData(c); setFragments(frags || []); }
      } catch (err) { console.error("Failed to load timeline data", err); }
      finally { if (isMounted) setIsLoading(false); }
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
    return { ...f, startMs: parseTimestamp(start), endMs: parseTimestamp(end) };
  });

  const allStarts = parsedTimeSegments.map((s) => s.startMs).filter(t => t > 0);
  const allEnds = parsedTimeSegments.map((s) => s.endMs).filter(t => t > 0);
  const minTimeMs = allStarts.length > 0 ? Math.min(...allStarts) : Date.now();
  const maxTimeMs = allEnds.length > 0 ? Math.max(...allEnds) : Date.now() + 3600000;
  const totalRangeMs = Math.max(1, maxTimeMs - minTimeMs);

  const ticks = Array.from({ length: 5 }, (_, i) => ({
    label: formatTimeTick(minTimeMs + (totalRangeMs / 4) * i),
    pct: (i / 4) * 100,
  }));

  const statusMap = { "Intake": "pending", "Processing": "pending", "Recovered": "validated", "Reported": "validated" };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(`/cases/${id}`)} className="flex items-center gap-2 text-sm text-phx-secondary hover:text-phx-primary transition-colors">
          <ArrowLeft size={16} />
          <span>Back to Case Detail</span>
        </button>
        <div className="text-xs text-phx-muted bg-phx-surface px-3 py-1.5 rounded border border-phx-border">
          Active Role: <strong className="text-phx-primary">{role}</strong>
        </div>
      </div>

      <CaseHeader
        caseId={caseData?.case_id || id}
        title={caseData?.title || `Case ${id}`}
        status={statusMap[caseData?.status] || "pending"}
        statusLabel={caseData?.status}
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3">
        <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Scope Note — Anchor Alignment Not Available</p>
          <p className="text-sm text-amber-700 mt-1">
            Manual cross-camera frame alignment requires backend endpoints for anchor storage.
            Timeline shows recovered fragments with estimated timing from SPS VUI.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-phx-border rounded-lg p-12 text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-phx-red animate-spin mx-auto mb-4" />
          <div className="text-xs text-phx-muted uppercase tracking-widest">Loading timeline data...</div>
        </div>
      ) : (
        <div className="bg-white border border-phx-border rounded-lg overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-phx-border flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-phx-primary">Channel Tracks & Time Axis</h3>
            <div className="flex flex-wrap gap-3 text-xs">
              <LegendItem color="#D97706" label="Recovered" />
              <LegendItem color="#166534" label="Validated" />
              <LegendItem color="#D1CEC7" label="Generic Fallback" />
              <LegendItem color="#111111" label="Research Target" />
            </div>
          </div>

          <div className="p-6">
            <div className="h-10 bg-phx-surface border border-phx-border rounded relative mb-6">
              {ticks.map((t, idx) => (
                <div key={idx} className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${t.pct}%`, transform: 'translateX(-50%)' }}>
                  <span className="text-[11px] font-mono text-phx-secondary mt-1.5">{t.label}</span>
                  <div className="w-px h-2.5 bg-phx-border mt-auto mb-1" />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              {Object.entries(channelGroups).map(([channelName, fragList]) => (
                <div key={channelName} className="bg-phx-surface border border-phx-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3 text-sm">
                    <span className="font-semibold text-phx-primary">{channelName}</span>
                    <span className="text-phx-muted text-xs">{fragList.length} Fragments</span>
                  </div>
                  <div className="relative h-14 bg-white border border-phx-border rounded overflow-hidden">
                    {fragList.map((frag) => {
                      const pSeg = parsedTimeSegments.find((p) => p.fragment_id === frag.fragment_id);
                      const leftPct = pSeg && pSeg.startMs > 0 ? ((pSeg.startMs - minTimeMs) / totalRangeMs) * 100 : 0;
                      const widthPct = pSeg && pSeg.endMs > pSeg.startMs ? Math.max(4, ((pSeg.endMs - pSeg.startMs) / totalRangeMs) * 100) : 4;

                      let bgColor = '#E5E2DC';
                      let textColor = '#555555';
                      let statusLabel = frag.recovery_method || 'UNKNOWN';
                      if (frag.recovery_method?.includes('VALIDATED') || frag.recovery_method === 'DHAV_PARSER') {
                        bgColor = '#FEF3C7'; textColor = '#92400E'; statusLabel = 'Validated';
                      } else if (frag.recovery_method?.includes('GENERIC') || frag.recovery_method === 'annexb_nal_carve') {
                        bgColor = '#DCFCE7'; textColor = '#166534'; statusLabel = 'Generic Fallback';
                      } else if (frag.recovery_method?.includes('RESEARCH')) {
                        bgColor = '#111111'; textColor = '#FFFFFF'; statusLabel = 'Research Target';
                      }

                      return (
                        <div
                          key={frag.fragment_id}
                          className="absolute top-1 bottom-1 rounded cursor-pointer hover:opacity-80 transition-all hover:ring-2 hover:ring-phx-cyan hover:z-10 shadow-sm"
                          style={{
                            left: `${Math.max(0, Math.min(96, leftPct))}%`,
                            width: `${Math.min(100 - leftPct, widthPct)}%`,
                            background: bgColor,
                          }}
                          title={`Fragment: ${frag.fragment_id}\nMethod: ${frag.recovery_method}\nConfidence: ${((frag.confidence_score || 0) * 100).toFixed(0)}%\nRationale: ${frag.confidence_rationale || 'N/A'}`}
                        />
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
        <div className="bg-white border border-phx-border rounded-lg p-12 text-center mt-6 shadow-sm">
          <Clock size={40} className="text-phx-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-phx-primary mb-2">No Timeline Data</h3>
          <p className="text-sm text-phx-secondary">No fragments with timing metadata found for this case.</p>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <span className="flex items-center gap-2 px-2.5 py-1 bg-phx-surface rounded border border-phx-border">
      <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
      <span className="text-phx-secondary">{label}</span>
    </span>
  );
}

function parseTimestamp(ts) {
  if (!ts) return 0;
  try { return new Date(ts.replace(" IST", "").replace(" ", "T")).getTime() || 0; } catch { return 0; }
}

function formatTimeTick(timeMs) {
  try {
    const d = new Date(timeMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return '00:00'; }
}