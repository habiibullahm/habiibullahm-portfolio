import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const homepage = readFileSync("dist/index.html", "utf8");
const archive = readFileSync("dist/projects/index.html", "utf8");
const expected = [
  ["bidakara-ai-assistant", "ai web"],
  ["agres-ai-sales-assistant", "ai web"],
  ["task-management", "web"],
  ["podmark", "tools"],
  ["trendplan", "web"],
  ["sahamku", "ai tools"],
  ["cv-screener", "tools"],
  ["jobmatch-helper", "tools"],
];
const published = readdirSync("src/content/projects").filter(file => file.endsWith(".mdx") && !/^draft: true$/m.test(readFileSync(`src/content/projects/${file}`, "utf8")));
assert.equal(published.length, expected.length, "Expected project list matches the published project files");

const cardsOf = (html) => [...html.matchAll(/<li\b[^>]*data-project-card[^>]*data-categories="([^"]*)"[^>]*>[\s\S]*?<\/li>/g)].map(([card, categories]) => ({ card, categories }));
for (const [label, html, limited] of [["Homepage", homepage, true], ["Archive", archive, false]]) {
  const lists = [...html.matchAll(/<ul\b[^>]*data-project-collection[^>]*>/g)];
  assert.equal(lists.length, 1, `${label}: exactly one project collection`);
  assert.equal(/\bis-limited\b/.test(lists[0][0]), limited, `${label}: limit class ${limited ? "present" : "absent"}`);
  const cards = cardsOf(html);
  assert.equal(cards.length, expected.length, `${label}: renders every project from the registry`);
  let previous = -1;
  expected.forEach(([slug, categories], index) => {
    assert.equal(cards[index].categories, categories, `${label}/${slug}: categories`);
    const position = html.indexOf(`href="/projects/${slug}"`);
    assert.ok(position > previous, `${label}/${slug}: correct order`);
    previous = position;
  });
  for (const filter of ["all", "ai", "web", "tools"]) {
    assert.match(html, new RegExp(`<button[^>]*data-filter="${filter}"[^>]*aria-pressed=`), `${label}: ${filter} filter button`);
  }
  assert.match(html, /role="group"[^>]*aria-label="Filter projects"/, `${label}: filters are an accessible group`);
}
assert.equal(
  [...homepage.matchAll(/class="[^"]*beyond-desktop[^"]*"/g)].length,
  expected.length - 6,
  "Homepage All view hides projects beyond the desktop limit",
);
assert.equal(
  [...homepage.matchAll(/class="[^"]*beyond-mobile[^"]*"/g)].length,
  expected.length - 3,
  "Homepage All view hides projects beyond the mobile limit",
);
assert.equal(
  [...archive.matchAll(/class="[^"]*beyond-(?:desktop|mobile)[^"]*"/g)].length,
  expected.length - 3,
  "Archive marks limits but never applies them (no is-limited)",
);
assert.ok(homepage.includes(`View all projects (${expected.length}) `), "View-all count is derived from project data");
assert.match(homepage, /href="\/projects"/);

assert.doesNotMatch(homepage, /Selected Work|Featured|More Projects|Engineering &amp; tools|data-showcase-panel|data-project-slider/);
const kickers = [...homepage.matchAll(/class="section-kicker"[^>]*>(\d\d) \/ ([^<]+)</g)].map(([, number, name]) => `${number} / ${name.trim()}`);
assert.deepEqual(kickers, ["01 / Projects", "02 / Experience", "03 / Open Source", "04 / About", "05 / Contact"], "Visible section numbering is continuous");
for (const id of ["home", "projects", "ai-projects", "focus", "experience", "about", "contributions", "contact"]) {
  assert.ok(homepage.includes(`id="${id}"`), `Legacy anchor #${id} remains available`);
}
for (const [slug] of expected) {
  const page = readFileSync(`dist/projects/${slug}/index.html`, "utf8");
  assert.equal([...page.matchAll(/href="\/#projects"/g)].length, 2, `${slug}: return links point to the Projects section`);
}
assert.ok(homepage.indexOf('id="nav-toggle"') < homepage.indexOf('id="primary-nav"'), "Menu toggle precedes navigation links in DOM order");
assert.match(homepage, /<nav[^>]*id="primary-nav"[^>]*inert/);
assert.match(homepage, /<nav[^>]*id="desktop-nav"/);
assert.match(homepage, /href="mailto:[^"]+"/);
assert.match(homepage, /Independent demo/);
assert.match(homepage, /Demo · sample data/);
const footer = homepage.slice(homepage.indexOf("<footer"), homepage.indexOf("</footer>"));
assert.match(footer, />MH</);
assert.doesNotMatch(footer, /<a\b/, "Footer is a closing signature without links");
console.log(`Project collection checks passed: ${expected.length} registry projects, filters, limits, archive, section numbering, legacy anchors, menu order, and footer.`);
