"""Async wrappers so the API layer can run carving off the event loop."""

from __future__ import annotations

import asyncio
from pathlib import Path

from backend.adapters.generic_carver.carver import GenericNalCarver
from backend.adapters.generic_carver.models import CarveResult, ExportedFragment


async def async_carve(carver: GenericNalCarver, source_path: str | Path) -> CarveResult:
    return await asyncio.to_thread(carver.carve, source_path)


async def async_export(
    carver: GenericNalCarver,
    source_path: str | Path,
    result: CarveResult,
    out_dir: str | Path,
) -> list[ExportedFragment]:
    return await asyncio.to_thread(carver.export, source_path, result, out_dir)
