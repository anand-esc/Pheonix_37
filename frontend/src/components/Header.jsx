import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield, UserCheck, ChevronRight, Home, FolderOpen } from "lucide-react";
import { useRole, ROLES } from "../context/RoleContext";

export function Header() {
  const { role, setRole } = useRole();
  const location = useLocation();

  // Extract case ID from current pathname if viewing a case route
  const caseIdMatch = location.pathname.match(/\/cases\/([^/]+)/);
  const currentCaseId = caseIdMatch ? caseIdMatch[1] : null;

  return (
    <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-40 px-4 lg:px-8 py-3 transition-colors shadow-2xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left Side: Brand & Title */}
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center shadow-xs group-hover:bg-sky-700 transition-colors">
              <Shield className="w-5 h-5 text-white stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight group-hover:text-sky-700 transition-colors">
                  Phoenix Forensic Toolkit
                </h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 hidden sm:inline-block">
                  v0.2
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>NTRO SIH26150</span>
                <span className="text-slate-300">•</span>
                <span>BSA Sec 63 Compliant</span>
              </p>
            </div>
          </Link>

          {/* Quick Nav Links */}
          <div className="hidden sm:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-200">
            <Link
              to="/"
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                location.pathname === "/"
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </Link>
            <Link
              to="/cases"
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                location.pathname === "/cases"
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Dashboard
            </Link>
          </div>

          {/* Breadcrumb if inside case */}
          {currentCaseId && (
            <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 pl-4 border-l border-slate-200">
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <span className="font-mono text-sky-700 font-medium bg-sky-50 px-2 py-0.5 rounded border border-sky-200/60">
                {currentCaseId}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Role Selector */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
            <UserCheck className="w-4 h-4 text-sky-600" />
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Role:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-transparent text-xs text-slate-900 font-medium focus:outline-none cursor-pointer pr-1"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id} className="bg-white text-slate-900">
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
