import React, { useMemo } from "react";

export function BinaryHeroIllustration() {
  const shieldData = useMemo(() => {
    return [
      { text: "01001100 01101111 01100011 01101011", align: "center", dim: true },
      { text: "10110101 0x7F454C46 01001100 11010101 01000001", align: "center", dim: false },
      { text: "01000011 01010000 [0x00] [0xFF] 01001001 01000011", align: "center", dim: false },
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
      { text: "01001100 01101111 01100011 01101011", align: "center", dim: true },
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
        .animate-scanline { animation: scanlineAssemble 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-glow { animation: pulseGlow 3.5s ease-in-out infinite; }
      `}</style>

      <div className="relative z-10 w-full max-w-lg bg-phx-deep border border-phx-border rounded p-4 sm:p-5 font-mono text-[10px] sm:text-[11px] leading-tight text-phx-muted">
        <div className="flex items-center justify-between border-b border-phx-border pb-2 mb-3 text-[10px] text-phx-muted font-sans tracking-wide">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-phx-green" />
            <span className="font-semibold text-phx-secondary">RAW IMAGE SUBSTRATE</span>
          </div>
          <span className="font-mono text-phx-cyan text-[10px]">DHFS / WFS / NAL CARVER</span>
        </div>

        <div className="space-y-1 my-2">
          {shieldData.map((row, idx) => {
            if (row.highlight) {
              return (
                <div
                  key={idx}
                  className="my-1.5 py-1 px-2 rounded bg-phx-deep border border-phx-cyan/30 text-phx-cyan font-bold text-center tracking-wider text-[11px] sm:text-xs shadow-inner animate-glow flex items-center justify-between"
                >
                  <span className="text-phx-muted font-semibold">[VERIFIED HASH]</span>
                  <span className="font-mono text-phx-cyan">{row.text}</span>
                  <span className="text-phx-green text-[9px] px-1 bg-[var(--accent-green-dim)] rounded border border-[rgba(52,211,153,0.2)]">SHA-256</span>
                </div>
              );
            }
            return (
              <div
                key={idx}
                className={`text-center tracking-widest ${row.dim ? "text-phx-muted/50" : "text-phx-secondary/70"}`}
              >
                {row.text}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-phx-border pt-2 mt-3 text-[9px] text-phx-muted font-mono">
          <span>OFFSET: 0x0004F200</span>
          <span>ENTROPY: 7.98 (COMPRESSED STREAM)</span>
          <span className="text-phx-cyan">STATE: LOCK_VERIFIED</span>
        </div>
      </div>
    </div>
  );
}