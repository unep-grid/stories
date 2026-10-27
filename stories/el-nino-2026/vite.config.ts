import { defineConfig } from "vite";

// Relative base: the same build serves under story.unepgrid.ch/<slug>/ and
// <user>.github.io/<repo>/<slug>/.
export default defineConfig({
  base: "./",
  build: {
    outDir: process.env.STORY_OUT_DIR ?? "dist",
    emptyOutDir: true,
    // projversor ships its 50 m land geometry as one ~550 kB chunk.
    chunkSizeWarningLimit: 700,
  },
});
