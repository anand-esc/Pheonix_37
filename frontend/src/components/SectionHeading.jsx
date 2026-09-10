import React from "react";

export function SectionHeading({ title, subtitle, icon: Icon, actions, badge, className = "" }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-phx-border ${className}`}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 bg-phx-cyan/10 border border-phx-cyan/20 rounded text-phx-cyan shrink-0 mt-0.5">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-bold text-phx-primary tracking-tight">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-phx-secondary mt-0.5 font-normal">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}