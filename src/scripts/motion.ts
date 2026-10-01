let abort: AbortController | null = null;
// Stable keys keep reveals completed when Astro remounts the homepage.
const revealed = new Set<string>();
let heroSeen = false;

function initMotion() {
  abort?.abort();
  abort = null;
  const home = document.getElementById("home");
  if (!home || !("animate" in Element.prototype)) return;
  abort = new AbortController();
  const { signal } = abort;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Map<HTMLElement, Animation>();
  let printing = window.matchMedia("print").matches;
  const cancel = () => { for (const animation of animations.values()) animation.cancel(); animations.clear(); };
  const reveal = (element: HTMLElement, key: string, delay = 0, line = false) => {
    if (revealed.has(key)) return;
    revealed.add(key);
    const anchor = location.hash.slice(1);
    const target = anchor ? document.getElementById(anchor) : null;
    if (reduce.matches || printing || element.contains(document.activeElement) || target?.closest("section") === element.closest("section")) return;
    const frames = line
      ? [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }]
      : [{ opacity: 0, transform: `translateY(${key.startsWith("hero-") ? 12 : 20}px)` }, { opacity: 1, transform: "none" }];
    const animation = element.animate(frames, {duration: 400, delay, fill: "backwards", easing: "cubic-bezier(0.22, 1, 0.36, 1)"});
    animations.set(element, animation);
    animation.onfinish = animation.oncancel = () => animations.delete(element);
  };
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!heroSeen && !location.hash && window.scrollY < 40 && entry?.type !== "back_forward") {
    home.querySelectorAll<HTMLElement>("[data-hero-reveal]").forEach((element, index) => reveal(element, `hero-${index}`, index * 60));
  }
  heroSeen = true;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const element = entry.target as HTMLElement;
      reveal(element, element.dataset.reveal ?? element.dataset.lineReveal ?? "", 0, element.hasAttribute("data-line-reveal"));
    }
  }, {rootMargin: "0px 0px -5% 0px", threshold: .05});
  document.querySelectorAll<HTMLElement>("[data-reveal], [data-line-reveal]").forEach(element => {
    if (!revealed.has(element.dataset.reveal ?? element.dataset.lineReveal ?? "")) observer.observe(element);
  });
  document.addEventListener("focusin", event => {
    if (!(event.target instanceof Node)) return;
    for (const [element, animation] of animations) if (element.contains(event.target)) animation.cancel();
  }, {signal});
  reduce.addEventListener("change", () => { if (reduce.matches) cancel(); }, {signal});
  window.addEventListener("hashchange", cancel, {signal});
  window.addEventListener("beforeprint", () => { printing = true; cancel(); }, {signal});
  window.addEventListener("afterprint", () => { printing = false; }, {signal});
  signal.addEventListener("abort", () => {observer.disconnect(); cancel();}, {once: true});
}
document.addEventListener("astro:before-swap", () => abort?.abort());
document.addEventListener("astro:page-load", initMotion);
