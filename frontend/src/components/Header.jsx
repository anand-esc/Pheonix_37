import React from "react";
import { Link, useLocation } from "react-router-dom";
import { UserCheck, ChevronRight, FolderOpen } from "lucide-react";
import { useRole } from "../context/RoleContext";
import { OPERATORS } from "../api";

export function Header() {
  const { operatorId, role, setOperator, logout } = useRole();
  const location = useLocation();

  const caseIdMatch = location.pathname.match(/\/cases\/([^/]+)/);
  const currentCaseId = caseIdMatch ? caseIdMatch[1] : null;

  return (
    <header className="bg-phx-panel border-b border-phx-border sticky top-0 z-40 px-4 lg:px-8 py-3 no-print shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-phx-primary tracking-tight group-hover:text-phx-cyan transition-colors">
              Pheonix_37
            </h1>
            <p className="text-[11px] text-phx-secondary mt-0.5 font-medium tracking-wide">
              NTRO SIH26150 <span className="text-phx-border-light mx-1">|</span> BSA Sec 63 Compliant
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 ml-2 pl-6 border-l border-phx-border">
            <Link
              to="/cases"
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors flex items-center gap-2 ${
                location.pathname.startsWith("/cases")
                  ? "bg-phx-surface text-phx-red border border-phx-border"
                  : "text-phx-secondary hover:text-phx-primary hover:bg-phx-surface border border-transparent"
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Dashboard
            </Link>
          </div>

          {currentCaseId && (
            <div className="hidden xl:flex items-center gap-2 text-sm text-phx-secondary pl-6 border-l border-phx-border">
              <ChevronRight className="w-4 h-4 text-phx-muted" />
              <span className="font-mono text-phx-red font-semibold bg-phx-red/5 px-2 py-0.5 rounded border border-phx-red/20">
                {currentCaseId}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-phx-surface px-3 py-1.5 rounded border border-phx-border transition-colors hover:border-phx-red/40">
            <UserCheck className="w-3.5 h-3.5 text-phx-muted" />
            <select
              value={operatorId}
              onChange={(e) => setOperator(e.target.value)}
              className="bg-transparent text-xs text-phx-primary font-medium focus:outline-none cursor-pointer border-none"
            >
              {OPERATORS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} ({o.role})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={logout}
            className="text-xs font-medium text-phx-secondary hover:text-phx-red transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}