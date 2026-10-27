#!/usr/bin/env node
/**
 * Regions with a consistent El Niño rainfall signal, as GeoJSON, for the
 * El Niño 2026 story. Outlines are schematic, after the composite analysis
 * of Ropelewski & Halpert (1987) as mapped by NOAA CPC / Climate.gov, and
 * labelled with the season panel of those maps.
 *
 * [TO BE COMPLETED] Regions and seasons to be validated by WMO.
 *
 * Usage: node scripts/data/rainfall-signal.mjs
 */
import { geoArea } from "d3-geo";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(
  new URL(
    "../../stories/el-nino-2026/public/content/data/rainfall-signal.geojson",
    import.meta.url,
  ),
);

// [lon, lat] rings, any winding: fixed below for d3-geo.
const REGIONS = [
  {
    name: "Indonesia – N Australia",
    signal: "drier",
    season: "Jun–Feb",
    labelAt: [125, -8],
    ring: [
      [95, 6],
      [140, 6],
      [150, -10],
      [145, -20],
      [120, -20],
      [110, -10],
      [95, -5],
    ],
  },
  {
    name: "Southern Africa",
    signal: "drier",
    season: "Dec–Feb",
    labelAt: [28, -22],
    ring: [
      [14, -15],
      [38, -12],
      [36, -30],
      [26, -34],
      [16, -28],
    ],
  },
  {
    name: "India",
    signal: "drier",
    season: "Jun–Aug",
    labelAt: [78, 21],
    ring: [
      [70, 28],
      [86, 26],
      [82, 15],
      [77, 8],
      [72, 18],
    ],
  },
  {
    name: "Central America",
    signal: "drier",
    season: "Jun–Aug",
    labelAt: [-86, 14],
    ring: [
      [-100, 20],
      [-80, 20],
      [-77, 8],
      [-86, 8],
      [-95, 14],
    ],
  },
  {
    name: "Northern South America",
    signal: "drier",
    season: "Dec–Feb",
    labelAt: [-55, 0],
    ring: [
      [-75, 8],
      [-60, 10],
      [-35, -4],
      [-40, -12],
      [-60, -8],
      [-72, -2],
    ],
  },
  {
    name: "Ecuador – N Peru coast",
    signal: "wetter",
    season: "Dec–Feb",
    labelAt: [-86, -4],
    ring: [
      [-82, 2],
      [-78, 1],
      [-78, -8],
      [-81, -9],
      [-83, -3],
    ],
  },
  {
    name: "Equatorial East Africa",
    signal: "wetter",
    season: "Oct–Dec",
    labelAt: [42, 0],
    ring: [
      [34, 6],
      [46, 8],
      [50, 2],
      [42, -6],
      [36, -4],
    ],
  },
  {
    name: "SE South America",
    signal: "wetter",
    season: "Dec–Feb",
    labelAt: [-55, -30],
    ring: [
      [-62, -22],
      [-48, -22],
      [-50, -34],
      [-60, -38],
      [-64, -30],
    ],
  },
  {
    name: "Central Chile",
    signal: "wetter",
    season: "Jun–Aug",
    labelAt: [-78, -35],
    ring: [
      [-73, -30],
      [-70, -30],
      [-70, -39],
      [-74, -39],
    ],
  },
  {
    name: "Southern United States",
    signal: "wetter",
    season: "Dec–Feb",
    labelAt: [-92, 31],
    ring: [
      [-112, 34],
      [-80, 34],
      [-80, 27],
      [-98, 26],
      [-112, 30],
    ],
  },
];

/** d3-geo wants the exterior ring clockwise: else the polygon is the rest of the sphere. */
function polygon(ring) {
  const closed = [...ring, ring[0]];
  const geometry = { type: "Polygon", coordinates: [closed] };
  if (geoArea(geometry) > 2 * Math.PI) {
    geometry.coordinates = [closed.slice().reverse()];
  }
  return geometry;
}

const collection = {
  type: "FeatureCollection",
  features: REGIONS.map(({ ring, ...properties }) => ({
    type: "Feature",
    properties: {
      ...properties,
      label: `${properties.name} · ${properties.season}`,
    },
    geometry: polygon(ring),
  })),
};
writeFileSync(OUT, JSON.stringify(collection) + "\n");
console.log(`wrote ${collection.features.length} regions`);
