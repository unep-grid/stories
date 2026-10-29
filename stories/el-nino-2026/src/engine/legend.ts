import { scaleLinear, scaleSqrt } from "d3-scale";
import type { LegendScale } from "@fxi/projversor";
import type { LegendSwatch, ViewLegend } from "./documents";
import { swap } from "./rail";

/**
 * The legend band: a black strip under the stage, one column per key, the
 * key to whatever the stage shows: the map's field and overlays, or a
 * stage chart's scales. The band keeps its height whatever it holds, so the
 * sphere never moves for it; changed keys wipe out and back in, left to
 * right. A chapter with nothing to key leaves it empty.
 */

/** A color ramp; without `scale`, it follows the sphere's decoded month. */
export interface RampKey {
  type: "ramp";
  label: string;
  /** Show the playhead date under the label. */
  stamp?: boolean;
  scale?: Pick<LegendScale, "min" | "max" | "ramp">;
  /** Css gradient, left to right; with `scale`. */
  gradient?: string;
}

export interface SwatchKey {
  type: "swatches";
  label: string;
  swatches: LegendSwatch[];
}

export type BandKey = RampKey | SwatchKey;

/** The keys of a view's legend: its field (or swatches), then the rest. */
export function viewKeys(legend: ViewLegend): BandKey[] {
  const first: BandKey = legend.swatches?.length
    ? { type: "swatches", label: legend.label, swatches: legend.swatches }
    : { type: "ramp", label: legend.label, stamp: legend.stamp };
  return [
    first,
    ...(legend.keys ?? []).map(
      (key): BandKey => ({
        type: "swatches",
        label: key.label,
        swatches: key.swatches ?? [],
      }),
    ),
  ];
}

export interface LegendBand {
  element: HTMLElement;
  setKeys(keys: readonly BandKey[]): void;
  /** Range and colors of the playing month, for a live ramp. */
  setRange(scale: LegendScale, gradient: string | null): void;
  setDate(day: string): void;
}

/**
 * Tick values and positions (0–1) along a ramp. With `ends`, the domain's
 * ends are labelled too, and inner ticks too close to them dropped.
 */
export function rampTicks(
  scale: Pick<LegendScale, "min" | "max" | "ramp">,
  { count = 5, ends = false } = {},
): { value: number; at: number; label: string }[] {
  const { min, max } = scale;
  if (!(max > min)) {
    return [];
  }
  const s =
    scale.ramp === "sqrt" && min >= 0
      ? scaleSqrt().domain([min, max]).range([0, 1])
      : scaleLinear().domain([min, max]).range([0, 1]);
  const format = s.tickFormat(count);
  let values = s.ticks(count);
  if (ends) {
    const room = 0.06;
    values = [
      min,
      ...values.filter((v) => s(v) > room && s(v) < 1 - room),
      max,
    ];
  }
  return values.map((value) => ({
    value,
    at: s(value),
    label: format(value).replace("-", "−"),
  }));
}

interface Column {
  el: HTMLElement;
  key: BandKey;
  date?: HTMLElement;
  bar?: HTMLElement;
  ticks?: HTMLElement;
}

function swatchColumn(doc: Document, key: SwatchKey): Column {
  const el = doc.createElement("div");
  el.className = "zs-legend-key is-swatches";
  const label = doc.createElement("p");
  label.className = "zs-legend-label";
  label.textContent = key.label;
  const list = doc.createElement("ul");
  list.className = "zs-legend-swatches";
  for (const swatch of key.swatches) {
    const li = doc.createElement("li");
    const chip = doc.createElement("span");
    chip.className = `zs-legend-chip is-${swatch.shape ?? "area"}`;
    chip.style.color = swatch.color;
    li.append(chip, swatch.label);
    list.append(li);
  }
  el.append(label, list);
  return { el, key };
}

function rampColumn(doc: Document, key: RampKey): Column {
  const el = doc.createElement("div");
  el.className = "zs-legend-key is-ramp";
  const label = doc.createElement("p");
  label.className = "zs-legend-label";
  label.textContent = key.label;
  const date = doc.createElement("p");
  date.className = "zs-legend-date";
  date.hidden = !key.stamp;
  const bar = doc.createElement("div");
  bar.className = "zs-legend-bar";
  const ticks = doc.createElement("div");
  ticks.className = "zs-legend-ticks";
  el.append(label, date, bar, ticks);
  return { el, key, date, bar, ticks };
}

export function mountLegend(
  doc: Document,
  options: { reduced: boolean },
): LegendBand {
  const { reduced } = options;
  const band = doc.createElement("div");
  band.className = "zs-legend";
  band.setAttribute("role", "group");
  band.setAttribute("aria-label", "Key");
  const row = doc.createElement("div");
  row.className = "zs-legend-row";
  band.append(row);

  let shown: string | undefined;
  let ramp: Column | null = null;
  let live: { scale: LegendScale | null; gradient: string } = {
    scale: null,
    gradient: "",
  };

  const drawRamp = () => {
    if (!ramp?.ticks || !ramp.bar) {
      return;
    }
    const key = ramp.key as RampKey;
    const scale = key.scale ?? live.scale;
    ramp.bar.style.background = key.gradient ?? live.gradient;
    ramp.ticks.replaceChildren(
      ...(scale ? rampTicks(scale, { ends: !!key.scale }) : []).map((tick) => {
        const node = doc.createElement("span");
        node.style.left = `${tick.at * 100}%`;
        node.textContent = tick.label;
        return node;
      }),
    );
  };

  const draw = (keys: readonly BandKey[]) => {
    const columns = keys.map((key) =>
      key.type === "ramp" ? rampColumn(doc, key) : swatchColumn(doc, key),
    );
    ramp = columns.find((c) => c.bar) ?? null;
    row.replaceChildren(...columns.map((c) => c.el));
    band.dataset.count = String(columns.length);
    drawRamp();
  };

  return {
    element: band,
    setKeys(keys) {
      const next = JSON.stringify(keys);
      if (next === shown) {
        return;
      }
      const first = shown === undefined;
      shown = next;
      // A live ramp waits for the new layer's first month.
      live = { scale: null, gradient: "" };
      swap(band, first ? [] : [row], () => draw(keys), {
        reduced,
        axis: "x",
      });
    },
    setRange(scale, gradient) {
      live = { scale, gradient: gradient ?? live.gradient };
      if (ramp && !(ramp.key as RampKey).scale) {
        drawRamp();
      }
    },
    setDate(day) {
      if (ramp?.date && !ramp.date.hidden) {
        ramp.date.textContent = day;
      }
    },
  };
}
