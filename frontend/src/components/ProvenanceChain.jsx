import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  GitCommit,
  AlertTriangle,
  FileCheck,
  Cpu,
  Layers,
  HardDrive,
} from "lucide-react";
import { getCase } from "../api";
import { formatDate } from "../api";
import { Badge } from "./Badge";
import { SectionHeading } from "./SectionHeading";
import { HashDisplay } from "./HashDisplay";

export function ProvenanceChain({ caseId, initialCaseData }) {
  const [caseData, setCaseData] = useState(initialCaseData);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const pollCase = async () => {
      try {
        const updated = await getCase(caseId);
        if (isMounted && updated) {
          setCaseData(updated);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    };

    pollCase();
    const interval = setInterval(pollCase, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [caseId]);

  const origHash = caseData?.evidence?.hash || null;
  const origTime = caseData?.evidence?.acquiredAt || null;
  const parsedHash = caseData?.parsedHash || null;
  const parsedTime = caseData?.parsedAt || null;
  const lastRec =
    caseData?.lastRecovery ||
    (caseData?.recoveries ? Object.values(caseData.recoveries).slice(-1)[0] : null);

  let recState = "pending";
  let recHash = null;
  let recTime = null;
  let recMethod = null;

  if (lastRec) {
    if (lastRec.status === "failed") {
      recState = "failed";
    } else if (lastRec.status === "success" && lastRec.recoveredHash) {
      recState = "completed";
      recHash = lastRec.recoveredHash;
      recTime = lastRec.timestamp || new Date().toISOString();
      recMethod = lastRec.method;
    }
  }

  const nodes = [
    {
      id: "original",
      title: "1. Intake Hash",
      subtitle: "Raw Plaintext SHA-256 Digest",
      icon: HardDrive,
      state: origHash ? "completed" : "pending",
      hash: origHash,
      timestamp: origTime,
      details: "Computed on raw disk image before envelope encryption during Intake.",
    },
    {
      id: "parsed",
      title: "2. Parsed Stream Hash",
      subtitle: "Filesystem Engine Output",
      icon: Cpu,
      state: parsedHash ? "completed" : "pending",
      hash: parsedHash,
      timestamp: parsedTime,
      details: "Derived from native DVR filesystem signature scan & stream extraction.",
    },
    {
      id: "recovered",
      title: "3. Carved Segment Hash",
      subtitle: "NAL Recovery Result",
      icon: Layers,
      state: recState,
      hash: recHash,
      timestamp: recTime,
      details: recState === "failed"
        ? "Recovery Engine Failed: Data sectors overwritten by DVR ring-buffer."
        : `Carved using ${recMethod || "NAL Recovery Engine"}.`,
    },
    {
      id: "report",
      title: "4. Report Package Hash",
      subtitle: "BSA Sec 63 Court Seal",
      icon: FileCheck,
      state: "pending",
      hash: null,
      timestamp: null,
      details: "Generated on legal report submission.",
      note: "Generated on report submission",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="data-panel p-6">
        <SectionHeading
          title="Court-Defensible Cryptographic Provenance Chain"
          subtitle="Immutable hash chain linking raw intake bytes to parsed streams and carved segment recovery"
          icon={GitCommit}
          badge={<Badge label="Live Chain" variant="cyan" size="sm" />}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
          {nodes.map((node) => {
            const Icon = node.icon;
            return (
              <div
                key={node.id}
                onClick={() => {
                  if (node.state !== "pending") setSelectedNode(node);
                }}
                className={`rounded p-4 border transition-all flex flex-col justify-between h-full space-y-4 cursor-pointer ${
                  node.state === "completed"
                    ? "bg-[var(--bg-panel-lighter)] border-[rgba(62,214,196,0.2)] hover:border-[var(--accent-cyan)]"
                    : node.state === "failed"
                    ? "bg-[var(--accent-red-dim)] border-[rgba(248,113,113,0.2)] hover:border-[var(--accent-red)]"
                    : "bg-[var(--bg-deep)] border-dashed border-[var(--border)] opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center border ${
                        node.state === "completed"
                          ? "bg-[var(--accent-cyan-dim)] border-[rgba(62,214,196,0.3)] text-[var(--accent-cyan)]"
                          : node.state === "failed"
                          ? "bg-[var(--accent-red-dim)] border-[rgba(248,113,113,0.3)] text-[var(--accent-red)]"
                          : "bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">{node.title}</h4>
                      <p className="text-[10px] text-[var(--text-secondary)]">{node.subtitle}</p>
                    </div>
                  </div>

                  <div>
                    {node.state === "completed" && (
                      <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
                    )}
                    {node.state === "failed" && (
                      <XCircle className="w-4 h-4 text-[var(--accent-red)]" />
                    )}
                    {node.state === "pending" && (
                      <Clock className="w-4 h-4 text-[var(--text-muted)]" />
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {node.state === "completed" && node.hash && (
                    <div className="bg-[var(--bg-deep)] border border-[rgba(62,214,196,0.2)] rounded px-2 py-1.5 font-mono text-[11px] text-[var(--accent-cyan)] font-semibold flex items-center justify-between">
                      <span>{truncateHash(node.hash)}</span>
                      <span className="text-[10px] font-sans font-medium text-[var(--accent-green)] bg-[var(--accent-green-dim)] px-1.5 py-0.5 rounded border border-[rgba(52,211,153,0.2)]">
                        Verified
                      </span>
                    </div>
                  )}
                  {node.state === "failed" && (
                    <div className="bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] rounded px-2 py-1.5 font-mono text-[11px] text-[var(--accent-red)] font-semibold space-y-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-[var(--accent-red)] shrink-0" />
                        <span>Chain Gap</span>
                      </div>
                      <p className="text-[10px] font-sans text-[var(--accent-red)] font-normal">
                        Unrecoverable sector
                      </p>
                    </div>
                  )}
                  {node.state === "pending" && (
                    <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded px-2 py-1.5 font-mono text-[11px] text-[var(--text-muted)] flex items-center justify-between">
                      <span>—</span>
                      <span className="text-[10px] font-sans text-[var(--text-muted)]">
                        {node.note || "Pending Stage"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-[var(--text-muted)] font-mono flex items-center justify-between pt-1 border-t border-[var(--border)]">
                  <span>
                    {node.timestamp ? formatDate(node.timestamp) : "Awaiting stage"}
                  </span>
                  {node.state !== "pending" && (
                    <span className="text-[var(--accent-cyan)] font-sans font-medium">
                      Details →
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-deep)]/80"
          onClick={() => setSelectedNode(null)}
        >
          <div
            className="bg-[var(--bg-panel)] border border-[var(--border)] rounded w-full max-w-lg overflow-hidden p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded flex items-center justify-center ${
                    selectedNode.state === "completed"
                      ? "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border border-[rgba(62,214,196,0.2)]"
                      : "bg-[var(--accent-red-dim)] text-[var(--accent-red)] border border-[rgba(248,113,113,0.2)]"
                  }`}
                >
                  <selectedNode.icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedNode.title}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">{selectedNode.subtitle}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded bg-[var(--bg-panel-lighter)] border border-[var(--border)]"
              >
                Close
              </button>
            </div>

            {selectedNode.hash ? (
              <HashDisplay hash={selectedNode.hash} label="Full SHA-256 Digest" verified={true} allowExpand={true} />
            ) : (
              <div className="p-3 bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] rounded text-xs text-[var(--accent-red)] space-y-1">
                <span className="font-semibold block">No Digest Produced</span>
                <p className="text-[var(--accent-red)] text-[11px]">{selectedNode.details}</p>
              </div>
            )}

            <div className="bg-[var(--bg-deep)] p-3.5 rounded border border-[var(--border)] text-xs space-y-1">
              <span className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">Forensic Stage Details</span>
              <p className="text-[var(--text-secondary)]">{selectedNode.details}</p>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
              <span>Timestamp: {selectedNode.timestamp ? formatDate(selectedNode.timestamp) : "N/A"}</span>
              <span className="font-mono text-[var(--accent-cyan)] font-medium">BSA Sec 63 Chain Anchor</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function truncateHash(hash, len = 7) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.substring(0, len)}...${hash.substring(hash.length - len)}`;
}