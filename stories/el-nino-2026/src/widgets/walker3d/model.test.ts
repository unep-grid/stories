import { describe, expect, it } from "vitest";
import {
  BOX,
  airY,
  depthFraction,
  depthMetres,
  loopPoint,
  LOOP_BOTTOM_KM,
  thermoDepth,
  walkerState,
  worldX,
} from "./model";

describe("walker model", () => {
  it("morphs between Normal and El Niño, clamped", () => {
    const normal = walkerState(0);
    const nino = walkerState(1);
    expect(nino.main.rise).toBeGreaterThan(normal.main.rise);
    expect(nino.main.strength).toBeLessThan(normal.main.strength);
    expect(normal.west.strength).toBe(0);
    expect(nino.warmEdge).toBeGreaterThan(normal.warmEdge);
    expect(walkerState(2)).toEqual(nino);
    expect(walkerState(-1)).toEqual(normal);
  });

  it("tilts the thermocline normally and flattens it in El Niño", () => {
    const tilt = (t: number) =>
      thermoDepth(walkerState(t), 120) - thermoDepth(walkerState(t), 280);
    expect(tilt(0)).toBeGreaterThan(0.3);
    expect(tilt(1)).toBeLessThan(0.1);
    expect(tilt(1)).toBeGreaterThanOrEqual(0);
  });

  it("maps the box ends and depth ticks", () => {
    expect(worldX(120)).toBeCloseTo(-BOX.halfWidth);
    expect(worldX(280)).toBeCloseTo(BOX.halfWidth);
    expect(airY(15)).toBeCloseTo(BOX.air);
    expect(depthFraction(300)).toBeCloseTo(1);
    expect(depthMetres(depthFraction(100))).toBeCloseTo(100);
  });

  it("runs the surface branch towards the rising air", () => {
    const { main, west } = walkerState(1);
    // Main cell rises in the west: surface flow goes west.
    const [x0, y0] = loopPoint(main, 0);
    const [x1] = loopPoint(main, 0.01);
    expect(y0).toBeCloseTo(airY(LOOP_BOTTOM_KM));
    expect(x1).toBeLessThan(x0);
    // Western El Niño cell rises east of where it sinks: surface flow east.
    const [w0] = loopPoint(west, 0);
    const [w1] = loopPoint(west, 0.01);
    expect(w1).toBeGreaterThan(w0);
  });

  it("closes the loop and keeps a constant speed", () => {
    const cell = walkerState(0).main;
    const a = loopPoint(cell, 0);
    const b = loopPoint(cell, 1);
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
    const steps = 200;
    const lengths: number[] = [];
    for (let i = 0; i < steps; i++) {
      const p = loopPoint(cell, i / steps);
      const q = loopPoint(cell, (i + 1) / steps);
      lengths.push(Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const mean = lengths.reduce((s, l) => s + l, 0) / steps;
    for (const l of lengths) {
      expect(Math.abs(l - mean) / mean).toBeLessThan(0.05);
    }
  });
});
