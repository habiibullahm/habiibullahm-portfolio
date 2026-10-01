import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homepage = readFileSync("dist/index.html", "utf8");
const groups = {
  "ai-projects": ["bidakara-ai-assistant", "agres-ai-sales-assistant"],
  projects: ["podmark", "trendplan", "task-management", "sahamku", "cv-screener", "jobmatch-helper"],
};

assert.equal([...homepage.matchAll(/data-project-slider\b/g)].length, 2);
assert.doesNotMatch(homepage, /<form\b|reveal-pending/);
for (const [section, slugs] of Object.entries(groups)) {
  const track = homepage.match(new RegExp(`<ul\\b[^>]*id="${section}-track"[\\s\\S]*?<\\/ul>`))?.[0];
  assert.ok(track, `${section}: slider is rendered`);
  assert.match(track, /tabindex="0"/);
  assert.equal([...track.matchAll(/data-project-card\b/g)].length, slugs.length);
  let previous = -1;
  for (const slug of slugs) {
    const position = track.indexOf(`href="/projects/${slug}"`);
    assert.ok(position > previous, `${slug}: correct slider and order`);
    previous = position;
    const page = readFileSync(`dist/projects/${slug}/index.html`, "utf8");
    assert.equal([...page.matchAll(new RegExp(`href="/#${section}"`, "g"))].length, 2, `${slug}: both return links target its category`);
  }
}
for (const id of ["focus", "experience", "about", "contributions", "contact"]) {
  assert.ok(homepage.includes(`id="${id}"`), `Legacy anchor #${id} remains available`);
}
assert.match(homepage, /href="mailto:[^"]+"/);
console.log("Project slider checks passed: 2 groups, 8 ordered projects, category return links, legacy anchors, and direct contact.");
