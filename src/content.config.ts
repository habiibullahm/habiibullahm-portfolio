import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const rootRelativePath = z
  .string()
  .regex(/^\/(?!\/)/, "Path must be root-relative like /images/...");

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https:"), {
    message: "Embed URL must be https",
  });

const imagePreview = z.object({
  type: z.literal("image"),
  src: rootRelativePath,
  alt: z.string(),
});

const videoPreview = z.object({
  type: z.literal("video"),
  src: rootRelativePath,
  srcMp4: rootRelativePath.optional(),
  poster: rootRelativePath.optional(),
  alt: z.string(),
});

/** Live interactive UI (iframe). Telegram and other frame-blocked hosts will not work. */
const embedPreview = z.object({
  type: z.literal("embed"),
  src: httpsUrl,
  title: z.string(),
});

const previewItem = z.preprocess((value) => {
  if (value && typeof value === "object" && !("type" in value)) {
    return { ...value, type: "image" };
  }
  return value;
}, z.discriminatedUnion("type", [imagePreview, videoPreview, embedPreview]));

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    summary: z.string().min(1).optional(),
    showcase: z.object({
      src: rootRelativePath,
      /** Optional capture (phone screenshot or tight crop) shown inline on narrow screens. */
      mobileSrc: rootRelativePath.optional(),
      /** Intrinsic [width, height] of mobileSrc, to reserve layout space. */
      mobileSize: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
      alt: z.string().min(1),
      focusX: z.number().min(0).max(100).default(50),
      focusY: z.number().min(0).max(100).default(50),
      caption: z.string().optional(),
      /** "contain" letterboxes phone screenshots instead of cropping them. */
      fit: z.enum(["cover", "contain"]).default("cover"),
    }).optional(),
    outcome: z.string(),
    client: z.string(),
    domain: z.string(),
    /** Product-type label shown on collection cards, e.g. "AI assistant". */
    type: z.string(),
    /** Filter membership; a project may belong to several categories. */
    categories: z.array(z.enum(["ai", "web", "tools"])).min(1),
    /** Up to three short capability labels for the collection card. */
    capabilities: z.array(z.string()).min(1).max(3),
    /** Global collection order (ascending). */
    order: z.number(),
    /** Detail-page preview sizing only: ai = wide screenshots, tool-helper = phone screenshots. */
    section: z.enum(["ai", "featured", "tool-helper"]).default("featured"),
    stack: z.array(z.string()).min(1),
    /** Site-relative only (OWASP: no remote/scriptable image URLs). */
    image: rootRelativePath.optional(),
    imageAlt: z.string().default(""),
    what: z.string(),
    why: z.string(),
    how: z.string(),
    /** Screenshots, videos, or live interactive embeds on the detail page. */
    previews: z.array(previewItem).optional(),
    draft: z.boolean().default(false),
    links: z
      .object({
        live: z.string().url().optional(),
        repo: z.string().url().optional(),
      })
      .optional(),
  }),
});

export const collections = { projects };
