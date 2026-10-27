import { parseProjversorView } from "@fxi/projversor";
import type { StoryViewsDocument } from "@fxi/zartigl/story";

/**
 * Check every `projversor` view of a views document with projversor's own
 * parser: catalog layer, preset, style, playback and geojson. Returns one
 * message per invalid view; empty when all pass. Views of other types are
 * the story's own business and are skipped.
 */
export function checkProjversorViews(views: StoryViewsDocument): string[] {
  const errors: string[] = [];
  for (const view of views.views) {
    if (view.type !== "projversor") {
      continue;
    }
    try {
      parseProjversorView(view);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}
