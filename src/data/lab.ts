import { getCollection } from "astro:content";

/** How many notes the unfiltered homepage shows. */
export const labHomeLimit = 3;

export async function getLabEntries() {
  return (await getCollection("lab", ({ data }) => !data.draft)).sort((a, b) => {
    const byDate = new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
    return byDate || a.data.title.localeCompare(b.data.title);
  });
}

const tagId: Record<string, string> = {
  Infrastructure: "Infrastruktur",
  "AI Ops": "Operasi AI",
  Billing: "Tagihan",
  Networking: "Jaringan",
};

export function labFilters(entries: Awaited<ReturnType<typeof getLabEntries>>) {
  const tags: string[] = [];
  for (const entry of entries) {
    for (const tag of entry.data.tags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  return [
    { id: "all", label: "All", labelId: "Semua" },
    ...tags.map((tag) => ({ id: tag, label: tag, labelId: tagId[tag] ?? tag })),
  ];
}
