import {
  Projversor,
  ProjversorStoryView,
  legendLabels,
  monthLegend,
  parseProjversorView,
  preloadLayer,
  projversorState,
  rampGradient,
  type GeoJSONStyle,
  type Inset,
} from "@fxi/projversor";
import {
  LoadingIndicator,
  StoryScroller,
  storyExternalLinkAttributes,
  type StoryWidgetBlock,
} from "@fxi/zartigl/story";
import { WIDGETS, type WidgetInstance } from "../widgets";
import { mountProgress } from "./progress";
import {
  loadDocuments,
  selectFeatures,
  sceneCopy,
  sceneWidgets,
  text,
  viewOf,
  type Documents,
  type Scene,
  type StoryView,
  type ViewLegend,
  type ViewOverlay,
} from "./documents";

/** Below this width, the text runs under the sphere instead of beside it. */
const WIDE_MIN = 900;
/** Activation line, from the top of the viewport. */
const LINE = 0.6;
const EASE = "cubic-bezier(.16,1,.3,1)";
const EARLIEST = Date.UTC(2000, 0, 1);

/**
 * Free zone of the sphere for a scene layout, css px: beside the text on
 * wide screens, above it on narrow ones.
 */
export function sceneInset(
  layout: string,
  width: number,
  height: number,
): Inset {
  if (width < WIDE_MIN) {
    return { top: 0, right: 0, bottom: Math.round(height * 0.34), left: 0 };
  }
  const side = Math.round(Math.min(width * 0.42, 560));
  if (layout === "left") {
    return { top: 0, right: 0, bottom: 0, left: side };
  }
  if (layout === "right") {
    return { top: 0, right: side, bottom: 0, left: 0 };
  }
  return { top: Math.round(height * 0.4), right: 0, bottom: 0, left: 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A headline with one masked span per word, for the reveal. */
function headline(doc: Document, tag: "h1" | "h2", value: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = "zs-headline";
  node.setAttribute("aria-label", value);
  value
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word, i) => {
      if (i > 0) {
        node.append(" ");
      }
      const mask = doc.createElement("span");
      mask.className = "zs-w";
      mask.setAttribute("aria-hidden", "true");
      const inner = doc.createElement("span");
      inner.textContent = word;
      mask.append(inner);
      node.append(mask);
    });
  return node;
}

function renderStep(
  doc: Document,
  docs: Documents,
  scene: Scene,
  index: number,
  key: Key | null,
): HTMLElement {
  const step = doc.createElement("article");
  step.className = "zs-step";
  step.dataset.layout = scene.layout;
  step.dataset.scene = scene.id;
  const body = doc.createElement("div");
  body.className = "zs-text";
  const copy = sceneCopy(scene);

  if (index > 0) {
    const kicker = doc.createElement("p");
    kicker.className = "zs-kicker zs-label";
    const number = doc.createElement("span");
    number.className = "zs-index";
    number.textContent = pad(index);
    const rule = doc.createElement("span");
    rule.className = "zs-rule";
    kicker.append(number, rule);
    if (copy?.label) {
      kicker.append(text(copy.label));
    }
    body.append(kicker);
  } else if (copy?.label) {
    const eyebrow = doc.createElement("p");
    eyebrow.className = "zs-eyebrow zs-label";
    eyebrow.textContent = text(copy.label);
    body.append(eyebrow);
  }
  body.append(
    headline(doc, index === 0 ? "h1" : "h2", text(copy?.heading ?? scene.name)),
  );
  if (copy?.text) {
    const lede = doc.createElement("p");
    lede.className = "zs-lede";
    lede.textContent = text(copy.text);
    body.append(lede);
  }
  if (key) {
    body.append(key.el);
  }
  for (const block of sceneWidgets(scene)) {
    if (block.slot === "copy") {
      body.append(widgetHost(doc, block));
    }
  }
  const references = copy?.references ?? [];
  if (references.length) {
    const source = doc.createElement("p");
    source.className = "zs-source";
    references.forEach((reference, i) => {
      if (i > 0) {
        source.append(" · ");
      }
      const a = doc.createElement("a");
      Object.assign(
        a,
        storyExternalLinkAttributes(reference, text(reference.label)),
      );
      source.append(a);
    });
    body.append(source);
  }
  const theme = docs.story.themes[scene.theme];
  if (theme) {
    step.style.setProperty("--zs-accent", theme.accent);
  }
  step.append(body);
  return step;
}

function widgetHost(doc: Document, block: StoryWidgetBlock): HTMLElement {
  const host = doc.createElement("div");
  host.className = "zs-widget";
  host.dataset.widget = block.widget;
  host.dataset.block = block.id;
  return host;
}

/** Words rise through their masks, then the rest fades in. */
function reveal(step: HTMLElement): void {
  step.querySelectorAll<HTMLElement>(".zs-w > span").forEach((node, i) => {
    node.animate(
      [{ transform: "translateY(105%)" }, { transform: "translateY(0)" }],
      { duration: 900, delay: 120 + i * 55, easing: EASE, fill: "backwards" },
    );
  });
  const parts: [string, number][] = [
    [".zs-kicker", 0],
    [".zs-eyebrow", 0],
    [".zs-lede", 380],
    [".zs-key", 460],
    [".zs-text > .zs-widget", 560],
    [".zs-source", 700],
  ];
  for (const [selector, delay] of parts) {
    step.querySelectorAll(selector).forEach((node) =>
      node.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 700, delay, easing: EASE, fill: "backwards" },
      ),
    );
  }
  step
    .querySelector(".zs-rule")
    ?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: 900,
      easing: EASE,
      fill: "backwards",
    });
}

/** What the map shows, set in the scene text: quantity, live date, ramp, basis. */
interface Key {
  el: HTMLElement;
  stamp: HTMLElement;
  ramp: HTMLElement;
  min: HTMLElement;
  max: HTMLElement;
}

function renderKey(doc: Document, legend: ViewLegend): Key {
  const el = doc.createElement("div");
  el.className = "zs-key";
  const head = doc.createElement("p");
  head.className = "zs-key-head";
  const label = doc.createElement("span");
  label.className = "zs-key-label";
  label.textContent = legend.label;
  const stamp = doc.createElement("span");
  stamp.className = "zs-key-date";
  stamp.hidden = !legend.stamp;
  head.append(label, stamp);
  el.append(head);
  const ramp = doc.createElement("span");
  const min = doc.createElement("span");
  const max = doc.createElement("span");
  if (legend.swatches?.length) {
    const list = doc.createElement("ul");
    list.className = "zs-key-swatches";
    for (const swatch of legend.swatches) {
      const li = doc.createElement("li");
      const dot = doc.createElement("span");
      dot.style.background = swatch.color;
      li.append(dot, swatch.label);
      list.append(li);
    }
    el.append(list);
  } else {
    const bar = doc.createElement("div");
    bar.className = "zs-key-bar";
    ramp.className = "zs-key-ramp";
    bar.append(min, ramp, max);
    el.append(bar);
  }
  if (legend.basis) {
    const basis = doc.createElement("p");
    basis.className = "zs-key-basis";
    basis.textContent = legend.basis;
    el.append(basis);
  }
  return { el, stamp, ramp, min, max };
}

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export interface StageOptions {
  /** Folder of story.json, views.json and data/. */
  contentUrl: URL;
}

/**
 * The scroll story: one sticky projversor sphere behind the text, a veil on
 * the text side, a chapter rail and a HUD. The step crossing the activation
 * line drives the view, its overlays and widgets. Stage widgets take the
 * free side of the sphere and dim it. Throws when WebGL2 is missing, before
 * anything stays attached.
 */
export async function mountStage(
  host: HTMLElement,
  options: StageOptions,
): Promise<() => void> {
  const doc = host.ownerDocument;
  const win = doc.defaultView!;
  const abort = new AbortController();
  const docs = await loadDocuments(options.contentUrl, abort.signal);
  const scenes = docs.story.scenes;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const root = doc.createElement("section");
  root.className = "zs-story";
  root.setAttribute("aria-label", text(docs.story.title));
  const stage = doc.createElement("div");
  stage.className = "zs-stage";
  const veil = doc.createElement("div");
  veil.className = "zs-veil";
  const status = doc.createElement("p");
  status.className = "zs-status";
  status.setAttribute("role", "status");
  const stageWidgets = doc.createElement("div");
  stageWidgets.className = "zs-stage-widgets";
  const steps = doc.createElement("div");
  steps.className = "zs-steps";
  // A key in the text of scenes whose map has a legend; stage-widget
  // scenes carry their own scales.
  const keys = scenes.map((scene) => {
    const legend = viewOf(docs, scene)?.legend;
    const staged = sceneWidgets(scene).some((b) => b.slot === "stage");
    return legend && !staged ? renderKey(doc, legend) : null;
  });
  const stepEls = scenes.map((scene, i) =>
    renderStep(doc, docs, scene, i, keys[i]),
  );
  steps.append(...stepEls);
  const progress = mountProgress(doc, {
    names: scenes.map((scene) => text(scene.name)),
    steps: stepEls,
    line: LINE,
    reduced,
  });

  // Stage widgets: one host per block, shown with their scene.
  const stageHosts = scenes.map((scene) =>
    sceneWidgets(scene)
      .filter((block) => block.slot === "stage")
      .map((block) => {
        const widgetEl = widgetHost(doc, block);
        widgetEl.classList.add("zs-stage-widget");
        stageWidgets.append(widgetEl);
        return widgetEl;
      }),
  );
  stage.append(veil, stageWidgets, progress.element, status);
  root.append(stage, steps);

  // The opening view's archive starts loading now, before WebGL is up.
  const first = viewOf(docs, scenes[0]);
  const opening = first ? projversorState(parseProjversorView(first)) : null;
  if (opening?.layer) {
    preloadLayer(opening.layer, opening.time).catch(() => {});
  }

  // Attached first: the overlay reads its colors from the computed style.
  // Built on the opening view, so its first activation is not a morph, and
  // without waiting for the detailed coastline, which arrives on its own.
  host.append(root);
  const projversor = new Projversor(stage, {
    playing: false,
    interactive: false,
    waitForLandDetail: false,
    ...(opening && {
      preset: opening.preset,
      rotate: opening.rotate,
      zoom: opening.zoom,
      time: opening.time,
    }),
  });
  try {
    await projversor.init();
  } catch (error) {
    root.remove();
    throw error;
  }

  const loading = new LoadingIndicator((visible) => {
    root.classList.toggle("is-loading", visible);
    if (visible) {
      status.textContent = "Loading data";
    } else if (status.textContent === "Loading data") {
      status.textContent = "";
    }
  });
  const report = (error: unknown) => {
    console.error(error);
    loading.hide(true);
    status.textContent = error instanceof Error ? error.message : String(error);
  };
  const adapter = new ProjversorStoryView(projversor, !reduced, report);

  // Index of the shown scene; generation drops stale async activations.
  let active = -1;
  let generation = 0;

  // Widgets: mounted once, entered and left with their scene.
  const widgets: WidgetInstance[][] = scenes.map(() => []);
  const mounts = scenes.flatMap((scene, i) =>
    sceneWidgets(scene).map(async (block) => {
      const widgetEl =
        block.slot === "stage"
          ? stageHosts[i].find((h) => h.dataset.block === block.id)
          : stepEls[i].querySelector<HTMLElement>(
              `.zs-widget[data-block="${block.id}"]`,
            );
      const widget = WIDGETS[block.widget];
      if (!widgetEl || !widget) {
        console.error(new Error(`Unknown widget: ${block.widget}`));
        widgetEl?.remove();
        return;
      }
      try {
        const instance = await widget(widgetEl, {
          doc,
          config: block.config ?? {},
          contentUrl: options.contentUrl,
          signal: abort.signal,
          reduced,
        });
        if (instance) {
          widgets[i].push(instance);
          if (i === active) {
            instance.enter?.();
          }
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error(error);
          widgetEl.remove();
        }
      }
    }),
  );
  void Promise.all(mounts);

  // GeoJSON overlays of the views, fetched once and cached.
  const overlayData = new Map<string, Promise<unknown>>();
  const shownOverlays = new Set<string>();
  const overlayFile = (url: string) => {
    let data = overlayData.get(url);
    if (!data) {
      data = fetch(new URL(url, options.contentUrl), {
        signal: abort.signal,
      }).then((r) => {
        if (!r.ok) {
          throw new Error(`${url}: HTTP ${r.status}`);
        }
        return r.json();
      });
      overlayData.set(url, data);
    }
    return data;
  };
  const overlayTimers = new Set<number>();
  const showOverlay = async (overlay: ViewOverlay, current: number) => {
    const id = `overlay-${overlay.id}`;
    const data = selectFeatures(await overlayFile(overlay.url), overlay.where);
    if (current !== generation) {
      return;
    }
    const style: GeoJSONStyle = overlay.style ?? {};
    if (shownOverlays.has(id)) {
      await (
        projversor.get(id) as { update(s: GeoJSONStyle): Promise<void> }
      ).update(style);
    } else {
      shownOverlays.add(id);
      await projversor.add(id, "geojson", { data: data as never, style });
    }
  };
  const syncOverlays = async (view: StoryView | undefined, current: number) => {
    overlayTimers.forEach((t) => clearTimeout(t));
    overlayTimers.clear();
    const wanted = view?.overlays ?? [];
    for (const id of shownOverlays) {
      if (!wanted.some((o) => `overlay-${o.id}` === id)) {
        shownOverlays.delete(id);
        await projversor.remove(id);
      }
    }
    for (const overlay of wanted) {
      const delay = reduced ? 0 : (overlay.delayMs ?? 0);
      if (delay > 0 && !shownOverlays.has(`overlay-${overlay.id}`)) {
        const timer = window.setTimeout(() => {
          overlayTimers.delete(timer);
          showOverlay(overlay, current).catch(report);
        }, delay);
        overlayTimers.add(timer);
      } else {
        await showOverlay(overlay, current);
      }
    }
  };

  // The active scene's key follows the decoded month and the playhead.
  const offMonth = projversor.on("month", ({ month }) => {
    const key = keys[active];
    if (!key) {
      return;
    }
    const scale = monthLegend(month);
    const [lo, hi] = legendLabels(scale.min, scale.max);
    key.min.textContent = lo;
    key.max.textContent = hi;
    const palette = adapter.field?.palette;
    if (palette) {
      key.ramp.style.background = rampGradient(palette).replace(
        "to top",
        "to right",
      );
    }
  });
  let lastDay = "";
  const offFrame = projversor.on("frame", () => {
    const ms = projversor.time;
    // Before a layer's first month decodes the playhead is 0 (1970): no
    // archive starts that early, so wait for a real date.
    if (!Number.isFinite(ms) || ms < EARLIEST) {
      return;
    }
    const key = keys[active];
    if (key && !key.stamp.hidden) {
      const day = STAMP.format(new Date(ms)).toUpperCase();
      if (day !== lastDay) {
        lastDay = day;
        key.stamp.textContent = day;
      }
    }
    for (const widget of widgets[active] ?? []) {
      widget.time?.(ms);
    }
  });

  const inset = (durationMs: number) => {
    const scene = scenes[Math.max(0, active)];
    const { width, height } = stage.getBoundingClientRect();
    projversor.view.setInset(
      sceneInset(scene.layout, width, height),
      durationMs,
    );
  };

  const activate = async (index: number) => {
    if (index === active) {
      return;
    }
    const previous = active;
    const scene = scenes[index];
    const view = viewOf(docs, scene);
    const current = ++generation;
    active = index;
    root.dataset.layout = scene.layout;
    root.dataset.scene = scene.id;
    const accent = docs.story.themes[scene.theme]?.accent;
    if (accent) {
      root.style.setProperty("--zs-accent", accent);
    }
    stepEls.forEach((node, i) =>
      node.classList.toggle("is-active", i === index),
    );
    progress.setActive(index);
    stageHosts.forEach((hosts, i) =>
      hosts.forEach((node) => node.classList.toggle("is-active", i === index)),
    );
    root.classList.toggle("has-stage-widget", stageHosts[index].length > 0);

    root.style.setProperty("--zs-dim", String(view?.dim ?? 0.16));
    lastDay = "";

    if (previous >= 0) {
      widgets[previous].forEach((w) => w.leave?.());
    }
    widgets[index].forEach((w) => w.enter?.());
    if (!reduced) {
      reveal(stepEls[index]);
    }
    if (!view) {
      return;
    }
    const { transitionMs } = parseProjversorView(view);
    // The first view opens in place: no eased inset either.
    inset(reduced || previous < 0 ? 0 : (transitionMs ?? 0));
    loading.show();
    try {
      await adapter.activate(view);
      await syncOverlays(view, current);
      if (current !== generation) {
        return;
      }
      loading.hide();
      const nextView = scenes[index + 1] && viewOf(docs, scenes[index + 1]);
      if (nextView) {
        adapter.preload(nextView).catch(() => {});
      }
    } catch (error) {
      if (current === generation) {
        report(error);
      }
    }
  };

  // Play only while the story is on screen and the tab visible.
  let onScreen = false;
  const syncPlaying = () =>
    void projversor.update({ playing: onScreen && !doc.hidden && !reduced });
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    syncPlaying();
  });
  visibility.observe(root);
  doc.addEventListener("visibilitychange", syncPlaying);
  const resize = new ResizeObserver(() => inset(0));
  resize.observe(stage);

  syncPlaying();
  const scroller = new StoryScroller(stepEls, (index) => void activate(index), {
    line: LINE,
  });
  if (scroller.active < 0) {
    void activate(0);
  }

  return () => {
    abort.abort();
    offMonth();
    offFrame();
    widgets.flat().forEach((w) => w.destroy?.());
    scroller.destroy();
    progress.destroy();
    overlayTimers.forEach((t) => clearTimeout(t));
    visibility.disconnect();
    resize.disconnect();
    doc.removeEventListener("visibilitychange", syncPlaying);
    adapter.destroy();
    root.remove();
  };
}
