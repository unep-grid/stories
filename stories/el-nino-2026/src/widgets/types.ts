import type { BandKey } from "../engine/legend";

/** What a widget gets: its host, its block config and the story context. */
export interface WidgetContext {
  doc: Document;
  config: Record<string, unknown>;
  /** Content folder: widgets resolve their data files under it. */
  contentUrl: URL;
  signal: AbortSignal;
  /** prefers-reduced-motion: show final states at once. */
  reduced: boolean;
}

/**
 * A mounted widget. `enter` runs each time its scene becomes active (replay
 * the reveal), `leave` when it stops being so, `time` with the playhead of
 * the sphere (epoch ms) while its scene is active. A stage widget's
 * `legend` goes to the legend band while its scene is active.
 */
export interface WidgetInstance {
  legend?: BandKey[];
  enter?(): void;
  leave?(): void;
  time?(ms: number): void;
  destroy?(): void;
}

export type Widget = (
  host: HTMLElement,
  context: WidgetContext,
) => WidgetInstance | void | Promise<WidgetInstance | void>;

export async function fetchData<T>(
  context: WidgetContext,
  file: unknown,
): Promise<T> {
  if (typeof file !== "string") {
    throw new Error("widget config.data must be a file name");
  }
  const url = new URL(file, context.contentUrl);
  const response = await fetch(url, { signal: context.signal });
  if (!response.ok) {
    throw new Error(`${url.pathname}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (textContent !== undefined) {
    node.textContent = textContent;
  }
  return node;
}

export const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export const EASE = "cubic-bezier(.16,1,.3,1)";
