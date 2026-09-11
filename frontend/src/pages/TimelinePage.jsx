import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Clock, Loader2, AlertCircle, Activity, Video, ShieldCheck, Database,
  LayoutList, PieChart as PieChartIcon, BarChart2,
} from "lucide-react";
import { getCase, getCaseFragments, getCaseTimeline, formatSeconds } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

const METHOD_COLORS = {
  "Generic carve": "#22c55e",
  "Vendor parser": "#f59e0b",
  Unknown: "#9ca3af",
};

function methodGroup(recoveryMethod) {
  if (!recoveryMethod) return "Unknown";
  return recoveryMethod === "annexb_nal_carve" ? "Generic carve" : "Vendor parser";
}

/**
 * Timeline of recovered fragments. Positions come from the backend Timeline:
 * each fragment has a probable channel (shared encoder parameters), an
 * estimated duration (frame count / fps) and a relative start within its
 * channel. There is no wall-clock time in a raw bitstream, so the axis is
 * seconds from the start of each channel, not time of day.
 */
export function TimelinePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();
  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [timeline, setTimeline] = useState({ entries: [], channels: [], notes: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [c, frags, tl] = await Promise.all([
          getCase(id),
          getCaseFragments(id),
          getCaseTimeline(id).catch(() => ({ entries: [], channels: [], notes: [] })),
        ]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
          setTimeline(tl || { entries: [], channels: [], notes: [] });
        }
      } catch (err) {
        console.error("Failed to load timeline data", err);
        if (isMounted) setError(err.message || "Failed to load timeline data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [id]);

  const view = useMemo(() => {
    const entryByFragment = new Map((timeline.entries || []).map((e) => [e.fragment_id, e]));
    const segments = fragments.map((f, idx) => {
      const e = entryByFragment.get(f.fragment_id);
      const start = e?.relative_start_seconds ?? 0;
      const duration = e?.estimated_seconds ?? 0;
      return {
        ...f,
        index: idx,
        channel: e?.channel_id || "unattributed",
        start,
        duration,
        end: start + duration,
        fps: e?.fps ?? null,
        durationBasis: e?.duration_basis || "unknown",
        complete: e?.complete ?? false,
        method: methodGroup(f.recovery_method),
      };
    });

    const channelGroups = {};
    for (const s of segments) (channelGroups[s.channel] ||= []).push(s);

    const totalSeconds = Math.max(1, ...segments.map((s) => s.end));
    const majorTicks = Array.from({ length: 11 }, (_, i) => ({
      label: formatSeconds((totalSeconds / 10) * i),
      pct: i * 10,
    }));
    const minorTicks = Array.from({ length: 10 }, (_, i) => ({ pct: i * 10 + 5 }));

    const methodCounts = {};
    for (const s of segments) methodCounts[s.method] = (methodCounts[s.method] || 0) + 1;
    const methodData = Object.entries(methodCounts).map(([name, value]) => ({
      name,
      value,
      color: METHOD_COLORS[name] || METHOD_COLORS.Unknown,
    }));

    const channelChartData = (timeline.channels || []).map((c) => ({
      name: c.channel_id,
      seconds: Math.round(c.estimated_seconds || 0),
      resolution: c.resolution,
    }));
    if (channelChartData.length === 0 && segments.length > 0) {
      channelChartData.push({
        name: "unattributed",
        seconds: Math.round(segments.reduce((a, s) => a + s.duration, 0)),
      });
    }

    const completeCount = segments.filter((s) => s.complete).length;
    const stats = {
      totalFragments: segments.length,
      totalChannels: Object.keys(channelGroups).length,
      durationLabel: formatSeconds(segments.reduce((a, s) => a + s.duration, 0)),
      completePct: segments.length ? Math.round((completeCount / segments.length) * 100) : 0,
    };

    return { segments, channelGroups, totalSeconds, majorTicks, minorTicks, methodData, channelChartData, stats };
  }, [fragments, timeline]);

  const statusMap = { Intake: "pending", Processing: "pending", Recovered: "validated", Reported: "validated" };
  const channelInfo = new Map((timeline.channels || []).map((c) => [c.channel_id, c]));

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
        caseId={caseData?.id || id}
        title={caseData?.name || `Case ${id}`}
        status={statusMap[caseData?.status] || "pending"}
        statusLabel={caseData?.status}
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3 shadow-sm">
        <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Scope note — relative time only</p>
          <p className="text-sm text-amber-700 mt-1">
            A raw bitstream carries no wall-clock time. Channels are probable groupings by encoder
            parameters; durations are frame counts divided by the declared or assumed frame rate;
            positions are seconds from the start of each channel.
          </p>
          {(timeline.notes || []).length > 0 && (
            <ul className="mt-2 text-xs text-amber-700 font-mono list-disc pl-4">
              {timeline.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{error}</div>
      )}

      {isLoading ? (
        <div className="bg-white border border-phx-border rounded-lg p-12 text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-phx-red animate-spin mx-auto mb-4" />
          <div className="text-xs text-phx-muted uppercase tracking-widest">Loading timeline data...</div>
        </div>
      ) : view.segments.length === 0 ? (
        <div className="bg-white border border-phx-border rounded-lg p-12 text-center shadow-sm">
          <Clock size={40} className="text-phx-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-phx-primary mb-2">No Timeline Data</h3>
          <p className="text-sm text-phx-secondary">Run the acquisition pipeline to recover fragments first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard icon={Video} label="Recovered Fragments" value={view.stats.totalFragments} />
            <StatCard icon={Activity} label="Estimated Footage" value={view.stats.durationLabel} />
            <StatCard icon={ShieldCheck} label="Clean End-of-Stream" value={`${view.stats.completePct}%`} />
            <StatCard icon={Database} label="Probable Channels" value={view.stats.totalChannels} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-phx-border rounded-lg shadow-sm p-5">
              <h3 className="text-sm font-semibold text-phx-primary mb-4 flex items-center gap-2">
                <PieChartIcon size={16} className="text-phx-secondary" /> Recovery Methods
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={view.methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {view.methodData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-phx-border rounded-lg shadow-sm p-5">
              <h3 className="text-sm font-semibold text-phx-primary mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-phx-secondary" /> Estimated Seconds per Channel
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={view.channelChartData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <RechartsTooltip cursor={{ fill: "#f3f4f6" }} content={<CustomTooltip />} />
                    <Bar dataKey="seconds" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white border border-phx-border rounded-lg shadow-sm flex flex-col mt-6">
            <div className="px-6 py-4 border-b border-phx-border bg-phx-surface flex justify-between items-center rounded-t-lg">
              <h3 className="text-sm font-semibold text-phx-primary flex items-center gap-2">
                <LayoutList size={16} className="text-phx-red" /> Fragment Timeline (seconds from channel start)
              </h3>
              <div className="flex gap-4 text-xs">
                {Object.entries(METHOD_COLORS).map(([label, color]) => (
                  <LegendItem key={label} color={color} label={label} />
                ))}
              </div>
            </div>

            <div className="relative flex bg-phx-surface rounded-b-lg overflow-hidden border-t border-white">
              <div className="w-64 shrink-0 border-r border-phx-border bg-white z-20 flex flex-col shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                <div className="h-10 border-b border-phx-border bg-gray-50 flex items-center px-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Channels</span>
                </div>
                {Object.keys(view.channelGroups).map((channel) => {
                  const info = channelInfo.get(channel);
                  return (
                    <div key={channel} className="h-16 border-b border-gray-100 flex items-center px-4 justify-between bg-white hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-phx-primary truncate" title={info?.rationale || channel}>{channel}</div>
                        {info && (
                          <div className="text-[10px] text-phx-muted font-mono truncate">
                            {info.codec || "?"} {info.resolution || ""} {info.declared_fps ? `${info.declared_fps} fps` : "fps assumed"}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{view.channelGroups[channel].length}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex-1 overflow-x-auto relative min-h-[300px]" style={{ minWidth: 0 }}>
                <div className="min-w-[800px] h-full flex flex-col">
                  <div className="h-10 border-b border-phx-border bg-gray-50 relative sticky top-0 z-10">
                    {view.majorTicks.map((t) => (
                      <div key={t.pct} className="absolute top-0 bottom-0 border-l border-gray-300 flex flex-col justify-end pb-1" style={{ left: t.pct === 100 ? "calc(100% - 1px)" : `${t.pct}%` }}>
                        <span
                          className="absolute bottom-2 text-[10px] font-mono text-gray-500 bg-gray-50 px-1 whitespace-nowrap"
                          style={{ transform: t.pct === 0 ? "translateX(0)" : t.pct === 100 ? "translateX(-100%)" : "translateX(-50%)" }}
                        >
                          {t.label}
                        </span>
                      </div>
                    ))}
                    {view.minorTicks.map((t) => (
                      <div key={t.pct} className="absolute bottom-0 w-px h-1 bg-gray-300" style={{ left: `${t.pct}%` }} />
                    ))}
                  </div>

                  <div className="relative flex-1 bg-white">
                    {view.majorTicks.map((t) => (
                      <div key={t.pct} className="absolute top-0 bottom-0 w-px bg-gray-100 z-0 pointer-events-none" style={{ left: `${t.pct}%` }} />
                    ))}
                    {Object.entries(view.channelGroups).map(([channel, segs]) => (
                      <div key={channel} className="h-16 border-b border-gray-100 relative z-10 hover:bg-blue-50/30 transition-colors">
                        {segs.map((seg) => {
                          const leftPct = (seg.start / view.totalSeconds) * 100;
                          const widthPct = Math.max(0.5, (seg.duration / view.totalSeconds) * 100);
                          const color = METHOD_COLORS[seg.method] || METHOD_COLORS.Unknown;
                          return (
                            <div
                              key={seg.fragment_id}
                              onClick={() => navigate(`/cases/${id}/video/${seg.index}`)}
                              className="absolute top-2 bottom-2 rounded-sm cursor-pointer shadow-sm hover:shadow-md hover:z-20 transition-all group/frag"
                              style={{
                                left: `${Math.max(0, Math.min(99.5, leftPct))}%`,
                                width: `${Math.min(100 - leftPct, widthPct)}%`,
                                background: color,
                                border: `1px solid ${color}`,
                                opacity: seg.complete ? 1 : 0.7,
                              }}
                            >
                              <div className="hidden group-hover/frag:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-900 text-white text-[10px] p-2 rounded shadow-xl z-50 pointer-events-none">
                                <p className="font-bold border-b border-gray-700 pb-1 mb-1">{seg.fragment_id}</p>
                                <p><span className="text-gray-400">Method:</span> {seg.recovery_method}</p>
                                <p><span className="text-gray-400">Confidence:</span> {((seg.confidence_score || 0) * 100).toFixed(0)}%</p>
                                <p><span className="text-gray-400">Start:</span> {formatSeconds(seg.start)} · <span className="text-gray-400">Duration:</span> {formatSeconds(seg.duration)} ({seg.durationBasis})</p>
                                <p><span className="text-gray-400">End of stream:</span> {seg.complete ? "clean" : "not seen"}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white border border-phx-border p-4 rounded-lg shadow-sm flex items-center gap-4">
      <div className="p-3 bg-phx-surface rounded-md">
        <Icon className="w-6 h-6 text-phx-red" />
      </div>
      <div>
        <p className="text-xs font-medium text-phx-secondary uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-phx-primary">{value}</p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded shadow-lg text-sm">
        <p className="font-semibold mb-1">{label || payload[0].name}</p>
        <p className="text-gray-600">
          Value: <span className="font-medium text-gray-900">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

function LegendItem({ color, label }) {
  return (
    <span className="flex items-center gap-2 px-2.5 py-1 bg-phx-surface rounded border border-phx-border">
      <span className="w-3 h-3 rounded-sm shadow-sm" style={{ background: color }} />
      <span className="text-phx-secondary font-medium">{label}</span>
    </span>
  );
}
