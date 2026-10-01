import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homepage = readFileSync("dist/index.html", "utf8");
const groups = [
  ["bidakara-ai-assistant", "agres-ai-sales-assistant", "task-management"],
  ["podmark", "trendplan", "sahamku", "cv-screener", "jobmatch-helper"],
];
const lists = [...homepage.matchAll(/<ul\b[^>]*data-project-index[^>]*>[\s\S]*?<\/ul>/g)].map(([list]) => list);
assert.equal(lists.length, 2, "Selected and supporting project indexes are rendered");
assert.equal([...homepage.matchAll(/data-showcase-panel/g)].length, 1, "One shared showcase panel serves Selected Work only");
assert.equal([...lists[0].matchAll(/<figure class="row-showcase"/g)].length, 3, "Each selected project has an inline showcase for narrow screens");
assert.doesNotMatch(lists[1], /row-showcase/, "Supporting projects stay text-led");
assert.doesNotMatch(homepage, /data-project-slider|data-slider-track|reveal-pending/);
for (const [index, slugs] of groups.entries()) {
  const list = lists[index];
  assert.equal([...list.matchAll(/data-project-row\b/g)].length, slugs.length);
  let previous = -1;
  for (const slug of slugs) {
    const position = list.indexOf(`href="/projects/${slug}"`);
    assert.ok(position > previous, `${slug}: correct project index and order`);
    previous = position;
    const page = readFileSync(`dist/projects/${slug}/index.html`, "utf8");
    const anchor = slug.endsWith("assistant") ? "ai-projects" : "projects";
    assert.equal([...page.matchAll(new RegExp(`href="/#${anchor}"`, "g"))].length, 2, `${slug}: category return links remain available`);
  }
}
for (const id of ["home", "projects", "ai-projects", "focus", "experience", "about", "contributions", "contact"]) {
  assert.ok(homepage.includes(`id="${id}"`), `Legacy anchor #${id} remains available`);
}
assert.ok(homepage.indexOf('id="nav-toggle"') < homepage.indexOf('id="primary-nav"'), "Menu toggle precedes navigation links in DOM order");
assert.match(homepage, /<nav[^>]*id="primary-nav"[^>]*inert/);
assert.match(homepage, /href="mailto:[^"]+"/);
assert.match(homepage, /Independent demo/);
assert.match(homepage, /Demo · sample data/);
console.log("Project index checks passed: 8 ordered projects, preserved return links/anchors, demo labels, menu DOM order, and direct contact.");
