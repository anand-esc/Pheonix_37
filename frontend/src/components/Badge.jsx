import React from "react";

/**
 * Standardized status badge for Phoenix Forensic Toolkit
 * Preserves strict required label strings: Validated, Generic Fallback, Research Target, Intake, Processing, Recovered, Reported
 */
export function Badge({ label, variant, size = "md", className = "" }) {
  const normalizedLabel = String(label || "").trim();
  
  // Resolve visual variant if not explicitly provided
  let styleVariant = variant;
  if (!styleVariant) {
    const l = normalizedLabel.toLowerCase();
    if (l === "validated" || l === "recovered") styleVariant = "emerald";
    else if (l === "generic fallback" || l === "processing") styleVariant = "amber";
    else if (l === "research target" || l === "intake") styleVariant = "cyan";
    else if (l === "reported") styleVariant = "indigo";
    else if (l === "failed" || l === "corrupted") styleVariant = "rose";
    else styleVariant = "slate";
  }

  const variantStyles = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/80 font-medium",
    amber: "bg-amber-50 text-amber-800 border-amber-200/80 font-medium",
    cyan: "bg-sky-50 text-sky-700 border-sky-200/80 font-medium",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200/80 font-medium",
    rose: "bg-rose-50 text-rose-700 border-rose-200/80 font-medium",
    slate: "bg-slate-100 text-slate-700 border-slate-200 font-medium",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs rounded",
    md: "px-2.5 py-1 text-xs rounded-md",
    lg: "px-3 py-1.5 text-sm rounded-md",
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
