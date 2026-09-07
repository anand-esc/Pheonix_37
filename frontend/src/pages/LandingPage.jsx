import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCases } from "../mockApi";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { TerminalHeroIllustration } from "../components/TerminalHeroIllustration";
import {
  Shield,
  FolderOpen,
  Plus,
  ArrowRight,
  HardDrive,
  Cpu,
  FileCheck,
  Activity,
  Zap,
  Lock,
  FileSpreadsheet,
  Video,
  CheckCircle2
} from "lucide-react";

/**
 * Landing / Home Screen for Phoenix_37 DVR/NVR Forensic Toolkit.
 * Features a high-contrast dot-matrix ASCII terminal hero panel surrounded by a clean,
 * modern light-themed application layout with live system metrics and quick case access.
 */
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
    return () => {
      isMounted = false;
    };
  }, []);

  // Live system metrics calculated from actual cases
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
      
      {/* Hero Section Container (Light Theme Page Wrapper with High-Contrast Dark Terminal Panel) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs relative overflow-hidden space-y-6">
        
        {/* Top Copy Section (Normal Light-Theme Text) */}
        <div className="relative z-10 max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold tracking-tight">
            <Shield className="w-3.5 h-3.5 text-slate-700" />
            <span>Phoenix_37 Forensic Engine</span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-[11px] text-slate-600">v0.2.0 Desktop</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
              Phoenix_37
            </h1>
            <p className="text-base sm:text-lg text-slate-700 font-medium leading-relaxed max-w-3xl">
              Vendor-agnostic DVR/NVR evidence recovery, raw sector format detection, and cryptographic provenance verification.
            </p>
          </div>

          {/* Compliance & Functional Pill Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
              Designed to support BSA Section 63 chain-of-custody requirements
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-xs font-mono">
              <Zap className="w-3.5 h-3.5 text-slate-500" /> DHFS / WFS / Hikvision Raw Carver
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-xs font-mono">
              <Lock className="w-3.5 h-3.5 text-slate-500" /> SHA-256 Bitstream Seal
            </span>
          </div>

          {/* Primary & Secondary Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              onClick={() => navigate("/cases")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold text-sm transition-all shadow-xs hover:shadow-sm cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Open Case Dashboard</span>
              <ArrowRight className="w-4 h-4 ml-1 opacity-80" />
            </button>

            <button
              onClick={() => navigate("/cases?new=true")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-sm transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-500" />
              <span>Create New Case</span>
            </button>
          </div>
        </div>

        {/* ASCII Dot-Matrix Terminal Illustration Panel (Focal Rectangle) */}
        <div className="pt-2 relative z-10">
          <TerminalHeroIllustration />
        </div>
      </div>

      {/* Live System Metrics Cards (Light Theme with Semantic Status Colors) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Total Cases</span>
            <FolderOpen className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{loading ? "..." : totalCases}</div>
          <div className="text-[11px] text-slate-500 mt-1">Active forensic dockets</div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Acquired Raw Images</span>
            <HardDrive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-sky-700">{loading ? "..." : casesWithEvidence}</div>
          <div className="text-[11px] text-slate-500 mt-1">SHA-256 locked image dumps</div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Stream Recoveries</span>
            <Cpu className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{loading ? "..." : statusCounts.Recovered}</div>
          <div className="text-[11px] text-slate-500 mt-1">Carved NAL keyframe streams</div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">BSA Sec 63 Reports</span>
            <FileCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-700">{loading ? "..." : statusCounts.Reported}</div>
          <div className="text-[11px] text-slate-500 mt-1">Draft compliance certificates</div>
        </div>
      </div>

      {/* Recent Cases Quick Access Grid */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
        <SectionHeading
          title="Recent Active Cases"
          subtitle="Direct entry into evidence acquisition, carving, and timeline analysis"
          icon={Activity}
          actions={
            <button
              onClick={() => navigate("/cases")}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({totalCases})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        />

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400 font-mono">Loading cases...</div>
        ) : recentCases.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">No active cases found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {recentCases.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(c.hasEvidence ? `/cases/${c.id}/analysis` : `/cases/${c.id}/evidence`)}
                className="group p-4 rounded-xl border border-slate-200 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-100/50 transition-all cursor-pointer flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono font-medium text-slate-500 block mb-0.5">
                      {c.id}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-black transition-colors">
                      {c.name}
                    </h3>
                  </div>
                  <Badge label={c.status} />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-200/60 pt-2.5 mt-1">
                  <span>Examiner: <strong className="font-medium text-slate-700">{c.examiner}</strong></span>
                  <span className="text-slate-800 font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
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
