import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const readPage = (path) => readFileSync(join("dist", path), "utf8");
const homepage = readPage("index.html");
const sections = new Set(
  [...homepage.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id),
);

assert.match(homepage, /Muhammad Habiibullah — AI &amp; Full-Stack Engineer/);
assert.match(homepage, /<meta name="twitter:card" content="summary_large_image"/);
assert.match(homepage, /<link rel="canonical" href="https:\/\/habiibullahm\.my\.id\//);
assert.match(homepage, /Bidakara AI Assistant/);
assert.match(homepage, /AGRES AI Sales Assistant/);
for (const file of ["bidakara-app-icon.svg", "task-management-logo.webp", "podmark.svg", "trendplan-mark.webp", "sahamku-logo.webp"]) {
  assert.ok(homepage.includes(`<img class="card-mark" src="/images/projects/${file}"`), `${file}: homepage collection renders its mark`);
  assert.ok(existsSync(join("dist", "images", "projects", file)), `${file} is published`);
}
for (const file of ["bidakara-card.webp", "agres-ai-sales-assistant-preview.webp", "task-management-card.webp", "podmark-card.webp", "trendplan-card.webp", "sahamku-card.webp", "cv-screener-preview-thumb.webp", "jobmatch-helper-preview-thumb.webp"]) {
  assert.ok(!homepage.includes(`/images/projects/${file}`), `${file}: screenshots stay on detail pages, not the collection`);
}
assert.ok(existsSync(join("dist", "projects", "index.html")), "Project archive /projects exists");
assert.match(homepage, /<img src="\/images\/projects\/habib-profile-transparent\.webp" alt="Portrait of/, "Hero renders the transparent portrait");
assert.equal(
  [...homepage.matchAll(/href="https:\/\/ai\.habiibullahm\.my\.id\//g)].length,
  1,
  "AI Services appears in the hero",
);
assert.match(readPage("resume/index.html"), /Print \/ Save PDF/);

for (const id of ["projects", "experience", "about", "contact"]) {
  assert.ok(sections.has(id), `Homepage navigation target #${id} exists`);
}

for (const slug of [
  "agres-ai-sales-assistant",
  "bidakara-ai-assistant",
  "cv-screener",
  "jobmatch-helper",
  "podmark",
  "sahamku",
  "task-management",
  "trendplan",
]) {
  const path = `projects/${slug}/index.html`;
  assert.ok(existsSync(join("dist", path)), `Project page ${slug} exists`);
  const projectPage = readPage(path);
  assert.match(projectPage, /rel="canonical"/);
  assert.match(projectPage, /<title>/);
}

for (const [, target] of homepage.matchAll(/\bhref="([^"]+)"/g)) {
  if (target.startsWith("#")) {
    assert.ok(sections.has(target.slice(1)), `Homepage anchor ${target} exists`);
  }
}

const pages = readdirSync("dist", { recursive: true }).filter((path) => path.endsWith(".html"));
for (const path of pages) {
  const page = readPage(path);
  for (const [, attributes] of page.matchAll(/<script\b([^>]*)>/g)) {
    if (/\btype="module"/.test(attributes)) {
      assert.match(attributes, /\bsrc="/, `${path}: module scripts remain compatible with CSP`);
    }
  }
  for (const [, target] of page.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (!target.startsWith("/") && !target.startsWith("#")) continue;
    const url = new URL(target, `https://habiibullahm.my.id/${path.replaceAll("\\", "/")}`);
    const destination = decodeURIComponent(url.pathname).slice(1);
    const file = extname(destination) ? destination : join(destination, "index.html");
    assert.ok(existsSync(join("dist", file)), `${path}: ${target} resolves`);
    if (url.hash && file.endsWith(".html")) {
      const ids = new Set([...readPage(file).matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
      assert.ok(ids.has(decodeURIComponent(url.hash.slice(1))), `${path}: ${target} anchor exists`);
    }
  }
}

console.log(`Portfolio checks passed: SEO, navigation, resume, 8 project pages, and local links/assets across ${pages.length} pages.`);
