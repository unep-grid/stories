# Stories agent guide

This file applies to the whole repository unless a deeper `AGENTS.md` provides
more specific instructions. The [README](README.md) describes the layout, the
content contract, the data scripts and the deployment.

## Working method

- Keep stories independent: each `stories/<slug>/` owns its engine, widgets,
  styles and content. Move code to `packages/kit` only when a second story
  needs it.
- Keep the content contract: `story.json` and `views.json` follow the zartigl
  story schema, and a view's `config` stays a plain projversor view config. A
  story's own keys go beside `config`, documented and checked in its
  `documents.ts`.
- Do not edit generated data under `stories/<slug>/public/content/data/` by
  hand. Change the script in `scripts/data/` and run it again.
- Depend on the published npm versions of projversor and zartigl. Use
  `npm link` for local work, never in a commit.

## Validation

- Follow `.prettierrc.json`: 80 columns, double quotes, trailing commas,
  `bracketSameLine`, `arrowParens: "always"`. `.prettierignore` skips the
  lockfile, `dist`, `_drafts` and the generated story data.
- Before handoff, run `npm run format`, then `npm run quality` (Prettier check,
  `tsc` in every workspace, Vitest) and `npm run build`. CI runs the same
  `quality` and `build` on every pull request.
- Test the essential behavior of documents, view configs, data files and pure
  helpers in the story's `content.test.ts`.
- Check a visual or motion change in a browser on the dev server, at desktop
  and phone widths.
- Run `git diff --check` and report the validations performed and any that
  could not be run.

## Dependencies

- projversor depends on a zartigl range, so bump both together, in the story
  and in `packages/kit`, then run the full validation and check the story in a
  browser.

## Commits

- Use Conventional Commits only, scoped by story slug when the change belongs
  to one story, e.g. `feat(el-nino-2026): …`; dependency bumps as
  `build: depend on zartigl 0.10.2`.
- Keep commit messages to one line.
- Do not add co-author attribution unless requested.
