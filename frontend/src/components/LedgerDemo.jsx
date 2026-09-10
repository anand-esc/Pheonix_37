import React, { useState } from "react";
import { Shield, AlertTriangle, RotateCcw, Search, Terminal, RefreshCw, Copy, Check, X } from "lucide-react";
import { getLedgerChain, verifyLedgerChain, tamperLedgerBlock, restoreLedgerChain, simulateLedgerAccess, probeDahua } from "../api";
import { HashDisplay } from "./HashDisplay";

export function LedgerDemo() {
  const [fullChain, setFullChain] = useState([]);
  const [verifyResult, setVerifyResult] = useState(null);
  const [tamperResult, setTamperResult] = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);
  const [simulateResult, setSimulateResult] = useState(null);
  const [dahuaResult, setDahuaResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tamperIndex, setTamperIndex] = useState(1);
  const [tamperPayload, setTamperPayload] = useState('{"tampered": true, "demo": "integrity violation"}');
  const [simulateOperator, setSimulateOperator] = useState("investigator-01");
  const [simulateAction, setSimulateAction] = useState("VIEW_EVIDENCE");
  const [dahuaFilePath, setDahuaFilePath] = useState("");

  const operators = [
    { id: "investigator-01", role: "INVESTIGATOR" },
    { id: "technical-expert-01", role: "TECHNICAL_EXPERT" },
    { id: "auditor-01", role: "AUDITOR" },
    { id: "court-export-01", role: "COURT_EXPORT" },
  ];

  const actions = ["VIEW_EVIDENCE", "EXPORT_BUNDLE", "TRIGGER_ACQUISITION", "RUN_DETECTION", "VIEW_LEDGER", "GENERATE_CERTIFICATE"];

  const handleLoadChain = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const chain = await getLedgerChain();
      setFullChain(chain);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyLedgerChain();
      setVerifyResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTamper = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = JSON.parse(tamperPayload);
      const result = await tamperLedgerBlock(tamperIndex, payload);
      setTamperResult(result);
      await handleLoadChain();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await restoreLedgerChain();
      setRestoreResult(result);
      await handleLoadChain();
      setVerifyResult(null);
      setTamperResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await simulateLedgerAccess(simulateOperator, simulateAction);
      setSimulateResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProbeDahua = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await probeDahua(null, dahuaFilePath);
      setDahuaResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(JSON.stringify(text, null, 2));
  };

  const formatJson = (obj) => {
    if (!obj) return "";
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="data-panel p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--color-phx-primary)] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--color-phx-amber)]" />
          Ledger Demo Controls
        </h3>
        <span className="text-[11px] font-mono text-[var(--color-phx-muted)]">
          DEMO ONLY — Tamper/Restore mutate the in-memory chain
        </span>
      </div>

      {/* Load Chain */}
      <div className="space-y-4 border-t border-[var(--color-phx-border)] pt-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleLoadChain}
            disabled={isLoading}
            className="px-4 py-2 bg-[var(--phx-cyan-dim)] border border-phx-cyan/30 text-[var(--phx-cyan)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-colors font-mono hover:bg-[var(--phx-cyan)] hover:text-[var(--color-phx-primary)]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>LOAD FULL CHAIN</span>
          </button>
          {fullChain.length > 0 && (
            <button
              onClick={() => copyToClipboard(fullChain)}
              className="px-3 py-2 bg-[var(--color-phx-cyan)] border border-[var(--color-phx-border)] text-[var(--color-phx-secondary)] text-[11px] rounded cursor-pointer flex items-center gap-1.5 font-mono hover:border-[var(--phx-cyan)] hover:text-[var(--phx-cyan)]"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy JSON</span>
            </button>
          )}
        </div>
        {fullChain.length > 0 && (
          <div className="bg-[var(--color-phx-cyan)] border border-[var(--color-phx-border)] rounded p-4 max-h-96 overflow-auto">
            <pre className="text-[10px] font-mono text-[var(--phx-text-primary)]">{formatJson(fullChain)}</pre>
          </div>
        )}
      </div>

      {/* Verify Chain */}
      <div className="space-y-4 border-t border-[var(--color-phx-border)] pt-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleVerify}
            disabled={isLoading || fullChain.length === 0}
            className="px-4 py-2 bg-[var(--phx-green-dim)] border border-[rgba(52,211,153,0.3)] text-[var(--phx-green)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-colors font-mono hover:bg-[var(--phx-green)] hover:text-[var(--color-phx-primary)]"
          >
            <Shield className="w-4 h-4" />
            <span>VERIFY CHAIN INTEGRITY</span>
          </button>
        </div>
        {verifyResult !== null && (
          <div className={`p-4 rounded border font-mono text-[11px] ${verifyResult.valid ? "bg-[var(--phx-green-dim)] border-[rgba(52,211,153,0.3)] text-[var(--phx-green)]" : "bg-[var(--phx-red-dim)] border-[rgba(248,113,113,0.3)] text-[var(--color-phx-red)]"}`}>
            <div className="flex items-center gap-2 mb-2">
              {verifyResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              <span className="font-semibold">{verifyResult.valid ? "CHAIN VALID" : "CHAIN TAMPERED"}</span>
            </div>
            <pre>{formatJson(verifyResult)}</pre>
          </div>
        )}
      </div>

      {/* Tamper Block */}
      <div className="space-y-4 border-t border-[var(--color-phx-border)] pt-6">
        <h4 className="text-[11px] font-semibold text-[var(--color-phx-secondary)] uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[var(--color-phx-red)]" />
          TAMPER BLOCK (Demo)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-phx-secondary)] mb-1 font-mono">BLOCK INDEX (1-based, skip GENESIS at 0)</label>
            <input
              type="number"
              value={tamperIndex}
              onChange={(e) => setTamperIndex(parseInt(e.target.value) || 1)}
              min={1}
              className="w-full px-3 py-2 bg-phx-deep border border-[var(--color-phx-border)] rounded text-[11px] font-mono focus:outline-none focus:border-[var(--phx-cyan)]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-phx-secondary)] mb-1 font-mono">TAMPER PAYLOAD (JSON)</label>
            <textarea
              value={tamperPayload}
              onChange={(e) => setTamperPayload(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-phx-deep border border-[var(--color-phx-border)] rounded text-[11px] font-mono focus:outline-none focus:border-[var(--phx-cyan)]"
            />
          </div>
        </div>
        <button
          onClick={handleTamper}
          disabled={isLoading || fullChain.length === 0}
          className="px-4 py-2 bg-[var(--phx-red-dim)] border border-[rgba(248,113,113,0.3)] text-[var(--color-phx-red)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-colors font-mono hover:bg-[var(--color-phx-red)] hover:text-[var(--color-phx-deep)]"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>TAMPER BLOCK</span>
        </button>
        {tamperResult && (
          <div className="p-4 bg-[var(--phx-red-dim)] border border-[rgba(248,113,113,0.3)] rounded font-mono text-[11px] text-[var(--color-phx-red)]">
            <pre>{formatJson(tamperResult)}</pre>
          </div>
        )}
      </div>

      {/* Restore Chain */}
      <div className="space-y-4 border-t border-[var(--color-phx-border)] pt-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleRestore}
            disabled={isLoading}
            className="px-4 py-2 bg-[var(--phx-amber-dim)] border border-phx-amber/30 text-[var(--phx-amber)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-colors font-mono hover:bg-[var(--phx-amber)] hover:text-[var(--color-phx-primary)]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESTORE CHAIN FROM GENESIS</span>
          </button>
        </div>
        {restoreResult && (
          <div className="p-4 bg-[var(--phx-green-dim)] border border-[rgba(52,211,153,0.3)] rounded font-mono text-[11px] text-[var(--phx-green)]">
            <pre>{formatJson(restoreResult)}</pre>
          </div>
        )}
      </div>

      {/* RBAC Simulation */}
      <div className="space-y-4 border-t border-[var(--color-phx-border)] pt-6">
        <h4 className="text-[11px] font-semibold text-[var(--color-phx-secondary)] uppercase tracking-wider flex items-center gap-2">
          <Search className="w-4 h-4" />
          RBAC SIMULATION
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-phx-secondary)] mb-1 font-mono">OPERATOR ID</label>
            <select
              value={simulateOperator}
              onChange={(e) => setSimulateOperator(e.target.value)}
              className="w-full px-3 py-2 bg-phx-deep border border-[var(--color-phx-border)] rounded text-[11px] font-mono focus:outline-none focus:border-[var(--phx-cyan)]"
            >
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.id} ({op.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-phx-secondary)] mb-1 font-mono">ACTION</label>
            <select
              value={simulateAction}
              onChange={(e) => setSimulateAction(e.target.value)}
              className="w-full px-3 py-2 bg-phx-deep border border-[var(--color-phx-border)] rounded text-[11px] font-mono focus:outline-none focus:border-[var(--phx-cyan)]"
            >
              {actions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleSimulate}
          disabled={isLoading}
          className="px-4 py-2 bg-[var(--color-phx-cyan)] border border-[var(--color-phx-border)] text-[var(--phx-cyan)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-colors font-mono hover:bg-[var(--phx-cyan-dim)]"
        >
          <Search className="w-4 h-4" />
          <span>SIMULATE ACCESS CHECK</span>
        </button>
        {simulateResult && (
          <div className={`p-4 rounded border font-mono text-[11px] ${simulateResult.status === "granted" ? "bg-[var(--phx-green-dim)] border-[rgba(52,211,153,0.3)] text-[var(--phx-green)]" : "bg-[var(--phx-red-dim)] border-[rgba(248,113,113,0.3)] text-[var(--color-phx-red)]"}`}>
            <pre>{formatJson(simulateResult)}</pre>
          </div>
        )}
      </div>

      {/* Dahua Probe */}
      <div className="space-y-4 border-t border-[var(--color-phx-border)] pt-6">
        <h4 className="text-[11px] font-semibold text-[var(--color-phx-secondary)] uppercase tracking-wider flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          DAHUA PROBE (Format Detection)
        </h4>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-[var(--color-phx-secondary)] mb-1 font-mono">FILE PATH (server-side)</label>
            <input
              type="text"
              value={dahuaFilePath}
              onChange={(e) => setDahuaFilePath(e.target.value)}
              placeholder="e.g., ./case_store/CASE-A/run/evidence.img"
              className="w-full px-3 py-2 bg-phx-deep border border-[var(--color-phx-border)] rounded text-[11px] font-mono focus:outline-none focus:border-[var(--phx-cyan)]"
            />
          </div>
          <button
            onClick={handleProbeDahua}
            disabled={isLoading || !dahuaFilePath.trim()}
            className="px-4 py-2 bg-[var(--phx-cyan-dim)] border border-phx-cyan/30 text-[var(--phx-cyan)] text-[11px] font-medium rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-colors font-mono hover:bg-[var(--phx-cyan)] hover:text-[var(--color-phx-primary)] self-end"
          >
            <Terminal className="w-4 h-4" />
            <span>PROBE</span>
          </button>
        </div>
        {dahuaResult && (
          <div className="p-4 bg-[var(--color-phx-cyan)] border border-[var(--color-phx-border)] rounded font-mono text-[11px] text-[var(--phx-text-primary)]">
            <pre>{formatJson(dahuaResult)}</pre>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-[var(--phx-red-dim)] border border-[rgba(248,113,113,0.3)] rounded font-mono text-[11px] text-[var(--color-phx-red)] flex items-center gap-2">
          <X className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}