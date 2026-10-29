import {
  Projversor,
  ProjversorStoryView,
  monthLegend,
  parseProjversorView,
  preloadLayer,
  projversorState,
  rampGradient,
  type GeoJSONStyle,
  type Inset,
  type ProjversorMonth,
} from "@fxi/projversor";
import {
  LoadingIndicator,
  StoryScroller,
  storyExternalLinkAttributes,
  type StoryWidgetBlock,
} from "@fxi/zartigl/story";
import { WIDGETS, type WidgetInstance } from "../widgets";
import { mountProgress } from "./progress";
import { mountLegend, viewKeys, type BandKey } from "./legend";
import { mountRail } from "./rail";
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
/** Short form for the rail; the colophon spells the names out. */
const PARTNERS = "WMO × UNEP/GRID-Geneva";

/**
 * Free zone of the sphere for a scene layout, css px: beside the text on
 * wide screens, above it on narrow ones; always clear of the rail (left)
 * and the legend band (bottom).
 */
export function sceneInset(
  layout: string,
  width: number,
  height: number,
  rail = 0,
  band = 0,
): Inset {
  const free = height - band;
  if (width < WIDE_MIN) {
    return {
      top: 0,
      right: 0,
      bottom: band + Math.round(free * 0.34),
      left: rail,
    };
  }
  const side = Math.round(Math.min((width - rail) * 0.42, 560));
  if (layout === "left") {
    return { top: 0, right: 0, bottom: band, left: rail + side };
  }
  if (layout === "right") {
    return { top: 0, right: side, bottom: band, left: rail };
  }
  return { top: Math.round(free * 0.4), right: 0, bottom: band, left: rail };
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
  key: HTMLElement | null,
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
    body.append(key);
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

/**
 * The basis of the map's key, set in the scene text: the key itself is in
 * the rail, too narrow for a sentence.
 */
function renderBasis(doc: Document, legend: ViewLegend): HTMLElement {
  const basis = doc.createElement("p");
  basis.className = "zs-key";
  basis.textContent = legend.basis!;
  return basis;
}

export interface StageOptions {
  /** Folder of story.json, views.json and data/. */
  contentUrl: URL;
}

/**
 * The scroll story: one sticky projversor sphere behind the text, a veil on
 * the text side, a rail on the left (chapters, credits) and a legend band
 * at the bottom. The step crossing the activation
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
  // The band keys scenes whose map has a legend, with its basis in the
  // text; stage-widget scenes hand theirs to the band.
  const legends = scenes.map((scene) => {
    const legend = viewOf(docs, scene)?.legend;
    const staged = sceneWidgets(scene).some((b) => b.slot === "stage");
    return legend && !staged ? legend : null;
  });
  const stepEls = scenes.map((scene, i) => {
    const legend = legends[i];
    return renderStep(
      doc,
      docs,
      scene,
      i,
      legend?.basis ? renderBasis(doc, legend) : null,
    );
  });
  steps.append(...stepEls);
  const progress = mountProgress(doc, {
    names: scenes.map((scene) => text(scene.name)),
    title: text(scenes[0].name),
    steps: stepEls,
    line: LINE,
    reduced,
  });
  const colophon = doc.querySelector<HTMLElement>(".zs-colophon");
  const rail = mountRail(doc, {
    progress: progress.element,
    partners: PARTNERS,
    about: colophon,
    reduced,
  });
  // The timeline only takes the pointer once a month shows, after the
  // sphere and its adapter below exist.
  const band = mountLegend(doc, {
    reduced,
    onSeek: (ms) => projversor.update({ time: ms }).catch(report),
    onHold: (held) => void projversor.update({ held }),
  });
  // The map's own source, else the scene's first reference; a stage widget
  // in front of the map is credited by the reference.
  const credits = scenes.map(
    (scene, i) =>
      (legends[i] && viewOf(docs, scene)?.legend?.source) ||
      text(sceneCopy(scene)?.references?.[0]?.label),
  );

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
  stage.append(veil, stageWidgets, status);
  // The rail and the band frame the stage above the scrolling text: the
  // sticky stage is a stacking context of its own, so they get theirs.
  const frame = doc.createElement("div");
  frame.className = "zs-frame";
  const frameInner = doc.createElement("div");
  frameInner.className = "zs-frame-inner";
  frameInner.append(rail.element, band.element);
  frame.append(frameInner);
  root.append(stage, steps, frame);

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
  // The band keys the map, or else the scene's stage widgets.
  const bandKeys = (i: number): BandKey[] => {
    const legend = legends[i];
    return legend
      ? viewKeys(legend)
      : widgets[i].flatMap((widget) => widget.legend ?? []);
  };
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
            band.setKeys(bandKeys(i));
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

  // The band's ramp follows the decoded month and the playhead. A scene
  // that keeps the layer and month on screen gets no new month event, so
  // the last one is kept and applied again once the scene is active.
  let lastMonth: ProjversorMonth | null = null;
  const syncKey = () => {
    if (!legends[active] || !lastMonth) {
      return;
    }
    const field = adapter.field;
    band.setRange(
      monthLegend(lastMonth),
      field?.palette
        ? rampGradient(field.palette).replace("to top", "to right")
        : null,
    );
    if (legends[active]?.stamp) {
      band.setBounds(field?.timeBounds ?? null);
    }
  };
  const offMonth = projversor.on("month", ({ month }) => {
    lastMonth = month;
    syncKey();
  });
  const offFrame = projversor.on("frame", () => {
    const ms = projversor.time;
    // Before a layer's first month decodes the playhead is 0 (1970): no
    // archive starts that early, so wait for a real date.
    if (!Number.isFinite(ms) || ms < EARLIEST) {
      return;
    }
    if (legends[active]?.stamp) {
      band.setTime(ms);
    }
    for (const widget of widgets[active] ?? []) {
      widget.time?.(ms);
    }
  });

  const inset = (durationMs: number) => {
    const scene = scenes[Math.max(0, active)];
    const { width, height } = stage.getBoundingClientRect();
    projversor.view.setInset(
      sceneInset(
        scene.layout,
        width,
        height,
        rail.element.offsetWidth,
        band.element.offsetHeight,
      ),
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
    band.setKeys(bandKeys(index));
    rail.setCredit(credits[index], reduced ? 0 : 120);
    stageHosts.forEach((hosts, i) =>
      hosts.forEach((node) => node.classList.toggle("is-active", i === index)),
    );
    root.classList.toggle("has-stage-widget", stageHosts[index].length > 0);

    root.style.setProperty("--zs-dim", String(view?.dim ?? 0.16));
    syncPlaying();

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
      syncKey();
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

  // Play only while the story is on screen and the tab visible, and not
  // behind a stage widget that hides the sphere entirely (dim 0).
  let onScreen = false;
  const sphereHidden = () =>
    active >= 0 &&
    stageHosts[active].length > 0 &&
    viewOf(docs, scenes[active])?.dim === 0;
  const syncPlaying = () =>
    void projversor.update({
      playing: onScreen && !doc.hidden && !reduced && !sphereHidden(),
    });
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
