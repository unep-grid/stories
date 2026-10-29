import type { GeoJSONStyle } from "@fxi/projversor";
import {
  parseStoryDocuments,
  sceneViewId,
  type StoryCopyBlock,
  type StoryDocument,
  type StoryScene,
  type StoryViewDefinition,
  type StoryViewsDocument,
  type StoryWidgetBlock,
} from "@fxi/zartigl/story";

/**
 * This story reads zartigl story documents (schemaVersion 1) and adds a few
 * keys of its own, outside anything zartigl or projversor validate:
 *
 * - view `overlays`: GeoJSON files drawn above the field, loaded by URL so
 *   large point sets stay out of views.json, optionally filtered (`where`)
 *   and delayed (`delayMs`) for a staged reveal;
 * - view `legend`: what the colors mean, with the baseline of an anomaly;
 * - view `dim`: how far the sphere steps back behind a stage widget.
 *
 * A view's `config` stays a plain projversor view config.
 */
export const LAYOUTS = ["intro", "left", "right"] as const;

export interface ViewOverlay {
  id: string;
  /** GeoJSON file, relative to the content folder. */
  url: string;
  style?: GeoJSONStyle;
  /** Only the features whose properties equal these values. */
  where?: Record<string, string | number | boolean>;
  /** Shown this long after the view opens, for a staged reveal. */
  delayMs?: number;
}

interface FeatureLike {
  properties?: Record<string, unknown> | null;
}

/** The features of a FeatureCollection matching `where`; others unchanged. */
export function selectFeatures<T>(data: T, where: ViewOverlay["where"]): T {
  const collection = data as { type?: string; features?: FeatureLike[] };
  if (!where || collection.type !== "FeatureCollection") {
    return data;
  }
  const entries = Object.entries(where);
  return {
    ...collection,
    features: (collection.features ?? []).filter((feature) =>
      entries.every(([key, value]) => feature.properties?.[key] === value),
    ),
  } as T;
}

export interface LegendSwatch {
  color: string;
  label: string;
  /** "dot" for points, "line" and "dash" for strokes; areas otherwise. */
  shape?: "dot" | "area" | "line" | "dash";
}

/** A key of what the overlays draw: a title and its swatches. */
export interface LegendKey {
  label: string;
  swatches?: LegendSwatch[];
}

export interface ViewLegend extends LegendKey {
  /** Quantity and unit, e.g. "Sea surface temperature anomaly (°C)". */
  label: string;
  /** Reference period or note, e.g. "vs 1993–2016 climatology". */
  basis?: string;
  /** Short credit for the rail, e.g. "Copernicus Marine". */
  source?: string;
  /** Show the playhead date with the color ramp. */
  stamp?: boolean;
  /**
   * Swatches here replace the field's color ramp, when the overlays carry
   * the scene's message.
   */
  swatches?: LegendSwatch[];
  /** Further keys beside the first, two or three at most. */
  keys?: LegendKey[];
}

export interface StoryView extends StoryViewDefinition {
  overlays?: ViewOverlay[];
  legend?: ViewLegend;
  /** Sphere opacity behind a stage widget, 0–1; 0.16 when omitted. */
  dim?: number;
}

export type Scene = StoryScene;

export interface Story extends StoryDocument {
  scenes: Scene[];
}

export interface Documents {
  story: Story;
  views: Omit<StoryViewsDocument, "views"> & { views: StoryView[] };
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid story document: ${message}`);
  }
}

/** zartigl's checks, then this story's own keys. */
export function parseDocuments(story: unknown, views: unknown): Documents {
  const parsed = parseStoryDocuments(story, views, { layouts: LAYOUTS });
  const docs = parsed as unknown as Documents;
  for (const view of docs.views.views) {
    for (const overlay of view.overlays ?? []) {
      check(
        typeof overlay.id === "string" && typeof overlay.url === "string",
        `view ${view.id}.overlays needs an id and a url`,
      );
      check(
        overlay.delayMs === undefined ||
          (Number.isFinite(overlay.delayMs) && overlay.delayMs >= 0),
        `view ${view.id}.overlays.${overlay.id}.delayMs must be a non-negative number`,
      );
      check(
        overlay.where === undefined ||
          (typeof overlay.where === "object" && overlay.where !== null),
        `view ${view.id}.overlays.${overlay.id}.where must be an object`,
      );
    }
    check(
      view.dim === undefined || (view.dim >= 0 && view.dim <= 1),
      `view ${view.id}.dim must be between 0 and 1`,
    );
    if (view.legend) {
      check(
        typeof view.legend.label === "string",
        `view ${view.id}.legend.label is required`,
      );
      check(
        (view.legend.keys ?? []).every(
          (key) => typeof key.label === "string" && Array.isArray(key.swatches),
        ) && (view.legend.keys?.length ?? 0) <= 3,
        `view ${view.id}.legend.keys needs a label and swatches each, three at most`,
      );
    }
  }
  return docs;
}

async function fetchJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${url.pathname}: HTTP ${response.status}`);
  }
  return response.json();
}

/** Load and check `story.json` and `views.json` of a content folder. */
export async function loadDocuments(
  folder: URL,
  signal: AbortSignal,
): Promise<Documents> {
  const [story, views] = await Promise.all([
    fetchJson(new URL("story.json", folder), signal),
    fetchJson(new URL("views.json", folder), signal),
  ]);
  return parseDocuments(story, views);
}

export function sceneCopy(scene: StoryScene): StoryCopyBlock | undefined {
  return scene.blocks.find(
    (block): block is StoryCopyBlock => block.type === "copy",
  );
}

export function sceneWidgets(scene: StoryScene): StoryWidgetBlock[] {
  return scene.blocks.filter(
    (block): block is StoryWidgetBlock => block.type === "widget",
  );
}

export function viewOf(
  docs: Documents,
  scene: StoryScene,
): StoryView | undefined {
  const id = sceneViewId(scene);
  return id ? docs.views.views.find((view) => view.id === id) : undefined;
}

/** English only for now; the documents keep `{en, …}` for later locales. */
export function text(value: Record<string, string> | undefined): string {
  return value?.en ?? "";
}
