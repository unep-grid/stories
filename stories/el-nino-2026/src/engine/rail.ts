/**
 * The rail: a black column on the left of the stage, full height, in two
 * segments of one grammar. Each has a token on top, a body, and a token at
 * the foot; the body is a line (track, rule) on the left, then two
 * columns of vertical text read bottom to top, the main one against the
 * line, a quieter one beyond it: head tilted left, line, main, sub.
 *
 *   progress (3/5)  step number · track + chapter name, story · count
 *   credits  (2/5)  "Data" · rule + source, partners · link to the colophon
 *
 * Every slot keeps its size whatever it holds, so a new scene changes ink,
 * never geometry. Changed parts wipe out and back in, in reading direction.
 */

const EASE = "cubic-bezier(.16,1,.3,1)";
const OUT_EASE = "cubic-bezier(.5,0,.75,0)";

export interface RailSegment {
  el: HTMLElement;
  top: HTMLElement;
  line: HTMLElement;
  main: HTMLElement;
  sub: HTMLElement;
  foot: HTMLElement;
}

export function railSegment(
  doc: Document,
  tag: "nav" | "div",
  name: string,
): RailSegment {
  const el = doc.createElement(tag);
  el.className = `zs-rail-seg zs-rail-${name}`;
  const top = doc.createElement("p");
  top.className = "zs-rail-token";
  const body = doc.createElement("div");
  body.className = "zs-rail-body";
  const line = doc.createElement("div");
  line.className = "zs-rail-line";
  const copy = doc.createElement("div");
  copy.className = "zs-rail-copy";
  const main = doc.createElement("p");
  main.className = "zs-rail-main";
  const sub = doc.createElement("p");
  sub.className = "zs-rail-sub";
  copy.append(main, sub);
  body.append(line, copy);
  const foot = doc.createElement("p");
  foot.className = "zs-rail-token is-foot";
  el.append(top, body, foot);
  return { el, top, line, main, sub, foot };
}

interface SwapOptions {
  reduced: boolean;
  delay?: number;
  /** Reading direction of what is wiped: down the rail, or across. */
  axis?: "x" | "y";
}

const CLIP = {
  y: {
    shown: "inset(0 0 0 0)",
    before: "inset(0 0 100% 0)",
    after: "inset(100% 0 0 0)",
  },
  x: {
    shown: "inset(0 0 0 0)",
    before: "inset(0 100% 0 0)",
    after: "inset(0 0 0 100%)",
  },
};

const runs = new WeakMap<object, number>();

/**
 * Wipe `els` out (erased from the start of the reading direction), run
 * `apply`, wipe them back in (drawn from the start). A newer swap on the
 * same owner supersedes this one; its `apply` sets the whole state, so a
 * skipped one loses nothing.
 */
export function swap(
  owner: object,
  els: readonly HTMLElement[],
  apply: () => void,
  { reduced, delay = 0, axis = "y" }: SwapOptions,
): void {
  const run = (runs.get(owner) ?? 0) + 1;
  runs.set(owner, run);
  els.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
  if (reduced || !els.length) {
    apply();
    return;
  }
  const clip = CLIP[axis];
  const outs = els.map((el, i) =>
    el.animate([{ clipPath: clip.shown }, { clipPath: clip.after }], {
      duration: 260,
      delay: delay + i * 40,
      easing: OUT_EASE,
      fill: "forwards",
    }),
  );
  Promise.all(outs.map((a) => a.finished))
    .then(() => {
      if (runs.get(owner) !== run) {
        return;
      }
      apply();
      els.forEach((el, i) => {
        el.getAnimations().forEach((a) => a.cancel());
        el.animate([{ clipPath: clip.before }, { clipPath: clip.shown }], {
          duration: 820,
          delay: 60 + i * 70,
          easing: EASE,
          fill: "backwards",
        });
      });
    })
    .catch(() => {});
}

/** Swap the text of one element, if it changes. */
export function swapText(
  el: HTMLElement,
  value: string,
  options: SwapOptions,
): void {
  if (el.textContent === value && !el.getAnimations().length) {
    return;
  }
  swap(el, [el], () => (el.textContent = value), options);
}

export interface RailOptions {
  progress: HTMLElement;
  partners: string;
  /** Where the credits' foot link leads: the full sources. */
  about?: HTMLElement | null;
  reduced: boolean;
}

export interface Rail {
  element: HTMLElement;
  /** Source of what the map shows. */
  setCredit(credit: string, delay: number): void;
}

export function mountRail(doc: Document, options: RailOptions): Rail {
  const { reduced } = options;
  const aside = doc.createElement("aside");
  aside.className = "zs-rail";
  aside.setAttribute("aria-label", "Chapters and sources");

  const credits = railSegment(doc, "div", "credits");
  credits.top.textContent = "Data";
  credits.sub.textContent = options.partners;
  const about = options.about;
  if (about) {
    const link = doc.createElement("button");
    link.type = "button";
    link.className = "zs-rail-link";
    link.textContent = "About";
    link.setAttribute("aria-label", "About: data and method");
    link.addEventListener("click", () =>
      about.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }),
    );
    credits.foot.append(link);
  }

  aside.append(options.progress, credits.el);

  return {
    element: aside,
    setCredit(credit, delay) {
      swapText(credits.main, credit, { reduced, delay });
    },
  };
}
