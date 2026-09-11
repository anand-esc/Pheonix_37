const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const ACQ_BASE = import.meta.env.VITE_ACQ_BASE || "/acquisition";

const ROLE_ACTIONS = {
  INVESTIGATOR: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "TRIGGER_ACQUISITION"],
  TECHNICAL_EXPERT: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "TRIGGER_ACQUISITION", "RUN_DETECTION"],
  AUDITOR: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "VIEW_LEDGER"],
  COURT_EXPORT: ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "GENERATE_CERTIFICATE"],
};

function getOperatorId() {
  return localStorage.getItem("phoenix_operator_id") || "investigator-01";
}

function getOperatorRole() {
  const roleMap = {
    "investigator-01": "INVESTIGATOR",
    "technical-expert-01": "TECHNICAL_EXPERT",
    "auditor-01": "AUDITOR",
    "court-export-01": "COURT_EXPORT",
  };
  return roleMap[getOperatorId()] || "INVESTIGATOR";
}

function getAuthHeaders(action) {
  const operatorId = getOperatorId();
  const headers = {
    "X-Operator-ID": operatorId,
    "Content-Type": "application/json",
  };
  if (action) {
    const role = getOperatorRole();
    const allowedActions = ROLE_ACTIONS[role] || [];
    if (!allowedActions.includes(action)) {
      console.warn(`Action ${action} not allowed for role ${role}`);
    }
  }
  return headers;
}

function buildUrl(base, path, action) {
  const url = new URL(`${base}${path}`, window.location.origin);
  if (action) {
    url.searchParams.set("action", action);
  }
  return url.toString();
}

async function fetchJson(url, options = {}, action) {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(action), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}


export async function createCase(data) {
  return fetchJson(buildUrl(API_BASE, "/cases"), {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteCase(caseId) {
  return fetchJson(buildUrl(API_BASE, `/cases/${caseId}`), {
    method: "DELETE",
  });
}

export async function getCases() {
  return fetchJson(buildUrl(API_BASE, "/cases", "VIEW_EVIDENCE"));
}

export async function getCase(caseId) {
  const rawCase = await fetchJson(buildUrl(API_BASE, `/case/${encodeURIComponent(caseId)}`, "VIEW_EVIDENCE"));
  if (!rawCase) return null;
  
  const hasEvidence = rawCase.evidence_items && rawCase.evidence_items.length > 0;
  let evidence = null;
  if (hasEvidence) {
    const item = rawCase.evidence_items[0];
    const intakeHash = item.hash_lineage && item.hash_lineage.length > 0 ? item.hash_lineage[0].hex_digest : "";
    evidence = {
      hash: intakeHash,
      fileName: item.evidence_id,
      fileSize: 0,
      acquiredAt: rawCase.intake_timestamp_utc
    };
  }

  return {
    id: rawCase.case_id || rawCase.id,
    name: rawCase.name || (rawCase.case_id ? `Case ${rawCase.case_id}` : "DVR Forensic Case"),
    examiner: rawCase.investigator_id || rawCase.examiner || "Unassigned",
    createdAt: rawCase.intake_timestamp_utc || rawCase.createdAt,
    status: mapBackendStatus(rawCase.status),
    hasEvidence,
    evidence,
    parsedHash: rawCase.parsedHash || null,
    parsedAt: rawCase.parsedAt || null,
    recoveries: {},
    anchors: []
  };
}

export async function getCaseFragments(caseId) {
  return fetchJson(buildUrl(API_BASE, `/case/${encodeURIComponent(caseId)}/fragments`, "VIEW_EVIDENCE"));
}

export async function getCaseLedger(caseId) {
  return fetchJson(buildUrl(API_BASE, `/case/${encodeURIComponent(caseId)}/ledger`, "VIEW_LEDGER"));
}

export async function streamFragment(caseId, fragmentIndex, rangeHeader) {
  const operatorId = getOperatorId();
  const headers = { "X-Operator-ID": operatorId };
  if (rangeHeader) headers.Range = rangeHeader;
  const url = buildUrl(API_BASE, `/case/${encodeURIComponent(caseId)}/fragments/${fragmentIndex}/stream`, "VIEW_EVIDENCE");
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export async function startAcquisitionRun(request) {
  return fetchJson(buildUrl(ACQ_BASE, "/runs", "TRIGGER_ACQUISITION"), {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getAcquisitionRun(jobId) {
  return fetchJson(buildUrl(ACQ_BASE, `/runs/${encodeURIComponent(jobId)}`, "VIEW_EVIDENCE"));
}

export async function getAcquisitionResult(jobId) {
  return fetchJson(buildUrl(ACQ_BASE, `/runs/${encodeURIComponent(jobId)}/result`, "VIEW_EVIDENCE"));
}

export async function getAcquisitionEvents(jobId) {
  return fetchJson(buildUrl(ACQ_BASE, `/runs/${encodeURIComponent(jobId)}/events`, "VIEW_EVIDENCE"));
}

export async function detectFormat(sourcePath) {
  return fetchJson(buildUrl(ACQ_BASE, "/detect", "RUN_DETECTION"), {
    method: "POST",
    body: JSON.stringify({ source_path: sourcePath }),
  });
}

export async function getLedgerChain() {
  return fetchJson(buildUrl(API_BASE, "/ledger/chain", "VIEW_LEDGER"));
}

export async function verifyLedgerChain() {
  return fetchJson(buildUrl(API_BASE, "/ledger/verify", "VIEW_LEDGER"), {
    method: "POST",
  });
}

export async function tamperLedgerBlock(index, payload) {
  return fetchJson(buildUrl(API_BASE, "/ledger/tamper", "VIEW_LEDGER"), {
    method: "POST",
    body: JSON.stringify({ index, payload }),
  });
}

export async function restoreLedgerChain() {
  return fetchJson(buildUrl(API_BASE, "/ledger/restore", "VIEW_LEDGER"), {
    method: "POST",
  });
}

export async function simulateLedgerAccess(operatorId, action) {
  return fetchJson(buildUrl(API_BASE, "/ledger/simulate-access", "VIEW_LEDGER"), {
    method: "POST",
    body: JSON.stringify({ operator_id: operatorId, action }),
  });
}

export async function probeDahua(dataB64, filePath) {
  const params = new URLSearchParams();
  if (dataB64) params.set("data_b64", dataB64);
  if (filePath) params.set("file_path", filePath);
  return fetchJson(buildUrl(API_BASE, `/ledger/dahua/probe?${params.toString()}`, "VIEW_EVIDENCE"));
}

export async function pollAcquisitionRun(jobId, onProgress, intervalMs = 2000) {
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

export function setOperatorId(id) {
  localStorage.setItem("phoenix_operator_id", id);
}

export { getOperatorId, getOperatorRole };

export const OPERATORS = [
  { id: "investigator-01", label: "Investigator", role: "INVESTIGATOR" },
  { id: "technical-expert-01", label: "Technical Expert", role: "TECHNICAL_EXPERT" },
  { id: "auditor-01", label: "Auditor", role: "AUDITOR" },
  { id: "court-export-01", label: "Court / Export", role: "COURT_EXPORT" },
];

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

export function mapLedgerEntry(entry) {
  if (!entry) return null;
  const eventType = entry.event_type || entry.type || "";
  if (eventType === "GENESIS") return { ...entry, type: "genesis" };
  if (entry.verification_failed === true) return { ...entry, type: "tampered" };
  const typeMap = {
    "FORMAT_DETECTED": "detected",
    "RECOVERY_COMPLETED": "recovered",
    "VERIFICATION_PASSED": "verified",
    "ENCRYPTION_COMPLETED": "verified",
    "CHAIN_HALTED": "halted",
  };
  return { ...entry, type: typeMap[eventType] || "detected" };
}
export async function generateCertificate(caseId) {
  return fetchJson(buildUrl(API_BASE, `/case/${encodeURIComponent(caseId)}/certificate`, "VIEW_EVIDENCE"), {
    method: "POST"
  });
}

export function getCertificateDownloadUrl(caseId) {
  return buildUrl(API_BASE, `/case/${encodeURIComponent(caseId)}/certificate/download`, "VIEW_EVIDENCE");
}
