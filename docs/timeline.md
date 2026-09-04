# Timeline and channel attribution

Owner: `feat/acquisition-recovery` branch. Code:
`backend/adapters/generic_carver/timeline.py`.

A vendor index tells you which camera recorded what and when. Once that index
is gone, the bitstream itself is the only witness left, and it is a partial
one. This module reports exactly what the bitstream supports and labels
everything else as an estimate with its basis. Nothing here invents a clock or
a camera number.

## What comes from where

| Question | Answer used | Basis |
|---|---|---|
| In what order were these recorded? | position of the fragment in the image | write order on a recorder that has not wrapped around |
| How long is each recording? | `pictures / frame rate` | `declared_fps` from SPS VUI timing, else the caller's assumed rate |
| Which camera? | fragments sharing identical SPS bytes | one encoder configuration = one probable channel |
| What time of day? | not answered | no wall clock exists in an elementary stream |

`pictures` is counted from picture starts, not NAL units: H.264 uses
`first_mb_in_slice == 0`, H.265 uses `first_slice_segment_in_pic_flag`, so a
frame split into several slices is still counted once.

## Frame rate

`parse_sps_h264` now reads the VUI timing block when the encoder wrote one:
`fps = time_scale / (2 * num_units_in_tick)`. This is the rate the recorder
itself declared, so durations built on it are as good as the recording. A
malformed VUI is ignored rather than failing the whole SPS parse; the picture
size is already known by that point.

When there is no VUI (common on cheap recorders), `build_timeline` falls back
to `assumed_fps` (25 by default), marks the entry `duration_basis =
"assumed_fps"`, and adds a note saying how many fragments are affected. Those
durations scale linearly with the real rate: if the unit actually recorded at
12.5 fps, every such estimate is exactly half of the truth.

H.265 VUI is not parsed yet, so H.265 fragments always use the assumed rate.

## Channels

Fragments are grouped by the SHA-256 of their SPS bytes and named
`probable-ch01`, `probable-ch02`, and so on, in the order they first appear in
the image. Two honest limits, both written into the group's `rationale`:

* two cameras configured identically (same resolution, profile, level, rate)
  are indistinguishable in the bitstream and collapse into one group;
* one camera reconfigured mid-recording produces two groups.

`Timeline.to_channel_info()` returns the shared-contract `ChannelInfo` list
with `declared_frame_rate` and `declared_resolution` filled in and
`clock_offset_seconds` left unset, because no clock is available to offset.

Fragments with no readable SPS go into a single group whose signature is
`unknown-encoder-config`, described as "grouped together only for listing".

## Times in the output

Each `TimelineEntry` carries `relative_start_seconds`: the cumulative position
within its own channel, starting at zero for that channel's first recording.
Channels are not aligned with each other, because nothing in the data says how
they line up. If a fragment's duration is unknown the cumulative chain for
that channel restarts rather than silently drifting.

## Where it appears

* `EvidenceItem.channels` (from `GenericCarverAdapter.parse`)
* `EvidenceItem.metadata`: `channels_inferred`, `estimated_footage_seconds`,
  `timeline_notes`, and per fragment `fragment_NNNN_channel`,
  `fragment_NNNN_seconds` (with the basis in brackets)
* `PipelineResult.timeline` and the `timeline` block of `run_transcript.json`
* printed by `hardware/acquisition_rig/run_demo_pipeline.py`

## What would make this better

A vendor index (Hikvision WFS, Dahua DHFS) gives real channel numbers and real
timestamps; when those adapters land, their `parse()` output replaces this
inference entirely. Short of that, the operator can supply the recorder's
configured frame rate for a case, which turns every `assumed_fps` estimate
into a defensible one.
