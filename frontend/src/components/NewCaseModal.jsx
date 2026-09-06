import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Plus, FolderPlus, Loader2, User, FileText } from "lucide-react";
import { createCase } from "../mockApi";

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
      // Navigate to /cases/:id/evidence on success
      navigate(`/cases/${newCase.id}/evidence`);
    } catch (err) {
      setError("Failed to create case. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity">
      <div 
        className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Create New Forensic Case</h2>
              <p className="text-xs text-slate-500">Initialize a new investigation workspace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
              {error}
            </div>
          )}

          {/* Case Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-600" />
              Case Name <span className="text-sky-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Bank Vault Hikvision DVR Extraction"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Examiner Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-sky-600" />
              Assigned Examiner <span className="text-sky-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Insp. S. Sharma"
              value={examinerName}
              onChange={(e) => setExaminerName(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
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
