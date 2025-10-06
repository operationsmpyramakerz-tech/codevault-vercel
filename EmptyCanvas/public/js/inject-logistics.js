
// inject-logistics.js
// Adds 'Logistics' link to the left sidebar if it's missing and highlights it when active.
(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var sidebar = document.querySelector(".sidebar .sidebar-nav");
    if (!sidebar) return;

    // Find a UL/Container that has the nav links
    var container = sidebar.querySelector(".nav-list") || sidebar;

    // Don't duplicate
    if (container.querySelector('[data-link="logistics"]')) return;

    // Build link
    var a = document.createElement("a");
    a.className = "nav-link";
    a.href = "/logistics";
    a.setAttribute("data-link", "logistics");
    a.innerHTML =
      '<span class="nav-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:10px;">' +
      // chain link icon (inline SVG - accessible, fallback-friendly)
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
      '<path d="M10.59 13.41a1 1 0 0 1 0-1.41l2.59-2.59a1 1 0 1 1 1.41 1.41l-2.59 2.59a1 1 0 0 1-1.41 0z"></path>' +
      '<path d="M9 17a4 4 0 0 1-2.83-6.83l2-2a1 1 0 1 1 1.41 1.41l-2 2a2 2 0 0 0 2.83 2.83l2-2a1 1 0 1 1 1.41 1.41l-2 2A3.98 3.98 0 0 1 9 17zM15 7a3.98 3.98 0 0 1 2.83 1.17 4 4 0 0 1 0 5.66l-2 2a1 1 0 1 1-1.41-1.41l2-2a2 2 0 0 0-2.83-2.83l-2 2a1 1 0 1 1-1.41-1.41l2-2A3.98 3.98 0 0 1 15 7z"></path>' +
      "</svg></span>" +
      '<span class="nav-text">Logistics</span>';

    // Insert before "Funds" if exists, else at end
    var funds = container.querySelector('a[href="/funds"]');
    if (funds && funds.parentNode === container) {
      container.insertBefore(a, funds);
    } else {
      container.appendChild(a);
    }

    // Active state
    if (location.pathname.startsWith("/logistics")) {
      a.classList.add("active");
    }
  });
})();
