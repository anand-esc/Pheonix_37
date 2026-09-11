import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Loader2, ShieldCheck, HardDrive, Cpu, Terminal, AlertCircle } from "lucide-react";
import {
  getCase, getCaseFragments, formatBytes, formatDate,
  generateCertificate, downloadCertificate,
} from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";

export function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, can } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const [c, frags] = await Promise.all([getCase(id), getCaseFragments(id)]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
        }
      } catch (err) {
        console.error("Failed to load case data", err);
        if (isMounted) setLoadError(err.message || "Failed to load case data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const handleGenerate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await generateCertificate(id);
      setMessage({ ok: true, text: "Certificate draft generated. Download it below." });
    } catch (err) {
      setMessage({ ok: false, text: `Generation failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await downloadCertificate(id);
    } catch (err) {
      setMessage({ ok: false, text: `Download failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const statusMap = { Intake: "pending", Processing: "pending", Recovered: "validated", Reported: "validated" };

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

  if (loadError || !caseData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex gap-4">
          <AlertCircle size={24} className="text-red-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-800 mb-1">Case Load Error</h3>
            <p className="text-sm text-red-700">{loadError || `Case "${id}" could not be retrieved.`}</p>
            <button onClick={() => navigate("/cases")} className="mt-4 btn-secondary text-sm">Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  const evidence = caseData.evidence;
  const lineage = caseData.evidence_items?.[0]?.hash_lineage || [];
  const digestFor = (predicate) => lineage.find(predicate)?.hex_digest || null;
  const intakeHash = evidence?.hash || null;
  const verifyHash = digestFor((h) => h.pipeline_stage === "intake_verify");
  const sealedHash = digestFor((h) => String(h.pipeline_stage).startsWith("pre_encryption"));

  const carved = fragments.filter((f) => f.recovery_method === "annexb_nal_carve").length;
  const vendorParsed = fragments.length - carved;
  const canGenerate = can("GENERATE_CERT_DRAFT");

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
          caseId={caseData.id || id}
          title={caseData.name || `Case ${id}`}
          status={statusMap[caseData.status] || "pending"}
          statusLabel="BSA §63 Certificate Draft"
        />
      </div>

      <div className="bg-white border border-phx-border shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-center rounded-lg no-print">
        <Terminal className="w-5 h-5 text-phx-red shrink-0" />
        <div className="flex-1 min-w-[240px]">
          <strong className="text-sm text-phx-red block">Official PDF Certificate Draft</strong>
          <p className="text-xs text-phx-secondary mt-1">
            The backend reporting engine renders the draft from the pipeline&apos;s custody facts.
            It is unsigned until a responsible official reviews and signs it.
            {!canGenerate && " Generating requires the Technical Expert role."}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={busy || !canGenerate || !caseData.hasEvidence}
          title={canGenerate ? "" : "Switch to Technical Expert to generate the draft"}
          className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldCheck size={14} />
          <span>Generate Certificate</span>
        </button>
        <button onClick={handleDownload} disabled={busy} className="btn-secondary text-xs disabled:opacity-40">
          <Printer size={14} />
          <span>Download PDF</span>
        </button>
      </div>

      {message && (
        <div className={`no-print mb-6 rounded-lg border p-3 text-sm ${message.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="print-a4 bg-white border border-phx-border rounded-lg p-8 md:p-12 font-serif text-black">
        <div className="text-center mb-10 pb-6 border-b border-phx-border">
          <span className="inline-block px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded font-mono text-[10px] font-bold tracking-widest uppercase mb-4">
            FORM BSA-63 (CERTIFICATE OF ELECTRONIC EVIDENCE) — PREVIEW
          </span>
          <h2 className="text-2xl font-bold text-black mb-2 leading-snug">
            BHARATIYA SAKSHYA ADHINIYAM 2023 — SECTION 63 COMPLIANCE
          </h2>
          <p className="text-sm text-gray-600 italic max-w-2xl mx-auto">
            Preview of the integrity and chain-of-custody facts recorded by the pipeline. The
            generated PDF is the reviewable draft.
          </p>
          <p className="font-mono text-[10px] text-gray-400 mt-4">
            Preview rendered: {new Date().toISOString()}
          </p>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h3 className="flex items-center gap-2 font-sans text-xs font-bold text-amber-700 tracking-wider uppercase">
              <HardDrive size={16} />
              PART A — Device & Evidence Identification
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CertField label="Case Reference" value={caseData.id || id} mono />
            <CertField label="Case Title" value={caseData.name} />
            <CertField label="Investigator" value={caseData.examiner} mono />
            <CertField label="Custodian" value={caseData.custodian || "Not recorded"} mono error={!caseData.custodian} />
            <CertField label="Pipeline Status" value={caseData.status} />
            <CertField
              label="Primary Evidence Media"
              value={evidence ? `${evidence.fileName} (${formatBytes(evidence.fileSize)})` : "Evidence not acquired yet"}
              mono
              error={!evidence}
              subLabel={evidence ? `Acquired: ${formatDate(evidence.acquiredAt)}` : null}
            />
            <CertField
              label="Evidence Intake SHA-256 Digest"
              value={intakeHash || "Intake SHA-256 digest unavailable"}
              mono
              error={!intakeHash}
            />
          </div>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h3 className="flex items-center gap-2 font-sans text-xs font-bold text-amber-700 tracking-wider uppercase">
              <Cpu size={16} />
              PART B — Forensic Methodology & Lineage Attestation
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CertField
              label="Filesystem Identification"
              value={evidence?.vendor ? `${evidence.vendor} (${evidence.validationStatus})` : "Detection not recorded"}
              error={!evidence?.vendor}
            />
            <CertField
              label="Analyzed Stream Segments"
              value={`${fragments.length} recovered fragments`}
              subLabel={`${vendorParsed} vendor-parsed • ${carved} generic carve`}
            />
            <CertField
              label="Recovery Engine"
              value={evidence?.adapter || "Not recorded"}
              mono
              subLabel={evidence?.recoveryMethod ? `method: ${evidence.recoveryMethod}` : null}
            />
            <CertField label="Provenance Chain Lineage Hashes" value="">
              <div className="flex flex-col gap-2">
                <LineageRow label="Link 1 (Intake hash):" value={intakeHash ? truncateHash(intakeHash, 14) : "Incomplete"} />
                <LineageRow label="Link 2 (Post-write verification):" value={verifyHash ? truncateHash(verifyHash, 14) : "Not verified"} />
                <LineageRow label="Link 3 (First sealed fragment):" value={sealedHash ? truncateHash(sealedHash, 14) : "Vault not sealed"} />
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
            &quot;I certify that the electronic record described in Part A was acquired read-only,
            hashed at intake, verified after write, and that the recovered fragments were hashed
            before encryption, as recorded in the pipeline&apos;s custody facts.&quot;
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <AttestationLine label="Certifying official (to be completed on review)" name="" />
            <AttestationLine label="Technical analyst" name={caseData.examiner} />
          </div>
        </div>
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
        <span className="font-serif text-sm font-semibold text-black block min-h-[1.25rem]">{name}</span>
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
