import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Loader2, AlertCircle, FileText, Clock, Layers, Cpu, HardDrive, Activity } from "lucide-react";
import {
  getCase, getCaseFragments, getCaseLedger, mapLedgerEntry,
  startAcquisitionRun, pollAcquisitionRun, deleteCase, getDemoSource, formatBytes,
} from "../api";
import { RecoveredVideos } from "../components/RecoveredVideos";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";
import ChainOfCustody from "../components/phoenix-ui-kit/ChainOfCustody";
import FragmentRow from "../components/phoenix-ui-kit/FragmentRow";

export function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, operatorId, can } = useRole();
  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("fragments");

  const [isAcquireModalOpen, setIsAcquireModalOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [demoSource, setDemoSource] = useState(null);
  const [acquireStatus, setAcquireStatus] = useState("");

  // Offer the demonstration image when one has been built, so the path does
  // not have to be typed on stage.
  useEffect(() => {
    getDemoSource().then((d) => d?.available && setDemoSource(d));
  }, []);

  const handleAcquire = async () => {
    // Strip leading and trailing quotes (single and double) and whitespace
    let cleanPath = sourcePath.trim().replace(/^["']|["']$/g, '');
    
    if (!cleanPath) return;
    try {
      setIsAcquiring(true);
      // the header identifies the operator; the body records the same id in custody
      const run = await startAcquisitionRun({
        source_path: cleanPath,
        case_id: id,
        operator_id: operatorId,
        out_dir: `case_store/${id}/run`,
        encrypt: true,
      });
      setIsAcquireModalOpen(false);
      setSourcePath("");
      await pollAcquisitionRun(
        run.job_id,
        (update) => {
          setAcquireStatus(
            `${(update.last_event || "running").replace(/_/g, " ")} - ${formatBytes(update.bytes_read || 0)} read`,
          );
        },
        1000,
      );
      setAcquireStatus("");
      await loadData();
      setActiveTab("fragments");
    } catch (err) {
      setAcquireStatus("");
      alert("Acquisition failed: " + err.message);
    } finally {
      setIsAcquiring(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [c, frags, ledger] = await Promise.all([
        getCase(id),
        getCaseFragments(id),
        getCaseLedger(id).catch(() => []),
      ]);
      setCaseData(c);
      setFragments(frags || []);
      setLedgerEntries((ledger || []).map(mapLedgerEntry));
    } catch (err) {
      console.error("Failed to load case detail", err);
      setError(err.message || "Failed to load case detail");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const statusMap = { "Intake": "pending", "Processing": "pending", "Recovered": "validated", "Reported": "validated" };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-phx-red animate-spin" />
          <span className="text-xs text-phx-muted uppercase tracking-widest">Loading case...</span>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex gap-4">
          <AlertCircle size={24} className="text-red-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-800 mb-1">Case Load Error</h3>
            <p className="text-sm text-red-700">{error || `Case "${id}" could not be retrieved.`}</p>
            <button onClick={() => navigate("/cases")} className="mt-4 btn-secondary text-sm">Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate("/cases")} className="flex items-center gap-2 text-sm text-phx-secondary hover:text-phx-primary transition-colors">
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/cases/${id}/evidence`)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-phx-secondary hover:text-phx-primary border border-phx-border rounded transition-colors">
            <HardDrive size={14} />
            Evidence Intake
          </button>
          <button onClick={() => navigate(`/cases/${id}/analysis`)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-phx-secondary hover:text-phx-primary border border-phx-border rounded transition-colors">
            <Activity size={14} />
            Analysis
          </button>
          <button 
            disabled={!can("RUN_CARVING")}
            title={can("RUN_CARVING") ? "Delete this case" : "Only an Investigator can delete a case"}
            onClick={async () => {
              if (window.confirm("Are you sure you want to delete this case completely? This will wipe the audit ledger and all carved fragments from disk. This cannot be undone.")) {
                try {
                  await deleteCase(id);
                  navigate("/cases");
                } catch (err) {
                  alert("Failed to delete case: " + err.message);
                }
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-phx-red hover:bg-phx-red hover:text-white border border-phx-red rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Case
          </button>
          <div className="text-xs text-phx-muted bg-phx-surface px-3 py-1.5 rounded border border-phx-border">
            Active Role: <strong className="text-phx-primary">{role}</strong>
          </div>
        </div>
      </div>

      <CaseHeader
        caseId={caseData.id || id}
        title={caseData.name || `Case ${id}`}
        status={statusMap[caseData.status] || "pending"}
        statusLabel={caseData.status}
      />

      <div className="flex gap-1 mb-6 border-b border-phx-border">
        {[
          { id: "fragments", label: "Recovered Videos", count: fragments.length, icon: Play },
          { id: "ledger", label: "Chain of Custody", count: ledgerEntries.length, icon: Layers },
          { id: "timeline", label: "Timeline", count: 0, icon: Clock },
          { id: "triage", label: "AI Triage", count: caseData?.evidence_items?.[0]?.detections?.length || 0, icon: Cpu },
          { id: "report", label: "Certificate", count: 0, icon: FileText },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? "text-phx-red border-phx-red bg-white"
                : "text-phx-secondary border-transparent hover:text-phx-primary hover:border-phx-border hover:bg-phx-surface"
            }`}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === tab.id ? "bg-phx-red/10 text-phx-red" : "bg-phx-surface text-phx-secondary border border-phx-border"
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === "fragments" && (
          <div className="space-y-4">
            {fragments.length === 0 ? (
              <div className="bg-white border border-phx-border rounded-lg p-12 text-center">
                <Play size={40} className="text-phx-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-phx-primary mb-2">Nothing recovered yet</h3>
                <p className="text-sm text-phx-secondary mb-4">
                  Point the pipeline at a disk image or a video file to recover exhibits.
                </p>
                <button
                  onClick={() => setIsAcquireModalOpen(true)}
                  disabled={!can("RUN_CARVING")}
                  title={can("RUN_CARVING") ? "" : "Only an Investigator can start acquisition"}
                  className="btn-primary mx-auto disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Start Acquisition
                </button>
              </div>
            ) : (
              <RecoveredVideos caseId={id} fragments={fragments} />
            )}
          </div>
        )}

        {activeTab === "ledger" && <ChainOfCustody entries={ledgerEntries} />}


        {activeTab === "triage" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-phx-secondary uppercase tracking-wider font-semibold">AI Triage Results</div>
                <p className="text-xs text-phx-muted mt-0.5">Automated visual localization of persons and vehicles for investigative filtering.</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-phx-surface text-phx-primary border border-phx-border">
                {caseData?.evidence_items?.[0]?.detections?.length || 0} Detections Flagged
              </span>
            </div>

            {!(caseData?.evidence_items?.[0]?.detections?.length) ? (
              <div className="bg-white border border-phx-border rounded-lg p-12 text-center">
                <Cpu size={40} className="text-phx-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-phx-primary mb-2">No Detections Found</h3>
                <p className="text-sm text-phx-secondary mb-4">AI triage did not flag any objects of interest.</p>
              </div>
            ) : (
              <div className="bg-white border border-phx-border rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm text-phx-primary">
                  <thead className="bg-phx-surface text-phx-secondary font-mono text-xs border-b border-phx-border">
                    <tr>
                      <th className="py-2.5 px-4">Fragment ID</th>
                      <th className="py-2.5 px-4">Detected Object</th>
                      <th className="py-2.5 px-4">Confidence</th>
                      <th className="py-2.5 px-4">Bounding Box [x, y, w, h]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseData.evidence_items[0].detections.map((d, i) => (
                      <tr key={i} className="border-b border-phx-border hover:bg-phx-surface/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-phx-red text-xs">{d.fragment_id || 'Unknown'}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-phx-surface border border-phx-border text-phx-primary">
                            {d.object_class}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 bg-phx-border rounded-full overflow-hidden">
                              <div className="h-full bg-phx-amber rounded-full" style={{ width: `${Math.round(d.confidence_score * 100)}%` }} />
                            </div>
                            <span className="font-mono text-[10px] font-bold text-phx-secondary">{Math.round(d.confidence_score * 100)}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-phx-muted">
                          {Array.isArray(d.bounding_box) && d.bounding_box.length === 4
                            ? `[${d.bounding_box.map(Math.round).join(', ')}]`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="bg-white border border-phx-border rounded-lg p-16 text-center">
            <Clock size={40} className="text-phx-muted mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-phx-primary mb-2">Timeline View</h3>
            <p className="text-sm text-phx-secondary mb-6">Cross-camera timeline with anchor alignment.</p>
            <button onClick={() => navigate(`/cases/${id}/timeline`)} className="btn-primary mx-auto">Open Full Timeline</button>
          </div>
        )}

        {activeTab === "report" && (
          <div className="bg-white border border-phx-border rounded-lg p-16 text-center">
            <FileText size={40} className="text-phx-muted mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-phx-primary mb-2">BSA Section 63 Certificate</h3>
            <p className="text-sm text-phx-secondary mb-6">Generate court-admissible certificate.</p>
            <button onClick={() => navigate(`/cases/${id}/report`)} className="btn-primary mx-auto">Open Certificate Draft</button>
          </div>
        )}
      </div>

      {isAcquireModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-phx-border bg-phx-surface">
              <h3 className="font-semibold text-phx-primary">Acquire Evidence</h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-phx-secondary mb-2">
                Source path (disk image, video file, or raw device)
              </label>
              <input
                type="text"
                autoFocus
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="D:\evidence\dvr_dump.img   or   D:\clips\camera1.mp4"
                className="w-full py-2 px-3 bg-phx-surface border border-phx-border rounded text-sm text-phx-primary focus:outline-none focus:border-phx-red/40 focus:ring-1 focus:ring-phx-red/20"
              />
              <p className="text-[11px] text-phx-muted mt-2">
                The backend reads this path and copies the bytes into the case before
                anything else runs, so deleting the original afterwards does not affect
                the case.
              </p>
              {demoSource && (
                <button
                  type="button"
                  onClick={() => setSourcePath(demoSource.source_path)}
                  className="mt-3 w-full text-left px-3 py-2 rounded border border-dashed border-phx-border hover:border-phx-red/40 hover:bg-phx-surface transition-colors"
                >
                  <span className="block text-xs font-semibold text-phx-primary">
                    Use the demonstration image
                  </span>
                  <span className="block text-[10px] font-mono text-phx-muted truncate">
                    {demoSource.source_path} ({formatBytes(demoSource.size_bytes)})
                  </span>
                </button>
              )}
              {acquireStatus && (
                <p className="mt-3 text-[11px] font-mono text-phx-secondary bg-phx-surface border border-phx-border rounded p-2">
                  {acquireStatus}
                </p>
              )}
              <div className="mb-6" />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsAcquireModalOpen(false)}
                  className="btn-secondary"
                  disabled={isAcquiring}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAcquire}
                  disabled={!sourcePath.trim() || isAcquiring}
                  className="btn-primary"
                >
                  {isAcquiring ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  <span>Start Pipeline</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}