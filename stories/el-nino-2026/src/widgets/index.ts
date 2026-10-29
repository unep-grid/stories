import { figure } from "./figure";
import { keyNumbers } from "./keyNumbers";
import { ninoChart } from "./ninoChart";
import { pipeline } from "./pipeline";
import { platforms } from "./platforms";
import { section } from "./section";
import { walker3d } from "./walker3d/widget";
import type { Widget } from "./types";

/** Widget blocks this story renders, by their `widget` name. */
export const WIDGETS: Record<string, Widget> = {
  "nino-chart": ninoChart,
  section,
  walker3d,
  pipeline,
  figure,
  "key-numbers": keyNumbers,
  platforms,
};

export type { Widget, WidgetContext, WidgetInstance } from "./types";
