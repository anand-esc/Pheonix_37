import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, AlertCircle, Activity, Video, ShieldCheck, Database, LayoutList, PieChart as PieChartIcon, BarChart2 } from "lucide-react";
import { getCase, getCaseFragments } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';

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

  const { channelGroups, parsedTimeSegments, minTimeMs, maxTimeMs, totalRangeMs, majorTicks, minorTicks, stats, methodData, channelChartData } = useMemo(() => {
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

    const majorTicks = Array.from({ length: 11 }, (_, i) => ({
      label: formatTimeTick(minTimeMs + (totalRangeMs / 10) * i),
      pct: i * 10,
    }));
    const minorTicks = Array.from({ length: 10 }, (_, i) => ({
      pct: i * 10 + 5,
    }));

    // Calculate stats
    let totalDuration = 0;
    let validatedCount = 0;
    let fallbackCount = 0;
    let maxConfidence = 0;

    const methodCounts = { Validated: 0, 'Generic Fallback': 0, 'Research Target': 0, Unknown: 0 };
    const channelDurations = {};

    fragments.forEach(f => {
      totalDuration += (f.duration || 0);
      maxConfidence = Math.max(maxConfidence, f.confidence_score || 0);
      
      const channel = f.metadata?.channel || "unattributed";
      if (!channelDurations[channel]) channelDurations[channel] = 0;
      channelDurations[channel] += (f.duration || 0);

      let methodGroup = 'Unknown';
      if (f.recovery_method?.includes('VALIDATED') || f.recovery_method === 'DHAV_PARSER') {
        validatedCount++;
        methodGroup = 'Validated';
      } else if (f.recovery_method?.includes('GENERIC') || f.recovery_method === 'annexb_nal_carve') {
        fallbackCount++;
        methodGroup = 'Generic Fallback';
      } else if (f.recovery_method?.includes('RESEARCH')) {
        methodGroup = 'Research Target';
      }
      methodCounts[methodGroup]++;
    });

    const stats = {
      totalFragments: fragments.length,
      totalChannels: Object.keys(channelGroups).length,
      durationLabel: `${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s`,
      avgConfidence: maxConfidence,
      validatedPct: fragments.length ? Math.round((validatedCount / fragments.length) * 100) : 0
    };

    const COLORS = {
      Validated: '#f59e0b',
      'Generic Fallback': '#22c55e',
      'Research Target': '#1f2937',
      Unknown: '#9ca3af'
    };

    const methodData = Object.entries(methodCounts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name, value, color: COLORS[name] }));

    const channelChartData = Object.entries(channelDurations).map(([name, duration]) => ({
      name,
      duration: Number((duration / 60).toFixed(1)) // in minutes
    }));

    return { channelGroups, parsedTimeSegments, minTimeMs, maxTimeMs, totalRangeMs, majorTicks, minorTicks, stats, methodData, channelChartData };
  }, [fragments]);

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
        title={caseData?.name || caseData?.title || `Case ${id}`}
        status={statusMap[caseData?.status] || "pending"}
        statusLabel={caseData?.status}
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3 shadow-sm">
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
        <div className="space-y-6">
          {/* STATS OVERVIEW */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard icon={Video} label="Recovered Fragments" value={stats.totalFragments} />
            <StatCard icon={Activity} label="Total Duration" value={stats.durationLabel} />
            <StatCard icon={ShieldCheck} label="Validated Methods" value={`${stats.validatedPct}%`} />
            <StatCard icon={Database} label="Video Channels" value={stats.totalChannels} />
          </div>

          {/* CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-phx-border rounded-lg shadow-sm p-5">
              <h3 className="text-sm font-semibold text-phx-primary mb-4 flex items-center gap-2">
                <PieChartIcon size={16} className="text-phx-secondary"/> Recovery Methods
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={methodData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {methodData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-phx-border rounded-lg shadow-sm p-5">
              <h3 className="text-sm font-semibold text-phx-primary mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-phx-secondary"/> Channel Duration (Minutes)
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChartData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip cursor={{fill: '#f3f4f6'}} content={<CustomTooltip />} />
                    <Bar dataKey="duration" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TIMELINE TRACKS */}
          <div className="bg-white border border-phx-border rounded-lg shadow-sm flex flex-col mt-6">
            <div className="px-6 py-4 border-b border-phx-border bg-phx-surface flex justify-between items-center rounded-t-lg">
              <h3 className="text-sm font-semibold text-phx-primary flex items-center gap-2">
                <LayoutList size={16} className="text-phx-red"/> Synchronized Fragment Timeline
              </h3>
              <div className="flex gap-4 text-xs">
                <LegendItem color="#f59e0b" label="Validated" />
                <LegendItem color="#22c55e" label="Generic Fallback" />
                <LegendItem color="#1f2937" label="Research Target" />
              </div>
            </div>
            
            <div className="relative flex bg-phx-surface rounded-b-lg overflow-hidden border-t border-white">
              {/* Left sidebar for channel names */}
              <div className="w-56 shrink-0 border-r border-phx-border bg-white z-20 flex flex-col shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                <div className="h-10 border-b border-phx-border bg-gray-50 flex items-center px-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Channels</span>
                </div>
                {Object.keys(channelGroups).map(channel => (
                  <div key={channel} className="h-16 border-b border-gray-100 flex items-center px-4 justify-between bg-white group hover:bg-gray-50 transition-colors">
                    <span className="font-semibold text-xs text-phx-primary truncate pr-2" title={channel}>{channel}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{channelGroups[channel].length}</span>
                  </div>
                ))}
              </div>

              {/* Right side for tracks (scrollable horizontally) */}
              <div className="flex-1 overflow-x-auto relative min-h-[300px]" style={{ minWidth: 0 }}>
                <div className="min-w-[800px] h-full flex flex-col">
                  {/* Time Axis Header */}
                  <div className="h-10 border-b border-phx-border bg-gray-50 relative sticky top-0 z-10">
                     {majorTicks.map(t => (
                        <div key={t.pct} className="absolute top-0 bottom-0 border-l border-gray-300 flex flex-col justify-end pb-1" style={{ left: t.pct === 100 ? 'calc(100% - 1px)' : `${t.pct}%` }}>
                           <span 
                             className="absolute bottom-2 text-[10px] font-mono text-gray-500 bg-gray-50 px-1 whitespace-nowrap"
                             style={{ transform: t.pct === 0 ? 'translateX(0)' : t.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}
                           >
                             {t.label}
                           </span>
                           <div className="w-px h-1.5 bg-gray-400 absolute bottom-0 left-0 -ml-px" />
                        </div>
                     ))}
                     {minorTicks.map(t => (
                        <div key={t.pct} className="absolute bottom-0 w-px h-1 bg-gray-300" style={{ left: `${t.pct}%` }} />
                     ))}
                  </div>

                  {/* Tracks */}
                  <div className="relative flex-1 bg-white">
                    {/* Background grid lines */}
                    {majorTicks.map(t => (
                      <div key={t.pct} className="absolute top-0 bottom-0 w-px bg-gray-100 z-0 pointer-events-none" style={{ left: `${t.pct}%` }} />
                    ))}
                    {minorTicks.map(t => (
                      <div key={t.pct} className="absolute top-0 bottom-0 w-px bg-gray-50 z-0 pointer-events-none" style={{ left: `${t.pct}%` }} />
                    ))}

                    {Object.entries(channelGroups).map(([channel, frags]) => (
                      <div key={channel} className="h-16 border-b border-gray-100 relative z-10 hover:bg-blue-50/30 transition-colors group">
                        {frags.map(frag => {
                          const pSeg = parsedTimeSegments.find((p) => p.fragment_id === frag.fragment_id);
                          const leftPct = pSeg && pSeg.startMs > 0 ? ((pSeg.startMs - minTimeMs) / totalRangeMs) * 100 : 0;
                          const widthPct = pSeg && pSeg.endMs > pSeg.startMs ? Math.max(0.5, ((pSeg.endMs - pSeg.startMs) / totalRangeMs) * 100) : 0.5;

                          let bgColor = 'linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%)';
                          let borderColor = '#d1d5db';
                          
                          if (frag.recovery_method?.includes('VALIDATED') || frag.recovery_method === 'DHAV_PARSER') {
                            bgColor = 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)';
                            borderColor = '#d97706';
                          } else if (frag.recovery_method?.includes('GENERIC') || frag.recovery_method === 'annexb_nal_carve') {
                            bgColor = 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)';
                            borderColor = '#16a34a';
                          } else if (frag.recovery_method?.includes('RESEARCH')) {
                            bgColor = 'linear-gradient(180deg, #374151 0%, #1f2937 100%)';
                            borderColor = '#111827';
                          }

                          return (
                            <div
                              key={frag.fragment_id}
                              className="absolute top-2 bottom-2 rounded-sm cursor-pointer shadow-sm hover:shadow-md hover:scale-y-[1.1] hover:z-20 transition-all group/frag"
                              style={{
                                left: `${Math.max(0, Math.min(99.5, leftPct))}%`,
                                width: `${Math.min(100 - leftPct, widthPct)}%`,
                                background: bgColor,
                                border: `1px solid ${borderColor}`,
                              }}
                            >
                              <div className="hidden group-hover/frag:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-900 text-white text-[10px] p-2 rounded shadow-xl z-50 pointer-events-none">
                                <p className="font-bold border-b border-gray-700 pb-1 mb-1">{frag.fragment_id}</p>
                                <p><span className="text-gray-400">Method:</span> {frag.recovery_method}</p>
                                <p><span className="text-gray-400">Confidence:</span> {((frag.confidence_score || 0) * 100).toFixed(0)}%</p>
                                <p><span className="text-gray-400">Duration:</span> {frag.duration}s</p>
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