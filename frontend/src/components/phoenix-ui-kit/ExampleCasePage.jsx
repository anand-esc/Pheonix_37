import CaseHeader from './CaseHeader';
import ChainOfCustody from './ChainOfCustody';
import FragmentRow from './FragmentRow';
import './tokens.css';

// This is a REFERENCE page showing how the three components compose together.
// Replace the hardcoded data below with real fetch() calls to your backend:
//   GET /api/case/{id}            -> case header info
//   GET /api/case/{id}/ledger     -> chain of custody entries
//   GET /api/case/{id}/fragments  -> fragment rows

const SAMPLE_LEDGER = [
  { id: 1, type: 'genesis', label: 'Genesis', detail: '00000000000000000000000000000000' },
  { id: 2, type: 'detected', label: 'Format detected', timestamp: '09:14:02', detail: 'a1c9…4f02 → hikvision, validated' },
  { id: 3, type: 'recovered', label: 'Recovery completed', timestamp: '09:14:37', detail: '8 fragments, byte-exact' },
  { id: 4, type: 'verified', label: 'Encryption completed', timestamp: '09:15:10', detail: 'AES-256-GCM, plaintext hashed first' },
];

const SAMPLE_FRAGMENTS = [
  { fragmentId: 'frag-53da6bd1', codec: 'H.264', durationLabel: '00:04:12', confidence: 0.87, rationale: 'SPS parsed, IDR start, VCL ratio 71% — high confidence' },
  { fragmentId: 'frag-91af02c4', codec: 'H.264', durationLabel: '00:02:05', confidence: 0.62, rationale: 'SPS present but unparseable, truncated end — moderate confidence' },
  { fragmentId: 'frag-0e77bb19', codec: 'H.265', durationLabel: '00:07:41', confidence: 0.95, rationale: 'Full GOP, matching SPS, clean end-of-stream marker' },
];

export default function ExampleCasePage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.5rem', background: 'var(--color-phx-deep)' }}>
      <CaseHeader
        caseId="case-2026-0091"
        title="Hikvision NVR — sector 4 recovery"
        status="validated"
      />

      <ChainOfCustody entries={SAMPLE_LEDGER} />

      <div style={{ marginTop: '2rem' }}>
        <div style={{ fontFamily: 'var(--phx-font-sans)', fontSize: '0.8rem', color: 'var(--color-phx-secondary)', marginBottom: 8 }}>
          Recovered fragments
        </div>
        {SAMPLE_FRAGMENTS.map((f) => (
          <FragmentRow key={f.fragmentId} {...f} />
        ))}
      </div>
    </div>
  );
}
