import React, { useMemo } from "react";

/**
 * Large ASCII / Binary Hero Illustration Component.
 * Constructs a Phoenix Shield & Lock silhouette out of raw binary streams,
 * hex addresses, and NAL frame headers, with a central verification-cyan SHA-256 stream.
 */
export function BinaryHeroIllustration() {
  // Generate deterministic binary/hex points for shield silhouette
  const shieldData = useMemo(() => {
    // 16 rows of character streams defining a shield contour
    return [
      { text: "01001100 01101111 01100011 01101011", align: "center", dim: true },
      { text: "10110101 0x7F454C46 01001100 11010101 01000001", align: "center", dim: false },
      { text: "01000011 01010001 [0x00] [0xFF] 01001001 01000011", align: "center", dim: false },
      { text: "11010100 01000101 01000011 01010101 01010010 01000101", align: "center", dim: false },
      { text: "0x44484653 01000001 01010101 01000100 01001001 01010100", align: "center", dim: false },
      { text: "SHA256: e3b0c442 98fc1c14 9afbf4c8 996fb924", align: "center", highlight: true },
      { text: "01010000 01010010 01001111 01010110 01000101 01001110", align: "center", dim: false },
      { text: "0x57465334 01000001 01010100 01000001 01000011 01001000", align: "center", dim: false },
      { text: "11010110 01000011 01000001 01010010 01010110 01000101", align: "center", dim: false },
      { text: "01000110 01010010 01000001 01001101 01000101 01010011", align: "center", dim: false },
      { text: "0x0012D4B5 01000001 01010101 01000100 01001001 01010100", align: "center", dim: false },
      { text: "10110101 01001100 01001111 01000011 01001011 01010011", align: "center", dim: false },
      { text: "01000011 01001000 01000001 01001001 01001110", align: "center", dim: false },
      { text: "01010011 01000101 01000011 00110110 00110011", align: "center", dim: false },
      { text: "0x3FA9C8 01000001 01010101 01000100", align: "center", dim: true },
      { text: "01001100 01101111 01100011 01101011", align: "center", dim: true }
    ];
  }, []);

  return (
    <div className="relative w-full h-full min-h-[260px] md:min-h-[320px] flex items-center justify-center p-2 overflow-hidden select-none">
      <style>{`
        @keyframes scanlineAssemble {
          0% { clip-path: inset(0 0 100% 0); opacity: 0.2; }
          100% { clip-path: inset(0 0 0 0); opacity: 1; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-scanline { animation: none !important; clip-path: none !important; opacity: 1 !important; }
          .animate-glow { animation: none !important; }
        }
        .animate-scanline {
          animation: scanlineAssemble 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-glow {
          animation: pulseGlow 3.5s ease-in-out infinite;
        }
      `}</style>

      {/* Background Radial Glow */}
      <div className="absolute w-72 h-72 bg-sky-100/70 rounded-full blur-3xl pointer-events-none" />

      {/* SVG Shield Framing & Matrix Layout */}
      <div className="relative z-10 w-full max-w-lg bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-lg animate-scanline font-mono text-[10px] sm:text-[11px] leading-tight text-slate-400">
        
        {/* Shield Header Overlay */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 text-[10px] text-slate-400 font-sans tracking-wide">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-200">RAW IMAGE SUBSTRATE</span>
          </div>
          <span className="font-mono text-sky-400 text-[10px]">DHFS / WFS / NAL CARVER</span>
        </div>

        {/* Binary / ASCII Character Matrix Grid */}
        <div className="space-y-1 my-2">
          {shieldData.map((row, idx) => {
            if (row.highlight) {
              return (
                <div
                  key={idx}
                  className="my-1.5 py-1 px-2 rounded-md bg-sky-950/80 border border-sky-500/50 text-sky-300 font-bold text-center tracking-wider text-[11px] sm:text-xs shadow-inner animate-glow flex items-center justify-between"
                >
                  <span className="text-sky-400 font-semibold">[VERIFIED HASH]</span>
                  <span className="font-mono text-sky-200">{row.text}</span>
                  <span className="text-emerald-400 text-[9px] px-1 bg-emerald-950/60 rounded border border-emerald-500/40">SHA-256</span>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className={`text-center tracking-widest transition-opacity duration-300 ${
                  row.dim ? "text-slate-600/70" : "text-slate-300/90"
                }`}
              >
                {row.text}
              </div>
            );
          })}
        </div>

        {/* Footer Substrate Line */}
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 mt-3 text-[9px] text-slate-500 font-mono">
          <span>OFFSET: 0x0004F200</span>
          <span>ENTROPY: 7.98 (COMPRESSED STREAM)</span>
          <span className="text-sky-400">STATE: LOCK_VERIFIED</span>
        </div>
      </div>
    </div>
  );
}
