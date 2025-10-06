// logistics.js — fixed selectors + robust fetch for both API variants (`/api/logistics/:state` or `/api/logistics?status=`)
// Renders cards similar to Storage and supports Prepared / Received / Delivered tabs.
(function () {
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const escapeHtml = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // ----- DOM targets (matching the current logistics.html) -----
  const pills = qsa("#logi-pills [data-tab]");
  const counters = {
    Prepared: qs("#prepared-count"),
    Received: qs("#received-count"),
    Delivered: qs("#delivered-count"),
  };
  const searchInput = qs("#logiSearch");
  const listRoot = qs("#logi-items");

  // ----- Tab state -----
  const urlParams = new URLSearchParams(location.search);
  let currentTab = urlParams.get("tab") || "Prepared";
  if (!["Prepared", "Received", "Delivered"].includes(currentTab)) currentTab = "Prepared";

  pills.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  function setActiveTab(tab) {
    currentTab = tab;
    pills.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
    urlParams.set("tab", tab);
    history.replaceState(null, "", `${location.pathname}?${urlParams.toString()}`);
    loadTab();
  }

  // ----- Data fetching -----
  async function fetchList(tab) {
    const state = String(tab || "Prepared");
    // Try REST style: /api/logistics/:state
    let res = await fetch(`/api/logistics/${state.toLowerCase()}`, {
      headers: { "Cache-Control": "no-store" },
    });
    // Fallback to query style: /api/logistics?status=
    if (!res.ok) {
      res = await fetch(`/api/logistics?status=${encodeURIComponent(state)}`, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Support both backends: either {items:[...]} or [...]
    return Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
  }

  // ----- Rendering -----
  function render(items) {
    if (!listRoot) return;

    const q = (searchInput?.value || "").trim().toLowerCase();
    if (q) {
      items = items.filter((it) =>
        (it.productName || "").toLowerCase().includes(q) ||
        (it.reason || "").toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      listRoot.innerHTML = `<p>No items.</p>`;
      return;
    }

    // Group by reason (like Storage grouping by order)
    const groups = new Map();
    for (const it of items) {
      const key = it.reason || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }

    const cards = [];
    for (const [reason, group] of groups.entries()) {
      const rows = group
        .map((it) => {
          // Support fields from both API versions
          const req = Number(it.requested ?? it.quantity ?? 0);
          const avail = Number(it.available ?? 0);
          const rem = Math.max(req - avail, 0);
          return `
            <div class="order-row">
              <div class="order-row__title">Product: ${escapeHtml(it.productName || "—")}</div>
              <div class="order-row__badges">
                <span class="pill pill-muted">Req: ${req}</span>
                <span class="pill pill-green">Avail: ${avail}</span>
                <span class="pill pill-gray">Rem: ${rem}</span>
              </div>
            </div>
          `;
        })
        .join("");

      cards.push(`
        <article class="order-card">
          <header class="order-header">
            <div class="order-title">${escapeHtml(reason)}</div>
          </header>
          <div class="order-body">
            ${rows}
          </div>
        </article>
      `);
    }

    listRoot.innerHTML = cards.join("");
    if (window.feather?.replace) window.feather.replace();
  }

  async function updateCounters() {
    for (const tab of ["Prepared", "Received", "Delivered"]) {
      try {
        const items = await fetchList(tab);
        if (counters[tab]) counters[tab].textContent = String(items.length);
      } catch {
        /* ignore */
      }
    }
  }

  async function loadTab() {
    if (listRoot) {
      listRoot.innerHTML = `<p><i data-feather="loader" class="loading-icon"></i> Loading...</p>`;
    }
    try {
      const items = await fetchList(currentTab);
      render(items);
    } catch (e) {
      if (listRoot) {
        listRoot.innerHTML = `<p class="error">Failed to load. ${escapeHtml(e.message || String(e))}</p>`;
      }
    }
  }

  searchInput?.addEventListener("input", () => loadTab());

  // Init
  updateCounters();
  setActiveTab(currentTab);
})();