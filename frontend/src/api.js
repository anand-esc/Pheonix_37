const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const ACQ_BASE = import.meta.env.VITE_ACQ_BASE || "/acquisition";

function getAuthHeaders() {
  const operatorId = localStorage.getItem("phoenix_operator_id") || "investigator-01";
  return {
    "X-Operator-ID": operatorId,
    "Content-Type": "application/json",
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getCases() {
  return fetchJson(`${API_BASE}/cases`);
}

export async function getCase(caseId) {
  return fetchJson(`${API_BASE}/case/${encodeURIComponent(caseId)}`);
}

export async function getCaseFragments(caseId) {
  return fetchJson(`${API_BASE}/case/${encodeURIComponent(caseId)}/fragments`);
}

export async function getCaseLedger(caseId) {
  return fetchJson(`${API_BASE}/case/${encodeURIComponent(caseId)}/ledger`);
}

export async function getCaseStatus(caseId) {
  return fetchJson(`${API_BASE}/case/${encodeURIComponent(caseId)}/status`);
}

export async function streamFragment(caseId, fragmentIndex, rangeHeader) {
  const operatorId = localStorage.getItem("phoenix_operator_id") || "investigator-01";
  const headers = { "X-Operator-ID": operatorId };
  if (rangeHeader) headers.Range = rangeHeader;
  const res = await fetch(`${API_BASE}/case/${encodeURIComponent(caseId)}/fragments/${fragmentIndex}/stream`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export async function startAcquisitionRun(request) {
  return fetchJson(`${ACQ_BASE}/runs`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getAcquisitionRun(jobId) {
  return fetchJson(`${ACQ_BASE}/runs/${encodeURIComponent(jobId)}`);
}

export async function getAcquisitionResult(jobId) {
  return fetchJson(`${ACQ_BASE}/runs/${encodeURIComponent(jobId)}/result`);
}

export async function getAcquisitionEvents(jobId) {
  return fetchJson(`${ACQ_BASE}/runs/${encodeURIComponent(jobId)}/events`);
}

export async function detectFormat(sourcePath) {
  return fetchJson(`${ACQ_BASE}/detect`, {
    method: "POST",
    body: JSON.stringify({ source_path: sourcePath }),
  });
}

export async function getLedgerChain() {
  return fetchJson(`${API_BASE}/ledger/chain`);
}

export async function verifyLedger() {
  return fetchJson(`${API_BASE}/ledger/verify`, { method: "POST" });
}

export async function simulateAccess(operatorId, action) {
  return fetchJson(`${API_BASE}/ledger/simulate-access`, {
    method: "POST",
    body: JSON.stringify({ operator_id: operatorId, action }),
  });
}

export function setOperatorId(id) {
  localStorage.setItem("phoenix_operator_id", id);
}

export function getOperatorId() {
  return localStorage.getItem("phoenix_operator_id") || "investigator-01";
}

export const ROLES = [
  { id: "investigator-01", label: "Investigator", role: "INVESTIGATOR" },
  { id: "technical-expert-01", label: "Technical Expert", role: "TECHNICAL_EXPERT" },
  { id: "auditor-01", label: "Auditor", role: "AUDITOR" },
  { id: "court-export-01", label: "Court / Export", role: "COURT_EXPORT" },
];

export async function pollAcquisitionRun(jobId, onProgress, intervalMs = 1000) {
  while (true) {
    const run = await getAcquisitionRun(jobId);
    if (onProgress) onProgress(run);
    if (run.status === "completed" || run.status === "failed") {
      if (run.status === "completed") {
        const result = await getAcquisitionResult(jobId);
        return { run, result };
      }
      throw new Error(run.error || "Acquisition failed");
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

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
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) + " IST";
  } catch { return isoString; }
}

export function mapBackendStatus(statusStr) {
  if (!statusStr) return "Intake";
  const s = String(statusStr).toUpperCase();
  if (s === "COMPLETED" || s === "REPORTED") return "Reported";
  if (s === "RECOVERY_COMPLETE" || s === "RECOVERED") return "Recovered";
  if (s === "PROCESSING" || s === "RUNNING") return "Processing";
  return "Intake";
}