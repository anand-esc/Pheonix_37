"""Timeline and channel attribution for carved fragments.

A bare Annex-B stream carries no wall clock and no camera number, so nothing
here invents one. What the bitstream *does* carry is used, and everything else
is labelled as an estimate with its basis:

* **Order** comes from the byte offset of each fragment in the image. On a
  recorder that writes sequentially this is also the recording order, but a
  disk that has wrapped around will place older footage after newer footage.
  The timeline says so rather than claiming chronology.
* **Duration** is ``pictures / frame rate``. The rate is the one declared in
  the SPS VUI timing info when the encoder wrote it (``duration_basis =
  "declared_fps"``); otherwise the caller's assumed rate is used and the
  entry is marked ``"assumed_fps"``.
* **Channel** is inferred from the encoder configuration: fragments whose SPS
  bytes are identical came from the same encoder setup and are grouped as one
  probable channel. Two cameras configured identically collapse into one
  group, and one camera reconfigured mid-recording splits into two; both
  limits are stated in the group's rationale.

Wall-clock time and true channel numbers can only come from a vendor index
(the native adapters) or from the operator. ``clock_offset_seconds`` is
therefore left unset.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.adapters.generic_carver.models import CarveResult
from backend.core.evidence_model import ChannelInfo

DEFAULT_ASSUMED_FPS = 25.0
UNKNOWN_SIGNATURE = "unknown-encoder-config"


class ChannelGroup(BaseModel):
    """Fragments that share one encoder configuration (a probable channel)."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str
    stream_signature: str
    codec: str | None = None
    resolution: str | None = None
    declared_fps: float | None = None
    fragment_indexes: list[int] = Field(default_factory=list)
    pictures: int = 0
    estimated_seconds: float | None = None
    rationale: str = ""


class TimelineEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sequence: int  # position in image order, 1-based
    fragment_index: int
    fragment_id: str
    channel_id: str
    byte_offset_start: int
    byte_offset_end: int
    pictures: int
    idr_count: int
    fps: float | None
    duration_basis: str  # "declared_fps" | "assumed_fps" | "unknown"
    estimated_seconds: float | None
    channel_position: int  # position within its channel, 1-based
    relative_start_seconds: float | None  # cumulative within the channel
    complete: bool  # ended at an end-of-stream NAL
    rationale: str


class Timeline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entries: list[TimelineEntry] = Field(default_factory=list)
    channels: list[ChannelGroup] = Field(default_factory=list)
    assumed_fps: float = DEFAULT_ASSUMED_FPS
    total_estimated_seconds: float | None = None
    notes: list[str] = Field(default_factory=list)

    def to_channel_info(self) -> list[ChannelInfo]:
        """The shared-contract view. ``clock_offset_seconds`` stays unset."""
        return [
            ChannelInfo(
                channel_id=group.channel_id,
                declared_frame_rate=group.declared_fps,
                declared_resolution=group.resolution,
            )
            for group in self.channels
        ]

    def channel_of(self, fragment_id: str) -> str | None:
        for entry in self.entries:
            if entry.fragment_id == fragment_id:
                return entry.channel_id
        return None


def build_timeline(
    result: CarveResult, *, assumed_fps: float = DEFAULT_ASSUMED_FPS
) -> Timeline:
    """Order, group and time-estimate the fragments of one carve result."""
    ordered = sorted(result.fragments, key=lambda c: c.fragment.byte_offset_start)

    # ---- group by encoder configuration -----------------------------------
    groups: dict[str, ChannelGroup] = {}
    order: list[str] = []
    for carved in ordered:
        signature = carved.sps_sha256 or UNKNOWN_SIGNATURE
        if signature not in groups:
            order.append(signature)
            stream = carved.stream
            groups[signature] = ChannelGroup(
                channel_id=f"probable-ch{len(order):02d}",
                stream_signature=signature,
                codec=carved.features.codec,
                resolution=(
                    f"{stream.width}x{stream.height}" if stream is not None else None
                ),
                declared_fps=stream.declared_fps if stream is not None else None,
            )
        groups[signature].fragment_indexes.append(carved.index)
        groups[signature].pictures += carved.features.picture_count

    # ---- one entry per fragment, in image order ---------------------------
    entries: list[TimelineEntry] = []
    cursor: dict[str, float] = {}
    position: dict[str, int] = {}
    for sequence, carved in enumerate(ordered, start=1):
        signature = carved.sps_sha256 or UNKNOWN_SIGNATURE
        group = groups[signature]
        declared = group.declared_fps
        pictures = carved.features.picture_count

        if pictures == 0:
            fps, basis, seconds = declared, "unknown", None
        elif declared:
            fps, basis, seconds = declared, "declared_fps", pictures / declared
        else:
            fps, basis, seconds = assumed_fps, "assumed_fps", pictures / assumed_fps

        position[signature] = position.get(signature, 0) + 1
        start = cursor.get(signature)
        if seconds is not None:
            cursor[signature] = cursor.get(signature, 0.0) + seconds
            start = start if start is not None else 0.0
        else:
            # An unknown duration breaks the cumulative chain for this channel.
            cursor.pop(signature, None)

        entries.append(
            TimelineEntry(
                sequence=sequence,
                fragment_index=carved.index,
                fragment_id=carved.fragment.fragment_id,
                channel_id=group.channel_id,
                byte_offset_start=carved.fragment.byte_offset_start,
                byte_offset_end=carved.fragment.byte_offset_end,
                pictures=pictures,
                idr_count=carved.features.idr_count,
                fps=fps,
                duration_basis=basis,
                estimated_seconds=round(seconds, 3) if seconds is not None else None,
                channel_position=position[signature],
                relative_start_seconds=(
                    round(start, 3)
                    if start is not None and seconds is not None
                    else None
                ),
                complete=carved.features.end_reason == "eos",
                rationale=_entry_rationale(
                    carved, group, basis, fps, pictures, seconds
                ),
            )
        )

    # ---- finish the groups -------------------------------------------------
    for signature in order:
        group = groups[signature]
        total = sum(
            e.estimated_seconds or 0.0
            for e in entries
            if e.channel_id == group.channel_id
        )
        group.estimated_seconds = round(total, 3) if total else None
        group.rationale = _group_rationale(group)

    total_seconds = sum(e.estimated_seconds or 0.0 for e in entries)
    timeline = Timeline(
        entries=entries,
        channels=[groups[s] for s in order],
        assumed_fps=assumed_fps,
        total_estimated_seconds=round(total_seconds, 3) if total_seconds else None,
        notes=_notes(entries, groups),
    )
    return timeline


# ---------------------------------------------------------------------------
# Rationale text
# ---------------------------------------------------------------------------
def _entry_rationale(carved, group, basis, fps, pictures, seconds) -> str:
    parts = [
        f"position {carved.index} by byte offset 0x{carved.fragment.byte_offset_start:x}",
        f"{pictures} picture(s), {carved.features.idr_count} key frame(s)",
    ]
    if basis == "declared_fps":
        parts.append(f"duration {seconds:.2f}s at {fps:g} fps declared in the SPS VUI")
    elif basis == "assumed_fps":
        parts.append(
            f"duration {seconds:.2f}s at an assumed {fps:g} fps; the SPS declares "
            "no timing information"
        )
    else:
        parts.append("duration unknown: no picture data to count")
    parts.append(f"grouped into {group.channel_id} by encoder configuration")
    if carved.features.end_reason != "eos":
        parts.append(
            f"recording is incomplete (ended by {carved.features.end_reason.replace('_', ' ')})"
        )
    return "; ".join(parts)


def _group_rationale(group: ChannelGroup) -> str:
    if group.stream_signature == UNKNOWN_SIGNATURE:
        return (
            "fragments with no readable SPS; they cannot be attributed to an "
            "encoder configuration and are grouped together only for listing"
        )
    parts = [
        (
            f"{len(group.fragment_indexes)} fragment(s) share SPS "
            f"{group.stream_signature[:16]}"
        ),
    ]
    if group.resolution:
        parts.append(f"resolution {group.resolution}")
    parts.append(
        "declared "
        + (f"{group.declared_fps:g} fps" if group.declared_fps else "no frame rate")
    )
    parts.append(
        "this is a probable channel, not a vendor channel number: two cameras "
        "configured identically would appear here as one"
    )
    return "; ".join(parts)


def _notes(entries: list[TimelineEntry], groups: dict[str, ChannelGroup]) -> list[str]:
    notes = [
        (
            "Order is the order fragments appear in the image, which is the "
            "recording order only if the recorder had not wrapped around and "
            "started overwriting."
        ),
        (
            "No wall-clock time is available from a bare elementary stream; all "
            "times are relative to the start of their own channel."
        ),
    ]
    assumed = sum(1 for e in entries if e.duration_basis == "assumed_fps")
    if assumed:
        notes.append(
            f"{assumed} of {len(entries)} fragment(s) have no declared frame rate; "
            "their durations use the assumed rate and would scale linearly with "
            "the real one."
        )
    unknown = sum(1 for e in entries if e.duration_basis == "unknown")
    if unknown:
        notes.append(f"{unknown} fragment(s) carry no countable pictures.")
    incomplete = sum(1 for e in entries if not e.complete)
    if incomplete:
        notes.append(
            f"{incomplete} fragment(s) do not end at an end-of-stream marker, so "
            "footage may be missing at their tail."
        )
    if len(groups) == 1 and len(entries) > 1:
        notes.append(
            "All fragments share one encoder configuration, so this image gives "
            "no basis for separating channels."
        )
    return notes
