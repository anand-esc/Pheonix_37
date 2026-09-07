import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCases } from "../api";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { ForensicPipelineDiagram } from "../components/ForensicPipelineDiagram";
import {
  Shield, FolderOpen, Plus, ArrowRight, HardDrive, Cpu,
  FileCheck, Activity, Zap, Lock, FileSpreadsheet, Video,
} from "lucide-react";

export function LandingPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getCases().then((data) => {
      if (isMounted) {
        setCases(data || []);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  const totalCases = cases.length;
  const statusCounts = {
    Intake: cases.filter((c) => c.status === "Intake").length,
    Processing: cases.filter((c) => c.status === "Processing").length,
    Recovered: cases.filter((c) => c.status === "Recovered").length,
    Reported: cases.filter((c) => c.status === "Reported").length,
  };
  const casesWithEvidence = cases.filter((c) => c.hasEvidence).length;
  const recentCases = cases.slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Hero Section */}
      <div className="data-panel p-6 sm:p-8 relative overflow-hidden space-y-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent-cyan)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[var(--accent-cyan-dim)] border border-[rgba(62,214,196,0.2)] text-[var(--accent-cyan)] text-xs font-semibold tracking-tight">
            <Shield className="w-3.5 h-3.5" />
            <span>Phoenix Forensic Toolkit • NTRO SIH 2026</span>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="font-mono text-[11px]">v0.2.0 Desktop</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            DVR / NVR Forensic Evidence Recovery Engine
          </h1>

          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            Transform corrupted, formatted, or unallocated surveillance hard drives into carved video streams, frame-accurate timelines, and verified BSA Section 63 chain-of-custody documentation.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono">
              <Zap className="w-3.5 h-3.5 text-[var(--accent-amber)]" /> Vendor-Agnostic DVR Parsing
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono">
              <Lock className="w-3.5 h-3.5 text-[var(--accent-cyan)]" /> SHA-256 Bit-Stream Lock
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#818CF8]" /> BSA Sec 63 Compliance Logs
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-mono">
              <Video className="w-3.5 h-3.5 text-[var(--accent-green)]" /> Frame-Accurate NAL Carver
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3">
            <button
              onClick={() => navigate("/cases")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded bg-[var(--accent-cyan)] text-[var(--bg-deep)] font-semibold text-sm transition-all cursor-pointer hover:opacity-90 font-mono"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Open Case Dashboard</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

            <button
              onClick={() => navigate("/cases?new=true")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] font-semibold text-sm transition-all cursor-pointer hover:border-[var(--accent-cyan)] font-mono"
            >
              <Plus className="w-4 h-4 text-[var(--text-muted)]" />
              <span>Create New Case</span>
            </button>
          </div>
        </div>

        <div className="pt-4 relative z-10">
          <ForensicPipelineDiagram />
        </div>
      </div>

      {/* Live System Metrics Cards — shrunk, less visual weight */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded p-3.5">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
            <span className="text-[11px] font-mono">Total Cases</span>
            <FolderOpen className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)]">{loading ? "..." : totalCases}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">Active forensic dockets</div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded p-3.5">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
            <span className="text-[11px] font-mono">Acquired Raw Images</span>
            <HardDrive className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </div>
          <div className="text-lg font-bold text-[var(--accent-cyan)]">{loading ? "..." : casesWithEvidence}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">SHA-256 locked image dumps</div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded p-3.5">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
            <span className="text-[11px] font-mono">Stream Recoveries</span>
            <Cpu className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </div>
          <div className="text-lg font-bold text-[var(--accent-green)]">{loading ? "..." : statusCounts.Recovered}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">Carved NAL keyframe streams</div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded p-3.5">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
            <span className="text-[11px] font-mono">BSA Sec 63 Reports</span>
            <FileCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)]">{loading ? "..." : statusCounts.Reported}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">Draft compliance certificates</div>
        </div>
      </div>

      {/* Recent Cases */}
      <div className="data-panel p-6">
        <SectionHeading
          title="Recent Active Cases"
          subtitle="Direct entry into evidence acquisition, carving, and timeline analysis"
          icon={Activity}
          actions={
            <button
              onClick={() => navigate("/cases")}
              className="text-[11px] font-semibold text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] inline-flex items-center gap-1 cursor-pointer bg-transparent border-none font-mono"
            >
              <span>View All ({totalCases})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        />

        {loading ? (
          <div className="py-8 text-center text-[11px] text-[var(--text-muted)] font-mono">Loading cases...</div>
        ) : recentCases.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-[var(--text-muted)] font-mono">No active cases found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {recentCases.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(c.hasEvidence ? `/cases/${c.id}/analysis` : `/cases/${c.id}/evidence`)}
                className="group p-4 rounded border border-[var(--border)] hover:border-[var(--accent-cyan)] bg-[var(--bg-deep)] hover:bg-[var(--bg-panel)] transition-all cursor-pointer flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-mono font-medium text-[var(--text-muted)] block mb-0.5">{c.id}</span>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] transition-colors">{c.name}</h3>
                  </div>
                  <Badge label={c.status} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] border-t border-[var(--border)] pt-2.5 mt-1">
                  <span>Examiner: <strong className="font-medium text-[var(--text-secondary)]">{c.examiner}</strong></span>
                  <span className="text-[var(--accent-cyan)] font-mono font-medium inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    {c.hasEvidence ? "Open Analysis" : "Intake Evidence"}
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}