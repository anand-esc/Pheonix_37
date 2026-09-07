import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield, UserCheck, ChevronRight, Home, FolderOpen } from "lucide-react";
import { useRole, ROLES } from "../context/RoleContext";

export function Header() {
  const { role, setRole } = useRole();
  const location = useLocation();

  const caseIdMatch = location.pathname.match(/\/cases\/([^/]+)/);
  const currentCaseId = caseIdMatch ? caseIdMatch[1] : null;

  return (
    <header className="bg-[var(--bg-panel)] border-b border-[var(--border)] sticky top-0 z-40 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded bg-[var(--accent-cyan)]/10 border border-[rgba(62,214,196,0.3)] flex items-center justify-center">
              <Shield className="w-5 h-5 text-[var(--accent-cyan)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[var(--text-primary)] tracking-tight group-hover:text-[var(--accent-cyan)] transition-colors">
                  Phoenix Forensic Toolkit
                </h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border border-[rgba(62,214,196,0.2)] hidden sm:inline-block">
                  v0.2
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
                <span>NTRO SIH26150</span>
                <span className="text-[var(--text-muted)]">•</span>
                <span>BSA Sec 63 Compliant</span>
              </p>
            </div>
          </Link>

          <div className="hidden sm:flex items-center gap-1.5 ml-4 pl-4 border-l border-[var(--border)]">
            <Link
              to="/"
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                location.pathname === "/"
                  ? "bg-[var(--bg-panel-lighter)] text-[var(--text-primary)] font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </Link>
            <Link
              to="/cases"
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                location.pathname === "/cases"
                  ? "bg-[var(--bg-panel-lighter)] text-[var(--text-primary)] font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Dashboard
            </Link>
          </div>

          {currentCaseId && (
            <div className="hidden xl:flex items-center gap-2 text-xs text-[var(--text-secondary)] pl-4 border-l border-[var(--border)]">
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="font-mono text-[var(--accent-cyan)] bg-[var(--accent-cyan-dim)] px-2 py-0.5 rounded border border-[rgba(62,214,196,0.2)]">
                {currentCaseId}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="flex items-center gap-2 bg-[var(--bg-deep)] px-3 py-1.5 rounded border border-[var(--border)]">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">RBAC</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-primary)] font-mono focus:outline-none cursor-pointer pr-1 border-none"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id} className="bg-[var(--bg-panel)] text-[var(--text-primary)]">
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}