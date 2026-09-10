import { useNavigate } from "react-router-dom";

export default function FragmentRow({ fragmentId, codec, confidence, rationale, durationLabel, caseId, fragmentIndex }) {
  const pct = Math.round(confidence * 100);
  const navigate = useNavigate();

  const handleClick = () => {
    if (caseId && fragmentIndex !== undefined) {
      navigate(`/cases/${caseId}/video/${fragmentIndex}`);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`flex flex-col sm:flex-row gap-3 sm:gap-6 px-4 py-3 border-b border-phx-border bg-white hover:bg-phx-surface transition-colors group ${caseId ? 'cursor-pointer' : ''}`}
    >
      <div className="font-mono text-sm font-semibold text-phx-red group-hover:text-phx-red/80 min-w-[120px]">
        {fragmentId}
      </div>
      <div className="flex items-center gap-4 min-w-[120px] font-sans text-xs text-phx-primary">
        <span className="bg-phx-surface px-2 py-0.5 rounded text-phx-secondary border border-phx-border font-medium">{codec}</span>
        {durationLabel && <span className="font-mono text-phx-secondary py-0.5 font-semibold">{durationLabel}</span>}
      </div>
      <div className="flex items-center gap-3 min-w-[140px]">
        <div className="h-2 w-24 bg-phx-border rounded-full overflow-hidden">
          <div className="h-full bg-phx-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[10px] text-phx-primary font-bold">{pct}%</span>
      </div>
      <div className="text-sm text-phx-secondary truncate flex-1">
        {rationale}
      </div>
    </div>
  );
}
