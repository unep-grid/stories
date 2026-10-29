/**
 * The Walker circulation schematic, as numbers: its two states (rising
 * and sinking longitudes, warm water extent, thermocline tilt), and the
 * scene box they are drawn in. Not drawn from data. Pure, so the
 * shaders' geometry can be tested here.
 */

export const LON0 = 120;
export const LON1 = 280;
export const LAT = 5;

/** Scene box, world units: x along the equator, y up, z south. */
export const BOX = {
  halfWidth: 1.6,
  halfDepth: 0.36,
  /** 15 km of air above the sea line. */
  air: 1,
  /** 300 m of ocean below it. */
  ocean: 0.95,
};

export const AIR_KM = 15;
export const OCEAN_M = 300;
/** Air loops run between these heights, km. */
export const LOOP_BOTTOM_KM = 1.2;
export const LOOP_TOP_KM = 12.5;

/** One overturning cell: where air rises and sinks, °E, and how strongly. */
export interface Cell {
  rise: number;
  sink: number;
  /** 0–1: particle speed and opacity. */
  strength: number;
}

export interface WalkerState {
  /** The Pacific cell: rising in the west, sinking in the east. */
  main: Cell;
  /** El Niño only: rising in the central Pacific, sinking to the west. */
  west: Cell;
  /** Eastern edge of the warm surface water, °E. */
  warmEdge: number;
  /** Thermocline depth at the western and eastern ends, 0–1 of the ocean. */
  thermoWest: number;
  thermoEast: number;
}

export const NORMAL: WalkerState = {
  main: { rise: 135, sink: 265, strength: 1 },
  west: { rise: 175, sink: 128, strength: 0 },
  warmEdge: 185,
  thermoWest: 0.62,
  thermoEast: 0.18,
};

export const EL_NINO: WalkerState = {
  main: { rise: 192, sink: 268, strength: 0.5 },
  west: { rise: 186, sink: 128, strength: 0.6 },
  warmEdge: 262,
  thermoWest: 0.46,
  thermoEast: 0.4,
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixCell = (a: Cell, b: Cell, t: number): Cell => ({
  rise: mix(a.rise, b.rise, t),
  sink: mix(a.sink, b.sink, t),
  strength: mix(a.strength, b.strength, t),
});

/** The schematic between Normal (0) and El Niño (1). */
export function walkerState(t: number): WalkerState {
  const f = Math.min(1, Math.max(0, t));
  return {
    main: mixCell(NORMAL.main, EL_NINO.main, f),
    west: mixCell(NORMAL.west, EL_NINO.west, f),
    warmEdge: mix(NORMAL.warmEdge, EL_NINO.warmEdge, f),
    thermoWest: mix(NORMAL.thermoWest, EL_NINO.thermoWest, f),
    thermoEast: mix(NORMAL.thermoEast, EL_NINO.thermoEast, f),
  };
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Thermocline depth, 0–1 of the ocean: deep and flat in the west. */
export function thermoDepth(state: WalkerState, lon: number): number {
  return mix(state.thermoWest, state.thermoEast, smoothstep(165, 225, lon));
}

/** World x of a longitude, °E (east of 180° counted on, to 280). */
export const worldX = (lon: number) =>
  ((lon - LON0) / (LON1 - LON0) - 0.5) * 2 * BOX.halfWidth;

/** World y of a height, km. */
export const airY = (km: number) => (km / AIR_KM) * BOX.air;

/**
 * World y of an ocean depth fraction (0–1). The first metres are stretched
 * so the warm layer reads, as on the usual ENSO schematics.
 */
export const oceanY = (f: number) => -f * BOX.ocean;

/** Depth fraction of a depth in metres. */
export const depthFraction = (m: number) => (m / OCEAN_M) ** 0.7;

/** Depth in metres of a depth fraction. */
export const depthMetres = (f: number) => OCEAN_M * f ** (1 / 0.7);

/**
 * A point of a cell's loop, world x and y: a rounded rectangle walked at
 * constant speed. `phase` runs with the flow: along the surface towards the
 * rising branch, up, aloft towards the sinking one, down. `inset` (0–1)
 * draws a smaller loop inside, so particles fill a band. Mirrors `loop()`
 * in the particle shader.
 */
export function loopPoint(
  cell: Cell,
  phase: number,
  inset = 0,
): [number, number] {
  const xa = worldX(cell.rise);
  const xb = worldX(cell.sink);
  const y0 = airY(LOOP_BOTTOM_KM);
  const y1 = airY(LOOP_TOP_KM);
  const shrink = 1 - inset * 0.55;
  const hw = Math.max((Math.abs(xb - xa) / 2) * shrink, 1e-4);
  const hh = ((y1 - y0) / 2) * shrink;
  const cx = (xa + xb) / 2;
  const cy = (y0 + y1) / 2;
  // Towards the rising branch is +u.
  const dir = xa >= xb ? 1 : -1;
  const r = Math.min(hw, hh) * 0.85;
  const lh = 2 * (hw - r);
  const lv = 2 * (hh - r);
  const q = (Math.PI / 2) * r;
  const segments = [lh / 2, q, lv, q, lh, q, lv, q, lh / 2];
  const total = segments.reduce((a, b) => a + b, 0);
  let s = (((phase % 1) + 1) % 1) * total;
  let u = 0;
  let v = 0;
  const corner = (cu: number, cv: number, a0: number, f: number) => {
    const a = a0 + f * (Math.PI / 2);
    u = cu + r * Math.cos(a);
    v = cv + r * Math.sin(a);
  };
  const ex = hw - r;
  const ey = hh - r;
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i];
    if (s > len && i < segments.length - 1) {
      s -= len;
      continue;
    }
    const f = len > 0 ? s / len : 0;
    switch (i) {
      case 0:
        [u, v] = [f * ex, -hh];
        break;
      case 1:
        corner(ex, -ey, -Math.PI / 2, f);
        break;
      case 2:
        [u, v] = [hw, -ey + f * lv];
        break;
      case 3:
        corner(ex, ey, 0, f);
        break;
      case 4:
        [u, v] = [ex - f * lh, hh];
        break;
      case 5:
        corner(-ex, ey, Math.PI / 2, f);
        break;
      case 6:
        [u, v] = [-hw, ey - f * lv];
        break;
      case 7:
        corner(-ex, -ey, Math.PI, f);
        break;
      default:
        [u, v] = [-ex + f * ex, -hh];
    }
    break;
  }
  return [cx + dir * u, cy + v];
}

export const lonLabel = (lon: number) =>
  lon === 180 ? "180°" : lon < 180 ? `${lon}°E` : `${360 - lon}°W`;
