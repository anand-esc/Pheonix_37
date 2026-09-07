import React, { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Lock } from "lucide-react";

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
      <div className={`inline-flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono italic bg-[var(--bg-panel-lighter)] px-2.5 py-1.5 rounded border border-[var(--border)] ${className}`}>
        <Lock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
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
        <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${verified ? "bg-[var(--accent-cyan)]" : "bg-[var(--text-muted)]"}`} />
          {label}
        </span>
      )}
      <div className="inline-flex items-center justify-between gap-2 bg-[var(--bg-deep)] border border-[var(--border)] rounded px-3 py-1.5 text-xs font-mono text-[var(--accent-cyan)] shadow-none-data">
        <span className="break-all selection:bg-[var(--accent-cyan-dim)] selection:text-[var(--accent-cyan)] font-medium">
          {displayHash}
        </span>
        
        <div className="flex items-center gap-1 shrink-0 ml-2 border-l border-[var(--border)] pl-2">
          {allowExpand && hash.length > 24 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors rounded hover:bg-[var(--bg-panel-lighter)]"
              title={expanded ? "Collapse Hash" : "Expand Full Hash"}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors rounded hover:bg-[var(--bg-panel-lighter)] flex items-center gap-1 text-[11px]"
            title="Copy Hash to Clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                <span className="text-[var(--accent-green)] font-sans font-medium text-[10px]">Copied</span>
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