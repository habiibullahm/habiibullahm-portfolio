let abort: AbortController | null = null;
const revealed = new WeakSet<HTMLElement>();

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
  const cancel = () => {
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
  };
  const reveal = (element: HTMLElement, delay = 0) => {
    if (revealed.has(element)) return;
    revealed.add(element);
    const hash = location.hash.slice(1);
    if (reduce.matches || printing || element.contains(document.activeElement) || element.closest("section")?.id === hash) return;
    const animation = element.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 400, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    animations.set(element, animation);
    animation.onfinish = animation.oncancel = () => animations.delete(element);
  };

  if (!location.hash && window.scrollY < 40) {
    home.querySelectorAll<HTMLElement>(".hero-content > div > *, .hero-content > img").forEach((element, index) => reveal(element, index * 60));
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      reveal(entry.target as HTMLElement);
    }
  }, { rootMargin: "0px 0px -5% 0px", threshold: 0.05 });
  document.querySelectorAll<HTMLElement>("#main > section:not(#home) .portfolio-section > *").forEach((element) => {
    if (!revealed.has(element)) observer.observe(element);
  });

  document.addEventListener("focusin", (event) => {
    if (!(event.target instanceof Node)) return;
    for (const [element, animation] of animations) {
      if (element.contains(event.target)) animation.cancel();
    }
  }, { signal });
  reduce.addEventListener("change", () => { if (reduce.matches) cancel(); }, { signal });
  window.addEventListener("hashchange", cancel, { signal });
  window.addEventListener("beforeprint", () => { printing = true; cancel(); }, { signal });
  window.addEventListener("afterprint", () => { printing = false; }, { signal });
  signal.addEventListener("abort", () => { observer.disconnect(); cancel(); }, { once: true });
}

document.addEventListener("astro:before-swap", () => abort?.abort());
document.addEventListener("astro:page-load", initMotion);
