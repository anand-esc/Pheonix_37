import React from "react";
import { HardDrive, Cpu, ShieldCheck, FileText, ArrowRight, Lock, CheckCircle2, Video } from "lucide-react";

export function ForensicPipelineDiagram() {
  return (
    <div className="w-full bg-phx-deep rounded border border-phx-border text-white relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute -top-16 -left-16 w-48 h-48 bg-phx-cyan/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-phx-cyan/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-phx-border pb-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-phx-green" />
          <span className="text-[11px] font-mono font-semibold tracking-wider text-phx-secondary uppercase">
            Forensic Data Pipeline Architecture
          </span>
        </div>
        <span className="text-[11px] font-mono text-phx-cyan bg-phx-cyan/10 px-2 py-0.5 rounded border border-phx-cyan/20">
          NTRO SIH 2026 • Live Engine
        </span>
      </div>

      {/* 3-Step Visual Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
        {/* Step 1 */}
        <div className="bg-phx-panel border border-phx-border rounded p-4 flex flex-col justify-between space-y-4 hover:border-phx-cyan/30 transition-all group">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded bg-phx-deep border border-phx-border flex items-center justify-center text-phx-cyan group-hover:scale-105 transition-transform">
              <HardDrive className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-phx-muted">STEP 01</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-phx-primary mb-1 flex items-center gap-1.5">
              <span>Raw Storage Disk</span>
              <span className="text-[10px] font-mono text-phx-amber bg-phx-amber/10 px-1.5 py-0.2 rounded border border-[rgba(240,169,58,0.2)]">Unallocated</span>
            </h3>
            <p className="text-[11px] text-phx-secondary leading-relaxed">
              Direct physical bit-stream image acquisition from unmapped DVR/NVR drives (DHFS, WFS, HIK).
            </p>
          </div>
          <div className="bg-phx-deep rounded p-2.5 border border-phx-border font-mono text-[10px] space-y-1 text-phx-muted">
            <div className="flex justify-between">
              <span>Magic Bytes:</span>
              <span className="text-phx-cyan">0x44484653</span>
            </div>
            <div className="flex justify-between">
              <span>Entropy:</span>
              <span className="text-phx-green">7.98 (Encrypted stream)</span>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-phx-panel border border-phx-cyan/20 rounded p-4 flex flex-col justify-between space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-phx-cyan/5 rounded-full blur-xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div className="w-10 h-10 rounded bg-phx-deep border border-phx-cyan/30 flex items-center justify-center text-phx-cyan group-hover:scale-105 transition-transform">
              <Cpu className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-phx-cyan">STEP 02</span>
          </div>

          <div className="relative z-10">
            <h3 className="text-sm font-bold text-phx-primary mb-1 flex items-center gap-1.5">
              <span>Phoenix Carving Engine</span>
              <Lock className="w-3.5 h-3.5 text-phx-cyan" />
            </h3>
            <p className="text-[11px] text-phx-secondary leading-relaxed">
              Deep NAL unit parsing, frame boundary reconstruction, and live cryptographic SHA-256 hash lock.
            </p>
          </div>

          <div className="bg-phx-deep rounded p-2.5 border border-phx-cyan/20 font-mono text-[10px] space-y-1 text-phx-cyan relative z-10">
            <div className="flex justify-between items-center">
              <span>NAL Units:</span>
              <span className="text-phx-green font-bold">14,280 Parsed</span>
            </div>
            <div className="flex justify-between items-center">
              <span>SHA-256:</span>
              <span className="truncate max-w-[120px]">e3b0c442...996f</span>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-phx-panel border border-phx-border rounded p-4 flex flex-col justify-between space-y-4 hover:border-[rgba(129,140,248,0.3)] transition-all group">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded bg-phx-deep border border-phx-border flex items-center justify-center text-[#818CF8] group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-[#818CF8]">STEP 03</span>
          </div>

          <div>
            <h3 className="text-sm font-bold text-phx-primary mb-1 flex items-center gap-1.5">
              <span>BSA Sec 63 Report</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-phx-green" />
            </h3>
            <p className="text-[11px] text-phx-secondary leading-relaxed">
              Verified video playback timeline and automated chain-of-custody draft compliance certificates.
            </p>
          </div>

          <div className="bg-phx-deep rounded p-2.5 border border-phx-border font-mono text-[10px] space-y-1 text-phx-secondary">
            <div className="flex justify-between items-center">
              <span>Video Playback:</span>
              <span className="text-phx-green font-semibold inline-flex items-center gap-1">
                <Video className="w-3 h-3" /> Synchronized
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Chain Status:</span>
              <span className="text-[#818CF8] font-semibold">BSA Sec 63 Draft Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-3 border-t border-phx-border flex flex-col sm:flex-row items-center justify-between text-[11px] text-phx-muted gap-2 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-phx-cyan" />
          <span>Vendor-Agnostic DVR/NVR Reconstruction</span>
        </div>
        <div className="text-phx-muted">
          Zero-bit modification guarantee • SHA-256 Hash Locked
        </div>
      </div>
    </div>
  );
}