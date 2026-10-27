# El Niño 2026: TODO

The first version is online at <https://unep-grid.github.io/stories/el-nino-2026/>.
Unchecked items remain pending before the story is final.

## Completed editorial review

- [x] Show the seasonal outlook as pending; explain the ensemble's range of outcomes.
- [x] Restore seasonal, probabilistic rainfall wording and a visible WMO validation notice.
- [x] Describe DHW as thermal exposure and mortality risk, not observed damage.
- [x] Use conditional upwelling/productivity wording, explain chlorophyll-a, and retain
      fisheries qualifications. The absolute modelled chlorophyll sequence does not
      establish a decline without a comparable baseline.
- [x] Label daily/weekly chart lines as numeric reference levels and explain that
      event classification requires sustained seasonal-index conditions and atmospheric coupling.
- [x] Remove unsupported catch and early-warning statistics pending exact sources.

This remains a compact adaptation of the supplied MapX export:

- The original GPCC precipitation observations are replaced by schematic historical
  ENSO rainfall tendencies, not a 2026 seasonal outlook.
- The original 1985–2018 time-between-heat-stress-events view is replaced by 2026
  NOAA Degree Heating Weeks. These are different quantities and periods.
- The risk dashboard and Honduras case remain outside this adaptation.

## Content to confirm with WMO

- [ ] **Forecast outlook** (`forecasts-pipeline`): replace the visible pending notice
      with a verified WMO El Niño/La Niña Update, including its issuing date, target
      season, probabilities and exact citation. The draft's persistence-into-2027
      claim has been removed.
- [ ] **Early warning numbers** (`early-warning`): 56 countries
      (2015) → 136 (2025) with multi-hazard early warning systems, taken from the
      draft and credited to "WMO State of the Climate, COP31 (draft)". Confirm both
      figures and the final source before restoring the removed numbers widget or
      the "more than doubled" claim.
- [ ] **Rainfall signal** (scene 07, `rainfall-signal`): the regions and their seasons
      in `public/content/data/rainfall-signal.geojson` are a schematic reading of
      Ropelewski & Halpert (1987) and the NOAA CPC impact maps.
  - WMO to validate or replace them.
  - Then update the validation notices in the scene text and legend.
  - To change the regions, edit `scripts/data/rainfall-signal.mjs` and run it.
- [ ] **Regional outlook** (scene 07): add the WMO Global Seasonal Climate Update
      precipitation map for the coming season, plus a GPCC observed-rainfall map if
      wanted.
  - The `figure` widget is ready: put the images under `public/content/figures/`
    and add a stage widget block with `panels[].src`.
  - Get the reuse terms for the images.
- [ ] **Anchoveta figure** (scene 09): "landings fell 56% (2023 against 2022)"
      comes from the draft and has been removed, along with its generic citation.
      Confirm it with FAO / PRODUCE Peru and link the exact source before restoring
      it; retain the fisheries qualification.
- [ ] **COP name**: the draft says COP31; check the event name used in the
      title and the communication.

## Data and method

- [x] **Copernicus SST anomaly baseline**: daily SST minus the GLORYS12
      (GLOBAL_MULTIYEAR_PHY_001_030) climatology over 1993–2016, per
      CMEMS-GLO-QUID-001-024 §II.5. Now stated in the legends, the chart key and
      `nino.json`.
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
- [x] **Opening load time**: fixed with projversor 0.3.0.
  - The story builds the instance on the opening view, so there is no camera
    morph.
  - `waitForLandDetail: false` lets init() start before the detailed
    coastline.
  - The opening archive is preloaded before init().
  - With a warm cache, the opening reaches full density in about 2 s (about
    4 s before).
- [x] **Argo point size**: uses the new projversor 0.3.0 `radius` style key:
      Argo floats at 2 px, moorings at 3.5 px.
- [x] **Progress rail**: ported to `../grid-homepage`, as a local commit there,
      not pushed.
- [ ] **French version**: the documents keep `{en: …}` text, so adding `fr` strings
      and a locale switch is enough.
- [ ] **Deployment**: the `ghcr.io/unep-grid/stories` image is private. Make it
      public or add a pull secret on the cluster, then set up the ingress for
      `story.unepgrid.ch`.
