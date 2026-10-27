import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import {
  EASE,
  el,
  fetchData,
  svg,
  type Widget,
  type WidgetContext,
} from "./types";

interface Point {
  time: string;
  value: number;
}

export interface NinoData {
  weekly: {
    label: string;
    baseline: string;
    points: { time: string; nino34: number }[];
  };
  oni: {
    label: string;
    points: { season: string; year: number; oni: number }[];
  };
  pastEvents: {
    event: string;
    weekly: Point;
    oni: { season: string; value: number };
  }[];
  copernicus: {
    label: string;
    analysisUntil: string;
    points: { time: string; value: number | null }[];
  } | null;
}

const WIDTH = 560;
const HEIGHT = 260;
const M = { top: 18, right: 64, bottom: 26, left: 34 };

/** WMO/NOAA strength wording for Niño 3.4 anomalies, °C. */
const THRESHOLDS = [
  { value: 0.5, label: "El Niño" },
  { value: 1.5, label: "Strong" },
  { value: 2.0, label: "Very strong" },
];

const date = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});

export function signed(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 ? `−${text}` : `+${text}`;
}

/** The latest weekly value and how it compares to the strongest past week. */
export function ninoHeadline(data: NinoData) {
  const last = data.weekly.points.at(-1)!;
  const record = data.pastEvents.reduce((best, event) =>
    event.weekly.value > best.weekly.value ? event : best,
  );
  return {
    value: last.nino34,
    time: last.time,
    record,
    exceeds: last.nino34 > record.weekly.value,
  };
}

/**
 * Niño 3.4 through 2026: NOAA's weekly OISST index as the reference, the
 * Copernicus daily mean of the field on the sphere beside it (its forecast
 * days dashed), strength thresholds and the strongest past week. A cursor
 * follows the sphere's playhead.
 */
export const ninoChart: Widget = async (host, context: WidgetContext) => {
  const { doc } = context;
  const data = await fetchData<NinoData>(context, context.config.data);
  // First day shown: the part of the year the scene is about.
  const from =
    typeof context.config.from === "string"
      ? context.config.from
      : "2026-01-01";
  const weekly: Point[] = data.weekly.points
    .filter((p) => p.time >= from)
    .map((p) => ({ time: p.time, value: p.nino34 }));
  const daily = (data.copernicus?.points ?? []).filter(
    (p): p is Point => p.value !== null && p.time >= from,
  );
  const until = data.copernicus?.analysisUntil ?? "9999";
  const analysis = daily.filter((p) => p.time <= until);
  const forecast = daily.filter((p) => p.time >= until);
  const headline = ninoHeadline(data);

  const x = scaleUtc()
    .domain([date(from), date(daily.at(-1)?.time ?? weekly.at(-1)!.time)])
    .range([M.left, WIDTH - M.right]);
  // From the lowest whole degree reached (never above 0) to +4 °C.
  const low = Math.min(
    0,
    Math.floor(
      Math.min(...weekly.map((p) => p.value), ...daily.map((p) => p.value)),
    ),
  );
  const y = scaleLinear()
    .domain([low, 4])
    .range([HEIGHT - M.bottom, M.top]);
  const path = line<Point>()
    .x((p) => x(date(p.time)))
    .y((p) => y(p.value));

  host.classList.add("zs-nino");
  const root = svg(doc, "svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: "img",
    "aria-label": `Niño 3.4 sea surface temperature anomaly in 2026, rising to ${signed(headline.value)} °C in the week of ${DAY.format(date(headline.time))}.`,
  });

  // Strength bands: the area above each threshold, faint.
  const grid = svg(doc, "g", { class: "zs-nino-grid" });
  for (const t of THRESHOLDS) {
    grid.append(
      svg(doc, "line", {
        x1: M.left,
        x2: WIDTH - M.right,
        y1: y(t.value),
        y2: y(t.value),
      }),
    );
    const label = svg(doc, "text", {
      x: M.left + 4,
      y: y(t.value) - 4,
    });
    label.textContent = `${t.label} ≥ ${signed(t.value)}`;
    grid.append(label);
  }
  const zero = svg(doc, "line", {
    class: "zs-nino-zero",
    x1: M.left,
    x2: WIDTH - M.right,
    y1: y(0),
    y2: y(0),
  });
  grid.append(zero);
  for (let v = low; v <= 4; v++) {
    const tick = svg(doc, "text", {
      class: "zs-nino-y",
      x: M.left - 8,
      y: y(v) + 3,
    });
    tick.textContent = v === 0 ? "0" : signed(v, 0);
    grid.append(tick);
  }
  // Monthly ticks on a short span, every other month on a long one.
  const [start, finish] = x.domain();
  const months =
    (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    finish.getUTCMonth() -
    start.getUTCMonth();
  const every = months > 7 ? 2 : 1;
  for (let m = start.getUTCMonth(); ; m += every) {
    const at = new Date(Date.UTC(start.getUTCFullYear(), m, 1));
    if (at > finish) {
      break;
    }
    if (at < start) {
      continue;
    }
    const tick = svg(doc, "text", {
      class: "zs-nino-x",
      x: x(at),
      y: HEIGHT - 6,
    });
    tick.textContent = MONTH.format(at);
    grid.append(tick);
  }
  root.append(grid);

  // Strongest past week, as a short reference mark on the right edge.
  const record = headline.record;
  const recordMark = svg(doc, "g", { class: "zs-nino-record" });
  recordMark.append(
    svg(doc, "line", {
      x1: WIDTH - M.right - 70,
      x2: WIDTH - M.right,
      y1: y(record.weekly.value),
      y2: y(record.weekly.value),
    }),
  );
  const recordLabel = svg(doc, "text", {
    x: WIDTH - M.right - 70,
    y: y(record.weekly.value) + 13,
  });
  recordLabel.textContent = `${record.event} peak ${signed(record.weekly.value)}`;
  recordMark.append(recordLabel);
  root.append(recordMark);

  const series = svg(doc, "g", { class: "zs-nino-series" });
  const copernicus = svg(doc, "path", {
    class: "zs-nino-daily",
    d: path(analysis) ?? "",
  });
  const ahead = svg(doc, "path", {
    class: "zs-nino-forecast",
    d: path(forecast) ?? "",
  });
  const noaa = svg(doc, "path", {
    class: "zs-nino-weekly",
    d: path(weekly) ?? "",
  });
  series.append(copernicus, ahead, noaa);
  root.append(series);

  const last = weekly.at(-1)!;
  const end = svg(doc, "g", { class: "zs-nino-end" });
  end.append(
    svg(doc, "circle", {
      cx: x(date(last.time)),
      cy: y(last.value),
      r: 4,
    }),
  );
  const endLabel = svg(doc, "text", {
    x: x(date(last.time)) + 8,
    y: y(last.value) - 8,
  });
  endLabel.textContent = `${signed(last.value)} °C`;
  end.append(endLabel);
  root.append(end);

  const cursor = svg(doc, "line", {
    class: "zs-nino-cursor",
    y1: M.top,
    y2: HEIGHT - M.bottom,
  });
  root.append(cursor);

  const keyList = el(doc, "ul", "zs-nino-key");
  const item = (kind: string, label: string) => {
    const li = el(doc, "li", `is-${kind}`);
    li.append(el(doc, "span", "zs-nino-swatch"), label);
    keyList.append(li);
  };
  item("weekly", `${data.weekly.label}, weekly (base ${data.weekly.baseline})`);
  if (data.copernicus) {
    item("daily", "Copernicus Marine, daily, the field on the globe");
    item("forecast", "Copernicus Marine 10-day forecast");
  }
  host.append(root, keyList);

  const lines = [noaa, copernicus, ahead];
  const lengths = lines.map((p) => p.getTotalLength?.() ?? 0);
  const [x0, x1] = x.domain().map(Number);
  return {
    enter() {
      if (context.reduced) {
        return;
      }
      lines.forEach((p, i) => {
        p.animate([{ strokeDashoffset: lengths[i] }, { strokeDashoffset: 0 }], {
          duration: 2200,
          delay: 200 + i * 180,
          easing: EASE,
          fill: "backwards",
        });
        // Dash patterns restore once the draw-in ends.
        p.style.strokeDasharray = `${lengths[i]}`;
        setTimeout(() => (p.style.strokeDasharray = ""), 2400 + i * 180);
      });
      for (const node of [end, recordMark]) {
        node.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 600,
          delay: 2000,
          fill: "backwards",
        });
      }
    },
    time(ms) {
      const visible = ms >= x0 && ms <= x1;
      cursor.style.opacity = visible ? "1" : "0";
      if (visible) {
        const at = x(new Date(ms));
        cursor.setAttribute("x1", String(at));
        cursor.setAttribute("x2", String(at));
      }
    },
  };
};
