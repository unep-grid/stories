import "./walker3d.css";
import type { BandKey } from "../../engine/legend";
import type { Widget } from "../types";
import { createWalker3D } from "./walker3d";

/**
 * The 3D Walker circulation as a story widget: while its scene is on, it
 * alternates by itself, Normal then El Niño, each held a few seconds with
 * an eased morph between. The two words above the figure say which state
 * shows; they are not controls.
 */

const HOLD_MS = 5000;
const MORPH_MS = 2000;

export const walker3d: Widget = (host, context) => {
  const { doc, reduced } = context;
  const win = doc.defaultView!;
  host.classList.add("zs-walker3d");
  const figure = doc.createElement("figure");
  figure.className = "zs-walker3d-figure";

  // Which state shows: the underline follows the morph.
  const state = doc.createElement("p");
  state.className = "zs-walker3d-state";
  state.setAttribute("aria-hidden", "true");
  const words = (["Normal", "El Niño"] as const).map((text) => {
    const word = doc.createElement("span");
    word.textContent = text;
    state.append(word);
    return word;
  });

  const plot = doc.createElement("div");
  plot.className = "zs-walker3d-plot";
  const caption = doc.createElement("figcaption");
  caption.className = "zs-walker3d-caption";
  caption.textContent =
    "Schematic along the equator, not to scale, after NOAA Climate.gov's ENSO diagrams. Drag to turn.";
  figure.append(state, plot, caption);
  host.append(figure);

  const walker = createWalker3D(plot, {
    reduced,
    density:
      typeof context.config.density === "number" ? context.config.density : 1,
    onMorph(t) {
      words[0].classList.toggle("is-current", t < 0.5);
      words[1].classList.toggle("is-current", t >= 0.5);
    },
  });
  walker.setMorph(0, 0);
  context.signal.addEventListener("abort", () => walker.destroy());

  // Normal, El Niño, Normal…: each held, then morphed to the other. After
  // the first hold, each wait covers the morph before it too.
  let timer = 0;
  const cycle = (target: number, wait: number) => {
    timer = win.setTimeout(() => {
      walker.setMorph(target, MORPH_MS);
      cycle(1 - target, MORPH_MS + HOLD_MS);
    }, wait);
  };

  const legend: BandKey[] = [
    {
      type: "swatches",
      label: "Schematic",
      swatches: [
        { shape: "dot", color: "#ff6a3d", label: "Warm air and water" },
        { shape: "dot", color: "#2fb8e6", label: "Cool air and water" },
        { shape: "line", color: "#66f2ff", label: "Thermocline" },
      ],
    },
  ];

  return {
    legend,
    enter() {
      win.clearTimeout(timer);
      walker.setMorph(0, 0);
      walker.start();
      cycle(1, HOLD_MS);
    },
    leave() {
      win.clearTimeout(timer);
      walker.stop();
    },
    destroy() {
      win.clearTimeout(timer);
      walker.destroy();
    },
  };
};
