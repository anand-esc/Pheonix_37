// Single API layer for the Phoenix backend. Every request carries the
// X-Operator-ID header; the backend enforces RBAC on it and answers 401/403.

const isElectron =
  typeof window !== "undefined" &&
  (window.location?.protocol === "file:" ||
    (typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent || "")));

// In the browser the Vite dev server proxies /api and /acquisition to the
// backend; inside Electron the renderer talks to the local backend directly.
const DEFAULT_HOST = isElectron ? "http://127.0.0.1:8000" : "";
const API_BASE = import.meta.env.VITE_API_BASE || `${DEFAULT_HOST}/api`;
const ACQ_BASE = import.meta.env.VITE_ACQ_BASE || `${DEFAULT_HOST}/acquisition`;

// Mirrors backend/ledger/rbac.py ROLE_PERMISSIONS. The backend is the
// authority; this only lets the UI disable what a role cannot do.
export const ROLE_ACTIONS = {
  INVESTIGATOR: ["VIEW_EVIDENCE", "RUN_CARVING", "ANALYZE_TIMELINE"],
  TECHNICAL_EXPERT: ["VALIDATE_PARSER", "GENERATE_CERT_DRAFT", "EXPORT_REPORT"],
  AUDITOR: ["READ_LEDGER", "VERIFY_INTEGRITY", "AUDIT_LOGS"],
  COURT_EXPORT: ["EXPORT_BUNDLE", "VIEW_CERTIFICATE"],
};

// Operator ids registered in backend/api/shared.py DEFAULT_OPERATORS.
export const OPERATORS = [
  { id: "investigator-01", label: "Investigator", role: "INVESTIGATOR" },
  { id: "technical-expert-01", label: "Technical Expert", role: "TECHNICAL_EXPERT" },
  { id: "auditor-01", label: "Auditor", role: "AUDITOR" },
  { id: "court-export-01", label: "Court / Export", role: "COURT_EXPORT" },
];

export function getOperatorId() {
  return localStorage.getItem("phoenix_operator_id") || OPERATORS[0].id;
}

export function setOperatorId(id) {
  localStorage.setItem("phoenix_operator_id", id);
}

export function getOperatorRole(operatorId = getOperatorId()) {
  return OPERATORS.find((o) => o.id === operatorId)?.role || OPERATORS[0].role;
}

function authHeaders() {
  return { "X-Operator-ID": getOperatorId() };
}

function url(base, path) {
  return `${base}${path}`;
}

async function readError(res) {
  const body = await res.json().catch(() => null);
  const detail = body && body.detail;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return `HTTP ${res.status} ${res.statusText}`.trim();
}

async function fetchJson(target, options = {}) {
  const res = await fetch(target, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
export async function createCase(data) {
  return fetchJson(url(API_BASE, "/cases"), { method: "POST", body: JSON.stringify(data) });
}

export async function deleteCase(caseId) {
  return fetchJson(url(API_BASE, `/cases/${encodeURIComponent(caseId)}`), { method: "DELETE" });
}

export async function getCases() {
  return fetchJson(url(API_BASE, "/cases"));
}

/** The locked Case contract, flattened into what the pages render. */
export async function getCase(caseId) {
  const raw = await fetchJson(url(API_BASE, `/case/${encodeURIComponent(caseId)}`));
  if (!raw) return null;
  const item = raw.evidence_items?.[0] || null;
  const lineage = item?.hash_lineage || [];
  const intake =
    lineage.find((h) => h.pipeline_stage === "intake" && h.algorithm === "SHA-256") ||
    lineage.find((h) => h.pipeline_stage === "intake");
  const meta = item?.metadata || {};
  const fragmentCount = item?.fragments?.length || 0;
  const sealed = lineage.some((h) => String(h.pipeline_stage).startsWith("pre_encryption"));

  let status = "Intake";
  if (item) status = sealed ? "Reported" : fragmentCount > 0 ? "Recovered" : "Processing";

  return {
    id: raw.case_id,
    name: `Case ${raw.case_id}`,
    examiner: raw.investigator_id || "Unassigned",
    custodian: raw.custodian_id || null,
    createdAt: raw.intake_timestamp_utc,
    status,
    hasEvidence: Boolean(item),
    evidence: item
      ? {
          hash: intake?.hex_digest || "",
          fileName: item.source_device_info || "evidence.img",
          fileSize: Number(meta.bytes_read || 0),
          acquiredAt: meta.acquired_utc || raw.intake_timestamp_utc,
          imagePath: meta.image_path || "",
          sourcePath: meta.source_path || "",
          vendor: item.vendor_info?.vendor_name || "",
          validationStatus: item.vendor_info?.validation_status || "",
          adapter: meta.adapter || "",
          recoveryMethod: meta.recovery_method || "",
        }
      : null,
    evidence_items: raw.evidence_items || [],
  };
}

export async function getCaseFragments(caseId) {
  return fetchJson(url(API_BASE, `/case/${encodeURIComponent(caseId)}/fragments`));
}

export async function getCaseLedger(caseId) {
  return fetchJson(url(API_BASE, `/case/${encodeURIComponent(caseId)}/ledger`));
}

/** Per-channel timeline from encoder parameters (relative seconds, no wall clock). */
export async function getCaseTimeline(caseId) {
  return fetchJson(url(API_BASE, `/case/${encodeURIComponent(caseId)}/timeline`));
}

export async function streamFragment(caseId, fragmentIndex, rangeHeader) {
  const headers = authHeaders();
  if (rangeHeader) headers.Range = rangeHeader;
  const res = await fetch(
    url(API_BASE, `/case/${encodeURIComponent(caseId)}/fragments/${fragmentIndex}/stream`),
    { headers },
  );
  if (!res.ok) throw new Error(await readError(res));
  return res;
}

/** The stream endpoint, fetched with the operator header and saved to disk. */
export async function downloadFragment(caseId, fragmentIndex, filename) {
  const res = await fetch(
    url(API_BASE, `/case/${encodeURIComponent(caseId)}/fragments/${fragmentIndex}/stream`),
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename || `${caseId}-fragment-${fragmentIndex}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/** Where the recovered bytes for one fragment can be streamed from. */
export function fragmentStreamUrl(caseId, fragmentIndex) {
  return url(API_BASE, `/case/${encodeURIComponent(caseId)}/fragments/${fragmentIndex}/stream`);
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------
export async function startAcquisitionRun(request) {
  return fetchJson(url(ACQ_BASE, "/runs"), { method: "POST", body: JSON.stringify(request) });
}

export async function getAcquisitionRun(jobId) {
  return fetchJson(url(ACQ_BASE, `/runs/${encodeURIComponent(jobId)}`));
}

export async function getAcquisitionResult(jobId) {
  return fetchJson(url(ACQ_BASE, `/runs/${encodeURIComponent(jobId)}/result`));
}

/** The demonstration image path, when demo/build_demo_case.py has been run. */
export async function getDemoSource() {
  try {
    return await fetchJson(url(API_BASE, "/demo/source"));
  } catch {
    return { available: false, source_path: null };
  }
}

export async function detectFormat(sourcePath) {
  return fetchJson(url(ACQ_BASE, "/detect"), {
    method: "POST",
    body: JSON.stringify({ source_path: sourcePath }),
  });
}

export async function pollAcquisitionRun(jobId, onProgress, intervalMs = 2000) {
  for (;;) {
    const run = await getAcquisitionRun(jobId);
    if (onProgress) onProgress(run);
    if (run.status === "completed") {
      const result = await getAcquisitionResult(jobId);
      return { run, result };
    }
    if (run.status === "failed") throw new Error(run.error || "Acquisition failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---------------------------------------------------------------------------
// Audit ledger (global demo controls)
// ---------------------------------------------------------------------------
export async function getLedgerChain() {
  return fetchJson(url(API_BASE, "/ledger/chain"));
}

export async function verifyLedgerChain() {
  return fetchJson(url(API_BASE, "/ledger/verify"), { method: "POST" });
}

export async function tamperLedgerBlock(index, payload) {
  return fetchJson(url(API_BASE, "/ledger/tamper"), {
    method: "POST",
    body: JSON.stringify({ index, payload }),
  });
}

export async function restoreLedgerChain() {
  return fetchJson(url(API_BASE, "/ledger/restore"), { method: "POST" });
}

export async function simulateLedgerAccess(operatorId, action) {
  return fetchJson(url(API_BASE, "/ledger/simulate-access"), {
    method: "POST",
    body: JSON.stringify({ operator_id: operatorId, action }),
  });
}

export async function probeDahua(dataB64, filePath) {
  const params = new URLSearchParams();
  if (dataB64) params.set("data_b64", dataB64);
  if (filePath) params.set("file_path", filePath);
  return fetchJson(url(API_BASE, `/ledger/dahua/probe?${params.toString()}`));
}

// ---------------------------------------------------------------------------
// BSA §63 certificate draft
// ---------------------------------------------------------------------------
export async function generateCertificate(caseId) {
  return fetchJson(url(API_BASE, `/case/${encodeURIComponent(caseId)}/certificate`), {
    method: "POST",
  });
}

/** Fetches the PDF with the operator header and hands it to the browser as a download. */
export async function downloadCertificate(caseId) {
  const res = await fetch(
    url(API_BASE, `/case/${encodeURIComponent(caseId)}/certificate/download`),
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `BSA63-Certificate-${caseId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    return (
      d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) + " IST"
    );
  } catch {
    return isoString;
  }
}

export function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function mapBackendStatus(statusStr) {
  if (!statusStr) return "Intake";
  const s = String(statusStr).toUpperCase();
  if (s === "COMPLETED" || s === "REPORTED") return "Reported";
  if (s === "RECOVERY_COMPLETE" || s === "RECOVERED") return "Recovered";
  if (s === "PROCESSING" || s === "RUNNING") return "Processing";
  return "Intake";
}

const LEDGER_LABELS = {
  GENESIS: "Genesis block",
  intake_started: "Intake started",
  intake_completed: "Intake hash locked",
  intake_failed: "Intake failed",
  format_detected: "Format detected",
  adapter_resolved: "Adapter resolved",
  recovery_started: "Recovery started",
  recovery_completed: "Recovery completed",
  fragment_exported: "Fragment exported",
  encryption_completed: "Encryption completed",
  ACCESS_GRANTED: "Access granted",
  ACCESS_DENIED: "Access denied",
};

const LEDGER_TYPES = {
  GENESIS: "genesis",
  intake_failed: "tampered",
  intake_completed: "verified",
  format_detected: "detected",
  adapter_resolved: "detected",
  recovery_started: "recovered",
  recovery_completed: "recovered",
  fragment_exported: "recovered",
  encryption_completed: "verified",
  ACCESS_DENIED: "halted",
};

/** Shapes a /case/{id}/ledger row for the ChainOfCustody component. */
export function mapLedgerEntry(row) {
  if (!row) return null;
  const eventType = row.event_type || "";
  const short = (h) => (h ? `${String(h).slice(0, 16)}…` : "");
  let detail = "";
  if (row.payload_hash) detail = `payload ${short(row.payload_hash)}  prev ${short(row.prev_hash)}`;
  else if (row.stage) detail = `stage ${row.stage} (transcript, unsigned)`;
  return {
    ...row,
    id: row.index ?? `${eventType}-${row.timestamp}`,
    type: LEDGER_TYPES[eventType] || "detected",
    label: LEDGER_LABELS[eventType] || eventType.replace(/_/g, " "),
    timestamp: row.timestamp ? formatDate(row.timestamp) : "",
    detail,
  };
}
