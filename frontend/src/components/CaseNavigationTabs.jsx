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
    <div className="bg-white border-b border-slate-200 px-4 lg:px-8 shadow-2xs">
      <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-sky-50 text-sky-800 border border-sky-200 font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
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
