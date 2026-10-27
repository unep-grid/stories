# El Niño 2026: TODO

The first version is online at <https://unep-grid.github.io/stories/el-nino-2026/>.
Everything below is still pending before the story is final.

## Content to confirm with WMO

- [ ] **Forecast outlook** (scene 06, `forecasts-pipeline`): "El Niño conditions are
      expected to persist into early 2027" comes from the draft structure document.
      Replace it with the wording and probabilities of the latest WMO El Niño/La Niña
      Update, and cite that Update.
- [ ] **Early warning numbers** (scene 10, `early-warning-numbers`): 56 countries
      (2015) → 136 (2025) with multi-hazard early warning systems, taken from the
      draft and credited to "WMO State of the Climate, COP31 (draft)". Confirm both
      figures and the final source.
- [ ] **Rainfall signal** (scene 07, `rainfall-signal`): the regions and their seasons
      in `public/content/data/rainfall-signal.geojson` are a schematic reading of
      Ropelewski & Halpert (1987) and the NOAA CPC impact maps.
  - WMO to validate or replace them.
  - Then remove the `[TO BE COMPLETED]` notes from the scene text and the legend.
  - To change the regions, edit `scripts/data/rainfall-signal.mjs` and run it.
- [ ] **Regional outlook** (scene 07): add the WMO Global Seasonal Climate Update
      precipitation map for the coming season, plus a GPCC observed-rainfall map if
      wanted.
  - The `figure` widget is ready: put the images under `public/content/figures/`
    and add a stage widget block with `panels[].src`.
  - Get the reuse terms for the images.
- [ ] **Anchoveta figure** (scene 09): "landings fell 56% (2023 against 2022)"
      comes from the draft. Confirm it with FAO / PRODUCE Peru and link the exact
      source.
- [ ] **COP name**: the draft says COP31; check the event name used in the
      title and the communication.

## Data and method

- [ ] **Copernicus SST anomaly baseline**: the legend names the product
      (`cmems_mod_glo_phy_anfc_0.083deg-sst-anomaly_P1D-m`) but not its reference
      period. Check the Copernicus product manual and add the baseline to the legends
      and the chart key.
- [ ] **Data refresh** before release: rerun the scripts, check the numbers in the text
      against the new outputs, then update the "Data as of" date in the colophon
      (`index.html`) and `story.meta.json`.

  ```sh
  uv run scripts/data/nino.py
  uv run scripts/data/observing.py
  uv run scripts/data/section.py <YYYY-MM-DD>
  ```

  Numbers in the text that depend on the data:
  - Niño 3.4 +3.4 °C and +0.8 °C in May (`nino.json`);
  - ONI July–September +2.2 °C (`nino.json`);
  - 2,837 Argo floats (`observing.json`);
  - thermocline depths (`section.json`).

- [ ] **TAO/TRITON moorings** are drawn at their nominal design sites. Use the
      currently reporting sites instead (GTMBA / OceanOPS) if WMO prefers.

## Design and engineering

- [ ] **Search engines**: the draft is public on GitHub Pages. Add
      `<meta name="robots" content="noindex">` to `index.html` until WMO
      signs off, then remove it.
- [ ] **Opening load time**: the tinted currents load two archives (about 8 s). Show
      an untinted first frame, or preload while the title animates.
- [ ] **Argo point size**: projversor draws GeoJSON points at a fixed 4.5 px. A
      `pointRadius` style key would be a small upstream change in projversor.
- [ ] **Progress rail**: port it to `../grid-homepage` (`src/slots/story.ts`,
      `site.css`).
- [ ] **French version**: the documents keep `{en: …}` text, so adding `fr` strings
      and a locale switch is enough.
- [ ] **Deployment**: the `ghcr.io/unep-grid/stories` image is private. Make it
      public or add a pull secret on the cluster, then set up the ingress for
      `story.unepgrid.ch`.
