/**
 * The playback timeline: a thin track over the view's time window, a tick
 * at each month start, and one thumb on the playhead. Dragging holds
 * playback and seeks, one seek at a time to the latest target while the map
 * catches up; letting go resumes it once the last seek has landed. A slider
 * for the keyboard: arrows by day, PageUp/PageDown by month, Home/End to
 * the first and last day; playback resumes a moment after the last key.
 */

const DAY = 86_400_000;
/** Playback resumes this long after the last key. */
const KEY_HOLD_MS = 1200;

export type Bounds = readonly [number, number];

/** Position (0–1) of a time in the window, clamped. */
export function fractionAt(ms: number, [start, end]: Bounds): number {
  if (!(end > start)) {
    return 0;
  }
  return Math.min(1, Math.max(0, (ms - start) / (end - start)));
}

/** Time at a position (0–1) in the window, clamped. */
export function timeAt(fraction: number, [start, end]: Bounds): number {
  return start + Math.min(1, Math.max(0, fraction)) * (end - start);
}

/** Positions of the month starts strictly inside the window, UTC. */
export function monthTicks(bounds: Bounds): number[] {
  const [start, end] = bounds;
  const ticks: number[] = [];
  const at = new Date(start);
  let month = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1);
  while (month < end) {
    ticks.push(fractionAt(month, bounds));
    const next = new Date(month);
    month = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
  }
  return ticks;
}

/** The same day of the month before or after, UTC. */
function shiftMonth(ms: number, by: number): number {
  const d = new Date(ms);
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + by,
    d.getUTCDate(),
    d.getUTCHours(),
  );
}

const LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface TimelineOptions {
  /** Move the playhead; settles once the month holding `ms` shows. */
  onSeek(ms: number): Promise<void>;
  /** True while the reader drags or types, and until the seek lands. */
  onHold(held: boolean): void;
  /** The time the thumb shows: the target while held, else the playhead. */
  onShow?(ms: number): void;
}

export interface Timeline {
  element: HTMLElement;
  setBounds(bounds: Bounds | null): void;
  setTime(ms: number): void;
}

export function mountTimeline(
  doc: Document,
  options: TimelineOptions,
): Timeline {
  const win = doc.defaultView!;
  const el = doc.createElement("div");
  el.className = "zs-timeline";
  el.tabIndex = 0;
  el.setAttribute("role", "slider");
  el.setAttribute("aria-label", "Playback date");
  const ticks = doc.createElement("div");
  ticks.className = "zs-timeline-ticks";
  const thumb = doc.createElement("span");
  thumb.className = "zs-timeline-thumb";
  el.append(ticks, thumb);

  let bounds: Bounds | null = null;
  let time = 0;
  let shown = -1;
  let dragging = false;

  const place = (ms: number) => {
    time = ms;
    options.onShow?.(ms);
    if (!bounds) {
      return;
    }
    // Moves the thumb only when it moves by a pixel.
    const x = Math.round(fractionAt(ms, bounds) * el.clientWidth);
    if (x !== shown) {
      shown = x;
      thumb.style.transform = `translateX(${x}px)`;
    }
    el.setAttribute("aria-valuenow", String(Math.round(ms)));
    el.setAttribute("aria-valuetext", LABEL.format(new Date(ms)));
  };

  // Playback holds while the reader drags or types, and until the last
  // seek has landed: resumed earlier, the clock would run on from the old
  // date while the new month loads, and the thumb would jump back.
  let keying = false;
  let inFlight = false;
  let pending: number | null = null;
  let held = false;
  const busy = () => dragging || keying || inFlight || pending !== null;
  const syncHold = () => {
    if (busy() !== held) {
      held = !held;
      options.onHold(held);
    }
  };

  // One seek at a time, the latest target wins: a seek into another month
  // decodes it, and seeks piling up would exhaust the video decoders.
  const pump = () => {
    if (inFlight || pending === null) {
      syncHold();
      return;
    }
    const target = pending;
    pending = null;
    inFlight = true;
    options
      .onSeek(target)
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        pump();
      });
  };
  const seek = (ms: number) => {
    place(ms);
    pending = ms;
    syncHold();
    pump();
  };
  const pointerTime = (event: PointerEvent) => {
    const box = el.getBoundingClientRect();
    return timeAt((event.clientX - box.left) / box.width, bounds!);
  };

  el.addEventListener("pointerdown", (event) => {
    if (!bounds || event.button !== 0) {
      return;
    }
    dragging = true;
    el.setPointerCapture(event.pointerId);
    el.classList.add("is-dragging");
    seek(pointerTime(event));
  });
  el.addEventListener("pointermove", (event) => {
    if (dragging) {
      seek(pointerTime(event));
    }
  });
  const release = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    el.classList.remove("is-dragging");
    syncHold();
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);

  // Keys hold playback like a drag, and let go a moment after the last one,
  // so the chosen date can be read before it plays on.
  let keyHold = 0;
  el.addEventListener("keydown", (event) => {
    if (!bounds) {
      return;
    }
    // The window's last day, not its last instant: from there playback
    // would loop to the start at once.
    const last = Math.max(bounds[0], bounds[1] - DAY);
    const moves: Record<string, () => number> = {
      ArrowLeft: () => time - DAY,
      ArrowDown: () => time - DAY,
      ArrowRight: () => time + DAY,
      ArrowUp: () => time + DAY,
      PageDown: () => shiftMonth(time, -1),
      PageUp: () => shiftMonth(time, 1),
      Home: () => bounds![0],
      End: () => last,
    };
    const move = moves[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    keying = true;
    win.clearTimeout(keyHold);
    keyHold = win.setTimeout(() => {
      keying = false;
      syncHold();
    }, KEY_HOLD_MS);
    seek(Math.min(last, Math.max(bounds[0], move())));
  });

  // The thumb's pixel depends on the track width.
  new ResizeObserver(() => {
    shown = -1;
    place(time);
  }).observe(el);

  return {
    element: el,
    setBounds(next) {
      bounds = next;
      el.classList.toggle("is-empty", !next);
      ticks.replaceChildren(
        ...(next ? monthTicks(next) : []).map((at) => {
          const tick = doc.createElement("span");
          tick.style.left = `${at * 100}%`;
          return tick;
        }),
      );
      if (next) {
        el.setAttribute("aria-valuemin", String(next[0]));
        el.setAttribute("aria-valuemax", String(next[1]));
      }
      shown = -1;
      place(time);
    },
    setTime(ms) {
      // While held, the thumb shows the target, not the clock catching up.
      if (!busy()) {
        place(ms);
      }
    },
  };
}
