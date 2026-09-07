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
            setAcquisitionStage("done");
            setAcquisitionResult({
              hash: c.evidence?.hash || "",
              fileName: c.evidence?.fileName || "",
              fileSize: c.evidence?.fileSize || 0,
              acquiredAt: c.evidence?.acquiredAt || "",
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
        <div className="max-w-5xl mx-auto px-4 py-16 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
            <span>POLLING CASE DATA...</span>
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
          <AlertCircle className="w-12 h-12 text-[var(--accent-red)] mx-auto" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Case Not Found</h2>
          <p className="text-[11px] text-[var(--text-muted)]">Case ID "{id}" could not be retrieved from the database.</p>
          <button
            onClick={() => navigate("/cases")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border)] text-[11px] font-medium text-[var(--accent-cyan)] rounded cursor-pointer hover:border-[var(--accent-cyan)]"
          >
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

      <div className="max-w-5xl mx-auto px-4 lg:px-8 space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/cases")}
            className="inline-flex items-center gap-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors bg-transparent border-none cursor-pointer font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-[var(--text-muted)]">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border border-[rgba(240,169,58,0.2)] font-mono">
              {role}
            </span>
          </div>
        </div>

        <div className="data-panel p-6">
          <SectionHeading
            title={`Evidence Intake — ${caseData.id}`}
            subtitle={caseData.name}
            icon={HardDrive}
            badge={<Badge label={caseData.status} />}
          />
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Perform SHA-256 intake hashing on raw DVR/NVR disk images to establish the first link in the court-admissible provenance chain.
            Source path must be accessible on the server filesystem (e.g., <code className="text-[var(--accent-amber)] bg-[var(--accent-amber-dim)] px-1 rounded font-mono">D:\\evidence\\dvr.img</code>).
          </p>
        </div>

        {/* ACQUISITION PROGRESS STRIP */}
        {(acquisitionStage === "queued" || acquisitionStage === "running") && (
          <div className="data-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
                  <span>
                    {acquisitionStage === "queued" && "QUEUE — INITIALIZING PIPELINE"}{" "}
                    {acquisitionStage === "running" && "RUN — READING DISK IMAGE"}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-[var(--accent-cyan)]">{statusMessage || "Processing..."}</p>
                  {progressBytes > 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] font-mono">Bytes read: {formatBytes(progressBytes)}</p>
                  )}
                </div>
              </div>
              <Badge label="Processing" variant="amber" />
            </div>

            <div className="w-full bg-[var(--bg-deep)] rounded h-2 overflow-hidden border border-[var(--border)]">
              <div
                className="bg-[var(--accent-cyan)] h-full transition-all duration-500"
                style={{ width: acquisitionStage === "queued" ? "10%" : "60%" }}
              />
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {acquisitionStage === "error" && (
          <div className="data-panel p-6 space-y-4 border-[rgba(248,113,113,0.3)]">
            <div className="flex items-center gap-3 text-[var(--accent-red)]">
              <AlertCircle className="w-6 h-6" />
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Acquisition Failed</h3>
                <p className="text-[11px] text-[var(--accent-red)] mt-0.5 font-mono">{acquisitionError}</p>
              </div>
            </div>
            <button
              onClick={handleStartAcquisition}
              className="px-4 py-2 bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.3)] text-[var(--accent-red)] text-[11px] font-medium rounded cursor-pointer hover:bg-[rgba(248,113,113,0.2)] transition-colors font-mono"
            >
              <RefreshCw className="w-4 h-4 inline mr-1" />
              <span>Retry Acquisition Pipeline</span>
            </button>
          </div>
        )}

        {/* SOURCE PATH INPUT */}
        {acquisitionStage !== "done" && acquisitionStage !== "queued" && acquisitionStage !== "running" && (
          <div className="space-y-6">
            <div className="data-panel p-6 space-y-6">
              <SectionHeading title="Source Path" subtitle="Enter the path to the DVR/NVR disk image or raw device on the server" icon={HardDrive} />

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-2 font-mono">DISK IMAGE / RAW DEVICE PATH</label>
                  <input
                    type="text"
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                    placeholder="e.g., D:\\evidence\\dvr_image.img or \\\\.\\PhysicalDrive2"
                    className="w-full px-4 py-2.5 bg-[var(--bg-deep)] border border-[var(--border)] rounded text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:bg-[var(--bg-panel)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all font-mono"
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">Must be accessible by the backend process.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-2 font-mono">OUTPUT DIRECTORY</label>
                    <input
                      type="text"
                      value={outDir}
                      onChange={(e) => setOutDir(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[var(--bg-deep)] border border-[var(--border)] rounded text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] focus:bg-[var(--bg-panel)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-2 font-mono">DEVICE INFO (optional)</label>
                    <input
                      type="text"
                      value={deviceInfo}
                      onChange={(e) => setDeviceInfo(e.target.value)}
                      placeholder="e.g., Hikvision DS-9016HUHI-K8 NVR"
                      className="w-full px-4 py-2.5 bg-[var(--bg-deep)] border border-[var(--border)] rounded text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] focus:bg-[var(--bg-panel)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={encrypt}
                      onChange={(e) => setEncrypt(e.target.checked)}
                      className="w-4 h-4 accent-[var(--accent-cyan)]"
                    />
                    <span className="text-[11px] text-[var(--text-secondary)]">Encrypt evidence vault (AES-256-GCM, per-case DEK)</span>
                  </label>
                </div>

                <div className="p-4 bg-[var(--bg-deep)] rounded border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                    <ShieldCheck className="w-4 h-4 text-[var(--accent-cyan)]" />
                    <span>Read-only acquisition • SHA-256 + MD5 intake hashing • Verification on write</span>
                  </div>
                  <button
                    onClick={handleStartAcquisition}
                    disabled={!sourcePath.trim()}
                    className="px-5 py-2.5 bg-[var(--accent-cyan)]/10 border border-[rgba(62,214,196,0.3)] text-[var(--accent-cyan)] font-medium text-[11px] rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-mono transition-all hover:bg-[var(--accent-cyan-dim)]"
                  >
                    <Lock className="w-4 h-4" />
                    <span>START ACQUISITION & LOCK INTAKE HASH</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETED ACQUISITION SUMMARY */}
        {acquisitionStage === "done" && acquisitionResult && (
          <div className="space-y-6">
            <div className="data-panel p-6 space-y-4 border-[rgba(62,214,196,0.2)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-[var(--accent-green-dim)] border border-[rgba(52,211,153,0.3)] flex items-center justify-center text-[var(--accent-green)]">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      Evidence Cryptographically Sealed
                      <Badge label="Link #1 Provenance" variant="cyan" size="sm" />
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      SHA-256 intake digest permanently registered in chain-of-custody log.
                    </p>
                  </div>
                </div>
                <div className="self-start sm:self-auto">
                  <HashDisplay hash={acquisitionResult.hash} label="Intake Lock Hash" verified={true} />
                </div>
              </div>
            </div>

            <div className="data-panel p-6 space-y-6">
              <SectionHeading title="Acquisition Artifact Summary" subtitle="Verified details of the acquired surveillance media dump" icon={FileCheck} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[var(--bg-deep)] p-3.5 rounded border border-[var(--border)]">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Source Image</span>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate block mt-1 font-mono">{acquisitionResult.fileName}</span>
                </div>
                <div className="bg-[var(--bg-deep)] p-3.5 rounded border border-[var(--border)]">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Total Size</span>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] block mt-1">{formatBytes(acquisitionResult.fileSize)}</span>
                </div>
                <div className="bg-[var(--bg-deep)] p-3.5 rounded border border-[var(--border)]">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Intake Timestamp</span>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] block mt-1 font-mono">{formatDate(acquisitionResult.acquiredAt)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
                <button
                  onClick={handleReacquire}
                  className="px-4 py-2 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded cursor-pointer border border-[var(--border)] hover:border-[var(--border-light)] transition-colors font-mono"
                >
                  <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                  <span>Re-acquire Evidence</span>
                </button>
                <button
                  onClick={() => navigate(`/cases/${id}/analysis`)}
                  className="px-6 py-2.5 bg-[var(--accent-cyan)]/10 border border-[rgba(62,214,196,0.3)] text-[var(--accent-cyan)] font-medium text-[11px] rounded cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[var(--accent-cyan-dim)] font-mono"
                >
                  <span>Continue to Video Analysis</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}