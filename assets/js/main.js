(() => {
  "use strict";

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  function initNav() {
    const toggle = $(".nav-orb");
    const nav = $("[data-nav]");
    const page = document.body.dataset.page || "home";

    $$("[data-nav] .nav-link").forEach((link) => {
      if (link.dataset.page === page) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    });

    if (!toggle || !nav) return;

    const setOpen = (open) => {
      document.body.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => {
      setOpen(!document.body.classList.contains("nav-open"));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("click", (e) => {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 960) setOpen(false);
    });
  }

  function initRegionCarousel() {
    const root = $("[data-region-carousel]");
    if (!root) return;

    const slides = $$("[data-region-slide]", root);
    const prev = $("[data-region-prev]", root);
    const next = $("[data-region-next]", root);
    let current = 0;

    const show = (index) => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === current;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
    };

    if (!slides.length) return;
    prev?.addEventListener("click", () => show(current - 1));
    next?.addEventListener("click", () => show(current + 1));
    show(0);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initRegionCarousel();
  });
})();
