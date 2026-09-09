# Generic Annex-B NAL Carver

**Component Owner:** Acquisition & Recovery Module  
**Source Location:** `backend/adapters/generic_carver/`

This subsystem serves as the vendor-agnostic fallback recovery engine. It executes structural file carving across any storage image utilizing H.264 or H.265 Annex-B byte streams. This methodology permits the extraction of video evidence when proprietary vendor filesystems are either damaged, overwritten, or unsupported, without necessitating stream decoding.

## Core Operational Logic

`GenericNalCarver.carve(image)` evaluates an acquired image and yields a `CarveResult` containing individual `CarvedFragment` objects. Each fragment adheres to the unified `Fragment` data contract (documenting byte offsets, codec metadata, extraction methodology, confidence scoring, and cryptographic identity). The subsequent `export(image, result, out_dir)` function persists the recovered fragments to disk (`fragment_<index>_<offset>.h264|h265`), computing a post-write SHA-256 hash to guarantee parity; any derivation triggers a `CarverExportError`.

The `byte_offset_end` parameter is structurally exclusive: `end - start` computes the exact byte length.

`Fragment.fragment_id` is deterministically computed as `frag-<first 16 hex characters of the fragment's SHA-256>` rather than a randomized UUID. This ensures reproducibility across discrete executions, preserving the integrity of downstream AI triage models and reporting logic over successive case reviews.

The `GenericCarverAdapter` encapsulates this logic into a compliant `BaseAdapter` interface. It mirrors the upstream format detector's vendor findings, derives *probable* logical channels utilizing encoder parameters (detailed in `docs/timeline.md`), and aggregates execution statistics into `EvidenceItem.metadata`.

## Known Algorithmic Limitations

> [!WARNING]
> **Interleaved Block Boundary Parsing (Algorithm Gap)**
> The current generic carver reads the image linearly and reassembles Annex-B NAL units across sector boundaries. On real multi-channel DVR inputs, video frames from different cameras are often interleaved in fixed-size hardware blocks (e.g., 256KB or 1MB chunks). Because the carver is not chunk-aware, it incorrectly treats adjacent blocks from different channels as contiguous byte streams. This causes severe macroblock corruption at the splice points when decoding the recovered fragments. Resolving this requires implementing a chunk-deinterleaving pass prior to NAL boundary scanning.

## Sequential Carving Ruleset

1. **Scanner Heuristic:** A candidate sequence requires `00 00 01` preceding a structurally valid NAL header. H.264 compliance dictates `forbidden_zero_bit = 0`, a type identifier within `1..12`, and consistent `nal_ref_idc` scaling. H.265 compliance requires valid type parameters, `nuh_layer_id = 0`, and `nuh_temporal_id_plus1 >= 1`. Memory allocation is constrained via a bounded block scanner (default 8 MiB with deterministic overflow carry).
2. **Codec Establishment:** The primary unambiguous parameter set (`0x67`/`0x68` for H.264, `0x40 01`/`0x42 01`/`0x44 01` for H.265) dictates the stream codec, superseding initial detector hints.
3. **Sequence Initialization:** A valid fragment originates at an SPS (H.264) or VPS/SPS (H.265). Sequences may also initiate on isolated IDR/IRAP or PPS packets, resulting in reduced confidence assertions.
4. **Sequence Continuation:** Structurally sound subsequent NAL units are aggregated. Routine SPS repetition (indicative of standard GOP pacing) is quantified but does not trigger fragmentation.
5. **Sequence Termination:** Fragments terminate upon specific state triggers, each generating a documented confidence modifier:

   | `end_reason` | Structural Trigger | Score Modifier |
   |---|---|---|
   | `eos` | Valid end-of-sequence/stream NAL (H.264 10/11, H.265 36/37) | +0.10 |
   | `new_sequence` | Divergent SPS sequence parameter (altered resolution/profile) | +0.05 |
   | `short_gop` | Premature GOP termination relative to the established stream baseline | +0.05 |
   | `zero_filler` | Unallocated zero-padding exceeding `filler_split_bytes` (4 KiB) | +0.05 |
   | `end_of_data` | Encounter of media boundaries | -0.05 |
   | `truncated_nal` | Intra-NAL `00 00 00` anomaly preceding short zero padding | -0.10 |
   | `oversized_nal_gap` | Start code gap exceeding `max_nal_bytes` bounds (8 MiB) | -0.10 |
   | `invalid_nal` | Syntactic NAL header invalidity | -0.10 |

6. **Boundary Enforcement:** Trailing zero-padding is strictly omitted. Streams concluding in EOS NAL units are truncated precisely post-header to isolate environmental noise. NAL units surpassing `verify_nal_bytes` (64 KiB) are aggressively bounded utilizing mandatory emulation prevention parameters (`00 00 00`).
7. **Noise Rejection:** Sequences exhibiting fewer than `min_nals` (3) or entirely devoid of picture data are discarded and audited within `CarveStats.discarded_fragments`.
8. **Cryptographic Sealing:** Individual fragments are hashed from the source disk. The overarching `recovery_hash` comprises a SHA-256 cascade of these fragments, emitted via `recovery_completed` for immutable ledger commitment.

## Quantitative Confidence Scoring

The `scoring.score(features)` logic is additive, deterministic, and rigorously documented within the `rationale` string.

| Heuristic Evaluated | Additive Delta |
|---|---|
| Base Allocation: Contiguous valid NAL unit sequence | 0.25 |
| Parseable SPS parameters (resolution, profile, level) | +0.25 |
| Unparseable SPS header present | +0.10 |
| PPS header present | +0.10 |
| Initialized on IDR/IRAP frame | +0.15 |
| Valid picture data payload across >50% of sequence (min. 2 NALs) | +0.10 |
| Termination state (`end_reason`) | Variable (see above) |
| System Clamp Limit | 0.05 .. 0.95 |

An intact, perfectly structured recording achieves a maximum index of 0.95. The theoretical ceiling is restricted because structural validity does not constitute a forensic claim of eventual player decodability or content authenticity.

## Parameter Set Parsing

`nal.parse_sps_h264` executes an iterative traversal of SPS syntax to derive valid cropped picture dimensions, appropriately managing high-profile scaling arrays and `pic_order_cnt_type` variations. `nal.parse_sps_h265` adheres to sub-layer tier levels and evaluates conformance windows. These operations run directly against the unescaped RBSP (Raw Byte Sequence Payload).

## Synthetic Validation Fixtures

`tests/fixtures/build_fixtures.py` engineers mathematically precise synthetic Annex-B streams, bypassing FFmpeg encoder variability. Using `BitWriter` with exp-Golomb coding, it constructs pseudo-random, zero-free payload blocks. The `build_dvr_image` logic encapsulates these into diverse vendor structures (hikvision, dahua, generic), embedding a known quantity of orphaned (deleted) data segments to definitively validate the carver's extraction efficacy byte-for-byte. 

## Lossless MP4 Wrapping

`mp4.wrap_fragment_file(fragment.h264, out.mp4, fps=25)` orchestrates the generation of an ISO BMFF container to facilitate visual analysis. Crucially, this component encapsulates raw NAL streams utilizing standard `stts`, `stss`, and `mdat` tables without executing stream decoding or transcoding. 
This isolation ensures the underlying evidence fragment (`fragment_id`) remains cryptographically pristine. The resultant MP4 artifact functions exclusively as a viewing proxy and is hashed distinctly within `PipelineResult.playable`.

## Operational Limitations

* Contiguous sequences sharing identical SPS parameters lacking definitive EOS markers or `zero_filler` padding are fragmented solely when triggered by the `short_gop` logic. A stream that terminates identically upon a GOP boundary may coalesce with successive contiguous recordings.
* Carved fragments exist purely as Annex-B byte streams. Standard video player decodability mandates independent MP4 wrapping logic.
* Truncated NAL units abutting non-zero disk garbage are bounded at the subsequent valid start code due to inherent binary stream constraints.
