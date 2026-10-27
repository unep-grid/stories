/**
 * Chapter progress: one thin vertical line, the current step number above
 * it and the count below. The fill follows the scroll continuously; ticks
 * mark the step boundaries. On the first step, before any scroll, a short
 * segment runs down the empty line: the scroll invitation. Keyboard and
 * screen-reader users get one (visually hidden) button per chapter.
 */

const EASE = "cubic-bezier(.16,1,.3,1)";
const NAME_MS = 2400;

const pad = (n: number) => String(n).padStart(2, "0");

export interface ProgressOptions {
  names: readonly string[];
  steps: readonly HTMLElement[];
  /** Fraction of the viewport height where a step becomes active. */
  line: number;
  reduced: boolean;
}

export interface Progress {
  element: HTMLElement;
  setActive(index: number): void;
  destroy(): void;
}

/** Scroll position as a fraction of the steps' extent, at the activation line. */
export function progressAt(
  scrollY: number,
  viewport: number,
  line: number,
  first: number,
  last: number,
): number {
  if (last <= first) {
    return 0;
  }
  const at = scrollY + viewport * line;
  return Math.min(1, Math.max(0, (at - first) / (last - first)));
}

export function mountProgress(
  doc: Document,
  options: ProgressOptions,
): Progress {
  const win = doc.defaultView!;
  const { names, steps, line, reduced } = options;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const count = names.length - 1;

  const nav = doc.createElement("nav");
  nav.className = "zs-progress";
  nav.setAttribute("aria-label", "Chapters");

  const now = doc.createElement("p");
  now.className = "zs-progress-now";
  now.setAttribute("aria-hidden", "true");
  const number = doc.createElement("span");
  number.className = "zs-progress-n";
  const name = doc.createElement("span");
  name.className = "zs-progress-name";
  now.append(number, name);

  const track = doc.createElement("div");
  track.className = "zs-progress-track";
  track.setAttribute("aria-hidden", "true");
  const fill = doc.createElement("span");
  fill.className = "zs-progress-fill";
  const nudge = doc.createElement("span");
  nudge.className = "zs-progress-nudge";
  const ticks = steps.slice(1).map(() => {
    const tick = doc.createElement("span");
    tick.className = "zs-progress-tick";
    track.append(tick);
    return tick;
  });
  track.prepend(fill, nudge);

  const total = doc.createElement("p");
  total.className = "zs-progress-total";
  total.setAttribute("aria-hidden", "true");
  total.textContent = pad(count);

  const cue = doc.createElement("p");
  cue.className = "zs-progress-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.textContent = "Scroll";

  // Accessible chapter list: visually hidden, shown in the name on focus.
  const list = doc.createElement("ol");
  list.className = "zs-progress-list";
  const jump = (i: number) =>
    steps[i]?.scrollIntoView({ behavior, block: "center" });
  names.forEach((label, i) => {
    const li = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = i > 0 ? `${pad(i)} ${label}` : label;
    button.addEventListener("click", () => jump(i));
    button.addEventListener("focus", () => flash(i));
    li.append(button);
    list.append(li);
  });

  nav.append(now, track, total, cue, list);

  // Extent of the steps, in document px, and the tick positions in it.
  let first = 0;
  let last = 1;
  let starts: number[] = [];
  const measure = () => {
    const top = (el: HTMLElement) =>
      el.getBoundingClientRect().top + win.scrollY;
    starts = steps.map(top);
    first = starts[0];
    const end = steps.at(-1)!;
    last = top(end) + end.offsetHeight - win.innerHeight * (1 - line);
    // A step activates when the line reaches its top: its tick sits where
    // the fill is at that moment.
    ticks.forEach((tick, i) => {
      const f = (starts[i + 1] - first) / Math.max(1, last - first);
      tick.style.top = `${Math.min(1, Math.max(0, f)) * 100}%`;
    });
  };

  let frame = 0;
  const update = () => {
    frame = 0;
    const p = progressAt(win.scrollY, win.innerHeight, line, first, last);
    fill.style.transform = `scaleY(${p})`;
    nav.classList.toggle("is-nudging", win.scrollY < 24 && !reduced);
  };
  const onScroll = () => {
    if (!frame) {
      frame = win.requestAnimationFrame(update);
    }
  };
  win.addEventListener("scroll", onScroll, { passive: true });
  const resize = new ResizeObserver(() => {
    measure();
    update();
  });
  resize.observe(doc.documentElement);

  // A click on the line jumps to the step whose span holds that point.
  track.addEventListener("click", (event) => {
    const box = track.getBoundingClientRect();
    const f = (event.clientY - box.top) / box.height;
    const at = first + f * (last - first);
    let target = 0;
    starts.forEach((start, i) => {
      if (start <= at) {
        target = i;
      }
    });
    jump(target);
  });

  let nameTimer = 0;
  const flash = (i: number) => {
    win.clearTimeout(nameTimer);
    name.textContent = i > 0 ? names[i] : "";
    nav.classList.add("is-named");
    nameTimer = win.setTimeout(() => nav.classList.remove("is-named"), NAME_MS);
  };

  let active = -1;
  return {
    element: nav,
    setActive(index) {
      if (index === active) {
        return;
      }
      const down = index > active;
      active = index;
      number.textContent = index > 0 ? pad(index) : "";
      nav.classList.toggle("is-first", index === 0);
      if (!reduced && index > 0) {
        number.animate(
          [
            { opacity: 0, transform: `translateY(${down ? 60 : -60}%)` },
            { opacity: 1, transform: "none" },
          ],
          { duration: 600, easing: EASE },
        );
      }
      if (index > 0) {
        flash(index);
      }
    },
    destroy() {
      win.removeEventListener("scroll", onScroll);
      win.cancelAnimationFrame(frame);
      win.clearTimeout(nameTimer);
      resize.disconnect();
      nav.remove();
    },
  };
}
