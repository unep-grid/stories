import { railSegment, swapText } from "./rail";

/**
 * Chapter progress, the first segment of the rail: the current step number
 * on top, the count at the foot, and between them the line beside the
 * chapter name, set vertically. The fill follows the scroll continuously;
 * ticks mark the step boundaries. On the first step, before any scroll, a
 * short segment runs down the empty line and the name reads "Scroll": the
 * invitation. Keyboard and screen-reader users get one (visually hidden)
 * button per chapter.
 */

const EASE = "cubic-bezier(.16,1,.3,1)";

const pad = (n: number) => String(n).padStart(2, "0");

export interface ProgressOptions {
  names: readonly string[];
  /** Running title, set beside the chapter name. */
  title: string;
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

  const seg = railSegment(doc, "nav", "progress");
  const nav = seg.el;
  nav.setAttribute("aria-label", "Chapters");
  nav.querySelector(".zs-rail-body")!.setAttribute("aria-hidden", "true");
  seg.top.setAttribute("aria-hidden", "true");
  seg.foot.setAttribute("aria-hidden", "true");
  seg.foot.textContent = pad(count);
  seg.sub.textContent = options.title;

  const track = seg.line;
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

  // Accessible chapter list: visually hidden, shown on focus.
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
    li.append(button);
    list.append(li);
  });
  nav.append(list);

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

  let active = -1;
  return {
    element: nav,
    setActive(index) {
      if (index === active) {
        return;
      }
      const down = index > active;
      active = index;
      nav.classList.toggle("is-first", index === 0);
      seg.top.textContent = index > 0 ? pad(index) : "";
      if (!reduced && index > 0) {
        seg.top.animate(
          [
            { opacity: 0, transform: `translateY(${down ? 60 : -60}%)` },
            { opacity: 1, transform: "none" },
          ],
          { duration: 600, easing: EASE },
        );
      }
      swapText(seg.main, index > 0 ? names[index] : "Scroll", { reduced });
    },
    destroy() {
      win.removeEventListener("scroll", onScroll);
      win.cancelAnimationFrame(frame);
      resize.disconnect();
      nav.remove();
    },
  };
}
