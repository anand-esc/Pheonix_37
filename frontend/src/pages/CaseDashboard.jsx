import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, FolderCheck } from "lucide-react";
import { getCases, formatDate, mapBackendStatus } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";

export function CaseDashboard() {
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
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

  useEffect(() => {
    fetchCases();
  }, []);

  const handleRowClick = (caseItem) => {
    navigate(`/cases/${caseItem.id}`);
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

  const statusMap = {
    "Intake": "pending",
    "Processing": "pending",
    "Recovered": "validated",
    "Reported": "validated",
  };

  return (
    <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <CaseHeader
          caseId="PHOENIX"
          title="Forensic Evidence Review Dashboard"
          status="pending"
          statusLabel={`${cases.length} cases on record`}
        />

        <div className="phx-dashboard-toolbar" style={{
          display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
          marginBottom: "1.5rem", padding: "1rem",
          background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
          borderRadius: "var(--phx-radius)"
        }}>
          <div className="phx-search" style={{ flex: 1, minWidth: 240, position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--phx-text-muted)" }} />
            <input
              type="text"
              placeholder="Search by Case ID, title, investigator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px 10px 40px",
                background: "var(--phx-navy-tint)", border: "1px solid var(--phx-border)",
                borderRadius: "var(--phx-radius)", fontFamily: "var(--phx-font-mono)",
                fontSize: "0.78rem", color: "var(--phx-ink)",
                outline: "none"
              }}
            />
          </div>

          <div className="phx-filter" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.78rem", color: "var(--phx-text-secondary)" }}>Filter:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "8px 12px", background: "var(--phx-navy-tint)", border: "1px solid var(--phx-border)",
                borderRadius: "var(--phx-radius)", fontFamily: "var(--phx-font-mono)",
                fontSize: "0.78rem", color: "var(--phx-ink)", cursor: "pointer", outline: "none"
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="INTAKE">Intake</option>
              <option value="PROCESSING">Processing</option>
              <option value="RECOVERED">Recovered</option>
              <option value="REPORTED">Reported</option>
            </select>
          </div>

          <div style={{ marginLeft: "auto", fontFamily: "var(--phx-font-mono)", fontSize: "0.72rem", color: "var(--phx-text-muted)" }}>
            Active Role: <strong style={{ color: "var(--phx-ink)" }}>{role}</strong>
          </div>
        </div>

        {isLoading && (
          <div style={{
            padding: "3rem", textAlign: "center",
            background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
            borderRadius: "var(--phx-radius)"
          }}>
            <Loader2 className="phx-spinner" size={32} style={{ color: "var(--phx-navy)", margin: "0 auto 12px" }} />
            <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-text-muted)" }}>
              LOADING CASE INDEX...
            </div>
          </div>
        )}

        {!isLoading && cases.length === 0 && (
          <div style={{
            padding: "3rem", textAlign: "center",
            background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
            borderRadius: "var(--phx-radius)"
          }}>
            <FolderCheck size={48} style={{ color: "var(--phx-text-muted)", marginBottom: 12 }} />
            <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1.1rem", color: "var(--phx-ink)", marginBottom: 4 }}>
              No Forensic Cases Recorded
            </h3>
            <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-text-secondary)" }}>
              Initialize a case workspace to begin evidence acquisition and stream carving.
            </p>
          </div>
        )}

        {!isLoading && cases.length > 0 && (
          <div className="phx-case-table" style={{
            background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
            borderRadius: "var(--phx-radius)", overflow: "hidden"
          }}>
            <div className="phx-case-table-header" style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 140px 120px 140px 120px",
              gap: 12, padding: "12px 16px",
              background: "var(--phx-navy-tint)", borderBottom: "1px solid var(--phx-border)",
              fontFamily: "var(--phx-font-mono)", fontSize: "0.72rem",
              color: "var(--phx-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em"
            }}>
              <div>CASE ID</div>
              <div>TITLE</div>
              <div>INTAKE (UTC)</div>
              <div>STATUS</div>
              <div>INVESTIGATOR</div>
              <div>EVIDENCE</div>
            </div>
            <div className="phx-case-table-body">
              {filteredCases.length === 0 ? (
                <div style={{
                  padding: "2rem", textAlign: "center",
                  fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-text-muted)"
                }}>
                  No cases match the selected search or status criteria.
                </div>
              ) : (
                filteredCases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleRowClick(c)}
                    className="phx-case-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr 140px 120px 140px 120px",
                      gap: 12, padding: "12px 16px",
                      alignItems: "center",
                      borderBottom: "1px solid var(--phx-border)",
                      cursor: "pointer",
                      transition: "background 0.15s ease"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--phx-navy-tint)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", fontWeight: 600, color: "var(--phx-navy)" }}>
                      {c.id}
                    </div>
                    <div style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-ink)", fontWeight: 500 }}>
                      {c.title}
                    </div>
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--phx-text-secondary)" }}>
                      {formatDate(c.createdAt)}
                    </div>
                    <div>
                      <span className={`phx-badge phx-badge--${statusMap[c.status] || "pending"}`} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", borderRadius: "var(--phx-radius)",
                        fontFamily: "var(--phx-font-sans)", fontSize: "0.72rem", fontWeight: 500,
                        textTransform: "capitalize"
                      }}>
                        {c.status}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-text-secondary)" }}>
                      {c.investigator}
                    </div>
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-navy)", fontWeight: 600 }}>
                      {c.evidenceCount}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .phx-spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .phx-case-row:hover {
          background: var(--phx-navy-tint) !important;
        }
        .phx-badge--validated {
          background: var(--phx-gold);
          color: var(--bg-deep);
        }
        .phx-badge--pending {
          background: var(--phx-navy-tint);
          color: var(--phx-gold);
        }
        option {
          background-color: var(--bg-panel);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}