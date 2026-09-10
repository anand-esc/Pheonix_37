import React from "react";

export function Badge({ label, variant, size = "md", className = "" }) {
  const normalizedLabel = String(label || "").trim();

  let styleVariant = variant;
  if (!styleVariant) {
    const l = normalizedLabel.toLowerCase();
    if (l === "validated" || l === "recovered" || l === "reported") styleVariant = "green";
    else if (l === "generic fallback" || l === "processing" || l === "pending" || l === "intake") styleVariant = "amber";
    else if (l === "research target" || l === "verified") styleVariant = "cyan";
    else if (l === "failed" || l === "corrupted" || l === "tampered" || l === "denied") styleVariant = "red";
    else if (l === "draft") styleVariant = "amber";
    else styleVariant = "slate";
  }

  const variantStyles = {
    emerald: "bg-[var(--accent-green-dim)] text-phx-green border border-[rgba(52,211,153,0.2)] font-mono",
    amber: "bg-phx-amber/10 text-phx-amber border border-[rgba(240,169,58,0.2)] font-mono",
    cyan: "bg-phx-cyan/10 text-phx-cyan border border-phx-cyan/20 font-mono",
    red: "bg-[var(--accent-red-dim)] text-phx-red border border-[rgba(248,113,113,0.2)] font-mono",
    indigo: "bg-[rgba(129,140,248,0.1)] text-[#818CF8] border border-[rgba(129,140,248,0.2)] font-mono",
    slate: "bg-phx-panel-lighter text-phx-secondary border border-phx-border font-mono",
  };

  const sizeStyles = {
    xs: "px-1.5 py-0.5 text-[10px] rounded",
    sm: "px-2 py-0.5 text-[11px] rounded",
    md: "px-2.5 py-1 text-[11px] rounded",
    lg: "px-3 py-1.5 text-xs rounded",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border tracking-tight ${variantStyles[styleVariant] || variantStyles.slate} ${sizeStyles[size] || sizeStyles.md} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />
      {normalizedLabel}
    </span>
  );
}