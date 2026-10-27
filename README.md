# unep-grid stories

Scroll stories by UNEP/GRID-Geneva, served at `story.unepgrid.ch/<story>/`, on
GitHub Pages, and as one small nginx image.

Each story is an **independent Vite app** under `stories/<slug>/`, with its
own engine, widgets and content. A story can be a projversor globe, a chart
essay or a plain scrolling document. What stories share is light:

- `packages/kit`: design tokens (after grid-homepage) and
  `checkProjversorViews`, which validates view configs with projversor's own
  parser.
- The **content contract**. `story.json` and `views.json` follow the zartigl
  story schema (`schemaVersion: 1`). Each view's `config` is a plain projversor
  view config, and its layer ids are zartigl catalog aliases. A story may add
  its own keys beside them, but never inside `config`.

| Story                                  | Status                                          |
| -------------------------------------- | ----------------------------------------------- |
| [`el-nino-2026`](stories/el-nino-2026) | WMO × UNEP/GRID. Draft: two WMO figures pending |

## Develop

```sh
npm install
npm run dev          # el-nino-2026 on http://localhost:5173
npm test             # documents, view configs, data files
npm run quality      # prettier, tsc, tests
npm run build        # dist/index.html + dist/<slug>/
npm run preview      # serve dist/
```

To work on projversor or zartigl at the same time, run
`npm link ../projversor ../zartigl`. The repository itself always depends on
the published npm versions, so CI never needs the sibling folders.

## Add a story

1. Create `stories/<slug>/` with a `package.json`, a `vite.config.ts` that has
   `base: "./"` and reads `STORY_OUT_DIR`, and an `index.html`.
2. Add `story.meta.json` (`slug`, `title`, `summary`, `date`, `accent`,
   `order`). The build lists the story on the index page from this file.
3. Run `npm install`, then `npm run build`. The Dockerfile, nginx config and
   workflows need no changes.

## Data

The data scripts are in `scripts/data/`. They are Python files with inline
dependencies, run with [uv](https://docs.astral.sh/uv/), and their outputs are
committed under `stories/<slug>/public/content/data/`:

```sh
uv run scripts/data/nino.py            # NOAA CPC weekly + ONI, Copernicus Niño 3.4 from Zarr
uv run scripts/data/observing.py       # Argo floats (last 10 days), TAO/TRITON sites
uv run scripts/data/section.py 2026-10-25   # equatorial temperature section, from Zarr
```

## Deploy

- **CI** (`.github/workflows/ci.yml`) runs quality checks and the build on
  every PR.
- **Pages** (`pages.yml`) deploys on every push to `main`. In the repository
  settings, set Settings → Pages → Source to "GitHub Actions" once.
- **Image** (`docker.yml`) publishes `ghcr.io/<owner>/<repo>` for amd64 and
  arm64 on `main`, `v*` tags and `sha-*`.

The container runs unprivileged nginx on port **8080**, with a health check at
**`/healthz`**:

| Path                | Cache                                   |
| ------------------- | --------------------------------------- |
| `/`                 | story index, `no-cache`                 |
| `/<slug>/`          | the story, `no-cache`                   |
| `/<slug>/assets/*`  | hashed build files, `immutable`, 1 year |
| `/<slug>/content/*` | documents and data, `no-cache`          |
| `/<slug>`           | 301 to `/<slug>/`                       |

```sh
docker build -t unepgrid-stories .
docker run -p 8080:8080 unepgrid-stories
```

Kubernetes: a Deployment with `containerPort: 8080`, readiness and liveness
probes on `GET /healthz`, and an Ingress for `story.unepgrid.ch`. The image is
stateless, about 20 MB, and needs no volumes, secrets or environment variables.

## License

Code: [MIT](LICENSE). Story text, figures and data extracts keep the terms of
their authors and sources (WMO, Copernicus Marine, NOAA, Argo and others),
credited in each story's colophon.
