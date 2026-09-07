import React, { useMemo } from "react";

/**
 * TerminalHeroIllustration Component
 * 
 * Recreates a classic BBS/DOS-era ASCII art dot-matrix terminal illustration.
 * Features:
 * - Pure monochrome high-contrast dark theme (#000000 / #09090b canvas, white/silver dots).
 * - Stippled / dotted border frame around the panel perimeter.
 * - Monospace ASCII title bar header with texture characters.
 * - Dot-matrix DVR device / camera silhouette (raw media evidence input).
 * - Dot-matrix Shield / Lock silhouette (BSA Sec 63 verified provenance output).
 * - Dashed connector line with flowing dot animation indicating bitstream flow.
 * - Terminal telemetry footer bar.
 * - Scalable pure SVG for high-DPI crisp rendering.
 */
export function TerminalHeroIllustration() {
  const { borderDots, dvrDots, cameraLensDots, shieldDots, connectorDots } = useMemo(() => {
    const width = 840;
    const height = 380;
    const pad = 12;
    const step = 10;

    // 1. Dotted Outer Border Frame
    const borderDotsArr = [];
    for (let x = pad; x <= width - pad; x += step) {
      borderDotsArr.push({ x, y: pad });
      borderDotsArr.push({ x, y: height - pad });
    }
    for (let y = pad + step; y <= height - pad - step; y += step) {
      borderDotsArr.push({ x: pad, y });
      borderDotsArr.push({ x: width - pad, y });
    }

    // 2. Left Shape: DVR Device & Camera Lens Silhouette (Center X: 210, Center Y: 195)
    const dvrDotsArr = [];
    const cameraLensDotsArr = [];
    const dvrCx = 210;
    const dvrCy = 210;

    // Camera Lens Assembly (Concentric Dot Rings)
    const lensCy = 145;
    [6, 14, 22, 30].forEach((r, ringIdx) => {
      const dotCount = Math.max(6, Math.floor(r * 0.75));
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * 2 * Math.PI;
        cameraLensDotsArr.push({
          x: dvrCx + Math.cos(angle) * r,
          y: lensCy + Math.sin(angle) * r,
          opacity: ringIdx === 0 ? 1 : 0.85 - ringIdx * 0.18,
          size: ringIdx === 0 ? 2.2 : 1.6,
        });
      }
    });
    // Lens Center Aperture Dot
    cameraLensDotsArr.push({ x: dvrCx, y: lensCy, opacity: 1, size: 3 });

    // Camera Mount / Stand Dots
    for (let y = 175; y <= 190; y += 5) {
      cameraLensDotsArr.push({ x: dvrCx - 15, y, opacity: 0.7, size: 1.5 });
      cameraLensDotsArr.push({ x: dvrCx + 15, y, opacity: 0.7, size: 1.5 });
    }

    // DVR Chassis Main Box (Stippled Matrix)
    const bx1 = 120;
    const bx2 = 300;
    const by1 = 190;
    const by2 = 250;
    const gridStep = 8;

    for (let x = bx1; x <= bx2; x += gridStep) {
      for (let y = by1; y <= by2; y += gridStep) {
        const isEdge = x === bx1 || x === bx2 || y === by1 || y === by2;
        const isStipple = (Math.round((x - bx1) / gridStep) + Math.round((y - by1) / gridStep)) % 2 === 0;

        if (isEdge) {
          dvrDotsArr.push({ x, y, opacity: 0.95, size: 2 });
        } else if (isStipple) {
          dvrDotsArr.push({ x, y, opacity: 0.45, size: 1.5 });
        }
      }
    }

    // DVR Front Panel Drive Trays & Status Indicators
    // Hard drive slot outlines inside DVR
    [140, 190, 240].forEach((slotX) => {
      for (let x = slotX; x <= slotX + 35; x += 7) {
        dvrDotsArr.push({ x, y: 210, opacity: 0.8, size: 1.5 });
        dvrDotsArr.push({ x, y: 230, opacity: 0.8, size: 1.5 });
      }
      dvrDotsArr.push({ x: slotX + 30, y: 220, opacity: 1, size: 2 }); // Drive LED
    });


    // 3. Right Shape: Shield & Lock Verification Silhouette (Center X: 630, Center Y: 195)
    const shieldDotsArr = [];
    const shieldCx = 630;
    const shieldTopY = 125;
    const shieldBottomY = 265;

    // Helper to test if a point is within the shield outline
    function isInsideShield(x, y) {
      const dx = Math.abs(x - shieldCx);
      if (y < shieldTopY || y > shieldBottomY || dx > 85) return false;
      if (y <= 185) return dx <= 85;
      
      // Curved taper down to bottom tip
      const progress = (y - 185) / (shieldBottomY - 185);
      const maxDx = 85 * (1 - progress * progress);
      return dx <= maxDx;
    }

    const sStep = 8;
    for (let x = shieldCx - 90; x <= shieldCx + 90; x += sStep) {
      for (let y = shieldTopY; y <= shieldBottomY; y += sStep) {
        if (isInsideShield(x, y)) {
          const dx = Math.abs(x - shieldCx);
          
          // Lock Icon coordinates inside shield center
          const inLockShackle = Math.hypot(x - shieldCx, y - 168) <= 20 && y <= 172 && Math.hypot(x - shieldCx, y - 168) >= 11;
          const inLockBody = dx <= 18 && y >= 172 && y <= 212;
          const inKeyhole = dx <= 4 && y >= 184 && y <= 196;
          
          if (inLockShackle || (inLockBody && !inKeyhole)) {
            shieldDotsArr.push({ x, y, opacity: 1, size: 2.2, isBright: true });
          } else if (inKeyhole) {
            // Dark keyhole center
            shieldDotsArr.push({ x, y, opacity: 0.1, size: 1, isBright: false });
          } else {
            // Outer shield stipple
            const isEdge = !isInsideShield(x - sStep, y) || !isInsideShield(x + sStep, y) || !isInsideShield(x, y - sStep) || !isInsideShield(x, y + sStep);
            const isStipple = (Math.round((x - (shieldCx - 90)) / sStep) + Math.round((y - shieldTopY) / sStep)) % 2 === 0;

            if (isEdge) {
              shieldDotsArr.push({ x, y, opacity: 0.9, size: 2, isBright: false });
            } else if (isStipple) {
              shieldDotsArr.push({ x, y, opacity: 0.45, size: 1.5, isBright: false });
            }
          }
        }
      }
    }


    // 4. Dashed Connector Line Dots & Arrow Markers
    const connectorDotsArr = [];
    const connStartX = 315;
    const connEndX = 530;
    const connY = 195;

    for (let x = connStartX; x <= connEndX; x += 12) {
      connectorDotsArr.push({ x, y: connY });
    }

    return {
      borderDots: borderDotsArr,
      dvrDots: dvrDotsArr,
      cameraLensDots: cameraLensDotsArr,
      shieldDots: shieldDotsArr,
      connectorDots: connectorDotsArr,
    };
  }, []);

  return (
    <div className="relative w-full bg-black rounded-2xl border border-neutral-800 p-4 sm:p-6 shadow-2xl overflow-hidden select-none font-mono">
      <style>{`
        @keyframes dotPulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.4; }
        }
        @keyframes streamFlow {
          0% { stroke-dashoffset: 36; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-dot-pulse {
          animation: dotPulse 3s ease-in-out infinite;
        }
        .animate-stream-flow {
          stroke-dasharray: 6 10;
          animation: streamFlow 1.8s linear infinite;
        }
        .animate-cursor {
          animation: cursorBlink 1s step-end infinite;
        }
      `}</style>

      {/* SVG Canvas for High-Contrast Monochrome Dot-Matrix Terminal */}
      <svg
        viewBox="0 0 840 380"
        className="w-full h-auto text-white block"
        style={{ background: "#000000" }}
        aria-label="Phoenix_37 ASCII Terminal Evidence Pipeline"
      >
        {/* 1. Dotted Frame Perimeter */}
        <g id="stippled-frame">
          {borderDots.map((d, i) => (
            <rect
              key={`b-${i}`}
              x={d.x - 1}
              y={d.y - 1}
              width={2}
              height={2}
              fill="#e2e8f0"
              opacity={0.85}
            />
          ))}
        </g>

        {/* 2. ASCII Terminal Title Bar */}
        <g id="terminal-header">
          {/* Header Title */}
          <text
            x="24"
            y="36"
            fill="#ffffff"
            fontSize="12"
            fontWeight="bold"
            letterSpacing="0.5"
          >
            ░▒▓ PHOENIX_37 :: EVIDENCE_PIPELINE ▓▒░
          </text>

          {/* Glitched / Stylized Window Controls & Mode */}
          <text
            x="816"
            y="36"
            textAnchor="end"
            fill="#94a3b8"
            fontSize="11"
            letterSpacing="1"
          >
            [■] [Ξ] [x]
          </text>

          {/* Dotted Header Separator Line */}
          <line
            x1="24"
            y1="48"
            x2="816"
            y2="48"
            stroke="#475569"
            strokeDasharray="2 6"
            strokeWidth="1.5"
          />
        </g>

        {/* 3. Left Shape: DVR / Surveillance Camera Dot Matrix */}
        <g id="dvr-camera-shape" className="animate-dot-pulse">
          {/* Camera Lens Rings */}
          {cameraLensDots.map((d, i) => (
            <circle
              key={`cam-${i}`}
              cx={d.x}
              cy={d.y}
              r={d.size / 2}
              fill="#ffffff"
              opacity={d.opacity}
            />
          ))}

          {/* DVR Body Stipple Matrix */}
          {dvrDots.map((d, i) => (
            <circle
              key={`dvr-${i}`}
              cx={d.x}
              cy={d.y}
              r={d.size / 2}
              fill="#ffffff"
              opacity={d.opacity}
            />
          ))}
        </g>

        {/* 4. Dashed Flow Connector Line */}
        <g id="connector-flow">
          {/* Background Guide Line */}
          <line
            x1="315"
            y1="195"
            x2="525"
            y2="195"
            stroke="#334155"
            strokeWidth="1.5"
            strokeDasharray="2 6"
          />

          {/* Active Flow Line */}
          <line
            x1="315"
            y1="195"
            x2="525"
            y2="195"
            stroke="#ffffff"
            strokeWidth="2"
            className="animate-stream-flow"
          />

          {/* Flow Direction Indicator Chevron Arrows */}
          <text
            x="420"
            y="182"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="10"
            letterSpacing="2"
            fontWeight="bold"
          >
            » » SHA-256 » »
          </text>

          <text
            x="420"
            y="212"
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="9"
            letterSpacing="1"
          >
            [RAW_SECTOR_BITSTREAM]
          </text>
        </g>

        {/* 5. Right Shape: Shield & Lock Provenance Silhouette */}
        <g id="shield-lock-shape" className="animate-dot-pulse">
          {shieldDots.map((d, i) => (
            <circle
              key={`shd-${i}`}
              cx={d.x}
              cy={d.y}
              r={d.size / 2}
              fill="#ffffff"
              opacity={d.opacity}
            />
          ))}
        </g>

        {/* 6. Shape ASCII Sub-Labels */}
        <g id="shape-labels">
          {/* DVR Device Label */}
          <text
            x="210"
            y="285"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="11"
            fontWeight="bold"
            letterSpacing="0.5"
          >
            [01: RAW_DVR_EVIDENCE]
          </text>
          <text
            x="210"
            y="300"
            textAnchor="middle"
            fill="#64748b"
            fontSize="9"
            letterSpacing="0.5"
          >
            VENDOR_AGNOSTIC_SUBSTRATE
          </text>

          {/* Shield Lock Label */}
          <text
            x="630"
            y="285"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="11"
            fontWeight="bold"
            letterSpacing="0.5"
          >
            [02: BSA_SEC63_VERIFIED]
          </text>
          <text
            x="630"
            y="300"
            textAnchor="middle"
            fill="#64748b"
            fontSize="9"
            letterSpacing="0.5"
          >
            SEALED_FORENSIC_OUTPUT
          </text>
        </g>

        {/* 7. Bottom Telemetry Bar */}
        <g id="terminal-telemetry">
          <line
            x1="24"
            y1="322"
            x2="816"
            y2="322"
            stroke="#334155"
            strokeDasharray="2 6"
            strokeWidth="1.5"
          />

          <text
            x="24"
            y="348"
            fill="#64748b"
            fontSize="10"
            letterSpacing="0.5"
          >
            STATUS: ACTIVE  |  FORMAT: DETECTED  |  PROVENANCE: VERIFIED
          </text>

          <text
            x="816"
            y="348"
            textAnchor="end"
            fill="#ffffff"
            fontSize="10"
            letterSpacing="0.5"
          >
            BSA_SEC_63_READY <tspan className="animate-cursor">█</tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}
