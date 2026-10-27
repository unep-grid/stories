import { EASE, el, type Widget } from "./types";

interface KeyNumber {
  value: number;
  /** Counted from, for the reveal; 0 by default. */
  from?: number;
  unit?: string;
  label: string;
  basis?: string;
}

function numbers(value: unknown): KeyNumber[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("key-numbers config.items must be a non-empty array");
  }
  value.forEach((item, i) => {
    if (typeof item?.value !== "number" || typeof item?.label !== "string") {
      throw new Error(`key-numbers config.items[${i}] needs value and label`);
    }
  });
  return value as KeyNumber[];
}

const FORMAT = new Intl.NumberFormat("en-GB");

/** A row of figures that count up when their scene opens. */
export const keyNumbers: Widget = (host, context) => {
  const { doc } = context;
  host.classList.add("zs-numbers");
  const items = numbers(context.config.items).map((item) => {
    const box = el(doc, "div", "zs-number");
    const value = el(doc, "span", "zs-number-value", FORMAT.format(item.value));
    if (item.unit) {
      value.append(el(doc, "span", "zs-number-unit", item.unit));
    }
    box.append(el(doc, "span", "zs-number-label", item.label), value);
    if (item.basis) {
      box.append(el(doc, "span", "zs-number-basis", item.basis));
    }
    host.append(box);
    return { item, value, digits: value.firstChild as Text };
  });

  let frame = 0;
  return {
    enter() {
      cancelAnimationFrame(frame);
      if (context.reduced) {
        return;
      }
      const start = performance.now() + 400;
      const tick = (at: number) => {
        const p = Math.min(1, Math.max(0, (at - start) / 1600));
        const eased = 1 - (1 - p) ** 4;
        for (const { item, digits } of items) {
          const from = item.from ?? 0;
          digits.data = FORMAT.format(
            Math.round(from + (item.value - from) * eased),
          );
        }
        if (p < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
      items.forEach(({ value }, i) =>
        value.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 600,
          delay: 300 + i * 120,
          easing: EASE,
          fill: "backwards",
        }),
      );
    },
    leave() {
      cancelAnimationFrame(frame);
      for (const { item, digits } of items) {
        digits.data = FORMAT.format(item.value);
      }
    },
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
};
