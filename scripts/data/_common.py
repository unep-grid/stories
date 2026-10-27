"""Shared helpers for the story data scripts: output paths, JSON, Zarr."""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def story_data_dir(slug: str) -> Path:
    return ROOT / "stories" / slug / "public" / "content" / "data"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rounded(value: Any, digits: int = 3) -> float | None:
    number = float(value)
    return round(number, digits) if math.isfinite(number) else None


def write_json(path: Path, value: Any, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    text = json.dumps(value, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))
    temporary.write_text(text + "\n", encoding="utf-8")
    os.replace(temporary, path)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "unepgrid-stories/0.1"})
    with urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", "replace")


def open_arco_zarr(url: str) -> Any:
    """Open a public Copernicus Marine ARCO Zarr store over HTTP.

    CloudFerro answers 403 for absent sparse chunks: read as missing keys,
    as in zartigl's scripts/arco_zarr.py.
    """
    import xarray as xr
    from fsspec.implementations.http import HTTPFileSystem

    class PublicArcoHttpFileSystem(HTTPFileSystem):
        def _raise_not_found_for_status(self, response: Any, url: str) -> None:
            if response.status in (403, 404):
                raise FileNotFoundError(url)
            super()._raise_not_found_for_status(response, url)

    mapper = PublicArcoHttpFileSystem().get_mapper(url)
    return xr.open_zarr(mapper, consolidated=True)
