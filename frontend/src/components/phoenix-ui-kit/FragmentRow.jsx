import './FragmentRow.css';

/**
 * Usage:
 * <FragmentRow
 *   fragmentId="frag-53da6bd1"
 *   codec="H.264"
 *   durationLabel="00:04:12"
 *   confidence={0.87}
 *   rationale="SPS parsed, IDR start, VCL ratio 71% — high confidence"
 * />
 *
 * Deliberately a table row, not a rounded card with a shadow — a forensic fragment log
 * reads like an evidence list, not a product feed. Confidence and rationale always sit
 * together: never show a bare percentage without the reason behind it.
 */
export default function FragmentRow({ fragmentId, codec, confidence, rationale, durationLabel }) {
  const pct = Math.round(confidence * 100);

  return (
    <div className="phx-fragment-row">
      <div className="phx-fragment-row__id">{fragmentId}</div>
      <div className="phx-fragment-row__meta">
        <span>{codec}</span>
        {durationLabel && <span>{durationLabel}</span>}
      </div>
      <div className="phx-fragment-row__confidence">
        <div className="phx-fragment-row__bar">
          <div className="phx-fragment-row__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="phx-fragment-row__pct">{pct}%</span>
      </div>
      <div className="phx-fragment-row__rationale">{rationale}</div>
    </div>
  );
}
