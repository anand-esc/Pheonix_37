/**
 * Mock API for Case Management, Evidence Acquisition, Detection, Recovery, Legal Reporting & Timeline Anchors
 * Contract:
 * - getCases() -> Promise<Array<{ id, name, examiner, createdAt, status, hasEvidence, evidence, parsedHash, recoveries, anchors }>>
 * - getCase(id) -> Promise<{ id, name, examiner, createdAt, status, hasEvidence, evidence, parsedHash, recoveries, anchors } | null>
 * - createCase({ name, examiner }) -> Promise<{ id, name, examiner, createdAt, status, hasEvidence }>
 * - acquireEvidence(caseId, file, onProgress) -> Promise<{ status, hash, fileName, fileSize, acquiredAt }>
 * - resetCaseEvidence(caseId) -> Promise<boolean>
 * - detectFormat(caseId) -> Promise<{ vendor, confidence, fileSystem, parsedHash }>
 * - getSegments(caseId) -> Promise<Array<{ id, channel, start, end, sizeBytes, status, deleted, corrupted }>>
 * - recoverSegment(caseId, segmentId) -> Promise<{ status, confidence, recoveredHash, method, message }>
 * - generateReport(caseId) -> Promise<{ reportTimestamp, part_a, part_b }>
 * - addAnchor(caseId, segmentIdA, segmentIdB) -> Promise<Array<{ id, segmentIdA, segmentIdB, markedAt }>>
 * - getAnchors(caseId) -> Promise<Array<{ id, segmentIdA, segmentIdB, markedAt }>>
 */

// In-memory case storage seeded with fake cases covering all 4 statuses
let casesStore = [
  {
    id: "CASE-2026-001",
    name: "Bank Vault Hikvision NVR Extraction",
    examiner: "Insp. S. Sharma",
    createdAt: "2026-09-01T10:30:00Z",
    status: "Reported",
    hasEvidence: true,
    evidence: {
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      fileName: "dvr_dump_hikvision_vault4.raw",
      fileSize: 4294967296,
      acquiredAt: "2026-09-01T10:32:15Z",
    },
    parsedHash: "b4c2a1e8f9d0c3b7a6e5f4d3c2b1a0e9f8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3",
    parsedAt: "2026-09-01T10:35:00Z",
    recoveries: {},
    anchors: [
      { id: "ANC-001", segmentIdA: "SEG-001", segmentIdB: "SEG-002", markedAt: "2026-09-01T11:00:00Z" }
    ],
  },
  {
    id: "CASE-2026-002",
    name: "Traffic Junction Dahua DHFS Carving",
    examiner: "Tech. Expert R. Verma",
    createdAt: "2026-09-03T14:15:00Z",
    status: "Recovered",
    hasEvidence: true,
    evidence: {
      hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      fileName: "dahua_dhfs_stream_ch1_4.dd",
      fileSize: 2147483648,
      acquiredAt: "2026-09-03T14:18:40Z",
    },
    parsedHash: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    parsedAt: "2026-09-03T14:20:00Z",
    recoveries: {},
    anchors: [],
  },
  {
    id: "CASE-2026-003",
    name: "Store CCTV Raw Image Intake",
    examiner: "Insp. A. Patel",
    createdAt: "2026-09-05T09:00:00Z",
    status: "Processing",
    hasEvidence: true,
    evidence: {
      hash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      fileName: "store_cctv_master.img",
      fileSize: 1073741824,
      acquiredAt: "2026-09-05T09:05:10Z",
    },
    parsedHash: "1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e",
    parsedAt: "2026-09-05T09:08:00Z",
    recoveries: {},
    anchors: [],
  },
  {
    id: "CASE-2026-004",
    name: "Warehouse Perimeter NAL Unit Recovery",
    examiner: "Auditor K. Singh",
    createdAt: "2026-09-06T11:45:00Z",
    status: "Intake",
    hasEvidence: false,
    evidence: null,
    parsedHash: null,
    parsedAt: null,
    recoveries: {},
    anchors: [],
  },
];

// Mock segment database for analysis & timeline viewer
const mockSegmentsStore = {
  default: [
    {
      id: "SEG-001",
      channel: "CH-01 (Main Gate)",
      start: "2026-09-01 08:00:00 IST",
      end: "2026-09-01 12:30:00 IST",
      sizeBytes: 1572864000,
      status: "validated",
      deleted: false,
      corrupted: false,
    },
    {
      id: "SEG-002",
      channel: "CH-02 (Vault Entry)",
      start: "2026-09-01 08:15:00 IST",
      end: "2026-09-01 10:45:00 IST",
      sizeBytes: 943718400,
      status: "validated",
      deleted: false,
      corrupted: false,
    },
    {
      id: "SEG-003",
      channel: "CH-02 (Vault Entry)",
      start: "2026-09-01 10:45:01 IST",
      end: "2026-09-01 11:20:00 IST",
      sizeBytes: 524288000,
      status: "validated",
      deleted: true,
      corrupted: false,
    },
    {
      id: "SEG-004",
      channel: "CH-03 (Loading Bay)",
      start: "2026-09-01 09:00:00 IST",
      end: "2026-09-01 13:00:00 IST",
      sizeBytes: 1887436800,
      status: "fallback",
      deleted: false,
      corrupted: false,
    },
    {
      id: "SEG-005",
      channel: "CH-03 (Loading Bay)",
      start: "2026-09-01 13:00:01 IST",
      end: "2026-09-01 13:40:00 IST",
      sizeBytes: 314572800,
      status: "fallback",
      deleted: false,
      corrupted: true,
    },
    {
      id: "SEG-006",
      channel: "CH-04 (Perimeter Rear)",
      start: "2026-09-01 07:30:00 IST",
      end: "2026-09-01 11:00:00 IST",
      sizeBytes: 1258291200,
      status: "research",
      deleted: false,
      corrupted: false,
    },
    {
      id: "SEG-007",
      channel: "CH-04 (Perimeter Rear)",
      start: "2026-09-01 11:00:01 IST",
      end: "2026-09-01 11:35:00 IST",
      sizeBytes: 209715200,
      status: "research",
      deleted: true,
      corrupted: true,
    },
  ],
};

/**
 * Fetch all cases
 */
export function getCases() {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const response = await fetch("/api/cases");
        if (response.ok) {
          const apiCases = await response.json();
          if (Array.isArray(apiCases) && apiCases.length > 0) {
            const mappedCases = apiCases.map((c) => {
              const existingLocal = casesStore.find(item => item.id === (c.case_id || c.id));
              return {
                id: c.case_id || c.id,
                name: c.case_id ? `Case ${c.case_id}` : (c.name || "DVR Forensic Case"),
                examiner: c.investigator_id || c.examiner || "Unassigned",
                createdAt: c.intake_timestamp_utc || c.createdAt || new Date().toISOString(),
                status: mapBackendStatus(c.status),
                hasEvidence: typeof c.hasEvidence === "boolean" ? c.hasEvidence : (c.evidence_count || 0) > 0,
                evidence: existingLocal ? existingLocal.evidence : null,
                parsedHash: existingLocal ? existingLocal.parsedHash : null,
                parsedAt: existingLocal ? existingLocal.parsedAt : null,
                recoveries: existingLocal ? existingLocal.recoveries || {} : {},
                anchors: existingLocal ? existingLocal.anchors || [] : [],
              };
            });

            mappedCases.forEach((mc) => {
              if (!casesStore.some((item) => item.id === mc.id)) {
                casesStore.unshift(mc);
              }
            });
            resolve([...casesStore]);
            return;
          }
        }
      } catch (err) {
        // Fallback to local store
      }
      resolve([...casesStore]);
    }, 300);
  });
}

/**
 * Fetch a single case by ID
 */
export function getCase(caseId) {
  return new Promise(async (resolve) => {
    const all = await getCases();
    const found = all.find((c) => c.id === caseId);
    resolve(found || null);
  });
}

/**
 * Create a new case
 */
export function createCase({ name, examiner }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const newId = `CASE-2026-${String(casesStore.length + 1).padStart(3, "0")}`;
      const newCase = {
        id: newId,
        name: name || "Untitled Case",
        examiner: examiner || "Unassigned",
        createdAt: new Date().toISOString(),
        status: "Intake",
        hasEvidence: false,
        evidence: null,
        parsedHash: null,
        parsedAt: null,
        recoveries: {},
        anchors: [],
      };

      casesStore.unshift(newCase);
      resolve(newCase);
    }, 400);
  });
}

/**
 * Acquire evidence for a case with multi-stage progress reporting
 */
export function acquireEvidence(caseId, file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided for evidence acquisition"));
      return;
    }

    const fakeHash = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    onProgress({
      status: "reading",
      message: "Reading disk image headers & sector structure...",
    });

    setTimeout(() => {
      onProgress({
        status: "hashing",
        message: "Computing SHA-256 intake digest on raw bytes...",
      });

      setTimeout(() => {
        const acquiredAt = new Date().toISOString();
        const evidenceData = {
          hash: fakeHash,
          fileName: file.name,
          fileSize: file.size,
          acquiredAt,
        };

        onProgress({
          status: "done",
          message: "Acquisition complete & SHA-256 locked",
          hash: fakeHash,
          fileName: file.name,
          fileSize: file.size,
          acquiredAt,
        });

        const targetCase = casesStore.find((c) => c.id === caseId);
        if (targetCase) {
          targetCase.hasEvidence = true;
          targetCase.status = "Processing";
          targetCase.evidence = evidenceData;
        }

        resolve({
          status: "done",
          hash: fakeHash,
          fileName: file.name,
          fileSize: file.size,
          acquiredAt,
        });
      }, 1200);
    }, 800);
  });
}

/**
 * Reset evidence state for a case
 */
export function resetCaseEvidence(caseId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const targetCase = casesStore.find((c) => c.id === caseId);
      if (targetCase) {
        targetCase.hasEvidence = false;
        targetCase.status = "Intake";
        targetCase.evidence = null;
        targetCase.parsedHash = null;
        targetCase.parsedAt = null;
        targetCase.recoveries = {};
        targetCase.anchors = [];
      }
      resolve(true);
    }, 200);
  });
}

/**
 * Detect DVR format & filesystem
 */
export function detectFormat(caseId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const targetCase = casesStore.find((c) => c.id === caseId);
      
      if (targetCase && !targetCase.parsedHash) {
        targetCase.parsedHash = Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("");
        targetCase.parsedAt = new Date().toISOString();
      }

      const parsedHash = targetCase?.parsedHash || "b4c2a1e8f9d0c3b7a6e5f4d3c2b1a0e9f8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3";

      if (caseId === "CASE-2026-002") {
        resolve({
          vendor: "Dahua Technology",
          confidence: 91,
          fileSystem: "DHFS v3.1 / DHAV Stream Container",
          parsedHash,
        });
      } else {
        resolve({
          vendor: "Hikvision",
          confidence: 94,
          fileSystem: "WFS v2.4 (Proprietary Disk Format)",
          parsedHash,
        });
      }
    }, 600);
  });
}

/**
 * Fetch segments found on the drive/image
 */
export function getSegments(caseId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([...mockSegmentsStore.default]);
    }, 500);
  });
}

/**
 * Recover a specific deleted/corrupted segment
 */
export function recoverSegment(caseId, segmentId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const targetCase = casesStore.find((c) => c.id === caseId);

      if (segmentId === "SEG-007") {
        const failureResult = {
          segmentId,
          status: "failed",
          confidence: 0,
          recoveredHash: null,
          method: "Generic NAL Carver Fallback",
          message: "Data sector overwritten by ring-buffer. Unrecoverable keyframes.",
          timestamp: new Date().toISOString(),
        };
        if (targetCase) {
          if (!targetCase.recoveries) targetCase.recoveries = {};
          targetCase.recoveries[segmentId] = failureResult;
          targetCase.lastRecovery = failureResult;
        }
        resolve(failureResult);
        return;
      }

      if (segmentId === "SEG-005") {
        const fakeHash = Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("");
        const lowConfResult = {
          segmentId,
          status: "success",
          confidence: 38,
          recoveredHash: fakeHash,
          method: "Generic NAL Unit Carver",
          message: "Partial frame sequence carved with visual compression artifacts.",
          timestamp: new Date().toISOString(),
        };
        if (targetCase) {
          if (!targetCase.recoveries) targetCase.recoveries = {};
          targetCase.recoveries[segmentId] = lowConfResult;
          targetCase.lastRecovery = lowConfResult;
        }
        resolve(lowConfResult);
        return;
      }

      const fakeHash = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      const highConfResult = {
        segmentId,
        status: "success",
        confidence: 92,
        recoveredHash: fakeHash,
        method: "WFS Journal Recovery Engine",
        message: "100% keyframes & synchronized audio stream restored.",
        timestamp: new Date().toISOString(),
      };
      if (targetCase) {
        if (!targetCase.recoveries) targetCase.recoveries = {};
        targetCase.recoveries[segmentId] = highConfResult;
        targetCase.lastRecovery = highConfResult;
        targetCase.status = "Recovered";
      }
      resolve(highConfResult);
    }, 1500);
  });
}

/**
 * Generate a BSA Section 63 report by reading the current case object
 */
export function generateReport(caseId) {
  return new Promise(async (resolve) => {
    const targetCase = await getCase(caseId);
    let fmt = null;
    let segs = [];

    try {
      fmt = await detectFormat(caseId);
    } catch {}

    try {
      segs = await getSegments(caseId);
    } catch {}

    const segSummary = {
      total: segs.length,
      validated: segs.filter((s) => s.status === "validated").length,
      fallback: segs.filter((s) => s.status === "fallback").length,
      research: segs.filter((s) => s.status === "research").length,
    };

    const recs = targetCase?.recoveries ? Object.values(targetCase.recoveries) : [];
    const recSuccess = recs.filter((r) => r.status === "success").length;
    const recFailed = recs.filter((r) => r.status === "failed").length;

    const recSummary = {
      totalAttempts: recs.length,
      successCount: recSuccess,
      failedCount: recFailed,
      lastRecovery: targetCase?.lastRecovery || null,
    };

    const reportTimestamp = new Date().toISOString();

    if (targetCase) {
      targetCase.status = "Reported";
    }

    setTimeout(() => {
      resolve({
        reportTimestamp,
        part_a: {
          caseId: targetCase?.id || caseId,
          caseName: targetCase?.name || "DVR Forensic Case",
          custodian: targetCase?.examiner || "Unassigned Examiner",
          status: targetCase?.status || "Processing",
          evidenceHash: targetCase?.evidence?.hash || null,
          fileName: targetCase?.evidence?.fileName || null,
          fileSize: targetCase?.evidence?.fileSize || null,
          acquiredAt: targetCase?.evidence?.acquiredAt || null,
        },
        part_b: {
          vendor: fmt?.vendor || null,
          confidence: fmt?.confidence || null,
          fileSystem: fmt?.fileSystem || null,
          parsedHash: targetCase?.parsedHash || null,
          parsedAt: targetCase?.parsedAt || null,
          segmentsSummary: segSummary,
          recoverySummary: recSummary,
          recoveries: recs,
        },
      });
    }, 700);
  });
}

/**
 * Add a manual cross-camera anchor pairing
 */
export function addAnchor(caseId, segmentIdA, segmentIdB) {
  return new Promise((resolve) => {
    const targetCase = casesStore.find((c) => c.id === caseId);
    const newAnchor = {
      id: `ANC-${String(Date.now()).slice(-4)}`,
      segmentIdA,
      segmentIdB,
      markedAt: new Date().toISOString(),
    };

    if (targetCase) {
      if (!targetCase.anchors) targetCase.anchors = [];
      const exists = targetCase.anchors.some(
        (a) =>
          (a.segmentIdA === segmentIdA && a.segmentIdB === segmentIdB) ||
          (a.segmentIdA === segmentIdB && a.segmentIdB === segmentIdA)
      );
      if (!exists) {
        targetCase.anchors.push(newAnchor);
      }
    }

    setTimeout(() => {
      resolve(targetCase?.anchors || [newAnchor]);
    }, 200);
  });
}

/**
 * Get manual cross-camera anchor pairings for a case
 */
export function getAnchors(caseId) {
  return new Promise((resolve) => {
    const targetCase = casesStore.find((c) => c.id === caseId);
    setTimeout(() => {
      resolve(targetCase?.anchors || []);
    }, 150);
  });
}

function mapBackendStatus(statusStr) {
  if (!statusStr) return "Intake";
  const s = String(statusStr).toUpperCase();
  if (s === "COMPLETED" || s === "REPORTED") return "Reported";
  if (s === "RECOVERY_COMPLETE" || s === "RECOVERED") return "Recovered";
  if (s === "PROCESSING" || s === "RUNNING") return "Processing";
  return "Intake";
}
