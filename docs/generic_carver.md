# Generic Annex-B NAL carver

Owner: `feat/acquisition-recovery` branch. Code: `backend/adapters/generic_carver/`.

This is the vendor-agnostic fallback recovery engine. It works on any image
that stores H.264 or H.265 as Annex-B byte streams, which covers most DVR
filesystems once the vendor index is gone, and it never needs a decoder.

## What it does

`GenericNalCarver.carve(image)` returns a `CarveResult` with one
`CarvedFragment` per recovered stream. Each carries the shared-contract
`Fragment` (byte offsets, codec info, recovery method, confidence, rationale),
the structural features the score was computed from, the parsed SPS, and the
SHA-256 of the fragment bytes. `export(image, result, out_dir)` writes each
fragment to `fragment_<index>_<offset>.h264|h265`, re-hashes the written file
and raises `CarverExportError` on any mismatch.

`byte_offset_end` is exclusive: `end - start` is the fragment length.

`Fragment.fragment_id` is set to `frag-<first 16 hex characters of the
fragment's SHA-256>` rather than the contract's default random UUID: two runs
of the carver over the same image produce the same ids, so AI triage results
and reports stay valid when a case is re-processed.

`GenericCarverAdapter` wraps the detector and the carver as a `BaseAdapter`.
It reports the vendor exactly as detection did (never upgraded), returns
*probable* channels inferred from encoder configuration (see
`docs/timeline.md`), and puts per-fragment hashes, timeline facts and carve
statistics into `EvidenceItem.metadata`.

## Rules, in order

1. **Scan.** Every `00 00 01` followed by a plausible NAL header is a
   candidate. H.264 headers need `forbidden_zero_bit = 0`, a type in 1..12,
   and `nal_ref_idc` consistent with the type. H.265 headers need a valid type,
   `nuh_layer_id = 0` and `nuh_temporal_id_plus1 >= 1`. The scanner records
   how many zero bytes precede each start code. Scanning is block-based
   (8 MiB default) with a small carry, so memory does not grow with the image.
2. **Codec.** The first unambiguous parameter set (`0x67`/`0x68` for H.264,
   `0x40 01`/`0x42 01`/`0x44 01` for H.265) fixes the codec, unless detection
   already supplied `codec_hint`.
3. **Start.** A fragment starts at an SPS (H.264) or VPS/SPS (H.265). Once the
   codec is known, an IDR/IRAP without parameter sets can also start one
   (`idr_without_parameter_sets`, lower confidence), and so can a PPS
   without SPS.
4. **Continue.** Subsequent valid NALs join the fragment. A repeated SPS with
   identical bytes is normal (recorders resend parameter sets every GOP) and
   is counted, not split on.
5. **End.** The fragment ends when one of these fires, and the reason is
   recorded and scored:

   | `end_reason` | Trigger | Score delta |
   |---|---|---|
   | `eos` | end-of-sequence/stream NAL (H.264 10/11, H.265 36/37) | +0.10 |
   | `new_sequence` | an SPS with different bytes (new resolution/profile) | +0.05 |
   | `short_gop` | a repeated SPS (or the AUD before it) whose preceding GOP is shorter than the GOP length the recording had established | +0.05 |
   | `zero_filler` | a zero run longer than `filler_split_bytes` (4 KiB) | +0.05 |
   | `end_of_data` | image ends | -0.05 |
   | `truncated_nal` | `00 00 00` inside a NAL followed by a short zero run | -0.10 |
   | `oversized_nal_gap` | next start code further than `max_nal_bytes` (8 MiB) | -0.10 |
   | `invalid_nal` | a start code whose header is invalid for the chosen codec | -0.10 |

6. **Exact ends.** Trailing zero bytes are never part of a fragment. EOS NALs
   carry no payload, so a fragment ending in EOS ends exactly after the header
   even if noise follows. Emulation prevention guarantees `00 00 00` cannot
   occur inside a NAL, so for the final NAL of the image and for any NAL longer
   than `verify_nal_bytes` (64 KiB) the carver looks for a zero triple and
   ends the NAL there.
7. **Noise.** Candidates with fewer than `min_nals` (3) NALs or without any
   picture NAL are discarded and counted in `CarveStats.discarded_fragments`.
   Random data almost never produces a valid start code plus header plus
   parameter set, so noise regions yield nothing.
8. **Hashing.** Each fragment is hashed from the image bytes it points at.
   `recovery_hash` is the SHA-256 over the ordered list of fragment hashes and
   is emitted with `recovery_completed` so a ledger can pin the whole result.

## Confidence

`scoring.score(features)` is additive and deterministic; the rationale string
lists every rule with its delta and ends with the total.

| Rule | Delta |
|---|---|
| base: contiguous run of valid NAL units | 0.25 |
| SPS parsed (resolution, profile, level known) | +0.25 |
| SPS present but unparseable | +0.10 |
| PPS present | +0.10 |
| first picture is an IDR/IRAP | +0.15 |
| at least half the NALs carry picture data (and at least 2) | +0.10 |
| end reason | see table above |
| clamp | 0.05 .. 0.95 |

A complete recording with parameter sets, an IDR start and an EOS scores
0.95. The ceiling is deliberate: carving proves structure, not decodability.

## SPS parsing

`nal.parse_sps_h264` walks the SPS syntax far enough to compute the cropped
picture size, including the high-profile branch (chroma format, bit depth,
scaling matrices) and every `pic_order_cnt_type`. `nal.parse_sps_h265` skips
`profile_tier_level` correctly for any number of sub-layers and applies the
conformance window. Both operate on the unescaped RBSP.

## Fixtures

`tests/fixtures/build_fixtures.py` builds byte-exact synthetic inputs without
ffmpeg: a `BitWriter` with exp-Golomb coding, real SPS/PPS/slice headers,
pseudo-random zero-free payloads, optional AUD and EOS NALs, and
`build_dvr_image` which lays out a vendor header block (six variants: none,
hikvision, dahua, avi, mp4, mpegts), an index block that lists only
non-deleted segments, block-aligned segments separated by zero filler, and a
random noise region. The manifest records offset, length and SHA-256 of every
segment, deleted or not, so tests can prove byte-exact recovery of a deleted
segment. `tests/fixtures/sample_dvr_image.img` (448 KiB, seed 2026,
hikvision variant) is committed with its manifest and a drift-guard test.

## Playable view: lossless MP4 wrapping

`mp4.wrap_fragment_file(fragment.h264, out.mp4, fps=25)` builds a minimal
ISO BMFF file: `ftyp`, one video track with `avc1`/`avcC` (SPS and PPS from
the fragment), fixed-rate `stts`, `stss` for IDR pictures, and an `mdat`
that holds every VCL and SEI NAL byte for byte with a 4-byte length prefix
in place of the Annex-B start code. Nothing is decoded or re-encoded, and the
raw fragment on disk is never touched, so the evidence hash stays valid; the
MP4 is a viewing aid and carries its own SHA-256 in `PipelineResult.playable`.
The frame rate is supplied, not measured: elementary streams from recorders
rarely carry timing, so the wrapper defaults to 25 fps. H.265 fragments are
listed with a note instead of an MP4.

## Known limitations

* Two recordings with identical SPS bytes that abut with no EOS and less than
  4 KiB of zero filler are split only when the first one ends in a short GOP
  (the `short_gop` rule). Recorders use a fixed GOP, so an abrupt end almost
  always leaves one; but a recording that happens to stop exactly on a GOP
  boundary is carved together with the next one. The rule needs two equal
  GOPs of evidence before it fires, so it never splits a healthy stream.
* Fragments are byte streams, not playable containers. Wrapping into MP4 for
  the viewer is a separate, lossless step that must keep the fragment hash.
* A NAL that is truncated by non-zero garbage (no zero triple) keeps the
  garbage up to the next start code. Nothing in the bitstream marks that
  boundary.
