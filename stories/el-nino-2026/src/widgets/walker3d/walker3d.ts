import { createLabels } from "./labels";
import { walkerState } from "./model";
import { createScene, type Clocks, type Scene, type View } from "./scene";

/**
 * The Walker circulation and the thermocline as a schematic 3D box along
 * the equatorial Pacific, 120°E–80°W, 5°S–5°N, 15 km of air over 300 m of
 * ocean, in glowing particles. Framework free: give it a host element, it
 * fills it. `setMorph` moves between Normal (0) and El Niño (1).
 */

export interface Walker3DOptions {
  /** prefers-reduced-motion: no flow, no orbit, instant morphs. */
  reduced?: boolean;
  /** Particle count multiplier, 1 by default. */
  density?: number;
  /** Called as the morph changes, 0–1. */
  onMorph?: (t: number) => void;
}

export interface Walker3D {
  readonly element: HTMLElement;
  readonly morph: number;
  /** Move to Normal (0) or El Niño (1), in `duration` ms after `delay`. */
  setMorph(target: number, duration?: number, delay?: number): void;
  /** Run the animation loop (while on screen). */
  start(): void;
  stop(): void;
  destroy(): void;
}

/** Loop turns per second at full strength. */
const TURN = 0.05;
/** Box widths per second for the ocean flow at full strength. */
const DRIFT = 0.03;
const VIEW: View = { yaw: 0.32, pitch: 0.2 };
const ORBIT = 0.1;
const ORBIT_PERIOD = 40;

export function createWalker3D(
  host: HTMLElement,
  options: Walker3DOptions = {},
): Walker3D {
  const { reduced = false, density = 1, onMorph } = options;
  const doc = host.ownerDocument;
  const win = doc.defaultView!;
  const element = doc.createElement("div");
  element.className = "w3d";
  const canvas = doc.createElement("canvas");
  canvas.className = "w3d-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Schematic 3D view of the Walker circulation and the thermocline along the equatorial Pacific. Normally air rises over the warm pool near Indonesia, flows east aloft, sinks over the eastern Pacific and returns west at the surface as the trade winds, piling warm water in the west where the thermocline is deep; it is shallow in the east. During El Niño the rising air moves to the central Pacific, the circulation weakens, warm water spreads east and the thermocline flattens.",
  );
  const labels = createLabels(doc);
  element.append(canvas, labels.element);
  host.append(element);

  let morph = 0;
  const clocks: Clocks = { main: 0.3, west: 0.3, ocean: 10 };
  const view: View = { ...VIEW };
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  let userView = false;
  let orbitTime = 0;

  // GL, rebuilt when the context comes back.
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    premultipliedAlpha: true,
    alpha: true,
  });
  let scene: Scene | null = null;
  if (!gl) {
    element.classList.add("is-unsupported");
    const note = doc.createElement("p");
    note.className = "w3d-unsupported";
    note.textContent = "This figure needs WebGL2.";
    element.append(note);
  } else {
    scene = createScene(gl, density);
  }

  let width = 0;
  let height = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    scene?.resize(width, height, dpr);
    draw();
  };

  const draw = () => {
    if (!scene || !gl || gl.isContextLost() || !width) {
      return;
    }
    const state = walkerState(morph);
    const mvp = scene.render(state, clocks, view);
    labels.update(mvp, state, width, height);
  };

  // Morph tween: ease in and out, the circulation shifts, then settles.
  let tween: ((at: number) => boolean) | null = null;
  const setMorphNow = (t: number) => {
    morph = t;
    onMorph?.(t);
  };
  const setMorph = (target: number, duration = 1600, delay = 0) => {
    if (reduced || duration <= 0) {
      tween = null;
      setMorphNow(target);
      draw();
      return;
    }
    const from = morph;
    const start = performance.now() + delay;
    tween = (at) => {
      const p = Math.min(1, Math.max(0, (at - start) / duration));
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      setMorphNow(from + (target - from) * e);
      return p < 1;
    };
  };

  // The loop: clocks advance with each cell's strength, time-based.
  let frame = 0;
  let last = 0;
  let running = false;
  let visible = true;
  const tick = (at: number) => {
    frame = 0;
    if (last) {
      const dt = Math.min(0.1, (at - last) / 1000);
      const state = walkerState(morph);
      clocks.main = (clocks.main + dt * TURN * state.main.strength) % 1;
      clocks.west = (clocks.west + dt * TURN * state.west.strength) % 1;
      // Wind-driven: the upper ocean slows with the trades.
      clocks.ocean += dt * DRIFT * (0.3 + 0.7 * state.main.strength);
      if (!drag && !userView) {
        orbitTime += dt;
        view.yaw =
          VIEW.yaw + ORBIT * Math.sin((orbitTime / ORBIT_PERIOD) * 2 * Math.PI);
      }
    }
    last = at;
    if (tween && !tween(at)) {
      tween = null;
    }
    draw();
    schedule();
  };
  const schedule = () => {
    if (running && visible && !reduced && !frame) {
      frame = win.requestAnimationFrame(tick);
    }
  };
  const halt = () => {
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    last = 0;
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      schedule();
    } else {
      halt();
    }
  });
  intersection.observe(element);

  // Drag to turn the box; vertical drags still scroll the page on touch.
  canvas.addEventListener("pointerdown", (event) => {
    drag = {
      x: event.clientX,
      y: event.clientY,
      yaw: view.yaw,
      pitch: view.pitch,
    };
    canvas.setPointerCapture(event.pointerId);
    element.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    userView = true;
    const k = 3 / Math.max(width, 1);
    view.yaw = Math.max(
      -1.1,
      Math.min(1.1, drag.yaw - (event.clientX - drag.x) * k),
    );
    view.pitch = Math.max(
      -0.15,
      Math.min(0.9, drag.pitch + (event.clientY - drag.y) * k),
    );
    if (reduced) {
      draw();
    }
  });
  const endDrag = () => {
    drag = null;
    element.classList.remove("is-dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  // Double click: back to the default view.
  canvas.addEventListener("dblclick", () => {
    userView = false;
    orbitTime = 0;
    Object.assign(view, VIEW);
    draw();
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    halt();
    scene = null;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (gl) {
      scene = createScene(gl, density);
      resize();
      schedule();
    }
  });

  return {
    element,
    get morph() {
      return morph;
    },
    setMorph,
    start() {
      running = true;
      schedule();
      draw();
    },
    stop() {
      running = false;
      halt();
    },
    destroy() {
      running = false;
      halt();
      resizeObserver.disconnect();
      intersection.disconnect();
      scene?.dispose();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      element.remove();
    },
  };
}
