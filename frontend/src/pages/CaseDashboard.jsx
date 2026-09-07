import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, ArrowUpRight, Loader2, Calendar, User, FolderCheck } from "lucide-react";
import { getCases, formatDate, mapBackendStatus } from "../api";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";

export function CaseDashboard() {
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const navigate = useNavigate();

  const fetchCases = async () => {
    try {
      setIsLoading(true);
      const data = await getCases();
      const mapped = (data || []).map(c => ({
        id: c.case_id,
        name: c.case_id ? `Case ${c.case_id}` : "DVR Forensic Case",
        examiner: c.investigator_id || "Unassigned",
        createdAt: c.intake_timestamp_utc,
        status: mapBackendStatus(c.status),
        hasEvidence: (c.evidence_count || 0) > 0,
      }));
      setCases(mapped);
    } catch (err) {
      console.error("Failed to load cases", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleRowClick = (caseItem) => {
    if (caseItem.hasEvidence) {
      navigate(`/cases/${caseItem.id}/analysis`);
    } else {
      navigate(`/cases/${caseItem.id}/evidence`);
    }
  };

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.examiner.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || c.status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <div className="data-panel p-6">
        <SectionHeading
          title="Case Investigation Dashboard"
          subtitle="Forensic intake, evidence verification, and court submission management"
          icon={FolderCheck}
          badge={<Badge label={`${cases.length} Total`} variant="slate" size="sm" />}
          actions={
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              Cases created via evidence acquisition
            </span>
          }
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-[var(--border)]">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Case ID, name, examiner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-deep)] border border-[var(--border)] rounded text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:bg-[var(--bg-panel)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all font-mono"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">Filter Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--bg-deep)] border border-[var(--border)] text-[11px] text-[var(--text-primary)] font-medium rounded px-3 py-2 focus:outline-none focus:border-[var(--accent-cyan)] cursor-pointer font-mono"
            >
              <option value="ALL">All Statuses</option>
              <option value="INTAKE">Intake</option>
              <option value="PROCESSING">Processing</option>
              <option value="RECOVERED">Recovered</option>
              <option value="REPORTED">Reported</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="data-panel p-12 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] animate-pulse" />
            <span>POLLING CASE INDEX...</span>
          </div>
        </div>
      )}

      {!isLoading && cases.length === 0 && (
        <div className="data-panel p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded border border-[var(--border)] bg-[var(--bg-deep)] flex items-center justify-center text-[var(--text-muted)]">
            <FolderCheck className="w-6 h-6" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">No Forensic Cases Recorded</h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Initialize a case workspace to begin evidence acquisition and stream carving.
            </p>
          </div>
        </div>
      )}

      {!isLoading && cases.length > 0 && (
        <div className="data-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)] font-semibold">
                  <th className="py-2.5 px-4 lg:px-6 font-mono">CASE ID</th>
                  <th className="py-2.5 px-4 lg:px-6 font-mono">TITLE</th>
                  <th className="py-2.5 px-4 lg:px-6 font-mono">INTAKE</th>
                  <th className="py-2.5 px-4 lg:px-6 font-mono">STATUS</th>
                  <th className="py-2.5 px-4 lg:px-6 font-mono">EXAMINER</th>
                  <th className="py-2.5 px-4 lg:px-6 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--text-muted)] font-mono">
                      No cases match the selected search or status criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => handleRowClick(c)}
                      className="hover:bg-[var(--bg-panel-lighter)] transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4 lg:px-6 font-mono text-[var(--accent-cyan)] font-semibold">
                        {c.id}
                      </td>
                      <td className="py-2.5 px-4 lg:px-6 font-medium text-[var(--text-primary)]">
                        {c.name}
                      </td>
                      <td className="py-2.5 px-4 lg:px-6 text-[var(--text-secondary)] font-mono">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 lg:px-6">
                        <Badge label={c.status} />
                      </td>
                      <td className="py-2.5 px-4 lg:px-6 text-[var(--text-secondary)] font-mono">
                        {c.examiner}
                      </td>
                      <td className="py-2.5 px-4 lg:px-6 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors">
                          {c.hasEvidence ? "View Analysis" : "Upload Evidence"}
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}