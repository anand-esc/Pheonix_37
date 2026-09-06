import React from "react";
import { HardDrive, Cpu, ShieldCheck, FileText, ArrowRight, Lock, CheckCircle2, Video } from "lucide-react";

/**
 * Interactive Forensic Pipeline Flow Diagram for Judges & Evaluators.
 * Visualizes the 3-step transformation:
 * Raw Damaged DVR Drive (DHFS/WFS) -> Phoenix Stream Carver (SHA-256) -> BSA Sec 63 Legal Audit Certificate.
 */
export function ForensicPipelineDiagram() {
  return (
    <div className="w-full bg-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute -top-16 -left-16 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-semibold tracking-wider text-slate-300 uppercase">
            Forensic Data Pipeline Architecture
          </span>
        </div>
        <span className="text-[11px] font-mono text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60">
          NTRO SIH 2026 • Live Engine
        </span>
      </div>

      {/* 3-Step Visual Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
        
        {/* Step 1: Raw Evidence Input */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-sky-500/50 transition-all group">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-slate-700/70 border border-slate-600/80 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
              <HardDrive className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
              STEP 01
            </span>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-1.5">
              <span>Raw Storage Disk</span>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/50">Unallocated</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Direct physical bit-stream image acquisition from unmapped DVR/NVR drives (DHFS, WFS, HIK).
            </p>
          </div>

          <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800 font-mono text-[10px] space-y-1 text-slate-400">
            <div className="flex justify-between">
              <span>Magic Bytes:</span>
              <span className="text-sky-300">0x44484653</span>
            </div>
            <div className="flex justify-between">
              <span>Entropy:</span>
              <span className="text-emerald-400">7.98 (Encrypted stream)</span>
            </div>
          </div>
        </div>

        {/* Arrow connector 1 for Desktop */}
        <div className="hidden md:flex absolute left-[31%] top-1/2 -translate-y-1/2 z-20 items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-sky-950 border border-sky-500/40 text-sky-400 flex items-center justify-center shadow-lg animate-pulse">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Step 2: Phoenix Processing Core */}
        <div className="bg-slate-800/80 border border-sky-500/40 rounded-xl p-4 flex flex-col justify-between space-y-4 shadow-lg shadow-sky-950/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/10 rounded-full blur-xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div className="w-10 h-10 rounded-lg bg-sky-900/80 border border-sky-600/80 flex items-center justify-center text-sky-300 group-hover:scale-105 transition-transform">
              <Cpu className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
              STEP 02
            </span>
          </div>

          <div className="relative z-10">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
              <span>Phoenix Carving Engine</span>
              <Lock className="w-3.5 h-3.5 text-sky-400" />
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Deep NAL unit parsing, frame boundary reconstruction, and live cryptographic SHA-256 hash lock.
            </p>
          </div>

          <div className="bg-sky-950/90 rounded-lg p-2.5 border border-sky-800/80 font-mono text-[10px] space-y-1 text-sky-200 relative z-10">
            <div className="flex justify-between items-center">
              <span>NAL Units:</span>
              <span className="text-emerald-300 font-bold">14,280 Parsed</span>
            </div>
            <div className="flex justify-between items-center">
              <span>SHA-256:</span>
              <span className="text-sky-300 truncate max-w-[120px]">e3b0c442...996f</span>
            </div>
          </div>
        </div>

        {/* Arrow connector 2 for Desktop */}
        <div className="hidden md:flex absolute right-[31%] top-1/2 -translate-y-1/2 z-20 items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-sky-950 border border-sky-500/40 text-sky-400 flex items-center justify-center shadow-lg animate-pulse">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Step 3: Verified Output & Legal Compliance */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-indigo-500/50 transition-all group">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-indigo-950/80 border border-indigo-700/80 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
              STEP 03
            </span>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-1.5">
              <span>BSA Sec 63 Report</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Verified video playback timeline and automated chain-of-custody draft compliance certificates.
            </p>
          </div>

          <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800 font-mono text-[10px] space-y-1 text-slate-300">
            <div className="flex justify-between items-center">
              <span>Video Playback:</span>
              <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                <Video className="w-3 h-3" /> Synchronized
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Chain Status:</span>
              <span className="text-indigo-300 font-semibold">BSA Sec 63 Draft Ready</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer Banner */}
      <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span>Vendor-Agnostic DVR/NVR Reconstruction</span>
        </div>
        <div className="text-slate-500">
          Zero-bit modification guarantee • SHA-256 Hash Locked
        </div>
      </div>
    </div>
  );
}
