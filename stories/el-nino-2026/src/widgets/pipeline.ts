import { EASE, el, type Widget } from "./types";

interface Step {
  title: string;
  text?: string;
}

function steps(value: unknown): Step[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("pipeline config.steps must be a non-empty array");
  }
  return value.map((step, i) => {
    if (typeof step?.title !== "string") {
      throw new Error(`pipeline config.steps[${i}].title is required`);
    }
    return step as Step;
  });
}

/**
 * A chain of steps lit one after the other along a running line, ending on
 * an outcome: from observations to the forecast people act on.
 */
export const pipeline: Widget = (host, context) => {
  const { doc, config } = context;
  const list = steps(config.steps);
  host.classList.add("zs-pipeline");
  const ol = el(doc, "ol", "zs-pipeline-list");
  const items = list.map((step, i) => {
    const li = el(doc, "li", "zs-pipeline-step");
    li.style.setProperty("--i", String(i));
    const n = el(doc, "span", "zs-pipeline-n", String(i + 1).padStart(2, "0"));
    const body = el(doc, "div", "zs-pipeline-body");
    body.append(el(doc, "strong", undefined, step.title));
    if (step.text) {
      body.append(el(doc, "span", undefined, step.text));
    }
    li.append(n, body);
    ol.append(li);
    return li;
  });
  host.append(ol);
  if (typeof config.outcome === "string") {
    const outcome = el(doc, "p", "zs-pipeline-outcome", config.outcome);
    host.append(outcome);
    items.push(outcome as unknown as HTMLLIElement);
  }

  const timers: number[] = [];
  const clear = () => timers.splice(0).forEach((t) => clearTimeout(t));
  return {
    enter() {
      clear();
      if (context.reduced) {
        items.forEach((item) => item.classList.add("is-lit"));
        return;
      }
      items.forEach((item) => item.classList.remove("is-lit"));
      items.forEach((item, i) => {
        timers.push(
          window.setTimeout(
            () => {
              item.classList.add("is-lit");
              item.animate(
                [
                  { opacity: 0.25, transform: "translateY(8px)" },
                  { opacity: 1, transform: "none" },
                ],
                { duration: 700, easing: EASE },
              );
            },
            500 + i * 520,
          ),
        );
      });
    },
    leave: clear,
    destroy: clear,
  };
};
