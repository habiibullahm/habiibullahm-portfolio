import { syncAllNavLinks } from "./nav-active";

/** Section ids observed for scroll-spy (aligned with primary nav). */
const sections = [
  "home",
  "ai-projects",
  "contributions",
  "projects",
  "engineering-projects",
  "about",
  "experience",
  "contact",
] as const;

type SectionId = (typeof sections)[number];

/**
 * While a nav click/hash jump is in flight, keep the highlight on the target.
 * IntersectionObserver mid-scroll is what made rapid header taps look inconsistent.
 */
let pinnedSection: SectionId | null = null;
let unlockTimer = 0;
let scrollGen = 0;
let lastActive: string | null = null;
let observer: IntersectionObserver | null = null;
let abort: AbortController | null = null;

function isSectionId(id: string): id is SectionId {
  return (sections as readonly string[]).includes(id);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setActive(sectionId: string) {
  if (sectionId === lastActive) return;
  lastActive = sectionId;
  syncAllNavLinks(sectionId);
}

function clearPin(gen: number) {
  if (gen !== scrollGen) return;
  window.clearTimeout(unlockTimer);
  pinnedSection = null;
}

/** Pin highlight until smooth scroll settles (scrollend) or timeout. */
function pinNav(sectionId: SectionId, ms = 1800) {
  const gen = ++scrollGen;
  pinnedSection = sectionId;
  setActive(sectionId);
  window.clearTimeout(unlockTimer);

  const onScrollEnd = () => {
    if (gen !== scrollGen) return;
    setActive(sectionId);
    // Short hold so trailing IO from the last frame cannot flip the pill.
    unlockTimer = window.setTimeout(() => clearPin(gen), 120);
  };

  window.addEventListener("scrollend", onScrollEnd, { once: true });
  unlockTimer = window.setTimeout(() => {
    window.removeEventListener("scrollend", onScrollEnd);
    onScrollEnd();
  }, ms);
}

function hashSection(): SectionId | null {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return isSectionId(id) ? id : null;
}

function goToSection(sectionId: SectionId) {
  pinNav(sectionId, prefersReducedMotion() ? 200 : 1800);
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

function teardown(): void {
  observer?.disconnect();
  observer = null;
  abort?.abort();
  abort = null;
  window.clearTimeout(unlockTimer);
  pinnedSection = null;
  lastActive = null;
}

export function initScrollSpy(): void {
  teardown();

  // Homepage-only: detail pages have no section anchors.
  if (!document.getElementById("home")) return;

  abort = new AbortController();
  const { signal } = abort;

  const initialHash = hashSection();
  if (initialHash) {
    pinNav(initialHash, 600);
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (pinnedSection) {
        setActive(pinnedSection);
        return;
      }

      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]?.target.id) {
        setActive(visible[0].target.id);
      }
    },
    { rootMargin: "-20% 0px -55% 0px", threshold: [0, 1] },
  );

  for (const id of sections) {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  }

  document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]").forEach((link) => {
    link.addEventListener(
      "click",
      (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const id = link.dataset.navLink;
        if (!id || !isSectionId(id)) return;

        const href = link.getAttribute("href") ?? "";
        // Same-page hash links: own the scroll so rapid taps cannot race the browser.
        if (href.startsWith("#")) {
          event.preventDefault();
          // replaceState: avoid stacking /#section entries so Back from a
          // project detail returns to the homepage instead of orphan hashes.
          if (window.location.hash !== `#${id}`) {
            history.replaceState(null, "", `#${id}`);
          }
          goToSection(id);
          link.blur();
          return;
        }

        // Cross-page (/#section from detail): pin for when we land; router navigates.
        pinNav(id);
      },
      { signal },
    );
  });

  window.addEventListener(
    "hashchange",
    () => {
      const id = hashSection();
      // hash-scroll.ts owns the jump; we only lock the highlight.
      if (id) pinNav(id, prefersReducedMotion() ? 200 : 1800);
    },
    { signal },
  );

  window.addEventListener(
    "popstate",
    () => {
      const id = hashSection();
      if (id) goToSection(id);
    },
    { signal },
  );
}

document.addEventListener("astro:page-load", initScrollSpy);
