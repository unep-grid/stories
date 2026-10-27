import "@fontsource-variable/inter-tight";
import "@unepgrid/story-kit/tokens.css";
import "./story.css";
import { storyExternalLinkAttributes } from "@fxi/zartigl/story";
import { loadDocuments, sceneCopy, text } from "./engine/documents";
import { mountStage } from "./engine/stage";

/**
 * Without WebGL2 (or when the sphere fails to start), the story still reads:
 * its copy as one article, with the references.
 */
async function mountFallback(
  host: HTMLElement,
  contentUrl: URL,
  reason: string,
) {
  const doc = host.ownerDocument;
  const docs = await loadDocuments(contentUrl, new AbortController().signal);
  const article = doc.createElement("article");
  article.className = "zs-fallback";
  const note = doc.createElement("p");
  note.className = "zs-fallback-note zs-label";
  note.textContent = reason;
  article.append(note);
  docs.story.scenes.forEach((scene, i) => {
    const copy = sceneCopy(scene);
    const section = doc.createElement("section");
    const h = doc.createElement(i === 0 ? "h1" : "h2");
    h.className = "zs-headline";
    h.textContent = text(copy?.heading ?? scene.name);
    section.append(h);
    if (copy?.text) {
      const p = doc.createElement("p");
      p.className = "zs-lede";
      p.textContent = text(copy.text);
      section.append(p);
    }
    for (const reference of copy?.references ?? []) {
      const a = doc.createElement("a");
      Object.assign(
        a,
        storyExternalLinkAttributes(reference, text(reference.label)),
      );
      const p = doc.createElement("p");
      p.className = "zs-source";
      p.append(a);
      section.append(p);
    }
    article.append(section);
  });
  host.append(article);
}

const host = document.getElementById("story")!;
const contentUrl = new URL(
  host.dataset.content ?? "./content/",
  document.baseURI,
);

mountStage(host, { contentUrl }).catch((error) => {
  console.error(error);
  void mountFallback(
    host,
    contentUrl,
    "The animated globe needs WebGL2, which this browser does not offer. Here is the story as text.",
  );
});
