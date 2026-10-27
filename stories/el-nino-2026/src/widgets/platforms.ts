import { el, fetchData, type Widget } from "./types";

export interface ObservingData {
  argo: { count: number; days: number; asOf: string };
  moorings: { count: number; note: string };
}

interface Row {
  key: "argo" | "moorings" | "satellites";
  color: string;
  label: string;
}

const FORMAT = new Intl.NumberFormat("en-GB");

/**
 * Legend of the observing platforms drawn on the sphere, with their counts
 * from the data files. `config.show` lists the rows, in order.
 */
export const platforms: Widget = async (host, context) => {
  const { doc, config } = context;
  const data = await fetchData<ObservingData>(context, config.data);
  const rows = (config.show as Row[] | undefined) ?? [];
  host.classList.add("zs-platforms");
  const ul = el(doc, "ul");
  for (const row of rows) {
    const li = el(doc, "li");
    const dot = el(doc, "span", "zs-platforms-dot");
    dot.style.background = row.color;
    li.append(dot);
    if (row.key === "argo") {
      li.append(
        el(doc, "strong", undefined, FORMAT.format(data.argo.count)),
        ` ${row.label} · reported in the ${data.argo.days} days to ${data.argo.asOf}`,
      );
    } else if (row.key === "moorings") {
      li.append(
        el(doc, "strong", undefined, String(data.moorings.count)),
        ` ${row.label}`,
      );
    } else {
      li.append(row.label);
    }
    ul.append(li);
  }
  host.append(ul);
};
