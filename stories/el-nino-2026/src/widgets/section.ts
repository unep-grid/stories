import { resolveColorRamp } from "@fxi/zartigl/engine";
import { scaleLinear } from "d3-scale";
import type { BandKey } from "../engine/legend";
import { el, fetchData, svg, type Widget } from "./types";

interface Week {
  end: string;
  days: number;
  temperature: (number | null)[][];
  isotherm20: (number | null)[];
}

export interface SectionData {
  source: { dataset: string; method: string };
  unit: string;
  longitude: number[];
  depth: number[];
  now: Week;
  before: Week;
}

const WIDTH = 720;
const HEIGHT = 380;
const M = { top: 34, right: 18, bottom: 30, left: 48 };
const T_MIN = 12;
const T_MAX = 31;
/** Resampled depth step, m: the canvas has one row per step. */
const DEPTH_STEP = 4;
const PALETTE = "thermal";
const MORPH_MS = 3200;

/** 256 rgb triplets of a zartigl palette, low to high. */
export function paletteLut(palette: string): Uint8ClampedArray {
  const stops = Object.entries(resolveColorRamp(palette))
    .map(([stop, color]) => [Number(stop), hex(color)] as const)
    .sort((a, b) => a[0] - b[0]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1][0] < t) {
      k++;
    }
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
    }
  }
  return lut;
}

function hex(color: string): [number, number, number] {
  const h = color.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/**
 * Model levels bunch up near the surface: resample each column to an even
 * depth axis, linearly between levels, so the figure keeps true depths.
 */
export function evenDepth(
  grid: (number | null)[][],
  depth: number[],
  step = DEPTH_STEP,
): { grid: (number | null)[][]; depth: number[] } {
  const bottom = depth.at(-1)!;
  const out: number[] = [];
  for (let z = 0; z <= bottom; z += step) {
    out.push(z);
  }
  const rows = out.map((z) => {
    let k = 0;
    while (k < depth.length - 2 && depth[k + 1] < z) {
      k++;
    }
    const f = Math.min(
      1,
      Math.max(0, (z - depth[k]) / (depth[k + 1] - depth[k])),
    );
    return grid[k].map((a, c) => {
      const b = grid[k + 1][c];
      if (a === null || b === null) {
        return f < 0.5 ? a : b;
      }
      return a + (b - a) * f;
    });
  });
  return { grid: rows, depth: out };
}

/** One canvas pixel per cell, scaled up smoothly by css. */
function paint(
  doc: Document,
  grid: (number | null)[][],
  lut: Uint8ClampedArray,
): HTMLCanvasElement {
  const rows = grid.length;
  const cols = grid[0].length;
  const canvas = doc.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const image = ctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r][c];
      const o = (r * cols + c) * 4;
      if (v === null) {
        // Land and sea floor: the page background, a touch lifted.
        image.data.set([14, 16, 22, 255], o);
        continue;
      }
      const i = Math.round(
        Math.min(1, Math.max(0, (v - T_MIN) / (T_MAX - T_MIN))) * 255,
      );
      image.data.set([lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2], 255], o);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const lonLabel = (lon: number) =>
  lon === 180 ? "180°" : lon < 180 ? `${lon}°E` : `${360 - lon}°W`;

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const weekLabel = (week: Week) =>
  `week to ${DATE.format(new Date(`${week.end}T00:00:00Z`))}`;

/**
 * Equatorial Pacific, surface to ~400 m: the temperature of a year ago
 * crossfades into this week's while the 20 °C isotherm (the thermocline)
 * flattens from its usual east-west tilt.
 */
export const section: Widget = async (host, context) => {
  const { doc } = context;
  const data = await fetchData<SectionData>(context, context.config.data);
  const lut = paletteLut(PALETTE);
  const lon = data.longitude;
  const depth = data.depth;
  const bottom = depth.at(-1)!;
  const x = scaleLinear()
    .domain([lon[0], lon.at(-1)!])
    .range([M.left, WIDTH - M.right]);

  host.classList.add("zs-section");
  const figure = el(doc, "figure", "zs-section-figure");
  const plot = el(doc, "div", "zs-section-plot");
  const before = paint(
    doc,
    evenDepth(data.before.temperature, depth).grid,
    lut,
  );
  const now = paint(doc, evenDepth(data.now.temperature, depth).grid, lut);
  before.className = "zs-section-field is-before";
  now.className = "zs-section-field is-now";
  // Canvas rows are even depth steps: the field spans the plot area.
  for (const canvas of [before, now]) {
    canvas.style.left = `${(M.left / WIDTH) * 100}%`;
    canvas.style.top = `${(M.top / HEIGHT) * 100}%`;
    canvas.style.width = `${((WIDTH - M.left - M.right) / WIDTH) * 100}%`;
    canvas.style.height = `${((HEIGHT - M.top - M.bottom) / HEIGHT) * 100}%`;
  }

  const overlay = svg(doc, "svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: "img",
    "aria-label": `Equatorial Pacific temperature from the surface to ${Math.round(bottom)} m. The 20 °C isotherm, ${weekLabel(data.before)} against ${weekLabel(data.now)}: the warm layer has deepened in the east.`,
  });
  const y = scaleLinear()
    .domain([0, bottom])
    .range([M.top, HEIGHT - M.bottom]);
  const axes = svg(doc, "g", { class: "zs-section-axes" });
  for (const l of [120, 150, 180, 210, 240, 270]) {
    const t = svg(doc, "text", { x: x(l), y: HEIGHT - 10 });
    t.textContent = lonLabel(l);
    axes.append(t);
  }
  for (const d of [0, 100, 200, 300]) {
    const t = svg(doc, "text", {
      class: "is-depth",
      x: M.left - 8,
      y: y(d) + 4,
    });
    t.textContent = d === 0 ? "0 m" : `${d}`;
    axes.append(t);
  }
  overlay.append(axes);

  const points = (values: (number | null)[]) =>
    values.map((z, i) => (z === null ? null : [x(lon[i]), y(z)]));
  const from = points(data.before.isotherm20);
  const to = points(data.now.isotherm20);
  const d = (t: number) => {
    let out = "";
    let pen = false;
    from.forEach((a, i) => {
      const b = to[i];
      if (!a || !b) {
        pen = false;
        return;
      }
      const px = a[0];
      const py = a[1] + (b[1] - a[1]) * t;
      out += `${pen ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
      pen = true;
    });
    return out;
  };
  const ghost = svg(doc, "path", {
    class: "zs-section-iso is-before",
    d: d(0),
  });
  const iso = svg(doc, "path", { class: "zs-section-iso is-now", d: d(1) });
  overlay.append(ghost, iso);

  const label = (cls: string, at: [number, number], textValue: string) => {
    const t = svg(doc, "text", { class: cls, x: at[0], y: at[1] });
    t.textContent = textValue;
    overlay.append(t);
    return t;
  };
  label("zs-section-note", [x(130), M.top - 12], "Western Pacific warm pool");
  label(
    "zs-section-note is-end",
    [x(lon.at(-1)!), M.top - 12],
    "Eastern Pacific",
  );
  const isoLabel = label(
    "zs-section-iso-label",
    [x(200), 0],
    "20 °C · thermocline",
  );
  const placeLabel = (t: number) => {
    const i = lon.findIndex((l) => l >= 200);
    const a = from[i];
    const b = to[i];
    if (a && b) {
      isoLabel.setAttribute("y", String(a[1] + (b[1] - a[1]) * t - 8));
    }
  };
  placeLabel(1);

  plot.append(before, now, overlay);
  const stamp = el(doc, "p", "zs-section-stamp");
  const caption = el(doc, "figcaption", "zs-section-caption");
  caption.textContent = `Temperature along the equator (2°S–2°N), ${weekLabel(data.before)} → ${weekLabel(data.now)}. Copernicus Marine global analysis.`;
  figure.append(stamp, plot, caption);
  host.append(figure);

  // The scales go to the legend band.
  const gradient = `linear-gradient(to right, ${Object.entries(
    resolveColorRamp(PALETTE),
  )
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([s, c]) => `${c} ${Number(s) * 100}%`)
    .join(", ")})`;
  const sentence = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);
  const legend: BandKey[] = [
    {
      type: "ramp",
      label: "Temperature (°C)",
      scale: { min: T_MIN, max: T_MAX, ramp: "linear" },
      gradient,
    },
    {
      type: "swatches",
      label: "20 °C thermocline",
      swatches: [
        { shape: "line", color: "#fff", label: sentence(weekLabel(data.now)) },
        {
          shape: "dash",
          color: "rgba(255, 255, 255, 0.7)",
          label: sentence(weekLabel(data.before)),
        },
      ],
    },
  ];

  let frame = 0;
  const show = (t: number) => {
    now.style.opacity = String(t);
    iso.setAttribute("d", d(t));
    placeLabel(t);
    stamp.textContent = t < 0.5 ? weekLabel(data.before) : weekLabel(data.now);
    stamp.classList.toggle("is-now", t >= 0.5);
  };
  show(1);

  return {
    legend,
    enter() {
      cancelAnimationFrame(frame);
      if (context.reduced) {
        show(1);
        return;
      }
      show(0);
      const start = performance.now() + 700;
      const tick = (at: number) => {
        const p = Math.min(1, Math.max(0, (at - start) / MORPH_MS));
        // Ease out: the thermocline settles into place.
        show(1 - (1 - p) ** 3);
        if (p < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
    },
    leave() {
      cancelAnimationFrame(frame);
    },
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
};
