let observer: IntersectionObserver | null = null;

function initScrollReveal() {
  observer?.disconnect();
  observer = null;

  const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (!targets.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  observer = new IntersectionObserver(
    (entries, currentObserver) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("reveal-pending");
        currentObserver.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );

  for (const target of targets) {
    target.classList.add("reveal-pending");
    observer.observe(target);
  }
}

document.addEventListener("astro:page-load", initScrollReveal);
