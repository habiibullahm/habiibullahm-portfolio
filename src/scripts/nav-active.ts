export function applyNavLinkActive(
  link: HTMLAnchorElement,
  match: boolean,
): void {
  if (match) {
    link.setAttribute("aria-current", "true");
    link.classList.add("text-accent");
    link.classList.remove("text-muted");
    return;
  }

  link.removeAttribute("aria-current");
  link.classList.remove("text-accent");
  link.classList.add("text-muted");
}

export function syncAllNavLinks(sectionId: string): void {
  document
    .querySelectorAll<HTMLAnchorElement>("[data-nav-link]")
    .forEach((link) => {
      applyNavLinkActive(link, link.dataset.navLink === sectionId);
    });
}
