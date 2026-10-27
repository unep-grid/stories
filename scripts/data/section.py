# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.4.2", "xarray==2026.1.0", "zarr==2.18.7", "fsspec==2026.7.0", "aiohttp==3.14.3", "dask[array]==2026.1.2"]
# ///
"""Equatorial Pacific temperature section for the El Niño 2026 story.

Copernicus Marine daily potential temperature (thetao), averaged over
2°S–2°N and a week, from 120°E to 80°W and the surface to MAX_DEPTH m, for
a week of the current event and the same week a year earlier. The 20 °C
isotherm stands for the thermocline. The difference of the two weeks is
"change in one year", not an anomaly to a climatology: the figure says so.

Usage: uv run scripts/data/section.py [YYYY-MM-DD]   (end of the week)
"""

from __future__ import annotations

import sys
from datetime import date, timedelta

import numpy as np

from _common import open_arco_zarr, rounded, story_data_dir, utc_now, write_json

THETAO_ZARR = (
    "https://s3.waw3-1.cloudferro.com/mdl-arco-time-012/arco/GLOBAL_ANALYSISFORECAST_PHY_001_024/"
    "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m_202406/timeChunked.zarr"
)
MAX_DEPTH = 450
LON_STEP = 1.0  # degrees, after averaging
DAYS = 7


def week(end: date) -> slice:
    start = end - timedelta(days=DAYS - 1)
    return slice(np.datetime64(start.isoformat()), np.datetime64(end.isoformat()))


def section(data, end: date):
    """Mean over latitude band and week, on a LON_STEP longitude grid 0–360."""
    subset = data.sel(time=week(end)).mean("time")
    subset = subset.mean("latitude", skipna=True)
    lon360 = (subset.longitude % 360).values
    subset = subset.assign_coords(longitude=lon360).sortby("longitude")
    subset = subset.sel(longitude=slice(120, 280))
    bins = np.arange(120, 280 + LON_STEP, LON_STEP)
    binned = subset.groupby_bins("longitude", bins, labels=bins[:-1] + LON_STEP / 2).mean(skipna=True)
    return binned.rename(longitude_bins="longitude").transpose("depth", "longitude").compute()


def isotherm(grid, depths: np.ndarray, value: float = 20.0) -> list[float | None]:
    """Depth of the first downward crossing of `value` per column, linear."""
    out: list[float | None] = []
    for column in grid.T:
        depth = None
        for k in range(len(column) - 1):
            a, b = column[k], column[k + 1]
            if np.isfinite(a) and np.isfinite(b) and a >= value > b:
                depth = depths[k] + (a - value) / (a - b) * (depths[k + 1] - depths[k])
                break
        out.append(rounded(depth, 1) if depth is not None else None)
    return out


def main() -> None:
    end = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today() - timedelta(days=1)
    before = end.replace(year=end.year - 1)
    dataset = open_arco_zarr(THETAO_ZARR)
    data = dataset["thetao"]
    lat = data.latitude
    data = data.sel(latitude=slice(2, -2) if float(lat[0]) > float(lat[-1]) else slice(-2, 2))
    # ARCO stores carry depth as "elevation", metres, negative down.
    if "elevation" in data.dims:
        data = data.assign_coords(elevation=-data.elevation).rename(elevation="depth")
    data = data.sortby("depth").sel(depth=slice(0, MAX_DEPTH))
    now = section(data, end)
    then = section(data, before)
    depths = now.depth.values
    grid = lambda a: [[rounded(v, 2) for v in row] for row in a]  # noqa: E731
    change = now.values - then.values
    finite = change[np.isfinite(change)]
    result = {
        "schemaVersion": 1,
        "generatedAt": utc_now(),
        "source": {
            "dataset": "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m",
            "store": THETAO_ZARR,
            "method": f"Mean over 2°S–2°N and {DAYS} days, binned to {LON_STEP}° longitude; 20 °C isotherm by linear interpolation.",
        },
        "unit": "°C",
        "longitude": [float(v) for v in now.longitude.values],
        "depth": [rounded(v, 1) for v in depths],
        "now": {"end": end.isoformat(), "days": DAYS, "temperature": grid(now.values), "isotherm20": isotherm(now.values, depths)},
        "before": {"end": before.isoformat(), "days": DAYS, "temperature": grid(then.values), "isotherm20": isotherm(then.values, depths)},
        "change": {"max": rounded(finite.max(), 2), "min": rounded(finite.min(), 2)},
    }
    write_json(story_data_dir("el-nino-2026") / "section.json", result)


if __name__ == "__main__":
    main()
