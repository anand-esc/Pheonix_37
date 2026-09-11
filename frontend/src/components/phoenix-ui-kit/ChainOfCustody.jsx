import { IconFlag, IconFileSearch, IconScan, IconX, IconLock, IconCheck } from '@tabler/icons-react';

const ICONS = {
  genesis: IconFlag,
  detected: IconFileSearch,
  recovered: IconScan,
  verified: IconCheck,
  tampered: IconX,
  halted: IconLock,
};

export default function ChainOfCustody({ entries }) {
  return (
    <div className="bg-white p-6 rounded-lg border border-phx-border shadow-sm">
      <div className="font-sans text-xs font-bold text-phx-red uppercase tracking-wider mb-6">
        Chain of custody
      </div>
      <div className="relative pl-6">
        <div className="absolute top-2 bottom-2 left-[11px] w-px bg-phx-border" />
        
        {entries.map((entry) => {
          const Icon = ICONS[entry.type] || IconCheck;
          const isTampered = entry.type === 'tampered';
          const isHalted = entry.type === 'halted';
          const isGenesis = entry.type === 'genesis';

          const dotColors = isTampered
            ? 'bg-red-500 text-white'
            : isHalted
            ? 'bg-gray-200 text-gray-500'
            : isGenesis
            ? 'bg-white border-2 border-gray-300 text-gray-500'
            : 'bg-green-100 border border-green-300 text-green-700';

          return (
            <div key={entry.id} className="relative mb-6 last:mb-0 group">
              <div className={`absolute -left-[32px] top-0 w-6 h-6 rounded-full flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${dotColors}`}>
                <Icon size={12} stroke={2.5} aria-hidden="true" />
              </div>
              <div className={`bg-phx-surface p-3 rounded border transition-colors ${isTampered ? 'border-red-200 bg-red-50' : 'border-phx-border hover:border-gray-400'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-sans text-sm font-semibold ${isTampered ? 'text-red-700' : 'text-phx-primary'}`}>
                    {entry.label || entry.type}
                  </span>
                  {entry.timestamp && (
                    <span className="font-mono text-[10px] text-phx-muted">{entry.timestamp}</span>
                  )}
                </div>
                {entry.detail && (
                  <div className={`font-mono text-[11px] ${isTampered ? 'text-red-600' : 'text-phx-secondary'} break-all mt-2 bg-white p-2 rounded border ${isTampered ? 'border-red-200' : 'border-phx-border'}`}>
                    {entry.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
