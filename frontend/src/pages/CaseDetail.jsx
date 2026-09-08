import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Loader2, AlertCircle, FileText, Clock, Layers } from "lucide-react";
import { getCase, getCaseFragments, getCaseLedger, formatDate, mapBackendStatus, mapLedgerEntry } from "../api";
import { useRole } from "../context/RoleContext";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";
import ChainOfCustody from "../components/phoenix-ui-kit/ChainOfCustody";
import FragmentRow from "../components/phoenix-ui-kit/FragmentRow";

export function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("fragments");

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [c, frags, ledger] = await Promise.all([
          getCase(id),
          getCaseFragments(id),
          getCaseLedger(id).catch(() => []),
        ]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
          setLedgerEntries((ledger || []).map(mapLedgerEntry));
        }
      } catch (err) {
        console.error("Failed to load case detail", err);
        if (isMounted) setError("Failed to load case detail");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  const statusMap = {
    "Intake": "pending",
    "Processing": "pending",
    "Recovered": "validated",
    "Reported": "validated",
  };

  if (isLoading) {
    return (
      <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <Loader2 className="phx-spinner" size={32} style={{ color: "var(--phx-navy)" }} />
              <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--phx-text-muted)" }}>
                LOADING CASE DATA...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh", padding: "2rem" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <CaseHeader
            caseId={id}
            title="Case Not Found"
            status="tampered"
            statusLabel="Load failed"
          />
          <div style={{
            marginTop: "1.5rem", padding: "1.5rem",
            background: "var(--phx-red-tint)", border: "1px solid var(--phx-red)",
            borderRadius: "var(--phx-radius)", display: "flex", gap: 12
          }}>
            <AlertCircle size={24} style={{ color: "var(--phx-red)", flexShrink: 0 }} />
            <div>
              <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1rem", color: "var(--phx-red)", marginBottom: 4 }}>
                Case Load Error
              </h3>
              <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-ink)" }}>
                {error || `Case "${id}" could not be retrieved from the database.`}
              </p>
              <button
                onClick={() => navigate("/cases")}
                style={{
                  marginTop: 12, padding: "8px 16px",
                  background: "var(--phx-navy)", color: "var(--phx-on-navy)",
                  border: "none", borderRadius: "var(--phx-radius)",
                  fontFamily: "var(--phx-font-sans)", fontSize: "0.78rem", cursor: "pointer"
                }}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="phx-page" style={{ background: "var(--phx-cream)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <button
            onClick={() => navigate("/cases")}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem",
              color: "var(--phx-text-secondary)", padding: 4
            }}
          >
            <ArrowLeft size={16} stroke={2} />
            <span>Back to Dashboard</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--phx-font-mono)", fontSize: "0.72rem", color: "var(--phx-text-muted)" }}>
            <span>Active Role:</span>
            <strong style={{ color: "var(--phx-ink)" }}>{role}</strong>
          </div>
        </div>

        <CaseHeader
          caseId={caseData.case_id || id}
          title={caseData.title || `Case ${id}`}
          status={statusMap[caseData.status] || "pending"}
          statusLabel={caseData.status}
        />

        <div className="phx-tabs" style={{
          display: "flex", gap: 4, marginBottom: "1.5rem",
          borderBottom: "1px solid var(--phx-border)", paddingBottom: 4
        }}>
          {[
            { id: "fragments", label: "Fragments", count: fragments.length, icon: Play },
            { id: "ledger", label: "Chain of Custody", count: ledgerEntries.length, icon: Layers },
            { id: "timeline", label: "Timeline", count: 0, icon: Clock },
            { id: "report", label: "Certificate", count: 0, icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 16px", background: "transparent", border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--phx-navy)" : "2px solid transparent",
                fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", fontWeight: 500,
                color: activeTab === tab.id ? "var(--phx-navy)" : "var(--phx-text-secondary)",
                cursor: "pointer", transition: "all 0.15s ease"
              }}
            >
              <tab.icon size={16} stroke={2} />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span style={{
                  background: activeTab === tab.id ? "var(--phx-navy)" : "var(--phx-border)",
                  color: activeTab === tab.id ? "var(--phx-on-navy)" : "var(--phx-text-secondary)",
                  padding: "2px 8px", borderRadius: "999px",
                  fontFamily: "var(--phx-font-mono)", fontSize: "0.7rem"
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "fragments" && (
          <div className="phx-tab-content">
            <div style={{
              fontFamily: "var(--phx-font-sans)", fontSize: "0.8rem",
              color: "var(--phx-text-secondary)", marginBottom: 8
            }}>
              Recovered fragments
            </div>
            {fragments.length === 0 ? (
              <div style={{
                padding: "2rem", textAlign: "center",
                background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
                borderRadius: "var(--phx-radius)"
              }}>
                <Play size={48} style={{ color: "var(--phx-text-muted)", marginBottom: 12 }} />
                <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1.1rem", color: "var(--phx-ink)", marginBottom: 4 }}>
                  No Fragments Recovered
                </h3>
                <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-text-secondary)" }}>
                  Run the acquisition pipeline to carve video fragments from the evidence.
                </p>
              </div>
            ) : (
              <div style={{
                background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
                borderRadius: "var(--phx-radius)", overflow: "hidden"
              }}>
                {fragments.map((f, idx) => (
                  <FragmentRow
                    key={f.fragment_id || idx}
                    fragmentId={f.fragment_id || `frag-${idx}`}
                    codec={f.codec_info || "Unknown"}
                    durationLabel={f.duration ? `${Math.floor(f.duration / 60)}:${String(Math.floor(f.duration % 60)).padStart(2, '0')}` : undefined}
                    confidence={f.confidence_score || 0}
                    rationale={f.confidence_rationale || "No rationale provided"}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "ledger" && (
          <div className="phx-tab-content">
            <ChainOfCustody entries={ledgerEntries} />
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="phx-tab-content">
            <div style={{
              padding: "2rem", textAlign: "center",
              background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
              borderRadius: "var(--phx-radius)"
            }}>
              <Clock size={48} style={{ color: "var(--phx-text-muted)", marginBottom: 12 }} />
              <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1.1rem", color: "var(--phx-ink)", marginBottom: 4 }}>
                Timeline View
              </h3>
              <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-text-secondary)", marginBottom: 16 }}>
                Cross-camera/channel timeline requires anchor alignment endpoints.
              </p>
              <button
                onClick={() => navigate(`/cases/${id}/timeline`)}
                style={{
                  padding: "8px 16px", background: "var(--phx-navy)", color: "var(--phx-on-navy)",
                  border: "none", borderRadius: "var(--phx-radius)",
                  fontFamily: "var(--phx-font-sans)", fontSize: "0.78rem", cursor: "pointer"
                }}
              >
                Open Full Timeline
              </button>
            </div>
          </div>
        )}

        {activeTab === "report" && (
          <div className="phx-tab-content">
            <div style={{
              padding: "2rem", textAlign: "center",
              background: "var(--phx-paper)", border: "1px solid var(--phx-border)",
              borderRadius: "var(--phx-radius)"
            }}>
              <FileText size={48} style={{ color: "var(--phx-text-muted)", marginBottom: 12 }} />
              <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1.1rem", color: "var(--phx-ink)", marginBottom: 4 }}>
                BSA Section 63 Certificate
              </h3>
              <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--phx-text-secondary)", marginBottom: 16 }}>
                Certificate generation is performed via backend CLI tool.
              </p>
              <button
                onClick={() => navigate(`/cases/${id}/report`)}
                style={{
                  padding: "8px 16px", background: "var(--phx-navy)", color: "var(--phx-on-navy)",
                  border: "none", borderRadius: "var(--phx-radius)",
                  fontFamily: "var(--phx-font-sans)", fontSize: "0.78rem", cursor: "pointer"
                }}
              >
                Open Certificate Draft
              </button>
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
      `}</style>
    </div>
  );
}