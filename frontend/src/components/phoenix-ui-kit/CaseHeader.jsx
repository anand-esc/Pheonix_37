import { IconRubberStamp, IconAlertTriangle, IconClock } from '@tabler/icons-react';
import './CaseHeader.css';

// npm install @tabler/icons-react

const STATUS_CONFIG = {
  validated: { icon: IconRubberStamp, className: 'phx-badge--gold', label: 'Vendor validated' },
  tampered: { icon: IconAlertTriangle, className: 'phx-badge--red', label: 'Tamper detected' },
  pending: { icon: IconClock, className: 'phx-badge--neutral', label: 'Pending review' },
};

/**
 * Usage:
 * <CaseHeader caseId="case-2026-0091" title="Hikvision NVR — sector 4 recovery" status="validated" />
 *
 * status: 'validated' | 'tampered' | 'pending'
 * statusLabel: optional override for the badge text (e.g. "Chain verified", "Tamper at block 3")
 */
export default function CaseHeader({ caseId, title, status = 'pending', statusLabel }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <div className="phx-case-header">
      <div>
        <div className="phx-case-header__id">{caseId}</div>
        <div className="phx-case-header__title">{title}</div>
      </div>
      <div className={`phx-badge ${config.className}`}>
        <Icon size={15} stroke={2} aria-hidden="true" />
        <span>{statusLabel || config.label}</span>
      </div>
    </div>
  );
}
