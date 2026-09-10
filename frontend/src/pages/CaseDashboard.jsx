import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, FolderCheck, Plus } from "lucide-react";
import { getCases, formatDate, mapBackendStatus, createCase } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";

export function CaseDashboard() {
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { role } = useRole();

  const fetchCases = async () => {
    try {
      setIsLoading(true);
      const data = await getCases();
      const mapped = (data || []).map(c => ({
        id: c.case_id,
        title: c.case_id ? `Case ${c.case_id}` : "DVR Forensic Case",
        investigator: c.investigator_id || "Unassigned",
        createdAt: c.intake_timestamp_utc,
        status: mapBackendStatus(c.status),
        evidenceCount: c.evidence_count || 0,
      }));
      setCases(mapped);
    } catch (err) {
      console.error("Failed to load cases", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCases(); }, []);

  const handleRowClick = (caseItem) => {
    navigate(`/cases/${caseItem.id}`);
  };

  const handleCreateCase = async () => {
    if (!newCaseTitle.trim()) return;
    try {
      setIsCreating(true);
      const res = await createCase({ name: newCaseTitle, examiner: role });
      if (res && res.case_id) {
        navigate(`/cases/${res.case_id}`);
      } else {
        await fetchCases();
        setIsModalOpen(false);
        setNewCaseTitle("");
      }
    } catch (err) {
      alert("Failed to create case: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.investigator.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || c.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <CaseHeader
          caseId="PHEONIX_37"
          title="Forensic Evidence Review Dashboard"
          status="pending"
          statusLabel={`${cases.length} cases on record`}
        />
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          <span>New Case</span>
        </button>
      </div>

      <div className="bg-white border border-phx-border rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center justify-between shadow-sm">
        <div className="flex flex-1 flex-wrap gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-phx-muted" />
            <input
              type="text"
              placeholder="Search by Case ID, title, investigator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2.5 pl-10 pr-4 bg-phx-surface border border-phx-border rounded text-sm text-phx-primary placeholder-phx-muted focus:outline-none focus:border-phx-red/40 focus:ring-1 focus:ring-phx-red/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-phx-secondary">Filter:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-2.5 px-3 bg-phx-surface border border-phx-border rounded text-sm text-phx-primary focus:outline-none focus:border-phx-red/40 cursor-pointer transition-all"
            >
              <option value="ALL">All Statuses</option>
              <option value="INTAKE">Intake</option>
              <option value="PROCESSING">Processing</option>
              <option value="RECOVERED">Recovered</option>
              <option value="REPORTED">Reported</option>
            </select>
          </div>
        </div>
        <div className="text-xs text-phx-muted bg-phx-surface py-2 px-3 rounded border border-phx-border">
          Active Role: <strong className="text-phx-primary ml-1">{role}</strong>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-phx-border rounded-lg p-16 flex flex-col items-center justify-center text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-phx-red animate-spin mb-4" />
          <div className="text-xs tracking-widest text-phx-muted uppercase">Loading cases...</div>
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-phx-border rounded-lg p-16 flex flex-col items-center justify-center text-center">
          <FolderCheck size={40} className="text-phx-muted mb-4" />
          <h3 className="text-xl font-semibold text-phx-primary mb-2">No Forensic Cases Recorded</h3>
          <p className="text-phx-secondary text-sm">Initialize a case workspace to begin evidence acquisition.</p>
        </div>
      ) : (
        <div className="bg-white border border-phx-border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-phx-surface border-b border-phx-border">
                <th className="px-5 py-3 font-semibold text-xs text-phx-secondary uppercase tracking-wider">Case ID</th>
                <th className="px-5 py-3 font-semibold text-xs text-phx-secondary uppercase tracking-wider">Title</th>
                <th className="px-5 py-3 font-semibold text-xs text-phx-secondary uppercase tracking-wider">Intake (UTC)</th>
                <th className="px-5 py-3 font-semibold text-xs text-phx-secondary uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 font-semibold text-xs text-phx-secondary uppercase tracking-wider">Investigator</th>
                <th className="px-5 py-3 font-semibold text-xs text-phx-secondary uppercase tracking-wider text-right">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-phx-border">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-phx-muted">
                    No cases match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => (
                  <tr key={c.id} onClick={() => handleRowClick(c)} className="cursor-pointer hover:bg-phx-surface transition-colors">
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-phx-red">{c.id}</td>
                    <td className="px-5 py-4 text-sm font-medium text-phx-primary">{c.title}</td>
                    <td className="px-5 py-4 font-mono text-xs text-phx-secondary">{formatDate(c.createdAt)}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-phx-secondary">{c.investigator}</td>
                    <td className="px-5 py-4 font-mono text-sm font-bold text-phx-primary text-right">{c.evidenceCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-phx-border bg-phx-surface">
              <h3 className="font-semibold text-phx-primary">Initialize New Case</h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-phx-secondary mb-2">Case Title</label>
              <input
                type="text"
                autoFocus
                value={newCaseTitle}
                onChange={(e) => setNewCaseTitle(e.target.value)}
                placeholder="e.g. Operation Pheonix_37 DVR"
                className="w-full py-2 px-3 bg-phx-surface border border-phx-border rounded text-sm text-phx-primary focus:outline-none focus:border-phx-red/40 focus:ring-1 focus:ring-phx-red/20 mb-6"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCase}
                  disabled={!newCaseTitle.trim() || isCreating}
                  className="btn-primary"
                >
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Create Case</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}