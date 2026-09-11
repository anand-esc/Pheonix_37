import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  HardDrive, FileCheck, ArrowLeft, ArrowRight, RefreshCw, ShieldCheck,
  Loader2, CheckCircle2, AlertCircle, Lock, Play,
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { HashDisplay } from "../components/HashDisplay";
import {
  getCase, startAcquisitionRun, pollAcquisitionRun,
  formatBytes, formatDate, mapBackendStatus
} from "../api";
import { useRole } from "../context/RoleContext";

export function EvidencePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [isLoadingCase, setIsLoadingCase] = useState(true);

  const [sourcePath, setSourcePath] = useState("");
  const [outDir, setOutDir] = useState(`./case_store/${id}/run`);
  const [deviceInfo, setDeviceInfo] = useState("");
  const [encrypt, setEncrypt] = useState(true);

  const [acquisitionStage, setAcquisitionStage] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [acquisitionResult, setAcquisitionResult] = useState(null);
  const [acquisitionError, setAcquisitionError] = useState(null);
  const [progressBytes, setProgressBytes] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchCaseDetails = async () => {
      try {
        setIsLoadingCase(true);
        const c = await getCase(id);
        if (isMounted) {
          setCaseData(c);
          if (c && c.hasEvidence) {
          const primaryEvidence = c?.evidence_items?.[0] || c?.evidence;
          const intakeHash = primaryEvidence?.hash_lineage?.find(
            (h) => h.pipeline_stage?.toLowerCase() === "intake" && (h.algorithm === "SHA-256" || !h.algorithm)
          )?.hex_digest || primaryEvidence?.hash_lineage?.find(
            (h) => h.pipeline_stage?.toLowerCase() === "intake"
          )?.hex_digest || primaryEvidence?.hash;

          if (primaryEvidence && (primaryEvidence.fragments?.length > 0 || intakeHash || c?.hasEvidence)) {
            setAcquisitionStage("done");
            setAcquisitionResult({
              hash: c.evidence?.hash || "",
              fileName: c.evidence?.fileName || "",
              fileSize: c.evidence?.fileSize || 0,
              acquiredAt: c.evidence?.acquiredAt || "",
              hash: intakeHash || "RECORDED",
              fileName: primaryEvidence.source_device_info || primaryEvidence.fileName || "evidence.img",
              fileSize: parseInt(primaryEvidence.metadata?.bytes_read || primaryEvidence.fileSize || 0, 10),
              acquiredAt: primaryEvidence.metadata?.acquired_utc || primaryEvidence.acquiredAt || c.intake_timestamp_utc || "",
            });
          }
        }
      } catch (err) {
        console.error("Failed to load case", err);
      } finally {
        if (isMounted) setIsLoadingCase(false);
      }
    };
    fetchCaseDetails();
    return () => { isMounted = false; };
  }, [id]);

  const handleStartAcquisition = async () => {
    if (!sourcePath.trim()) {
      setAcquisitionError("Please enter a source path (file or raw device)");
      return;
    }
    try {
      setAcquisitionStage("queued");
      setStatusMessage("Starting pipeline...");
      setAcquisitionError(null);
      setProgressBytes(0);

      const operatorId = localStorage.getItem("phoenix_operator_id") || "investigator-01";
      const run = await startAcquisitionRun({
        source_path: sourcePath,
        case_id: id,
        operator_id: operatorId,
        out_dir: outDir,
        device_info: deviceInfo || `source ${sourcePath}`,
        encrypt,
      });

      setAcquisitionStage("running");
      setStatusMessage("Reading disk image & computing SHA-256...");

      const { result } = await pollAcquisitionRun(run.job_id, (runUpdate) => {
        setProgressBytes(runUpdate.bytes_read || 0);
        const lastEvent = runUpdate.last_event;
        if (lastEvent) {
          setStatusMessage(lastEvent.replace(/_/g, " "));
        }
      }, 1000);

      const summary = result.summary;
      setAcquisitionResult({
        hash: summary.image_sha256,
        fileName: summary.evidence_id,
        fileSize: result.acquisition.bytes_read,
        acquiredAt: result.started_utc,
      });
      setAcquisitionStage("done");

      setCaseData((prev) => prev ? ({
        ...prev,
        hasEvidence: true,
        status: "Processing",
      }) : null);
    } catch (err) {
      console.error("Acquisition failed", err);
      setAcquisitionStage("error");
      setAcquisitionError(err.message || "Failed to complete acquisition pipeline.");
    }
  };

  const handleReacquire = () => {
    setSourcePath("");
    setAcquisitionStage("idle");
    setAcquisitionResult(null);
    setAcquisitionError(null);
    setProgressBytes(0);
    setCaseData((prev) => prev ? ({
      ...prev,
      hasEvidence: false,
      status: "Intake",
    }) : null);
  };

  if (isLoadingCase) {
    return (
      <div className="space-y-6">
        <CaseNavigationTabs />
        <div className="max-w-5xl mx-auto px-4 py-16 flex flex-col items-center justify-center gap-3 text-phx-secondary">
          <div className="flex items-center gap-3 text-xs font-mono text-phx-cyan">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="tracking-widest">POLLING CASE DATA...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="space-y-6">
        <CaseNavigationTabs />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-phx-red mx-auto drop-shadow-lg" />
          <h2 className="text-2xl font-bold text-phx-primary">Case Not Found</h2>
          <p className="text-sm text-phx-secondary">Case ID "{id}" could not be retrieved from the database.</p>
          <button onClick={() => navigate("/cases")} className="btn-secondary mt-4">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CaseNavigationTabs />

      <div className="max-w-6xl mx-auto px-4 lg:px-8 space-y-6 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button onClick={() => navigate("/cases")} className="flex items-center gap-2 text-xs font-mono text-phx-secondary hover:text-phx-primary transition-colors">
            <ArrowLeft size={16} strokeWidth={2} />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-2 text-[11px] font-mono bg-phx-surface px-3 py-1.5 rounded border border-phx-border">
            <span className="text-phx-muted">Active Role:</span>
            <span className="text-phx-cyan font-bold">{role}</span>
          </div>
        </div>

        <div className="glass-panel p-6 shadow-md">
          <SectionHeading
            title={`Evidence Intake — ${caseData.id}`}
            subtitle={caseData.name}
            icon={HardDrive}
            badge={<Badge label={caseData.status} />}
          />
          <p className="text-sm text-phx-secondary leading-relaxed mt-4 max-w-3xl">
            Perform SHA-256 intake hashing on raw DVR/NVR disk images to establish the first link in the court-admissible provenance chain.
            Source path must be accessible on the server filesystem (e.g., <code className="text-phx-amber bg-phx-amber/10 px-1.5 py-0.5 rounded font-mono border border-phx-amber/20">D:\evidence\dvr.img</code>).
          </p>
        </div>

        {/* ACQUISITION PROGRESS STRIP */}
        {(acquisitionStage === "queued" || acquisitionStage === "running") && (
          <div className="glass-panel p-6 space-y-6 animate-pulse shadow-lg border-phx-cyan/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-phx-cyan/10 border border-phx-cyan/30 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-phx-cyan animate-ping" />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-bold text-phx-cyan uppercase tracking-wider mb-1">
                    {acquisitionStage === "queued" ? "Initializing Pipeline..." : "Reading Disk Image..."}
                  </h3>
                  <p className="font-mono text-xs text-phx-primary">{statusMessage}</p>
                </div>
              </div>
              <div className="text-right">
                <Badge label="Processing" variant="amber" />
                {progressBytes > 0 && (
                  <p className="text-[10px] text-phx-muted font-mono mt-2">Bytes read: {formatBytes(progressBytes)}</p>
                )}
              </div>
            </div>

            <div className="w-full bg-phx-deep rounded-full h-2 overflow-hidden border border-phx-border">
              <div
                className="bg-phx-cyan h-full transition-all duration-500 ease-out"
                style={{ width: acquisitionStage === "queued" ? "10%" : "60%" }}
              />
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {acquisitionStage === "error" && (
          <div className="glass-panel p-6 space-y-4 border-phx-red/40 bg-phx-red/5">
            <div className="flex items-center gap-4 text-phx-red">
              <div className="w-10 h-10 rounded-full bg-phx-red/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Acquisition Failed</h3>
                <p className="text-sm font-mono mt-1 opacity-90">{acquisitionError}</p>
              </div>
            </div>
            <button onClick={handleStartAcquisition} className="btn-primary bg-phx-red/10 text-phx-red border-phx-red/30 hover:bg-phx-red hover:text-phx-deep mt-2">
              <RefreshCw size={16} />
              <span>Retry Acquisition Pipeline</span>
            </button>
          </div>
        )}

        {/* SOURCE PATH INPUT */}
        {acquisitionStage !== "done" && acquisitionStage !== "queued" && acquisitionStage !== "running" && (
          <div className="glass-panel shadow-lg overflow-hidden">
            <div className="bg-phx-surface/50 border-b border-phx-border p-6">
              <SectionHeading title="Source Path" subtitle="Enter the path to the DVR/NVR disk image or raw device on the server" icon={HardDrive} />
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-phx-secondary mb-2 font-mono tracking-wider">DISK IMAGE / RAW DEVICE PATH</label>
                  <input
                    type="text"
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                    placeholder="e.g., D:\evidence\dvr_image.img or \\.\PhysicalDrive2"
                    className="w-full px-4 py-3 bg-phx-deep border border-phx-border rounded-md text-sm text-phx-primary placeholder-phx-muted focus:outline-none focus:border-phx-cyan focus:ring-1 focus:ring-phx-cyan/50 transition-all font-mono shadow-inner"
                  />
                  <p className="text-xs text-phx-muted mt-2 font-mono">Must be accessible by the backend process.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-phx-secondary mb-2 font-mono tracking-wider">OUTPUT DIRECTORY</label>
                    <input
                      type="text"
                      value={outDir}
                      onChange={(e) => setOutDir(e.target.value)}
                      className="w-full px-4 py-3 bg-phx-deep border border-phx-border rounded-md text-sm text-phx-primary focus:outline-none focus:border-phx-cyan focus:ring-1 focus:ring-phx-cyan/50 transition-all font-mono shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-phx-secondary mb-2 font-mono tracking-wider">DEVICE INFO (optional)</label>
                    <input
                      type="text"
                      value={deviceInfo}
                      onChange={(e) => setDeviceInfo(e.target.value)}
                      placeholder="e.g., Hikvision DS-9016HUHI-K8 NVR"
                      className="w-full px-4 py-3 bg-phx-deep border border-phx-border rounded-md text-sm text-phx-primary focus:outline-none focus:border-phx-cyan focus:ring-1 focus:ring-phx-cyan/50 transition-all font-mono shadow-inner"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md border border-phx-border/50 bg-phx-surface hover:bg-phx-panel-lighter transition-colors">
                    <input
                      type="checkbox"
                      checked={encrypt}
                      onChange={(e) => setEncrypt(e.target.checked)}
                      className="w-4 h-4 accent-phx-cyan"
                    />
                    <span className="text-sm font-medium text-phx-primary">Encrypt evidence vault (AES-256-GCM, per-case DEK)</span>
                  </label>
                </div>

                <div className="p-5 bg-phx-surface rounded-lg border border-phx-border flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-inner mt-4">
                  <div className="flex items-start gap-3 text-sm text-phx-secondary max-w-xl">
                    <ShieldCheck className="w-5 h-5 text-phx-cyan shrink-0 mt-0.5" />
                    <p className="leading-relaxed">Read-only acquisition • SHA-256 + MD5 intake hashing • Verification on write</p>
                  </div>
                  <button
                    onClick={handleStartAcquisition}
                    disabled={!sourcePath.trim()}
                    className="btn-primary py-3 px-6 whitespace-nowrap text-sm font-bold shadow-lg shadow-phx-cyan/10 disabled:opacity-50 disabled:shadow-none"
                  >
                    <Lock size={18} />
                    <span>START ACQUISITION & LOCK HASH</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETED ACQUISITION SUMMARY */}
        {acquisitionStage === "done" && acquisitionResult && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="glass-panel p-6 border-phx-green/30 bg-phx-green/5 shadow-[0_0_15px_rgba(52,211,153,0.05)]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-phx-green/10 border border-phx-green/30 flex items-center justify-center text-phx-green shrink-0 shadow-[0_0_10px_rgba(52,211,153,0.2)]">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-phx-primary flex items-center gap-3">
                      Evidence Cryptographically Sealed
                      <Badge label="Link #1 Provenance" variant="cyan" />
                    </h3>
                    <p className="text-sm text-phx-secondary mt-1">
                      SHA-256 intake digest permanently registered in chain-of-custody log.
                    </p>
                  </div>
                </div>
                <div className="md:text-right">
                  <HashDisplay hash={acquisitionResult.hash} label="Intake Lock Hash" verified={true} />
                </div>
              </div>
            </div>

            <div className="glass-panel overflow-hidden shadow-lg">
              <div className="bg-phx-surface/50 border-b border-phx-border p-6">
                <SectionHeading title="Acquisition Artifact Summary" subtitle="Verified details of the acquired surveillance media dump" icon={FileCheck} />
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-phx-deep p-5 rounded-lg border border-phx-border shadow-inner">
                    <span className="text-[10px] font-mono font-bold text-phx-muted uppercase tracking-widest block mb-2">Source Image</span>
                    <span className="text-sm font-semibold text-phx-primary truncate block font-mono">{acquisitionResult.fileName}</span>
                  </div>
                  <div className="bg-phx-deep p-5 rounded-lg border border-phx-border shadow-inner">
                    <span className="text-[10px] font-mono font-bold text-phx-muted uppercase tracking-widest block mb-2">Total Size</span>
                    <span className="text-sm font-semibold text-phx-primary block font-mono">{formatBytes(acquisitionResult.fileSize)}</span>
                  </div>
                  <div className="bg-phx-deep p-5 rounded-lg border border-phx-border shadow-inner">
                    <span className="text-[10px] font-mono font-bold text-phx-muted uppercase tracking-widest block mb-2">Intake Timestamp</span>
                    <span className="text-sm font-semibold text-phx-primary block font-mono">{formatDate(acquisitionResult.acquiredAt)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-phx-border/50">
                  <button onClick={handleReacquire} className="btn-secondary">
                    <RefreshCw size={16} />
                    <span>Re-acquire Evidence</span>
                  </button>
                  <button onClick={() => navigate(`/cases/${id}/analysis`)} className="btn-primary px-8">
                    <span>Continue to Video Analysis</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}