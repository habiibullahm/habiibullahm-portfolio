export const site = {
  name: "Muhammad Habiibullah",
  initials: "MH",
  eyebrow: "AI & FULL-STACK ENGINEER · JAKARTA, INDONESIA",
  statement: "Building practical products from idea to production.",
  summary:
    "I build production-ready web applications and practical AI systems across frontend, backend, databases, RAG, LLM integrations, automation, and deployment.",
  technologies: "TypeScript · React · Node.js · PostgreSQL · Spring Boot · RAG · LLMs",
  about: {
    lead: "Product-minded engineering, from application architecture to applied AI.",
    paragraphs: [
      "I'm Habib, a Jakarta-based engineer with a Business Management degree (GPA 3.61) and a practical, product-minded approach to software. I enjoy working out what a product needs and building the systems behind it.",
      "At PT. Dans Multi Pro, I develop end-to-end enterprise applications for telecommunications clients, spanning Java and Spring Boot services, PostgreSQL, and React and React Native applications.",
      "I also build applied AI products: business assistants that ground responses in useful information and a podcast application that summarizes real transcripts. My focus is building useful features with dependable behavior, from frontend and backend through deployment.",
    ],
  },
  email: "mr.habiibullahm@gmail.com",
  aiServicesUrl: "https://ai.habiibullahm.my.id/",
  socials: {
    github: "https://github.com/habiibullahm",
    linkedin: "https://www.linkedin.com/in/muhammad-habibullah/",
  },
  seo: {
    title: "Muhammad Habiibullah — AI & Full-Stack Engineer",
    description:
      "AI & Full-Stack Engineer building production-ready web applications, RAG systems, AI assistants, automation, and scalable backend systems.",
  },
  contactBlurb:
    "Currently a Full-Stack Developer at PT. Dans Multi Pro and open to opportunities in AI and full-stack engineering.",
} as const;

export const nav = [
  { id: "projects", label: "Work", short: "Work", href: "#projects" },
  { id: "ai-projects", label: "AI Projects", short: "AI projects", href: "#ai-projects" },
  { id: "experience", label: "Experience", short: "Experience", href: "#experience" },
  { id: "about", label: "About", short: "About", href: "#about" },
  { id: "contact", label: "Contact", short: "Contact", href: "#contact" },
] as const;

export const focusAreas = [
  {
    title: "Product Engineering",
    blurb:
      "React, TypeScript, responsive web applications, and progressive web apps.",
  },
  {
    title: "Applied AI",
    blurb:
      "RAG, LLM integrations, embeddings, grounded AI assistants, prompt design, evaluation, and guardrails.",
  },
  {
    title: "Backend & APIs",
    blurb:
      "Node.js, Java, Spring Boot, REST APIs, authentication, and API design.",
  },
  {
    title: "Data & Platforms",
    blurb:
      "PostgreSQL, Prisma, Redis, Docker, and CI/CD.",
  },
  {
    title: "Delivery & Reliability",
    blurb:
      "Vercel, VPS deployments, testing, production debugging, and reliable releases.",
  },
] as const;

export const contributions = [
  {
    title: "Freshdesk Ticket Summary Actions",
    org: "PipedreamHQ (OSS)",
    outcome:
      "Merged PR #20969 — Freshdesk Ticket Summary actions on Pipedream (11k+ ★ open-source repo).",
    href: "https://github.com/PipedreamHQ/pipedream/pull/20969",
  },
] as const;

export const education = [
  {
    label: "Bachelor",
    title: "Business Management · GPA 3.61",
    org: "University of Informatics and Business Indonesia",
  },
] as const;

export const experience = [
  {
    role: "Full-Stack Developer",
    company: "PT. Dans Multi Pro — Jakarta",
    years: "Apr 2024 – Present",
    stack: [
      "Java",
      "Spring Boot",
      "PostgreSQL",
      "JWT/RBAC",
      "React",
      "React Native",
    ],
    win: "Secure Spring Boot APIs (JWT/RBAC, PostgreSQL) and React / React Native partner apps for telecom clients — including AI chat actions for core business flows.",
  },
] as const;

/** Allow only https/mailto for external destinations (OWASP A03). */
export function safeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/** Site-relative asset paths only (blocks protocol-relative //… URLs). */
export function safeSitePath(path: string): string | null {
  if (path.startsWith("/") && !path.startsWith("//")) {
    return path;
  }
  return null;
}
