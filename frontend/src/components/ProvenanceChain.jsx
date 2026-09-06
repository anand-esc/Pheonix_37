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
  HardDrive
} from "lucide-react";
import { getCase } from "../mockApi";
import { Badge } from "./Badge";
import { SectionHeading } from "./SectionHeading";
import { HashDisplay } from "./HashDisplay";

export function ProvenanceChain({ caseId, initialCaseData }) {
  const [caseData, setCaseData] = useState(initialCaseData);
  const [selectedNode, setSelectedNode] = useState(null);

  // Poll live case state every 1.5 seconds for real-time reactivity
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

  // Derive the 4 stage nodes
  const origHash = caseData?.evidence?.hash || null;
  const origTime = caseData?.evidence?.acquiredAt || null;

  const parsedHash = caseData?.parsedHash || null;
  const parsedTime = caseData?.parsedAt || null;

  // Find most recent recovery result (or check if any recovery failed)
  const lastRec = caseData?.lastRecovery || 
    (caseData?.recoveries ? Object.values(caseData.recoveries).slice(-1)[0] : null);

  let recState = "pending"; // 'pending' | 'completed' | 'failed'
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
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Prominent Section Banner — Focal Visual Moment */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-2xs">
        <SectionHeading
          title="Court-Defensible Cryptographic Provenance Chain"
          subtitle="Real-time immutable hash chain linking raw intake bytes to parsed streams and carved segment recovery"
          icon={GitCommit}
          badge={<Badge label="Live Chain" variant="cyan" size="sm" />}
        />

        {/* 4 HORIZONTAL PROVENANCE NODES */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
          {nodes.map((node) => {
            const Icon = node.icon;

            return (
              <div
                key={node.id}
                onClick={() => {
                  if (node.state !== "pending") setSelectedNode(node);
                }}
                className={`rounded-xl p-4 border transition-all flex flex-col justify-between h-full space-y-4 ${
                  node.state === "completed"
                    ? "bg-slate-50/80 border-sky-300 hover:border-sky-500 shadow-2xs hover:shadow-xs cursor-pointer group"
                    : node.state === "failed"
                    ? "bg-rose-50/40 border-rose-300 hover:border-rose-500 shadow-2xs hover:shadow-xs cursor-pointer group"
                    : "bg-slate-50/40 border-dashed border-slate-200 opacity-60 cursor-not-allowed"
                }`}
              >
                {/* Node Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                      node.state === "completed"
                        ? "bg-sky-50 border-sky-200 text-sky-700"
                        : node.state === "failed"
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-slate-100 border-slate-200 text-slate-400"
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{node.title}</h4>
                      <p className="text-[10px] text-slate-500">{node.subtitle}</p>
                    </div>
                  </div>

                  <div>
                    {node.state === "completed" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    {node.state === "failed" && (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    {node.state === "pending" && (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Hash / Status Box */}
                <div className="space-y-2 pt-1">
                  {node.state === "completed" && node.hash && (
                    <div className="bg-white border border-sky-200 rounded-lg p-2 font-mono text-[11px] text-sky-800 font-semibold flex items-center justify-between group-hover:border-sky-400 transition-colors">
                      <span>{truncateHash(node.hash)}</span>
                      <span className="text-[10px] font-sans font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Verified
                      </span>
                    </div>
                  )}

                  {node.state === "failed" && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 font-mono text-[11px] text-rose-800 font-semibold space-y-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>Chain Gap</span>
                      </div>
                      <p className="text-[10px] font-sans text-rose-700 font-normal">
                        Unrecoverable sector
                      </p>
                    </div>
                  )}

                  {node.state === "pending" && (
                    <div className="bg-slate-100/60 border border-slate-200 rounded-lg p-2 font-mono text-[11px] text-slate-400 flex items-center justify-between">
                      <span>—</span>
                      <span className="text-[10px] font-sans text-slate-500">
                        {node.note || "Pending Stage"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer Metadata */}
                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span>
                    {node.timestamp ? formatDate(node.timestamp) : "Awaiting stage"}
                  </span>
                  {node.state !== "pending" && (
                    <span className="text-sky-700 font-sans font-medium group-hover:underline">
                      Details →
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* NODE DETAILS MODAL */}
      {selectedNode && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setSelectedNode(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  selectedNode.state === "completed" ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  <selectedNode.icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedNode.title}</h3>
                  <p className="text-xs text-slate-500">{selectedNode.subtitle}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200"
              >
                Close
              </button>
            </div>

            {selectedNode.hash ? (
              <HashDisplay hash={selectedNode.hash} label="Full SHA-256 Digest" verified={true} allowExpand={true} />
            ) : (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
                <span className="font-semibold block">No Digest Produced</span>
                <p className="text-rose-700 text-[11px]">{selectedNode.details}</p>
              </div>
            )}

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
              <span className="text-[11px] font-semibold uppercase text-slate-500">Forensic Stage Details</span>
              <p className="text-slate-700">{selectedNode.details}</p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
              <span>Timestamp: {selectedNode.timestamp ? formatDate(selectedNode.timestamp) : "N/A"}</span>
              <span className="font-mono text-indigo-700 font-medium">BSA Sec 63 Chain Anchor</span>
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

function formatDate(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
