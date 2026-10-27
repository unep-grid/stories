#!/usr/bin/env node
/**
 * Build every story under stories/ into dist/<slug>/, then write
 * dist/index.html: one card per story, from its story.meta.json.
 *
 * Each story is an independent Vite app with a relative base, so the same
 * output serves under story.unepgrid.ch/<slug>/ and on GitHub Pages under
 * /<repo>/<slug>/.
 *
 * Usage: node scripts/build-all.mjs [slug ...]   (all stories by default)
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const only = process.argv.slice(2);

const stories = readdirSync(join(root, "stories"), { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      existsSync(join(root, "stories", d.name, "story.meta.json")),
  )
  .map((d) => {
    const dir = join(root, "stories", d.name);
    const meta = JSON.parse(readFileSync(join(dir, "story.meta.json"), "utf8"));
    if (meta.slug !== d.name) {
      throw new Error(
        `stories/${d.name}: story.meta.json slug must be "${d.name}"`,
      );
    }
    return { dir, meta };
  })
  .filter(({ meta }) => only.length === 0 || only.includes(meta.slug))
  .sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99));

if (only.length === 0) {
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dist, { recursive: true });

for (const { dir, meta } of stories) {
  console.log(`\n▸ ${meta.slug}`);
  execFileSync("npx", ["vite", "build"], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, STORY_OUT_DIR: join(dist, meta.slug) },
  });
}

const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const date = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const all = readdirSync(dist, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      existsSync(join(root, "stories", d.name, "story.meta.json")),
  )
  .map((d) =>
    JSON.parse(
      readFileSync(join(root, "stories", d.name, "story.meta.json"), "utf8"),
    ),
  )
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

const cards = all
  .map(
    (m) => `      <li>
        <a class="card" href="./${escape(m.slug)}/" style="--accent: ${escape(m.accent ?? "#7fd4ff")}">
          <span class="meta">${escape(date(m.date))}${m.partners ? ` · ${escape(m.partners.join(" × "))}` : ""}</span>
          <span class="title">${escape(m.title)}</span>
          <span class="summary">${escape(m.summary)}</span>
          <span class="go">Read the story →</span>
        </a>
      </li>`,
  )
  .join("\n");

const tokens = readFileSync(join(root, "packages/kit/src/tokens.css"), "utf8");
writeFileSync(
  join(dist, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#030409" />
    <title>Stories · UNEP/GRID-Geneva</title>
    <meta name="description" content="Data stories from UNEP/GRID-Geneva." />
    <style>
${tokens}
      body { margin: 0; min-height: 100vh; }
      main { max-width: 1200px; padding: 14vh var(--zs-gutter) 10vh; }
      .eyebrow { color: var(--zs-accent); margin: 0 0 1.4em; }
      ul { display: grid; gap: 1px; margin: 10vh 0 0; padding: 0; list-style: none;
           border-top: 1px solid var(--zs-line); }
      .card { display: grid; gap: 10px; padding: 36px 0; text-decoration: none;
              border-bottom: 1px solid var(--zs-line); }
      .card .meta { font-size: 11px; font-weight: 600; letter-spacing: .24em;
                    text-transform: uppercase; color: var(--accent); }
      .card .title { font-size: clamp(2rem, 4.4vw, 4rem); font-weight: 800;
                     line-height: .95; letter-spacing: -.04em; }
      .card .summary { max-width: 52ch; line-height: 1.5; color: var(--zs-muted); }
      .card .go { font-size: 13px; color: var(--zs-ink); opacity: .6;
                  transition: opacity 300ms var(--zs-ease), transform 300ms var(--zs-ease); }
      .card:hover .go, .card:focus-visible .go { opacity: 1; transform: translateX(6px); }
      footer { padding: 0 var(--zs-gutter) 8vh; font-size: 12px; color: var(--zs-muted); }
    </style>
  </head>
  <body class="zs-page">
    <main>
      <p class="eyebrow zs-label">UNEP/GRID-Geneva</p>
      <h1 class="zs-headline">Stories</h1>
      <p class="zs-lede">Data stories on the state of the planet, built from open observations and models.</p>
      <ul>
${cards}
      </ul>
    </main>
    <footer>© UNEP/GRID-Geneva</footer>
  </body>
</html>
`,
);
console.log(
  `\n✓ dist/index.html with ${all.length} ${all.length === 1 ? "story" : "stories"}`,
);
