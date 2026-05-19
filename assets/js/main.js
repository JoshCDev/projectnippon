(() => {
  "use strict";

  const APP_VERSION = "20260520-5";

  const utils = {
    qs(selector, scope = document) {
      return scope.querySelector(selector);
    },
    qsa(selector, scope = document) {
      return Array.from(scope.querySelectorAll(selector));
    },
    create(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (typeof text === "string") element.textContent = text;
      return element;
    },
    async loadJSON(path) {
      const url = new URL(path, window.location.href);
      url.searchParams.set("v", APP_VERSION);
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error(`Gagal memuat ${path}`);
      return response.json();
    }
  };

  window.NIPPON = utils;

  function initNavigation() {
    const toggle = utils.qs(".nav-orb");
    const nav = utils.qs("[data-nav]");
    const currentPage = document.body.dataset.page;

    utils.qsa("[data-nav] .nav-link").forEach((link) => {
      if (link.dataset.page === currentPage) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    });

    if (!toggle || !nav) return;

    const closeMenu = () => {
      document.body.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      const isOpen = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("a")) closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Node)) return;
      if (!nav.contains(event.target) && !toggle.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 960) closeMenu();
    });
  }

  function renderStats(stats) {
    const root = utils.qs("#stats-grid");
    if (!root) return;
    root.innerHTML = "";
    stats.forEach((stat) => {
      const card = utils.create("article", "stat-card");
      card.innerHTML = `
        <strong>${stat.value}</strong>
        <h3>${stat.label}</h3>
        <p class="muted">${stat.detail}</p>
      `;
      root.append(card);
    });
  }

  function renderPillars(pillars) {
    const root = utils.qs("#pillar-grid");
    if (!root) return;
    root.innerHTML = "";
    pillars.forEach((pillar) => {
      const card = utils.create("a", "pillar-card");
      card.href = pillar.link;
      card.setAttribute("aria-label", pillar.title + " - " + pillar.description);

      const iconBlock = pillar.icon
        ? `<span class="pillar-icon"><img src="${pillar.icon}" alt=""></span>`
        : "";
      const labelBlock = `<div class="pillar-label"><h3>${pillar.title}</h3></div>`;
      const photoBlock = pillar.image
        ? `<div class="pillar-photo"><img src="${pillar.image}" alt="${pillar.alt || ''}"></div>`
        : `<div class="pillar-photo pillar-photo-empty"></div>`;

      card.innerHTML = iconBlock + labelBlock + photoBlock;
      root.append(card);
    });
  }

  function renderPreviews(previews) {
    const root = utils.qs("#preview-grid");
    if (!root) return;
    root.innerHTML = "";
    previews.forEach((preview) => {
      const article = utils.create("article", "card");
      article.innerHTML = `
        <div class="card-media">
          <img src="${preview.image}" alt="${preview.alt}">
        </div>
        <div class="card-body">
          <div class="chip-list">${preview.tags.map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
          <h3>${preview.title}</h3>
          <p class="muted">${preview.description}</p>
          <a class="preview-card-link" href="${preview.link}">${preview.cta}</a>
        </div>
      `;
      root.append(article);
    });
  }

  function renderQuickFacts(facts) {
    const root = utils.qs("#quick-facts-list");
    if (!root) return;
    root.innerHTML = "";
    facts.forEach((fact) => {
      const item = utils.create("li");
      item.textContent = fact;
      root.append(item);
    });
  }

  function renderFestivalNotes(festivals) {
    const root = utils.qs("#festival-list");
    if (!root) return;
    root.innerHTML = "";
    festivals.forEach((festival) => {
      const item = utils.create("li");
      item.innerHTML = `<strong>${festival.name}:</strong> ${festival.detail}`;
      root.append(item);
    });
  }

  async function initHomePage() {
    if (document.body.dataset.page !== "home") return;

    try {
      const data = await utils.loadJSON("assets/data/site.json");

      const ctaTitle = utils.qs("#cta-title");
      const ctaText = utils.qs("#cta-text");
      if (ctaTitle) ctaTitle.textContent = data.cta.title;
      if (ctaText) ctaText.textContent = data.cta.text;

      renderStats(data.stats);
      renderPillars(data.pillars);
      renderPreviews(data.previews);
      renderQuickFacts(data.quickFacts);
      renderFestivalNotes(data.festivals);
    } catch (error) {
      const target = utils.qs("#home-data-root");
      if (target) {
        target.innerHTML = `<div class="error-state">Konten landing belum dapat dimuat. Pastikan situs dijalankan lewat server lokal.</div>`;
      }
      console.error(error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNavigation();

    const yearNode = utils.qs("[data-current-year]");
    if (yearNode) yearNode.textContent = String(new Date().getFullYear());

    initHomePage();
  });
})();
