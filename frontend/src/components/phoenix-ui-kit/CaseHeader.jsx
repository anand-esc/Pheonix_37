import { IconRubberStamp, IconAlertTriangle, IconClock } from '@tabler/icons-react';

const STATUS_CONFIG = {
  validated: { icon: IconRubberStamp, className: 'bg-phx-amber/10 text-phx-amber border-phx-amber/30', label: 'Vendor validated' },
  tampered: { icon: IconAlertTriangle, className: 'bg-phx-red/10 text-phx-red border-phx-red/30', label: 'Tamper detected' },
  pending: { icon: IconClock, className: 'bg-phx-panel-lighter text-phx-secondary border-phx-border', label: 'Pending review' },
};

export default function CaseHeader({ caseId, title, status = 'pending', statusLabel }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-phx-border/50 mb-6">
      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-xs font-bold text-phx-cyan uppercase tracking-widest">{caseId}</div>
        <div className="font-serif text-2xl font-semibold text-phx-primary">{title}</div>
      </div>
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-sans font-medium whitespace-nowrap self-start sm:self-auto ${config.className}`}>
        <Icon size={16} stroke={2} aria-hidden="true" />
        <span>{statusLabel || config.label}</span>
      </div>
    </div>
  );
}
