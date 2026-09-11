import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Loader2, ShieldCheck, HardDrive, Cpu, Terminal, Copy } from "lucide-react";
import { getCase, getCaseFragments, formatBytes, formatDate } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";

export function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [c, frags] = await Promise.all([getCase(id), getCaseFragments(id)]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
        }
      } catch (err) {
        console.error("Failed to load case data", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const handlePrint = async () => {
    if (window.electronAPI?.exportPDF) {
      const filePath = await window.electronAPI.exportPDF(`BSA63-Certificate-${id}.pdf`);
      if (filePath) {
        alert(`Certificate exported successfully to:\n${filePath}`);
      }
    } else {
      window.print();
    }
  };

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); };

  const partA = caseData ? {
    caseId: caseData.id || id,
    caseName: caseData.name || "DVR Forensic Case",
    custodian: caseData.examiner || "Unassigned Examiner",
    status: caseData.status,
    evidenceHash: caseData.evidence?.hash || null,
    fileName: caseData.evidence?.fileName || null,
    fileSize: caseData.evidence?.fileSize || null,
    acquiredAt: caseData.evidence?.acquiredAt || null,
  } : null;

  const validatedCount = fragments.filter(f => f.recovery_method?.includes("VALIDATED") || f.recovery_method === "DHAV_PARSER").length;
  const fallbackCount = fragments.filter(f => f.recovery_method?.includes("GENERIC") || f.recovery_method === "annexb_nal_carve").length;
  const researchCount = fragments.filter(f => f.recovery_method?.includes("RESEARCH")).length;

  const statusMap = {
    "Intake": "pending",
    "Processing": "pending",
    "Recovered": "validated",
    "Reported": "validated",
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-phx-red animate-spin" />
          <span className="font-mono text-xs text-phx-muted tracking-widest uppercase">LOADING CERTIFICATE DATA...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 no-print">
        <button
          onClick={() => navigate(`/cases/${id}`)}
          className="flex items-center gap-2 text-sm text-phx-secondary hover:text-phx-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Case Detail</span>
        </button>
        <div className="flex items-center gap-2 text-xs text-phx-muted bg-phx-surface px-3 py-1.5 rounded border border-phx-border">
          <span>Active Role:</span>
          <strong className="text-phx-primary">{role}</strong>
        </div>
      </div>

      <div className="no-print mb-6">
        <CaseHeader
          caseId={caseData?.id || id}
          title={caseData?.name || `Case ${id}`}
          status={statusMap[caseData?.status] || "pending"}
          statusLabel="BSA §63 Certificate Draft"
        />
      </div>

      <div className="bg-white border border-phx-border shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-center rounded-lg no-print">
        <Terminal className="w-5 h-5 text-phx-red shrink-0" />
        <div className="flex-1 min-w-[240px]">
          <strong className="text-sm text-phx-red block">Official PDF Certificate</strong>
          <p className="text-xs text-phx-secondary mt-1">
            Generate the official BSA §63 certificate PDF. This will invoke the backend reporting engine.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const api = await import("../api");
              await api.generateCertificate(id);
              alert("Certificate generated! You can now download it.");
            } catch (err) {
              alert("Generation failed: " + err.message);
            }
          }}
          className="btn-primary text-xs"
        >
          <ShieldCheck size={14} />
          <span>Generate Certificate</span>
        </button>
        <button
          onClick={async () => {
            const api = await import("../api");
            window.location.href = api.getCertificateDownloadUrl(id);
          }}
          className="btn-secondary text-xs"
        >
          <Printer size={14} />
          <span>Download PDF</span>
        </button>
      </div>

      <div className="print-a4 bg-white border border-phx-border rounded-lg p-8 md:p-12 font-serif text-black">
        <div className="text-center mb-10 pb-6 border-b border-phx-border">
          <span className="inline-block px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded font-mono text-[10px] font-bold tracking-widest uppercase mb-4">
            FORM BSA-63 (CERTIFICATE OF ELECTRONIC EVIDENCE)
          </span>
          <h2 className="text-2xl font-bold text-black mb-2 leading-snug">
            BHARATIYA SAKSHYA ADHINIYAM 2023 — SECTION 63 COMPLIANCE
          </h2>
          <p className="text-sm text-gray-600 italic max-w-2xl mx-auto">
            Official Certificate of Integrity and Chain-of-Custody for Surveillance DVR/NVR Media Records.
          </p>
          <p className="font-mono text-[10px] text-gray-400 mt-4">
            Certificate Preview Generated: {new Date().toISOString()}
          </p>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h3 className="flex items-center gap-2 font-sans text-xs font-bold text-amber-700 tracking-wider uppercase">
              <HardDrive size={16} />
              PART A — Device & Evidence Identification
            </h3>
            <span className="font-mono text-[10px] text-gray-400 no-print">
              (Source: Intake & Dashboard)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CertField label="Case Reference" value={partA.caseId} mono />
            <CertField label="Case Title" value={partA.caseName} />
            <CertField label="Investigator / Custodian" value={partA.custodian} mono />
            <CertField label="Pipeline Status" value={partA.status} />
            <CertField
              label="Primary Evidence Media Dump"
              value={partA.fileName ? `${partA.fileName} (${formatBytes(partA.fileSize)})` : "Evidence file not uploaded — acquisition incomplete"}
              mono
              error={!partA.fileName}
              subLabel={partA.fileName ? `Acquired: ${formatDate(partA.acquiredAt)}` : null}
            />
            <CertField
              label="Evidence Intake SHA-256 Digest"
              value={partA.evidenceHash || "Intake SHA-256 digest unavailable"}
              mono
              error={!partA.evidenceHash}
            />
          </div>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h3 className="flex items-center gap-2 font-sans text-xs font-bold text-amber-700 tracking-wider uppercase">
              <Cpu size={16} />
              PART B — Forensic Methodology & Lineage Attestation
            </h3>
            <span className="font-mono text-[10px] text-gray-400 no-print">
              (Source: Analysis Engine)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CertField
              label="Filesystem Identification"
              value="Format detection not yet run — see Analysis tab"
            />
            <CertField
              label="Analyzed Stream Segments"
              value={`${fragments.length} Total Segments`}
              subLabel={`${validatedCount} Validated • ${fallbackCount} Generic Fallback • ${researchCount} Research Target`}
            />
            <CertField
              label="Fragment Recovery Summary"
              value="No recovery attempts recorded — pipeline uses generic carving only"
            />
            <CertField
              label="Provenance Chain Lineage Hashes"
              value=""
            >
              <div className="flex flex-col gap-2">
                <LineageRow label="Link 1 (Intake Hash):" value={partA.evidenceHash ? truncateHash(partA.evidenceHash, 14) : "Incomplete"} />
                <LineageRow label="Link 2 (Parsed Stream Hash):" value="Run detection on Analysis tab" />
                <LineageRow label="Link 3 (Carved Segment Hash):" value="Available in pipeline output (custody_facts.json)" />
              </div>
            </CertField>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="flex items-center gap-2 font-sans text-xs font-bold text-amber-700 tracking-wider uppercase mb-4 pb-2 border-b border-gray-200">
            <ShieldCheck size={16} />
            Forensic Examiner Attestation
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed mb-8 italic">
            "I hereby certify that the electronic record extracted from the DVR device described in Part A has been acquired, processed, and cryptographically verified in accordance with Bharatiya Sakshya Adhiniyam 2023 (BSA) Section 63 standards. The raw evidence SHA-256 intake digest remained un-tampered throughout the forensic analysis pipeline."
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <AttestationLine label="System Custodian Signature (Part A)" name={partA.custodian} />
            <AttestationLine label="Technical Analyst Signature (Part B)" name="Technical Forensic Examiner" />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center no-print">
        <button onClick={async () => {
            const api = await import("../api");
            window.location.href = api.getCertificateDownloadUrl(id);
          }} className="btn-primary px-6 py-2.5">
          <Printer size={18} />
          <span>Download Generated PDF</span>
        </button>
      </div>
    </div>
  );
}

function CertField({ label, value, mono = false, error = false, subLabel = null, children = null }) {
  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded flex flex-col gap-1.5 cert-field">
      <span className="font-mono text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
      {children ? children : (
        <>
          <span className={`${mono ? "font-mono text-sm font-semibold break-all" : "font-serif text-[15px] font-medium"} ${error ? "text-red-600" : "text-black"}`}>
            {value}
          </span>
          {subLabel && <span className="font-mono text-[11px] text-gray-400 mt-1">{subLabel}</span>}
        </>
      )}
    </div>
  );
}

function LineageRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 p-2 bg-white border border-gray-200 rounded text-xs font-mono">
      <span className="text-gray-500 font-sans font-medium">{label}</span>
      <span className="text-amber-700 font-semibold">{value}</span>
    </div>
  );
}

function AttestationLine({ label, name }) {
  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="h-px bg-black" />
      <div>
        <span className="font-serif text-sm font-semibold text-black block">{name}</span>
        <span className="font-mono text-[10px] text-gray-500 block mt-1">{label}</span>
      </div>
    </div>
  );
}

function truncateHash(hash, len = 8) {
  if (!hash) return "";
  if (hash.length <= len * 2) return hash;
  return `${hash.substring(0, len)}...${hash.substring(hash.length - len)}`;
}