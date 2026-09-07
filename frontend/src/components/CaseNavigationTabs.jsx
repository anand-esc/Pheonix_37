import React from "react";
import { NavLink, useParams } from "react-router-dom";
import { HardDrive, Play, Clock, FileCheck } from "lucide-react";

export function CaseNavigationTabs() {
  const { id } = useParams();

  const tabs = [
    { path: `/cases/${id}/evidence`, label: "Evidence Intake", icon: HardDrive },
    { path: `/cases/${id}/analysis`, label: "Video Analysis", icon: Play },
    { path: `/cases/${id}/timeline`, label: "Timeline", icon: Clock },
    { path: `/cases/${id}/report`, label: "BSA Sec 63 Report", icon: FileCheck },
  ];

  return (
    <div className="bg-[var(--bg-panel)] border-b border-[var(--border)] px-4 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded text-xs font-medium transition-all whitespace-nowrap border ${
                  isActive
                    ? "bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)] border-[rgba(62,214,196,0.2)] font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel-lighter)] border-transparent"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}