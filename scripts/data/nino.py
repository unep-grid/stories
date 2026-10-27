# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.4.2", "xarray==2026.1.0", "zarr==2.18.7", "fsspec==2026.7.0", "aiohttp==3.14.3", "dask[array]==2026.1.2"]
# ///
"""Niño index series for the El Niño 2026 story.

- NOAA CPC weekly OISST v2.1 Niño indices (1991–2020 base): the reference.
- NOAA CPC Oceanic Niño Index (ERSSTv5, 3-month running mean, 1991–2020
  base), with the peak of past strong events for comparison.
- Copernicus Marine daily SST anomaly averaged over Niño 3.4, from the same
  ARCO Zarr the map shows (cos(latitude)-weighted).

Usage: uv run scripts/data/nino.py [--skip-zarr]
"""

from __future__ import annotations

import re
import sys
from datetime import datetime

from _common import fetch_text, open_arco_zarr, rounded, story_data_dir, utc_now, write_json

WEEKLY_URL = "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for"
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
SST_ANOMALY_ZARR = (
    "https://s3.waw3-1.cloudferro.com/mdl-arco-geo-014/arco/GLOBAL_ANALYSISFORECAST_PHY_001_024/"
    "cmems_mod_glo_phy_anfc_0.083deg-sst-anomaly_P1D-m_202411/geoChunked.zarr"
)
NINO34 = {"west": -170, "east": -120, "south": -5, "north": 5}
START = "2026-01-01"
PAST_EVENTS = [("1982–83", "1982", "1983"), ("1997–98", "1997", "1998"), ("2015–16", "2015", "2016"), ("2023–24", "2023", "2024")]
SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]


def parse_weekly(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        match = re.match(r"\s*(\d{2}[A-Z]{3}\d{4})\s+(.*)$", line)
        if not match:
            continue
        values = [float(v) for v in re.findall(r"-?\d+\.\d", match.group(2))]
        if len(values) != 8:
            continue
        date = datetime.strptime(match.group(1).title(), "%d%b%Y").date().isoformat()
        rows.append({"time": date, "nino12": values[1], "nino3": values[3], "nino34": values[5], "nino4": values[7]})
    return rows


def parse_oni(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines()[1:]:
        parts = line.split()
        if len(parts) == 4 and parts[0] in SEASONS:
            season, year, _, anomaly = parts
            # Centre month of the season, for plotting.
            month = SEASONS.index(season) + 1
            rows.append({"season": season, "year": int(year), "month": month, "oni": float(anomaly)})
    return rows


def zarr_nino34() -> dict | None:
    import numpy as np

    dataset = open_arco_zarr(SST_ANOMALY_ZARR)
    data = dataset["sea_surface_temperature_anomaly"].sel(time=slice(np.datetime64(START), None))
    lat = data.latitude
    lat_slice = slice(NINO34["north"], NINO34["south"]) if float(lat[0]) > float(lat[-1]) else slice(NINO34["south"], NINO34["north"])
    box = data.sel(latitude=lat_slice, longitude=slice(NINO34["west"], NINO34["east"]))
    weights = np.cos(np.deg2rad(box.latitude))
    mean = box.weighted(weights).mean(dim=("latitude", "longitude"), skipna=True).compute()
    points = [
        {"time": np.datetime_as_string(t, unit="D"), "value": rounded(v, 3)}
        for t, v in zip(mean.time.values, mean.values)
    ]
    return {
        "label": "Copernicus Marine daily analysis, Niño 3.4 mean",
        "dataset": "cmems_mod_glo_phy_anfc_0.083deg-sst-anomaly_P1D-m",
        "store": SST_ANOMALY_ZARR,
        "method": "cos(latitude)-weighted mean over 5°S–5°N, 170°W–120°W; anomaly as provided by Copernicus Marine.",
        # The product is analysis then a ~10-day forecast: days after the
        # build date are forecast.
        "analysisUntil": utc_now()[:10],
        "points": [p for p in points if p["value"] is not None],
    }


def main() -> None:
    weekly = parse_weekly(fetch_text(WEEKLY_URL))
    oni = parse_oni(fetch_text(ONI_URL))
    weekly_2026 = [r for r in weekly if r["time"] >= "2025-12-01"]
    peaks = []
    for label, first, second in PAST_EVENTS:
        weeks = [r for r in weekly if r["time"][:4] in (first, second)]
        seasons = [r for r in oni if str(r["year"]) in (first, second)]
        top_week = max(weeks, key=lambda r: r["nino34"])
        top_season = max(seasons, key=lambda r: r["oni"])
        peaks.append({
            "event": label,
            "weekly": {"time": top_week["time"], "value": top_week["nino34"]},
            "oni": {"season": f"{top_season['season']} {top_season['year']}", "value": top_season["oni"]},
        })
    record_weekly = max((r for r in weekly if r["time"] < "2026-01-01"), key=lambda r: r["nino34"])
    result = {
        "schemaVersion": 1,
        "generatedAt": utc_now(),
        "weekly": {
            "label": "NOAA CPC weekly OISST v2.1",
            "baseline": "1991–2020",
            "url": WEEKLY_URL,
            "points": weekly_2026,
        },
        "oni": {
            "label": "NOAA CPC Oceanic Niño Index (ERSSTv5)",
            "baseline": "1991–2020",
            "url": ONI_URL,
            "points": [r for r in oni if r["year"] >= 2025],
        },
        "pastEvents": peaks,
        "recordWeeklyBefore2026": {"time": record_weekly["time"], "value": record_weekly["nino34"]},
        "copernicus": None if "--skip-zarr" in sys.argv else zarr_nino34(),
    }
    write_json(story_data_dir("el-nino-2026") / "nino.json", result, indent=1)


if __name__ == "__main__":
    main()
