import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Plus, FolderPlus, Loader2, User, FileText } from "lucide-react";
import { createCase } from "../api";

export function NewCaseModal({ isOpen, onClose, onCaseCreated }) {
  const [caseName, setCaseName] = useState("");
  const [examinerName, setExaminerName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!caseName.trim()) {
      setError("Case Name is required");
      return;
    }
    if (!examinerName.trim()) {
      setError("Examiner Name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const newCase = await createCase({
        name: caseName.trim(),
        examiner: examinerName.trim(),
      });

      if (onCaseCreated) {
        onCaseCreated(newCase);
      }

      onClose();
      navigate(`/cases/${newCase.id}/evidence`);
    } catch (err) {
      setError("Failed to create case. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-deep)]/80 transition-opacity">
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border)] rounded w-full max-w-md overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-deep)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[var(--accent-cyan-dim)] border border-[rgba(62,214,196,0.2)] flex items-center justify-center text-[var(--accent-cyan)]">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Create New Forensic Case</h2>
              <p className="text-[11px] text-[var(--text-muted)]">Initialize a new investigation workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel-lighter)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-[11px] bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] text-[var(--accent-red)] rounded font-mono">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5 font-mono">
              <FileText className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
              Case Name <span className="text-[var(--accent-red)]">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Bank Vault Hikvision DVR Extraction"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
              className="w-full px-3.5 py-2 bg-[var(--bg-deep)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:bg-[var(--bg-panel)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all disabled:opacity-50 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5 font-mono">
              <User className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />
              Assigned Examiner <span className="text-[var(--accent-red)]">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Insp. S. Sharma"
              value={examinerName}
              onChange={(e) => setExaminerName(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 bg-[var(--bg-deep)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:bg-[var(--bg-panel)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all disabled:opacity-50 font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel-lighter)] rounded transition-colors disabled:opacity-50 font-mono"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[var(--accent-cyan)]/10 border border-[rgba(62,214,196,0.3)] text-[var(--accent-cyan)] font-medium text-[11px] rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-all hover:bg-[var(--accent-cyan-dim)] font-mono"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Case...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Case</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}