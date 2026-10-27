import { EASE, el, type Widget } from "./types";

interface Panel {
  /** Image file under the content folder; omitted while it is pending. */
  src?: string;
  alt: string;
  title: string;
  credit: string;
  /** Shown in place of the image while `src` is missing. */
  pending?: string;
}

function panels(value: unknown): Panel[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("figure config.panels must be a non-empty array");
  }
  value.forEach((panel, i) => {
    for (const key of ["alt", "title", "credit"]) {
      if (typeof panel?.[key] !== "string") {
        throw new Error(`figure config.panels[${i}].${key} is required`);
      }
    }
  });
  return value as Panel[];
}

/**
 * Official figures, side by side, each with its title and credit:
 * products shown as their authors made them, never redrawn.
 */
export const figure: Widget = (host, context) => {
  const { doc } = context;
  host.classList.add("zs-figures");
  const cards = panels(context.config.panels).map((panel) => {
    const card = el(doc, "figure", "zs-figure");
    const head = el(doc, "div", "zs-figure-head");
    head.append(el(doc, "span", "zs-figure-title", panel.title));
    card.append(head);
    if (panel.src) {
      const img = el(doc, "img");
      img.src = new URL(panel.src, context.contentUrl).href;
      img.alt = panel.alt;
      img.loading = "lazy";
      img.decoding = "async";
      card.append(img);
    } else {
      const frame = el(doc, "div", "zs-figure-pending");
      frame.setAttribute("role", "img");
      frame.setAttribute("aria-label", panel.alt);
      frame.append(
        el(doc, "span", undefined, panel.pending ?? "Figure to come"),
      );
      card.append(frame);
    }
    card.append(el(doc, "figcaption", undefined, panel.credit));
    host.append(card);
    return card;
  });
  return {
    enter() {
      if (context.reduced) {
        return;
      }
      cards.forEach((card, i) =>
        card.animate(
          [
            { opacity: 0, transform: "translateY(16px) scale(.98)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: 900,
            delay: 300 + i * 220,
            easing: EASE,
            fill: "backwards",
          },
        ),
      );
    },
  };
};
