# Format detection: signatures, confidence rules, adapter routing

Owner: `feat/acquisition-recovery` branch. Code: `backend/detection/`.

The detector reads a bounded amount of the image (1 MiB head plus 32 windows of
64 KiB spread evenly over the file, about 3 MiB total) and never decodes video.
It answers three questions with a written rationale: which vendor or container
is this, how sure are we, and which adapter should parse it.

## Signature registry

| Name | Vendor | Kind | Pattern | Expected offset | Weight | Status | Verified on device |
|---|---|---|---|---|---|---|---|
| `hikvision_master_sector` | Hikvision | vendor | `HIKVISION@HANGZHOU` | 0x210 | 0.90 | STUBBED (delegates to generic carver) | No |
| `hikvision_hikbtree` | Hikvision | vendor | `HIKBTREE` | anywhere | 0.55 | STUBBED | No |
| `dahua_dhfs_header` | Dahua | vendor | `DHFS4.1` | 0 | 0.85 | PARTIAL (filesystem parser incomplete) | No |
| `dahua_dhav_frame` | Dahua | vendor | `DHAV` | anywhere | 0.60 | PARTIAL (magic byte carving only) | No |
| `dahua_dhav_trailer` | Dahua | vendor | `dhav` | anywhere | 0.25 | PARTIAL | No |
| `riff_header` | Generic AVI | container | `RIFF` | 0 | 0.40 | GENERIC_FALLBACK | n/a |
| `avi_form_type` | Generic AVI | container | `AVI ` | 8 | 0.45 | GENERIC_FALLBACK | n/a |
| `iso_bmff_ftyp` | Generic MP4 | container | `ftyp` | 4 | 0.80 | GENERIC_FALLBACK | n/a |
| `mpegts_sync_0/1/2` | Generic MPEG-TS | container | `0x47` | 0, 188, 376 | 0.20 / 0.30 / 0.35 | GENERIC_FALLBACK | n/a |

Source notes live next to each entry in `backend/detection/signatures.py` and
are printed into the report. The Hikvision and Dahua entries come from public
reverse-engineering write-ups and open-source demuxers; nobody on this branch
has confirmed them against a physical recorder yet, and the registry says so
(`verified_on_device = False`). When a teammate confirms one on hardware, flip
the flag and update the note in the same commit.

Bare elementary streams have no fixed magic. They are recognised statistically
from Annex-B start codes (`00 00 01`) followed by a plausible NAL header:

* H.264: `forbidden_zero_bit = 0`, type 1 to 12, `nal_ref_idc` non-zero for
  IDR/SPS/PPS and zero for SEI/AUD/EOS/EOB/filler.
* H.265: type in 0 to 9, 16 to 21 or 32 to 40, `nuh_layer_id = 0`,
  `nuh_temporal_id_plus1 >= 1`.

Codec votes come only from parameter-set headers (`0x67`/`0x68` for H.264,
`0x40 01`/`0x42 01`/`0x44 01` for H.265), which are unambiguous between the
two codecs. `nal_density` is the fraction of sampled windows containing at
least one valid start code.

## Research targets

The problem statement also names CP Plus, Uniview, Godrej, Honeywell, Matrix and
TP-Link. No independently reproducible public filesystem signature was found
for them, so they are registered as `RESEARCH_TARGET` with a note and routed to
the generic carver. CP Plus deserves a specific note: many of its recorders
are Dahua OEM builds, so a DHFS/DHAV hit on a CP Plus unit is expected. The
report says "Dahua" with an OEM note instead of claiming native CP Plus
support.

## Confidence rules (explainable, deterministic)

1. A signature at its expected offset contributes its full weight. Found
   elsewhere, it contributes `weight x 0.8` and the rationale says
   "unexpected offset". Container magics only count at their defined offset;
   proprietary markers count anywhere.
2. Weights are summed per vendor and capped at 0.95.
3. The highest-scoring vendor wins if its score is at least 0.30. Scores below
   that are listed as hints only.
4. If two proprietary vendors both score at least 0.50, the winner loses 0.10
   and the rationale records the conflict.
5. If the winner has NAL density of at least 0.50, it gains 0.05 (cap 0.95):
   the image demonstrably contains recorded video.
6. No decisive signature but NAL start codes present: vendor is
   "Generic Annex-B stream", signature `annexb-h264` or `annexb-h265`,
   confidence `0.35 + 0.45 x density`, capped at 0.80.
7. Nothing at all: vendor "Unknown", signature `none`, confidence 0.
8. Empty file: "Unknown" with the reason "empty source".

`VendorInfo.detected_format_signature` is `<signature_name>@0x<offset>` for a
signature decision, the codec tag for a stream decision, or `none`.

## Adapter routing

`resolve_adapter(report)` maps the vendor to an entry point and imports it
lazily:

| Vendor | Module | Class |
|---|---|---|
| Hikvision | `backend.adapters.hikvision` | `HikvisionAdapter` |
| Dahua | `backend.adapters.dahua` | `DahuaAdapter` |
| anything else | `backend.adapters.generic_carver` | `GenericCarverAdapter` |

If the vendor module is missing, does not export the class, cannot be
instantiated without arguments, or is not a `BaseAdapter`, the resolver falls
back to the generic carver and records the reason. If the generic carver is
also missing, `available` is `False` and `adapter` is `None`; nothing raises.
Vendor adapter owners: if your class has a different name, change the entry in
`ADAPTER_FOR_VENDOR`; nothing else in detection depends on it.

## Events

`detect(..., case_id=..., sink=...)` emits `format_detected` with the report
summary (vendor, signature, validation_status, confidence, codec_guess,
nal_density, matched, adapter_module). `resolve_adapter(..., case_id=...,
sink=...)` emits `adapter_resolved` with adapter, fallback, available, reason.
