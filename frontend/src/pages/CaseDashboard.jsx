import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, FolderOpen, ArrowUpRight, Loader2, Calendar, User, FolderCheck } from "lucide-react";
import { getCases } from "../mockApi";
import { NewCaseModal } from "../components/NewCaseModal";
import { Badge } from "../components/Badge";
import { SectionHeading } from "../components/SectionHeading";

export function CaseDashboard() {
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setIsModalOpen(true);
    }
  }, [searchParams]);

  const fetchCases = async () => {
    try {
      setIsLoading(true);
      const data = await getCases();
      setCases(data || []);
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

  const handleCaseCreated = (newCase) => {
    setCases((prev) => [newCase, ...prev]);
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
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs">
        <SectionHeading
          title="Case Investigation Dashboard"
          subtitle="Forensic intake, evidence verification, and court submission management"
          icon={FolderCheck}
          badge={<Badge label={`${cases.length} Total`} variant="slate" size="sm" />}
          actions={
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Case</span>
            </button>
          }
        />

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Case ID, name, examiner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 hidden sm:inline">Filter Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500 cursor-pointer w-full sm:w-auto"
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

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-slate-500 shadow-2xs">
          <Loader2 className="w-7 h-7 text-sky-600 animate-spin" />
          <span className="text-xs font-medium">Loading forensic cases...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && cases.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-2xs">
          <div className="w-14 h-14 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
            <FolderOpen className="w-7 h-7" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-sm font-bold text-slate-900">No Forensic Cases Recorded</h3>
            <p className="text-xs text-slate-500">
              Initialize a case workspace to begin evidence acquisition and stream carving.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Case</span>
          </button>
        </div>
      )}

      {/* Case List Table */}
      {!isLoading && cases.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4 lg:px-6">Case ID</th>
                  <th className="py-3 px-4 lg:px-6">Case Title</th>
                  <th className="py-3 px-4 lg:px-6">Intake Date</th>
                  <th className="py-3 px-4 lg:px-6">Pipeline Status</th>
                  <th className="py-3 px-4 lg:px-6">Examiner</th>
                  <th className="py-3 px-4 lg:px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No cases match the selected search or status criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => handleRowClick(c)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Case ID */}
                      <td className="py-3.5 px-4 lg:px-6 font-mono text-sky-800 font-semibold">
                        {c.id}
                      </td>

                      {/* Case Name */}
                      <td className="py-3.5 px-4 lg:px-6 font-medium text-slate-900 group-hover:text-sky-700 transition-colors">
                        {c.name}
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 lg:px-6 text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(c.createdAt)}</span>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 lg:px-6">
                        <Badge label={c.status} />
                      </td>

                      {/* Assigned Examiner */}
                      <td className="py-3.5 px-4 lg:px-6 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{c.examiner}</span>
                        </div>
                      </td>

                      {/* Action Arrow */}
                      <td className="py-3.5 px-4 lg:px-6 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 group-hover:text-sky-900 transition-colors">
                          {c.hasEvidence ? "View Analysis" : "Upload Evidence"}
                          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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

      {/* New Case Modal */}
      <NewCaseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCaseCreated={handleCaseCreated}
      />
    </div>
  );
}

function formatDate(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
