// new-report-request.js — handles tab switching and centered panel display
(() => {
  "use strict";

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const tabs   = $$("#nrrTabs .nrr-tab");
  const panels = $$("#nrrCard .nrr-panel");

  function getTabFromURL() {
    const p = new URLSearchParams(location.search);
    const t = (p.get("tab") || "request").toLowerCase();
    return t === "report" ? "report" : "request";
  }

  function activate(tab) {
    // Tabs
    tabs.forEach(a => {
      const t = a.dataset.tab;
      const active = t === tab;
      a.classList.toggle("active", active);
      a.setAttribute("aria-selected", active ? "true" : "false");
      try {
        const u = new URL(a.getAttribute("href"), location.origin);
        u.searchParams.set("tab", t);
        a.setAttribute("href", u.pathname + "?" + u.searchParams.toString());
      } catch {}
    });

    // Panels
    panels.forEach(p => {
      p.hidden = p.dataset.panel !== tab;
    });

    // Focus the card for accessibility
    $("#nrrCard")?.focus({ preventScroll: false });
  }

  // Intercept clicks to switch without reloading
  tabs.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = a.dataset.tab || "request";
      if (!targetTab) return;
      activate(targetTab);
      const u = new URL(window.location.href);
      u.searchParams.set("tab", targetTab);
      history.replaceState({ tab: targetTab }, "", u.pathname + "?" + u.searchParams.toString());
    });
  });

  // Handle back/forward navigation
  window.addEventListener("popstate", () => activate(getTabFromURL()));

  // Init
  document.addEventListener("DOMContentLoaded", () => activate(getTabFromURL()));
})();
