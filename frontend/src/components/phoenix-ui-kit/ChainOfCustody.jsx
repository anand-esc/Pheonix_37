import { IconFlag, IconFileSearch, IconScan, IconX, IconLock, IconCheck } from '@tabler/icons-react';
import './ChainOfCustody.css';

const ICONS = {
  genesis: IconFlag,
  detected: IconFileSearch,
  recovered: IconScan,
  verified: IconCheck,
  tampered: IconX,
  halted: IconLock,
};

/**
 * Usage:
 * <ChainOfCustody entries={[
 *   { id: 1, type: 'genesis', label: 'Genesis', detail: '00000...0000' },
 *   { id: 2, type: 'detected', label: 'Format detected', timestamp: '09:14:02',
 *     detail: 'a1c9…4f02 → hikvision, validated' },
 *   { id: 3, type: 'recovered', label: 'Recovery completed', timestamp: '09:14:37',
 *     detail: '8 fragments, byte-exact' },
 *   { id: 4, type: 'tampered', label: 'Encryption completed', timestamp: '09:15:10',
 *     detail: 'signature mismatch — expected 7e2f…, got 91bd…' },
 *   { id: 5, type: 'halted', label: 'Chain halted — restore required before continuing' },
 * ]} />
 *
 * Map real ledger entries straight from GET /api/case/{id}/ledger:
 *   type: entry.event_type === 'GENESIS' ? 'genesis'
 *       : entry.verification_failed ? 'tampered'
 *       : mapEventTypeToIconKey(entry.event_type)   // 'detected' | 'recovered' | 'verified' | 'halted'
 */
export default function ChainOfCustody({ entries }) {
  return (
    <div className="phx-chain">
      <div className="phx-chain__label">Chain of custody</div>
      <div className="phx-chain__list">
        <div className="phx-chain__rail" />
        {entries.map((entry) => {
          const Icon = ICONS[entry.type] || IconCheck;
          const isTampered = entry.type === 'tampered';
          const isHalted = entry.type === 'halted';
          const isGenesis = entry.type === 'genesis';

          const dotClass = isTampered
            ? 'phx-chain__dot--red'
            : isHalted
            ? 'phx-chain__dot--halted'
            : isGenesis
            ? 'phx-chain__dot--neutral'
            : 'phx-chain__dot--gold';

          return (
            <div
              key={entry.id}
              className={`phx-chain__entry ${isTampered ? 'phx-chain__entry--tampered' : ''}`}
            >
              <div className={`phx-chain__dot ${dotClass}`}>
                <Icon size={11} stroke={2} aria-hidden="true" />
              </div>
              <div className="phx-chain__row">
                <span className="phx-chain__title">{entry.label}</span>
                {entry.timestamp && <span className="phx-chain__time">{entry.timestamp}</span>}
              </div>
              {entry.detail && <div className="phx-chain__detail">{entry.detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
