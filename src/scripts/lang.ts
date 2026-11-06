function currentLang(): "id" | "en" {
  return document.documentElement.dataset.lang === "en" ? "en" : "id";
}

function syncLang() {
  const lang = currentLang();
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLButtonElement>("[data-set-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.setLang === lang));
  });
  const title = document.querySelector("title");
  if (title?.dataset.id && title.dataset.en) {
    title.textContent = lang === "en" ? title.dataset.en : title.dataset.id;
  }
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description?.dataset.id && description.dataset.en) {
    description.content = lang === "en" ? description.dataset.en : description.dataset.id;
  }
  document.querySelectorAll<HTMLElement>("[data-label-id][data-label-en]").forEach((element) => {
    const id = element.dataset.labelId;
    const en = element.dataset.labelEn;
    if (id && en) element.setAttribute("aria-label", lang === "en" ? en : id);
  });
}

function setLang(lang: "id" | "en") {
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  try {
    localStorage.setItem("lang", lang);
  } catch {
    /* private mode */
  }
  syncLang();
  document.dispatchEvent(new CustomEvent("lang-change"));
}

let bound = false;

function initLang() {
  syncLang();
  if (bound) return;
  bound = true;
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-set-lang]") : null;
    if (!button) return;
    const next = button.dataset.setLang === "en" ? "en" : "id";
    if (next === currentLang()) return;
    setLang(next);
  });
}

document.addEventListener("astro:page-load", initLang);
