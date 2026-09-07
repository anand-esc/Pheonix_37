# Temporal Correlation and Channel Attribution

**Component Owner:** Acquisition & Recovery Module  
**Source Location:** `backend/adapters/generic_carver/timeline.py`

In the absence of an intact vendor index, the temporal ordering and source attribution of recovered video fragments must be derived strictly from the surviving bitstream. This module adheres to rigorous forensic standards by explicitly separating cryptographically verifiable facts from mathematical estimates, ensuring all derived metadata is court-defensible.

## Derivation Methodology

The temporal correlation engine extracts and infers metrics based strictly on encoded bitstream properties:

| Extracted Metric | Technical Artifact Utilized | Forensic Basis |
|---|---|---|
| **Sequential Ordering** | Offset byte position within the source image | Sequential sector write order (applicable exclusively to non-overwritten sectors) |
| **Temporal Duration** | `Picture Count / Frame Rate` | Explicit `declared_fps` derived from SPS VUI (Video Usability Information) timing parameters; otherwise scales against an operator-defined constant |
| **Channel Attribution** | Cryptographic identity (SHA-256) of SPS (Sequence Parameter Set) metadata | A unique encoder configuration acts as a reliable proxy for a distinct hardware channel |
| **Absolute Timestamp** | Not mathematically derivable | Elementary streams inherently lack UTC/IST wall-clock synchronization markers |

*Note on Enumeration:* The `Picture Count` is quantified via explicit picture start sequences (`first_mb_in_slice == 0` for H.264, `first_slice_segment_in_pic_flag` for H.265) to ensure accurate framing regardless of slice fragmentation.

## Frame Rate Extraction

For H.264 streams, the SPS parser extracts the VUI timing parameters (when present) to calculate native frame rate: `fps = time_scale / (2 * num_units_in_tick)`. This calculation reflects the hardware's native recording configuration. Corrupt or malformed VUI blocks are safely bypassed to preserve standard stream recovery.

In instances where VUI parameters are omitted by the hardware vendor, the engine defaults to an operator-configurable `assumed_fps` constant (defaulting to 25 FPS). All such derivations are strictly documented with `duration_basis = "assumed_fps"`. As this assumption scales linearly, an operator may subsequently apply a universal correction factor once the true hardware configuration is established.

## Channel Attribution Heuristics

The engine aggregates recovered fragments by computing the SHA-256 hash of their isolated SPS bytes. Fragments sharing an identical SPS signature are grouped under synthetic identifiers (e.g., `probable-ch01`). This heuristic is documented with the following intrinsic forensic limitations:

1. **Collisions:** Multiple distinct cameras operating under identical configurations (resolution, profile, level, bit-rate) will yield identical SPS signatures, collapsing into a single synthetic channel.
2. **Fragmentation:** A single camera subjected to dynamic mid-recording reconfiguration will yield disparate SPS signatures, resulting in synthetic channel bifurcation.

Fragments lacking recoverable SPS data are isolated under the `unknown-encoder-config` signature strictly for indexing purposes. The `Timeline.to_channel_info()` output explicitly omits `clock_offset_seconds` as cross-channel synchronization remains mathematically indeterminate in a generic carving context.

## Temporal Synchronization Output

Each `TimelineEntry` records a `relative_start_seconds` metric, representing the cumulative chronological progression within its designated synthetic channel. Channels are not arbitrarily synchronized against one another. If a fragment's duration cannot be derived, the cumulative progression chain for that channel is deliberately severed and restarted to prevent systemic drift.

## System Integration Points

- **Data Models:** `EvidenceItem.channels`, `EvidenceItem.metadata` (including `channels_inferred`, `estimated_footage_seconds`, `timeline_notes`).
- **Artefacts:** Logged natively within `PipelineResult.timeline` and the immutable `run_transcript.json`.

## Resolution Pathways

The temporal ambiguities inherent to generic carving are entirely superseded upon the integration of native filesystem parsers (e.g., Hikvision WFS, Dahua DHFS), which extract exact absolute timestamps and physical channel designations directly from intact vendor structures.
