import { project, type Mat4 } from "./gl";
import {
  BOX,
  LON0,
  LON1,
  airY,
  depthFraction,
  lonLabel,
  oceanY,
  thermoDepth,
  worldX,
  type WalkerState,
} from "./model";
import { KM_TICKS, LAT_TICKS, LON_TICKS, M_TICKS } from "./scene";

/**
 * Text over the canvas, at projected 3D anchors: crisp at any pixel ratio
 * and styled by CSS. `align` says which side of the anchor the text sits.
 */
type Align = "left" | "right" | "below" | "above";

const SHIFT: Record<Align, string> = {
  left: "translate(calc(-100% - 6px), -50%)",
  right: "translate(6px, -50%)",
  below: "translate(-50%, 4px)",
  above: "translate(-50%, calc(-100% - 2px))",
};

interface Label {
  node: HTMLElement;
  shift: string;
  at: (state: WalkerState) => readonly number[];
  opacity?: (state: WalkerState) => number;
}

export interface Labels {
  element: HTMLElement;
  update(mvp: Mat4, state: WalkerState, width: number, height: number): void;
}

export function createLabels(doc: Document): Labels {
  const element = doc.createElement("div");
  element.className = "w3d-labels";
  element.setAttribute("aria-hidden", "true");
  const labels: Label[] = [];
  const add = (
    text: string,
    cls: string,
    align: Align,
    at: Label["at"],
    opacity?: Label["opacity"],
  ) => {
    const node = doc.createElement("span");
    node.className = `w3d-label ${cls} is-${align}`;
    node.textContent = text;
    element.append(node);
    labels.push({ node, at, opacity, shift: SHIFT[align] });
  };

  const { halfWidth: w, halfDepth: d, ocean } = BOX;
  const t = 0.05;

  for (const lon of LON_TICKS) {
    add(lonLabel(lon), "is-axis", "below", () => [
      worldX(lon),
      -ocean - t,
      d + t,
    ]);
  }
  for (const km of KM_TICKS) {
    add(`${km} km`, "is-axis", "left", () => [-w - t, airY(km), d]);
  }
  add("0 m", "is-axis", "left", () => [-w - t, 0, d]);
  for (const m of M_TICKS) {
    add(`−${m} m`, "is-axis", "left", () => [
      -w - t,
      oceanY(depthFraction(m)),
      d,
    ]);
  }
  for (const lat of LAT_TICKS) {
    const text = lat === 0 ? "0°" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`;
    add(text, "is-axis", "right", () => [w + t, -ocean, (-lat / 5) * d]);
  }

  const top = airY(13.4);
  add("Rising air", "is-feature", "above", (s) => [
    worldX(s.main.rise),
    top,
    0,
  ]);
  add("Sinking air", "is-feature", "above", (s) => [
    worldX(s.main.sink),
    top,
    0,
  ]);
  add(
    "Sinking air",
    "is-feature",
    "above",
    (s) => [worldX(s.west.sink), top, 0],
    (s) => Math.min(1, s.west.strength * 2),
  );
  add(
    "Trade winds",
    "is-feature",
    "above",
    (s) => [worldX((s.main.rise + s.main.sink) / 2), airY(1.6), d],
    (s) => 0.35 + 0.65 * s.main.strength,
  );
  add("Warm water", "is-feature", "right", () => [
    worldX(LON0 + 3),
    oceanY(0.12),
    d,
  ]);
  add("Thermocline", "is-feature", "left", (s) => [
    worldX(LON1 - 2),
    oceanY(thermoDepth(s, LON1)) - 0.05,
    d,
  ]);
  add("Maritime Continent", "is-place", "right", () => [
    worldX(LON0 + 1),
    0.04,
    d,
  ]);
  add("South America", "is-place", "left", () => [worldX(LON1 - 1), 0.04, d]);

  return {
    element,
    update(mvp, state, width, height) {
      for (const label of labels) {
        const p = project(mvp, label.at(state), width, height);
        if (!p) {
          label.node.hidden = true;
          continue;
        }
        label.node.hidden = false;
        label.node.style.transform = `translate(${p[0].toFixed(
          1,
        )}px, ${p[1].toFixed(1)}px) ${label.shift}`;
        if (label.opacity) {
          label.node.style.opacity = label.opacity(state).toFixed(2);
        }
      }
    },
  };
}
