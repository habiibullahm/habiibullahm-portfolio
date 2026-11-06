import { getCollection, type CollectionEntry } from "astro:content";
import { safeSitePath } from "./site";

export const projectCategories = [
  { id: "all", label: "All", labelId: "Semua" },
  { id: "ai", label: "AI", labelId: "AI" },
  { id: "web", label: "Web", labelId: "Web" },
  { id: "tools", label: "Tools", labelId: "Alat" },
] as const;

/** How many projects the unfiltered homepage "All" view shows per breakpoint. */
export const homeLimit = { desktop: 6, mobile: 3 } as const;

export async function getProjects() {
  return (await getCollection("projects", ({ data }) => !data.draft)).sort((a, b) => a.data.order - b.data.order);
}

/**
 * Collection identity mark, in priority order: `mark` (an existing app icon or a tight crop of the real logo),
 * the project's real logo (`image`), then a plain monogram of its title. Never a generated or invented logo.
 */
export function getProjectMark({ title, image, mark }: CollectionEntry<"projects">["data"]) {
  const source = mark ?? image;
  const logo = source ? safeSitePath(source) : null;
  return logo ? { logo, monogram: null } : { logo: null, monogram: title.charAt(0).toUpperCase() };
}
