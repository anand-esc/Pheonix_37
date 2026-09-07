import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  FileCheck, 
  ArrowLeft, 
  Printer, 
  Loader2, 
  ShieldCheck, 
  FileText, 
  HardDrive,
  Cpu
} from "lucide-react";
import { CaseNavigationTabs } from "../components/CaseNavigationTabs";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";
import { HashDisplay } from "../components/HashDisplay";
import { getCase, generateReport } from "../mockApi";
import { useRole } from "../context/RoleContext";

export function ReportPage() {
  const { id } = useParams();
  const { role } = useRole();

  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [caseData, setCaseData] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const handleGenerate = async () => {
      try {
        setIsGenerating(true);
        const c = await getCase(id);
        if (isMounted) setCaseData(c);

        const rep = await generateReport(id);
        if (isMounted) setReportData(rep);
      } catch (err) {
        console.error("Report generation failed", err);
      } finally {
        if (isMounted) setIsGenerating(false);
      }
    };

    handleGenerate();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const triggerGenerate = async () => {
    try {
      setIsGenerating(true);
      const rep = await generateReport(id);
      setReportData(rep);
    } catch (err) {
      console.error("Report generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const partA = reportData?.part_a;
  const partB = reportData?.part_b;

  return (
    <div className="space-y-6">
      {/* Hide navigation bar on print */}
      <div className="print:hidden">
        <CaseNavigationTabs />
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-8 space-y-6 pb-16">
        
        {/* Top Navigation & Role Bar */}
        <div className="flex items-center justify-between print:hidden">
          <Link to="/cases" className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-sky-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Active Role:</span>
            <span className="px-2.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-medium">
              {role}
            </span>
          </div>
        </div>

        {/* Outer Banner (Hidden on Print) */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs print:hidden">
          <div>
            <SectionHeading
              title={`BSA Section 63 Certificate — ${id}`}
              subtitle="Automated court-admissible electronic evidence compliance certificate"
              icon={FileCheck}
              badge={<Badge label="Draft Form" variant="indigo" size="sm" />}
            />
            <p className="text-xs text-slate-600">
              Dynamically assembled from intake hashes, filesystem signatures, and carved segment provenance logs.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={triggerGenerate}
              disabled={isGenerating}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin text-sky-600" /> : <FileText className="w-4 h-4 text-sky-600" />}
              <span>Regenerate Draft</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isGenerating || !reportData}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Export PDF</span>
            </button>
          </div>
        </div>

        {/* LOADING STATE */}
        {isGenerating && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-slate-500 shadow-2xs print:hidden">
            <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
            <span className="text-xs font-medium">Assembling case provenance data for BSA Section 63 Certificate...</span>
          </div>
        )}

        {/* STRUCTURED PAPER CERTIFICATE DOCUMENT (Distinct Document Surface) */}
        {!isGenerating && reportData && (
          <div className="bg-white border border-slate-300 rounded-xl p-8 lg:p-12 shadow-md space-y-8 print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
            
            {/* Certificate Header Stamp */}
            <div className="border-b border-slate-300 print:border-black pb-6 text-center space-y-2">
              <span className="px-3 py-1 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 uppercase tracking-widest print:bg-gray-200 print:text-black print:border-gray-400">
                FORM BSA-63 (CERTIFICATE OF ELECTRONIC EVIDENCE)
              </span>
              <h2 className="text-xl lg:text-2xl font-bold text-slate-900 print:text-black tracking-tight mt-2">
                BHARATIYA SAKSHYA ADHINIYAM 2023 — SECTION 63 COMPLIANCE
              </h2>
              <p className="text-xs text-slate-600 print:text-gray-700 italic max-w-2xl mx-auto">
                Official Certificate of Integrity and Chain-of-Custody for Surveillance DVR/NVR Media Records.
              </p>
              <p className="text-[11px] text-slate-500 print:text-gray-600 font-mono pt-1">
                Certificate Issued: {formatDate(reportData.reportTimestamp)}
              </p>
            </div>

            {/* PART A — DEVICE & EVIDENCE IDENTIFICATION */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 print:border-gray-300 pb-2">
                <h3 className="text-xs font-bold text-slate-900 print:text-black uppercase tracking-wider flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-sky-700 print:text-black" />
                  PART A — Device & Evidence Identification
                </h3>
                <span className="text-[10px] text-slate-500 font-mono print:hidden">
                  (Source: Intake & Dashboard)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Case Reference</span>
                  <span className="font-mono text-sky-800 print:text-black font-bold block text-sm">{partA.caseId}</span>
                  <span className="text-slate-800 print:text-gray-800 block text-xs">{partA.caseName}</span>
                </div>

                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Investigator / Custodian</span>
                  <span className="font-semibold text-slate-900 print:text-black block text-sm">{partA.custodian}</span>
                  <span className="text-slate-600 print:text-gray-700 block text-xs">Pipeline Status: {partA.status}</span>
                </div>

                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1 md:col-span-2">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Primary Evidence Media Dump</span>
                  {partA.fileName ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <span className="font-semibold text-slate-900 print:text-black text-xs">{partA.fileName} ({formatBytes(partA.fileSize)})</span>
                      <span className="text-[11px] text-slate-600 print:text-gray-600 font-mono">Acquired: {formatDate(partA.acquiredAt)}</span>
                    </div>
                  ) : (
                    <span className="text-rose-700 print:text-red-700 font-semibold block pt-1">Evidence file not uploaded — acquisition incomplete</span>
                  )}
                </div>

                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1.5 md:col-span-2">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Evidence Intake SHA-256 Digest</span>
                  {partA.evidenceHash ? (
                    <HashDisplay hash={partA.evidenceHash} label={null} verified={true} />
                  ) : (
                    <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-xs text-rose-700 font-medium">
                      Intake SHA-256 digest unavailable
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PART B — METHODOLOGY & ATTESTATION */}
            <div className="space-y-4 pt-4 border-t border-slate-200 print:border-gray-300">
              <div className="flex items-center justify-between border-b border-slate-200 print:border-gray-300 pb-2">
                <h3 className="text-xs font-bold text-slate-900 print:text-black uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-700 print:text-black" />
                  PART B — Forensic Methodology & Lineage Attestation
                </h3>
                <span className="text-[10px] text-slate-500 font-mono print:hidden">
                  (Source: Analysis Engine)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                
                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Filesystem Identification</span>
                  {partB.vendor ? (
                    <div className="space-y-0.5 pt-1">
                      <span className="font-bold text-slate-900 print:text-black block text-sm">{partB.vendor} ({partB.confidence}% confidence)</span>
                      <span className="font-mono text-sky-800 print:text-black text-xs block">{partB.fileSystem}</span>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic block pt-1">Format detection not yet run</span>
                  )}
                </div>

                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Analyzed Stream Segments</span>
                  <span className="font-bold text-slate-900 print:text-black block text-sm">{partB.segmentsSummary.total} Total Segments</span>
                  <div className="flex items-center gap-3 pt-1 text-[11px]">
                    <span className="text-emerald-700 print:text-emerald-800 font-medium">{partB.segmentsSummary.validated} Validated</span>
                    <span className="text-amber-700 print:text-amber-800 font-medium">{partB.segmentsSummary.fallback} Generic Fallback</span>
                    <span className="text-rose-700 print:text-rose-800 font-medium">{partB.segmentsSummary.research} Research Target</span>
                  </div>
                </div>

                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-1 md:col-span-2">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Fragment Recovery Summary</span>
                  {partB.recoverySummary.totalAttempts > 0 ? (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center gap-3 font-medium">
                        <span className="text-emerald-700 print:text-emerald-800 font-bold">{partB.recoverySummary.successCount} Recovered Successfully</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-rose-700 print:text-rose-700 font-bold">{partB.recoverySummary.failedCount} Recovery Failed</span>
                      </div>
                      {partB.recoverySummary.lastRecovery && (
                        <p className="text-[11px] text-slate-600 print:text-gray-700 font-mono">
                          Method: {partB.recoverySummary.lastRecovery.method} ({partB.recoverySummary.lastRecovery.confidence}% confidence)
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500 italic block pt-1">No recovery attempts recorded</span>
                  )}
                </div>

                <div className="bg-slate-50 print:bg-gray-50 p-4 rounded-lg border border-slate-200 print:border-gray-300 space-y-2 md:col-span-2">
                  <span className="text-[11px] font-medium text-slate-500 print:text-gray-600 uppercase">Provenance Chain Lineage Hashes</span>
                  <div className="space-y-2 font-mono text-[11px] pt-1">
                    <div className="p-2.5 rounded bg-white print:bg-white border border-slate-200 print:border-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-slate-600 print:text-gray-700 font-sans font-medium">Link 1 (Intake Hash):</span>
                      <span className="text-sky-800 print:text-black font-bold">{partA.evidenceHash ? truncateHash(partA.evidenceHash, 14) : "Incomplete"}</span>
                    </div>

                    <div className="p-2.5 rounded bg-white print:bg-white border border-slate-200 print:border-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-slate-600 print:text-gray-700 font-sans font-medium">Link 2 (Parsed Stream Hash):</span>
                      <span className="text-sky-800 print:text-black font-bold">{partB.parsedHash ? truncateHash(partB.parsedHash, 14) : "Incomplete"}</span>
                    </div>

                    <div className="p-2.5 rounded bg-white print:bg-white border border-slate-200 print:border-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-slate-600 print:text-gray-700 font-sans font-medium">Link 3 (Carved Segment Hash):</span>
                      {partB.recoverySummary.lastRecovery?.status === "success" ? (
                        <span className="text-emerald-700 print:text-emerald-800 font-bold">{truncateHash(partB.recoverySummary.lastRecovery.recoveredHash, 14)}</span>
                      ) : partB.recoverySummary.lastRecovery?.status === "failed" ? (
                        <span className="text-rose-700 print:text-red-700 font-bold">Recovery Incomplete / Failed</span>
                      ) : (
                        <span className="text-slate-500 font-normal">Pending Carving</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* EXPERT ATTESTATION STATEMENT */}
              <div className="bg-slate-50 print:bg-gray-100 p-6 rounded-lg border border-slate-200 print:border-gray-400 space-y-4 pt-4">
                <h4 className="text-xs font-bold text-slate-900 print:text-black uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 print:text-black" />
                  Forensic Examiner Attestation
                </h4>
                <p className="text-xs text-slate-700 print:text-gray-800 leading-relaxed">
                  "I hereby certify that the electronic record extracted from the DVR device described in Part A has been acquired, processed, and cryptographically verified in accordance with Bharatiya Sakshya Adhiniyam 2023 (BSA) Section 63 standards. The raw evidence SHA-256 intake digest remained un-tampered throughout the forensic analysis pipeline."
                </p>

                {/* SIGNATURE BLOCKS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-8 border-t border-slate-300 print:border-gray-400">
                  <div className="space-y-6">
                    <div className="border-b border-slate-400 print:border-black h-8" />
                    <div>
                      <span className="font-bold text-slate-900 print:text-black text-xs block">{partA.custodian}</span>
                      <span className="text-[11px] text-slate-500 print:text-gray-600 block">System Custodian Signature (Part A)</span>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="border-b border-slate-400 print:border-black h-8" />
                    <div>
                      <span className="font-bold text-slate-900 print:text-black text-xs block">Technical Forensic Examiner</span>
                      <span className="text-[11px] text-slate-500 print:text-gray-600 block">Technical Analyst Signature (Part B)</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}

function truncateHash(hash, len = 8) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.substring(0, len)}...${hash.substring(hash.length - len)}`;
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
    }) + " IST";
  } catch {
    return isoString;
  }
}
