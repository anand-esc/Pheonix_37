import React, { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Lock } from "lucide-react";

/**
 * Consolidated Cryptographic SHA-256 Hash Display component.
 * Used across Evidence Intake, Provenance Chain, Analysis, and Report.
 */
export function HashDisplay({
  hash,
  label = "SHA-256 Digest",
  verified = true,
  allowExpand = true,
  className = "",
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!hash) {
    return (
      <div className={`inline-flex items-center gap-2 text-xs text-slate-400 font-mono italic bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 ${className}`}>
        <Lock className="w-3.5 h-3.5 text-slate-300" />
        No SHA-256 hash locked
      </div>
    );
  }

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedHash = `${hash.slice(0, 10)}...${hash.slice(-10)}`;
  const displayHash = expanded ? hash : truncatedHash;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${verified ? "bg-sky-500" : "bg-slate-300"}`} />
          {label}
        </span>
      )}
      <div className="inline-flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/90 rounded-md px-3 py-1.5 text-xs font-mono text-sky-800 shadow-2xs">
        <span className="break-all selection:bg-sky-100 selection:text-sky-900 font-medium">
          {displayHash}
        </span>
        
        <div className="flex items-center gap-1 shrink-0 ml-2 border-l border-slate-200 pl-2">
          {allowExpand && hash.length > 24 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-slate-400 hover:text-slate-700 transition-colors rounded hover:bg-slate-200/60"
              title={expanded ? "Collapse Hash" : "Expand Full Hash"}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-sky-700 transition-colors rounded hover:bg-slate-200/60 flex items-center gap-1 text-[11px]"
            title="Copy Hash to Clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600 font-sans font-medium text-[10px]">Copied</span>
              </>
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
