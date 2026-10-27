import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkProjversorViews } from "@unepgrid/story-kit";
import { describe, expect, it } from "vitest";
import { geoArea } from "d3-geo";
import {
  parseDocuments,
  sceneWidgets,
  selectFeatures,
  viewOf,
} from "./engine/documents";
import { progressAt } from "./engine/progress";
import { ninoHeadline, signed, type NinoData } from "./widgets/ninoChart";
import { WIDGETS } from "./widgets";

const content = fileURLToPath(new URL("../public/content/", import.meta.url));
const json = (file: string) =>
  JSON.parse(readFileSync(content + file, "utf8")) as unknown;
const docs = parseDocuments(json("story.json"), json("views.json"));

describe("story documents", () => {
  it("pass zartigl's story checks and this story's keys", () => {
    expect(docs.story.scenes.length).toBeGreaterThan(5);
  });

  it("have projversor view configs projversor accepts", () => {
    expect(checkProjversorViews(docs.views)).toEqual([]);
  });

  it("give every scene a view", () => {
    for (const scene of docs.story.scenes) {
      expect(viewOf(docs, scene), scene.id).toBeDefined();
    }
  });

  it("reject a stage dim outside 0–1", () => {
    const views = json("views.json") as { views: { dim?: number }[] };
    views.views[0].dim = 1.5;
    expect(() => parseDocuments(json("story.json"), views)).toThrow(/dim/);
  });

  it("only use known widgets, with their data files present", () => {
    for (const scene of docs.story.scenes) {
      for (const block of sceneWidgets(scene)) {
        expect(WIDGETS[block.widget], block.widget).toBeDefined();
        const data = block.config?.data;
        if (typeof data === "string") {
          expect(existsSync(content + data), data).toBe(true);
        }
      }
    }
  });

  it("only stamp a date on views that play through time", () => {
    for (const view of docs.views.views) {
      if (view.legend?.stamp) {
        const { playback, timeRange } = view.config as Record<string, unknown>;
        expect(playback ?? timeRange, view.id).toBeDefined();
      }
    }
  });

  it("have overlay files present", () => {
    for (const view of docs.views.views) {
      for (const overlay of view.overlays ?? []) {
        expect(existsSync(content + overlay.url), overlay.url).toBe(true);
      }
    }
  });

  it("put stage widgets only on side layouts", () => {
    for (const scene of docs.story.scenes) {
      if (sceneWidgets(scene).some((b) => b.slot === "stage")) {
        expect(["left", "right"]).toContain(scene.layout);
      }
    }
  });
});

describe("Niño data", () => {
  const data = json("data/nino.json") as NinoData;

  it("ends with the latest weekly value and the strongest past week", () => {
    const headline = ninoHeadline(data);
    expect(headline.time >= "2026-10-01").toBe(true);
    expect(headline.record.event).toBeTruthy();
  });

  it("formats signed values with a true minus", () => {
    expect(signed(3.4)).toBe("+3.4");
    expect(signed(-0.5)).toBe("−0.5");
  });
});

describe("rainfall-signal regions", () => {
  const regions = json("data/rainfall-signal.geojson") as {
    features: {
      properties: { signal: string; season: string; name: string };
      geometry: Parameters<typeof geoArea>[0];
    }[];
  };

  it("are small polygons, wound for d3-geo (not the rest of the sphere)", () => {
    for (const feature of regions.features) {
      // An inverted ring covers the rest of the sphere: more than 2π sr.
      expect(geoArea(feature.geometry), feature.properties.name).toBeLessThan(
        Math.PI / 4,
      );
    }
  });

  it("each carry a signal and a season", () => {
    for (const { properties } of regions.features) {
      expect(["drier", "wetter"]).toContain(properties.signal);
      expect(properties.season).toMatch(/^[A-Z][a-z]{2}–[A-Z][a-z]{2}$/);
    }
  });

  it("split into the view's two overlays with nothing left out", () => {
    const view = docs.views.views.find((v) => v.id === "rainfall-signal")!;
    const counts = view.overlays!.map(
      (o) => selectFeatures(regions, o.where).features.length,
    );
    expect(counts.reduce((a, b) => a + b)).toBe(regions.features.length);
    expect(counts.every((n) => n > 0)).toBe(true);
  });
});

describe("progress", () => {
  it("maps the activation line onto the steps' extent", () => {
    expect(progressAt(0, 1000, 0.6, 600, 5600)).toBe(0);
    expect(progressAt(2500, 1000, 0.6, 600, 5600)).toBeCloseTo(0.5);
    expect(progressAt(9000, 1000, 0.6, 600, 5600)).toBe(1);
    expect(progressAt(100, 1000, 0.6, 600, 600)).toBe(0);
  });
});
