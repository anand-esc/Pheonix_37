# Generic Annex-B NAL Carver

**Component Owner:** Acquisition & Recovery Module  
**Source Location:** `backend/adapters/generic_carver/`

This subsystem serves as the vendor-agnostic fallback recovery engine. It executes structural file carving across any storage image utilizing H.264 or H.265 Annex-B byte streams. This methodology permits the extraction of video evidence when proprietary vendor filesystems are either damaged, overwritten, or unsupported, without necessitating stream decoding.

## Core Operational Logic

`GenericNalCarver.carve(image)` evaluates an acquired image and yields a `CarveResult` containing individual `CarvedFragment` objects. Each fragment adheres to the unified `Fragment` data contract (documenting byte offsets, codec metadata, extraction methodology, confidence scoring, and cryptographic identity). The subsequent `export(image, result, out_dir)` function persists the recovered fragments to disk (`fragment_<index>_<offset>.h264|h265`), computing a post-write SHA-256 hash to guarantee parity; any derivation triggers a `CarverExportError`.

The `byte_offset_end` parameter is structurally exclusive: `end - start` computes the exact byte length.

`Fragment.fragment_id` is deterministically computed as `frag-<first 16 hex characters of the fragment's SHA-256>` rather than a randomized UUID. This ensures reproducibility across discrete executions, preserving the integrity of downstream AI triage models and reporting logic over successive case reviews.

The `GenericCarverAdapter` encapsulates this logic into a compliant `BaseAdapter` interface. It mirrors the upstream format detector's vendor findings, derives *probable* logical channels utilizing encoder parameters (detailed in `docs/timeline.md`), and aggregates execution statistics into `EvidenceItem.metadata`.

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

## Container File Carving (Pass A)

The NAL carver described above reads Annex-B elementary streams, which is what a
recorder writes to its own disk: every access unit is introduced by a `00 00 01`
start code. A file copied from a computer is a different shape. An MP4 keeps its
NAL units length-prefixed inside an `mdat` box and carries no start codes at all,
so a start-code scan over one finds only coincidences. On a five-second sample
clip it finds 677 of them, and every fragment built from them is noise.

`container.py` therefore runs first and carves such a file **as a file**. It finds
the `ftyp` box that opens every ISO base media file (or the `RIFF....AVI ` header
of an AVI), walks the box chain to the end, and returns exactly that byte range.
The result hashes identical to the original, which is the only claim worth making
about a recovered exhibit.

### Rules

1. **Candidate detection.** The image is scanned for `ftyp` and `RIFF` with an
   overlap between block reads, so a signature split across two reads is still
   found. A candidate `ftyp` box must be 16 to 512 bytes, a multiple of four, and
   followed by a printable major brand.
2. **Box walking.** Each header is read in whichever of the three defined forms it
   uses: a 32-bit size, `size == 1` with a 64-bit length in the next eight bytes,
   or `size == 0` meaning the box runs to the end of the file. Ignoring the second
   form is how a parser silently mis-reads every file over four gigabytes.
3. **Termination.** The chain ends at another `ftyp` (`next_file`), at the last
   byte of the image (`clean_end`), at a box that runs past the end
   (`truncated_box`), or at a header that is not a box (`invalid_box`).
4. **A media box is required.** An `ftyp` with no `mdat`, or a RIFF header with no
   `movi` list, holds no footage. It is counted as rejected rather than reported,
   which is what keeps a vendor's four-byte marker from being announced as a
   recovered file.
5. **Exclusion.** The byte ranges of everything pass A claims are excluded from
   the Annex-B scan, so the same bytes are never reported twice and a run of start
   codes inside an `mdat` does not become a second fragment.

### What is read beyond the boundaries

Deliberately little, and every value comes out of the file's own header:
`mvhd` gives the declared duration, `tkhd` and the sample entry give the geometry,
and the sample entry fourcc gives the codec. Nothing is inferred and nothing is
decoded.

### Confidence

| Heuristic | Delta |
|---|---|
| Base: valid header and box chain | 0.30 |
| Index box present (`moov` / `idx1`) — the file can be played | +0.30 |
| Media payload present (`mdat` / `movi`) | +0.25 |
| Box chain ended on a boundary | +0.10 |
| Last box runs past the end of the image | −0.20 |
| Header declares a duration | +0.05 |
| Clamp | 0.05 .. 0.95 |

An intact file with an index and a payload scores 0.95. As with the stream
carver, the score is reconstruction completeness and is stated as such in the
rationale — it is not a claim about what the footage shows.

### Where it shows up

`CarvedFragment.container` carries the `ContainerInfo` for exhibits found by this
pass; it is `None` for carved streams. `recovery_method` is
`container_file_carve` rather than `annexb_nal_carve`, export keeps the original
extension (`.mp4`, `.avi`), and the pipeline serves such a file directly to the
viewer instead of wrapping it, because re-wrapping would change the bytes that
were hashed.

`CarveOptions.carve_containers` turns the pass off; the carver then behaves
exactly as it did before this pass existed.
