# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Ocean observing platforms for the El Niño 2026 story, as GeoJSON.

- Argo floats with a profile in the last ARGO_DAYS days, one point per
  float at its latest position, from the Argo GDAC weekly profile index.
- TAO/TRITON tropical Pacific moorings at their nominal design sites
  (GTMBA), labelled as such: the operating status of each site varies.

Usage: uv run scripts/data/observing.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from _common import fetch_text, story_data_dir, utc_now, write_json

ARGO_INDEX = "https://data-argo.ifremer.fr/ar_index_this_week_prof.txt"
ARGO_DAYS = 10

# Nominal GTMBA sites: longitude (°E, negative west) → latitudes.
TAO_TRITON = {
    137: [8, 5, 2, 0],
    147: [5, 2, 0, -2],
    156: [8, 5, 2, 0, -2, -5],
    165: [8, 5, 2, 0, -2, -5, -8],
    180: [8, 5, 2, 0, -2, -5, -8],
    -170: [8, 5, 2, 0, -2, -5, -8],
    -155: [8, 5, 2, 0, -2, -5, -8],
    -140: [9, 5, 2, 0, -2, -5, -8],
    -125: [8, 5, 2, 0, -2, -5, -8],
    -110: [8, 5, 2, 0, -2, -5, -8],
    -95: [8, 5, 3.5, 2, 0, -2, -5, -8],
}


def point(lon: float, lat: float, **properties: object) -> dict:
    return {"type": "Feature", "properties": properties, "geometry": {"type": "Point", "coordinates": [round(lon, 2), round(lat, 2)]}}


def argo_floats() -> tuple[list[dict], str]:
    text = fetch_text(ARGO_INDEX)
    updated = next(line.split(":", 1)[1].strip() for line in text.splitlines() if line.startswith("# Date of update"))
    now = datetime.strptime(updated, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    cutoff = (now - timedelta(days=ARGO_DAYS)).strftime("%Y%m%d%H%M%S")
    latest: dict[str, tuple[str, float, float]] = {}
    for line in text.splitlines():
        if line.startswith("#") or line.startswith("file,"):
            continue
        parts = line.split(",")
        if len(parts) < 4 or not parts[2] or not parts[3]:
            continue
        path, date, lat, lon = parts[0], parts[1], parts[2], parts[3]
        if date < cutoff:
            continue
        wmo = path.split("/")[1]
        if wmo not in latest or date > latest[wmo][0]:
            latest[wmo] = (date, float(lat), float(lon))
    features = [point(lon, lat, kind="argo") for _, lat, lon in latest.values() if -90 <= lat <= 90 and -180 <= lon <= 180]
    return features, now.date().isoformat()


def moorings() -> list[dict]:
    return [point(lon, lat, kind="tao-triton") for lon, lats in TAO_TRITON.items() for lat in lats]


def main() -> None:
    argo, argo_date = argo_floats()
    tao = moorings()
    collection = lambda features: {"type": "FeatureCollection", "features": features}  # noqa: E731
    out = story_data_dir("el-nino-2026")
    write_json(out / "argo.geojson", collection(argo))
    write_json(out / "moorings.geojson", collection(tao))
    write_json(out / "observing.json", {
        "schemaVersion": 1,
        "generatedAt": utc_now(),
        "argo": {"count": len(argo), "days": ARGO_DAYS, "asOf": argo_date, "url": ARGO_INDEX},
        "moorings": {"count": len(tao), "note": "Nominal TAO/TRITON design sites (GTMBA); not all are operating at a given time."},
    }, indent=1)


if __name__ == "__main__":
    main()
