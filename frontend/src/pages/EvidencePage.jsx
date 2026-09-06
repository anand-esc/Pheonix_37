import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  UploadCloud, 
  FileCheck, 
  ArrowLeft, 
  ArrowRight, 
  ShieldCheck, 
  Loader2, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  AlertCircle, 
  Lock
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { HashDisplay } from "../components/HashDisplay";
import { getCase, acquireEvidence, resetCaseEvidence } from "../mockApi";
import { useRole } from "../context/RoleContext";

export function EvidencePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [isLoadingCase, setIsLoadingCase] = useState(true);

  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [acquisitionStage, setAcquisitionStage] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [acquisitionResult, setAcquisitionResult] = useState(null);
  const [acquisitionError, setAcquisitionError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchCaseDetails = async () => {
      try {
        setIsLoadingCase(true);
        const c = await getCase(id);
        if (isMounted) {
          setCaseData(c);
          if (c && c.hasEvidence && c.evidence) {
            setAcquisitionResult(c.evidence);
            setAcquisitionStage("done");
          }
        }
      } catch (err) {
        console.error("Failed to load case", err);
      } finally {
        if (isMounted) setIsLoadingCase(false);
      }
    };

    fetchCaseDetails();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleStartAcquisition = async () => {
    if (!selectedFile) return;

    try {
      setAcquisitionStage("reading");
      setStatusMessage("Reading disk image headers & sector layout...");
      setAcquisitionError(null);

      const result = await acquireEvidence(id, selectedFile, (stageUpdate) => {
        setAcquisitionStage(stageUpdate.status);
        if (stageUpdate.message) {
          setStatusMessage(stageUpdate.message);
        }
      });

      setAcquisitionResult(result);
      setAcquisitionStage("done");

      setCaseData((prev) => ({
        ...prev,
        hasEvidence: true,
        status: "Processing",
        evidence: result,
      }));
    } catch (err) {
      console.error("Acquisition failed", err);
      setAcquisitionStage("error");
      setAcquisitionError(err.message || "Failed to complete acquisition pipeline.");
    }
  };

  const handleReacquire = async () => {
    await resetCaseEvidence(id);
    setSelectedFile(null);
    setAcquisitionStage("idle");
    setAcquisitionResult(null);
    setAcquisitionError(null);

    setCaseData((prev) => ({
      ...prev,
      hasEvidence: false,
      status: "Intake",
      evidence: null,
    }));
  };

  if (isLoadingCase) {
    return (
      <div className="space-y-6">
        <CaseNavigationTabs />
        <div className="max-w-5xl mx-auto px-4 py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-7 h-7 text-sky-600 animate-spin" />
          <span className="text-xs font-medium">Loading case details...</span>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="space-y-6">
        <CaseNavigationTabs />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Case Not Found</h2>
          <p className="text-xs text-slate-500">Case ID "{id}" could not be retrieved from the database.</p>
          <Link to="/cases" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-xs font-medium text-sky-700 rounded-lg hover:bg-slate-50 shadow-2xs">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Case Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CaseNavigationTabs />

      <div className="max-w-5xl mx-auto px-4 lg:px-8 space-y-6 pb-12">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link to="/cases" className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-sky-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-medium">
              {role}
            </span>
          </div>
        </div>

        {/* Case Info Heading Card */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-2xs">
          <SectionHeading
            title={`Evidence Intake — ${caseData.id}`}
            subtitle={caseData.name}
            icon={UploadCloud}
            badge={<Badge label={caseData.status} />}
          />
          <p className="text-xs text-slate-600 leading-relaxed">
            Perform SHA-256 intake hashing on raw DVR/NVR disk images to establish the first link in the court-admissible provenance chain.
          </p>
        </div>

        {/* LIVE ACQUISITION PROGRESS STRIP */}
        {(acquisitionStage === "reading" || acquisitionStage === "hashing") && (
          <div className="bg-white border border-sky-300 rounded-xl p-6 shadow-xs space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-sky-600 animate-spin" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {acquisitionStage === "reading" && "Stage 1/2 — Reading Disk Image..."}
                    {acquisitionStage === "hashing" && "Stage 2/2 — Computing SHA-256 Intake Digest..."}
                  </h3>
                  <p className="text-xs text-sky-700 font-mono mt-0.5">{statusMessage}</p>
                </div>
              </div>
              <Badge label="Processing" variant="amber" />
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div 
                className="bg-sky-600 h-full transition-all duration-500"
                style={{ width: acquisitionStage === "reading" ? "45%" : "85%" }}
              />
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {acquisitionStage === "error" && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-800">
              <AlertCircle className="w-6 h-6 text-rose-600" />
              <div>
                <h3 className="text-sm font-bold">Acquisition Failed</h3>
                <p className="text-xs text-rose-600 mt-0.5">{acquisitionError}</p>
              </div>
            </div>
            <button
              onClick={handleStartAcquisition}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Acquisition Pipeline</span>
            </button>
          </div>
        )}

        {/* FILE UPLOAD DROPZONE */}
        {acquisitionStage !== "done" && acquisitionStage !== "reading" && acquisitionStage !== "hashing" && (
          <div className="space-y-6">
            {!selectedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-4 bg-white ${
                  isDragging
                    ? "border-sky-500 bg-sky-50/50 scale-[1.01]"
                    : "border-slate-300 hover:border-sky-400 hover:bg-slate-50/60"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shadow-2xs">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Drag & Drop Disk Image File
                  </h3>
                  <p className="text-xs text-slate-500">
                    Or click anywhere to select raw surveillance stream image from disk
                  </p>
                  <p className="text-[11px] text-slate-400 pt-2 font-mono">
                    Supports WFS (Hikvision), DHFS (Dahua), RAW, DD, IMG & NAL Carving containers
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-6 shadow-2xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{selectedFile.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        File Size: <span className="font-semibold text-slate-700">{formatBytes(selectedFile.size)}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-xs text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-rose-300 transition-colors"
                  >
                    Remove File
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                    <span>Ready for raw byte hashing & BSA Sec 63 ledger lock</span>
                  </div>
                  
                  <button
                    onClick={handleStartAcquisition}
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Lock Intake Hash</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PERSISTENT COMPLETED ACQUISITION SUMMARY */}
        {acquisitionStage === "done" && acquisitionResult && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-6 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-100 border border-sky-300 flex items-center justify-center text-sky-800">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      Evidence Cryptographically Sealed
                      <Badge label="Link #1 Provenance" variant="cyan" size="sm" />
                    </h3>
                    <p className="text-xs text-slate-600">
                      SHA-256 intake digest permanently registered in chain-of-custody log.
                    </p>
                  </div>
                </div>

                <div className="self-start sm:self-auto">
                  <HashDisplay hash={acquisitionResult.hash} label="Intake Lock Hash" verified={true} />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-2xs">
              <SectionHeading
                title="Acquisition Artifact Summary"
                subtitle="Verified details of the acquired surveillance media dump"
                icon={FileCheck}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Source Image</span>
                  <span className="text-xs font-semibold text-slate-900 truncate block mt-1">{acquisitionResult.fileName}</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Total Size</span>
                  <span className="text-xs font-semibold text-slate-900 block mt-1">{formatBytes(acquisitionResult.fileSize)}</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Intake Timestamp</span>
                  <span className="text-xs font-semibold text-slate-900 block mt-1">{formatDate(acquisitionResult.acquiredAt)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
                <button
                  onClick={handleReacquire}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-acquire Evidence</span>
                </button>

                <button
                  onClick={() => navigate(`/cases/${id}/analysis`)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer"
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " IST";
  } catch {
    return isoString;
  }
}
