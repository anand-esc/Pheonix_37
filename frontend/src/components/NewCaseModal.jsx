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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-phx-deep/80 transition-opacity">
      <div
        className="bg-phx-panel border border-phx-border rounded w-full max-w-md overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-phx-border bg-phx-deep">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-phx-cyan/10 border border-phx-cyan/20 flex items-center justify-center text-phx-cyan">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-phx-primary">Create New Forensic Case</h2>
              <p className="text-[11px] text-phx-muted">Initialize a new investigation workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-phx-muted hover:text-phx-primary hover:bg-phx-panel-lighter transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-[11px] bg-[var(--accent-red-dim)] border border-[rgba(248,113,113,0.2)] text-phx-red rounded font-mono">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-phx-secondary mb-1.5 flex items-center gap-1.5 font-mono">
              <FileText className="w-3.5 h-3.5 text-phx-cyan" />
              Case Name <span className="text-phx-red">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Bank Vault Hikvision DVR Extraction"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
              className="w-full px-3.5 py-2 bg-phx-deep border border-phx-border rounded text-sm text-phx-primary placeholder:text-phx-muted focus:outline-none focus:border-phx-cyan focus:bg-phx-panel focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all disabled:opacity-50 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-phx-secondary mb-1.5 flex items-center gap-1.5 font-mono">
              <User className="w-3.5 h-3.5 text-phx-cyan" />
              Assigned Examiner <span className="text-phx-red">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Insp. S. Sharma"
              value={examinerName}
              onChange={(e) => setExaminerName(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 bg-phx-deep border border-phx-border rounded text-sm text-phx-primary placeholder:text-phx-muted focus:outline-none focus:border-phx-cyan focus:bg-phx-panel focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all disabled:opacity-50 font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-phx-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-[11px] font-medium text-phx-muted hover:text-phx-primary hover:bg-phx-panel-lighter rounded transition-colors disabled:opacity-50 font-mono"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-phx-cyan/10 border border-phx-cyan/30 text-phx-cyan font-medium text-[11px] rounded cursor-pointer disabled:opacity-50 flex items-center gap-2 transition-all hover:bg-phx-cyan/10 font-mono"
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