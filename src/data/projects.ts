import { getCollection } from "astro:content";

export const projectCategories = [
  { id: "all", label: "All" },
  { id: "ai", label: "AI" },
  { id: "web", label: "Web" },
  { id: "tools", label: "Tools" },
] as const;

/** How many projects the unfiltered homepage "All" view shows per breakpoint. */
export const homeLimit = { desktop: 6, mobile: 3 } as const;

export async function getProjects() {
  return (await getCollection("projects", ({ data }) => !data.draft)).sort((a, b) => a.data.order - b.data.order);
}
