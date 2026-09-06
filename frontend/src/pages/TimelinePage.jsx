import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  Clock, 
  ArrowLeft, 
  Film, 
  Link2, 
  Plus, 
  Loader2
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { getCase, getSegments, addAnchor } from "../mockApi";
import { useRole } from "../context/RoleContext";

export function TimelinePage() {
  const { id } = useParams();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [segments, setSegments] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedSegment, setSelectedSegment] = useState(null);

  const [anchorSlotA, setAnchorSlotA] = useState(null);
  const [anchorSlotB, setAnchorSlotB] = useState(null);
  const [isMarkingAnchor, setIsMarkingAnchor] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadTimelineData = async () => {
      try {
        setIsLoading(true);
        const [c, segs] = await Promise.all([getCase(id), getSegments(id)]);
        if (isMounted) {
          setCaseData(c);
          setSegments(segs || []);
          setAnchors(c?.anchors || []);
        }
      } catch (err) {
        console.error("Failed to load timeline data", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadTimelineData();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleMarkAnchor = async () => {
    if (!anchorSlotA || !anchorSlotB) return;
    if (anchorSlotA.id === anchorSlotB.id) return;

    try {
      setIsMarkingAnchor(true);
      const updatedAnchors = await addAnchor(id, anchorSlotA.id, anchorSlotB.id);
      setAnchors(updatedAnchors || []);
      setAnchorSlotA(null);
      setAnchorSlotB(null);
    } catch (err) {
      console.error("Failed to mark anchor pair", err);
    } finally {
      setIsMarkingAnchor(false);
    }
  };

  const channelGroups = segments.reduce((acc, seg) => {
    if (!acc[seg.channel]) acc[seg.channel] = [];
    acc[seg.channel].push(seg);
    return acc;
  }, {});

  const parsedTimeSegments = segments.map((s) => ({
    ...s,
    startMs: parseISTTimestamp(s.start),
    endMs: parseISTTimestamp(s.end),
  }));

  const allStarts = parsedTimeSegments.map((s) => s.startMs);
  const allEnds = parsedTimeSegments.map((s) => s.endMs);

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
        
        {/* Header & Role */}
        <div className="flex items-center justify-between">
          <Link to="/cases" className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-sky-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-medium font-mono">
              {role}
            </span>
          </div>
        </div>

        {/* Case Banner */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-2xs">
          <SectionHeading
            title={`Multi-Track Timeline — ${id}`}
            subtitle={caseData?.name || "DVR Investigation"}
            icon={Clock}
            badge={<Badge label={caseData?.status || "Processing"} />}
          />
          <p className="text-xs text-slate-600 leading-relaxed">
            Multi-channel segment timeline view with manual cross-camera frame alignment anchor tools.
          </p>
        </div>

        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-slate-500 shadow-2xs">
            <Loader2 className="w-7 h-7 text-sky-600 animate-spin" />
            <span className="text-xs font-medium">Loading multi-track timeline data...</span>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* MANUAL ANCHOR ALIGNMENT TOOL */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-sky-600" />
                    Manual Cross-Camera Anchor Alignment
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select a segment from Channel A and Channel B to record a manual matching frame anchor pair.
                  </p>
                </div>

                <button
                  onClick={handleMarkAnchor}
                  disabled={!anchorSlotA || !anchorSlotB || anchorSlotA.id === anchorSlotB.id || isMarkingAnchor}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                >
                  {isMarkingAnchor ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Mark Matching Anchor Pair</span>
                </button>
              </div>

              {/* Slot Displays */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className={`p-3.5 rounded-lg border flex items-center justify-between text-xs transition-all ${
                  anchorSlotA ? "bg-sky-50 border-sky-300 text-sky-900 font-medium" : "bg-slate-50 border-slate-200 text-slate-500"
                }`}>
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-slate-500 block">Anchor Slot A</span>
                    <span className="font-mono">{anchorSlotA ? `${anchorSlotA.id} (${anchorSlotA.channel})` : "Click timeline segment to assign"}</span>
                  </div>
                  {anchorSlotA && (
                    <button onClick={() => setAnchorSlotA(null)} className="text-[11px] text-slate-500 hover:text-rose-600">Clear</button>
                  )}
                </div>

                <div className={`p-3.5 rounded-lg border flex items-center justify-between text-xs transition-all ${
                  anchorSlotB ? "bg-sky-50 border-sky-300 text-sky-900 font-medium" : "bg-slate-50 border-slate-200 text-slate-500"
                }`}>
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-slate-500 block">Anchor Slot B</span>
                    <span className="font-mono">{anchorSlotB ? `${anchorSlotB.id} (${anchorSlotB.channel})` : "Click timeline segment to assign"}</span>
                  </div>
                  {anchorSlotB && (
                    <button onClick={() => setAnchorSlotB(null)} className="text-[11px] text-slate-500 hover:text-rose-600">Clear</button>
                  )}
                </div>
              </div>

              {/* Recorded Anchor Pairs */}
              {anchors.length > 0 && (
                <div className="pt-2 space-y-2 border-t border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                    Recorded Anchor Alignment Pairs ({anchors.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {anchors.map((anc) => (
                      <div key={anc.id} className="px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-[11px] font-mono text-sky-800 flex items-center gap-2 shadow-2xs">
                        <Link2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>{anc.segmentIdA} ⟷ {anc.segmentIdB}</span>
                        <span className="text-[10px] text-sky-600 font-sans font-medium">Manual Marker</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* MULTI-TRACK TIMELINE CONTAINER */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <SectionHeading
                  title="Channel Tracks & Time Axis"
                  subtitle="Synchronized multi-channel surveillance stream tracks"
                  icon={Clock}
                />

                <div className="flex flex-wrap items-center gap-3 text-[11px] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-sky-600 border border-sky-700" />
                    <span className="text-slate-700 font-medium">Recovered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
                    <span className="text-slate-700 font-medium">Validated</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
                    <span className="text-slate-700 font-medium">Pending Carve</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-rose-100 border border-rose-400" />
                    <span className="text-slate-700 font-medium">Failed</span>
                  </div>
                </div>
              </div>

              {/* SHARED HORIZONTAL TIME AXIS RULER */}
              <div className="space-y-4">
                <div className="relative h-7 bg-slate-50 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-500 px-4 flex items-center select-none">
                  {ticks.map((t, idx) => (
                    <div
                      key={idx}
                      className="absolute transform -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${t.pct}%` }}
                    >
                      <span>{t.label}</span>
                      <div className="w-px h-2 bg-slate-300 mt-0.5" />
                    </div>
                  ))}
                </div>

                {/* TRACK ROWS */}
                <div className="space-y-3">
                  {Object.entries(channelGroups).map(([channelName, segList]) => (
                    <div key={channelName} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-slate-900">{channelName}</span>
                        <span className="text-[10px] text-slate-500">{segList.length} Segments</span>
                      </div>

                      <div className="relative h-12 bg-white rounded-lg border border-slate-200 overflow-hidden">
                        {segList.map((seg) => {
                          const pSeg = parsedTimeSegments.find((p) => p.id === seg.id);
                          const leftPct = ((pSeg.startMs - minTimeMs) / totalRangeMs) * 100;
                          const widthPct = Math.max(6, ((pSeg.endMs - pSeg.startMs) / totalRangeMs) * 100);

                          const rec = caseData?.recoveries ? caseData.recoveries[seg.id] : null;

                          let blockStyle = "bg-slate-100 text-slate-800 border-slate-300";
                          let statusLabel = seg.status;

                          if (rec) {
                            if (rec.status === "success") {
                              blockStyle = "bg-sky-600 text-white border-sky-700 shadow-2xs";
                              statusLabel = "Recovered";
                            } else if (rec.status === "failed") {
                              blockStyle = "bg-rose-100 text-rose-800 border-rose-300";
                              statusLabel = "Failed";
                            }
                          } else if (seg.deleted || seg.corrupted) {
                            blockStyle = "bg-amber-50 text-amber-900 border-dashed border-amber-300";
                            statusLabel = "Pending";
                          }

                          const isAnchorA = anchorSlotA?.id === seg.id;
                          const isAnchorB = anchorSlotB?.id === seg.id;

                          return (
                            <div
                              key={seg.id}
                              onClick={() => setSelectedSegment(seg)}
                              style={{
                                left: `${Math.max(0, Math.min(92, leftPct))}%`,
                                width: `${Math.min(100 - leftPct, widthPct)}%`,
                              }}
                              className={`absolute top-1 bottom-1 rounded border px-2 py-1 flex items-center justify-between text-[10px] font-mono cursor-pointer transition-all hover:scale-[1.02] hover:z-10 ${blockStyle} ${
                                isAnchorA || isAnchorB ? "ring-2 ring-sky-500 font-bold" : ""
                              }`}
                              title={`Click to inspect ${seg.id}`}
                            >
                              <span className="font-bold truncate">{seg.id}</span>
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

        {/* SEGMENT INSPECTION MODAL */}
        {selectedSegment && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setSelectedSegment(null)}
          >
            <div
              className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-mono">{selectedSegment.id}</h3>
                  <p className="text-xs text-slate-500">{selectedSegment.channel}</p>
                </div>
                <button
                  onClick={() => setSelectedSegment(null)}
                  className="text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Start Time:</span>
                    <span className="text-slate-900">{selectedSegment.start}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">End Time:</span>
                    <span className="text-slate-900">{selectedSegment.end}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Size:</span>
                    <span className="text-slate-900">{formatBytes(selectedSegment.sizeBytes)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Status Badge:</span>
                  <Badge label={selectedSegment.status} />
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center space-y-1">
                  <Film className="w-5 h-5 text-slate-400 mx-auto" />
                  <span className="text-[11px] font-semibold text-slate-700 block">Stream Fragment Selected</span>
                  <p className="text-[10px] text-slate-500 italic">
                    Fragment available for manual cross-camera anchor pairing below.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setAnchorSlotA(selectedSegment);
                      setSelectedSegment(null);
                    }}
                    className="flex-1 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 text-[11px] font-semibold rounded-lg border border-sky-200 transition-colors"
                  >
                    Set as Anchor Slot A
                  </button>
                  <button
                    onClick={() => {
                      setAnchorSlotB(selectedSegment);
                      setSelectedSegment(null);
                    }}
                    className="flex-1 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 text-[11px] font-semibold rounded-lg border border-sky-200 transition-colors"
                  >
                    Set as Anchor Slot B
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function parseISTTimestamp(dateStr) {
  if (!dateStr) return Date.now();
  try {
    const cleanStr = dateStr.replace(" IST", "");
    return new Date(cleanStr).getTime() || Date.now();
  } catch {
    return Date.now();
  }
}

function formatTimeTick(timeMs) {
  try {
    const d = new Date(timeMs);
    const hrs = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${hrs}:${mins}`;
  } catch {
    return "00:00";
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
