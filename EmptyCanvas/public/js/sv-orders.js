
/* =========================================================================
   sv-orders.js — S.V schools orders page
   - Tabs (?tab=not-started|approved|rejected)
   - Group cards by Reason (one card per Reason)
   - Edit quantity / Approve / Reject
   ========================================================================= */

(function () {
  "use strict";

  // --------- read current tab from URL ---------
  const qs = new URLSearchParams(location.search);
  const TAB = (qs.get("tab") || "not-started").toLowerCase(); // not-started | approved | rejected

  // ---------- small http helpers (fallback to fetch if common-ui not loaded) ----------
  const http = {
    async get(url) {
      if (typeof window.getJSON === "function") return await window.getJSON(url);
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`GET ${url} failed: ${r.status}`);
      return await r.json();
    },
    async post(url, body) {
      if (typeof window.postJSON === "function") return await window.postJSON(url, body);
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`POST ${url} failed: ${r.status}\n${t}`);
      }
      try { return await r.json(); } catch { return { ok: true }; }
    },
  };

  // ---------- state ----------
  let allItems = [];    // full list from server
  let filtered = [];    // search-filtered
  let loading = false;

  let qtyModal = null;
  let qtyInput = null;
  let qtyCloseBtn = null;
  let qtyCancelBtn = null;
  let qtySaveBtn = null;
  let qtyEditingId = null;

  // ---------- DOM ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const container = $("#sv-list");
  const searchInput = $("#svSearch");
  const tabsWrap = $("#svTabs");

  // ---------- utils ----------
  const N = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  const fmtDate = (dt) => {
    if (typeof window.formatDate === "function") return window.formatDate(dt);
    try {
      const d = new Date(dt);
      return d.toLocaleString();
    } catch {
      return dt || "";
    }
  };
  const toastOK = (msg) => (window.toast ? window.toast.success(msg) : alert(msg));
  const toastERR = (msg) => (window.toast ? window.toast.error(msg) : alert(msg));

  // ---------- tabs visual active state ----------
  function setActiveTab() {
    if (!tabsWrap) return;
    $$("#svTabs .tab-portfolio, #svTabs .tab-chip").forEach((a) => {
      const tabName = (a.dataset.tab || "").toLowerCase();
      const isActive = tabName === TAB;
      a.classList.toggle("active", isActive);
      a.setAttribute("aria-selected", isActive ? "true" : "false");
      // keep ?tab stable even if markup was copied without it
      try {
        const u = new URL(a.getAttribute("href"), location.origin);
        u.searchParams.set("tab", a.dataset.tab || "not-started");
        a.setAttribute("href", u.pathname + "?" + u.searchParams.toString());
      } catch {}
    });
  }

  // ---------- fetch & render ----------
  async function loadList() {
    loading = true;
    render();
    try {
      const data = await http.get(`/api/sv-orders?tab=${encodeURIComponent(TAB)}`);
      allItems = Array.isArray(data) ? data : [];
      applyFilter();
    } catch (e) {
      console.error(e);
      toastERR("Failed to load S.V schools orders.");
    } finally {
      loading = false;
      render();
    }
  }

  function applyFilter() {
    const q = (searchInput && searchInput.value || "").toLowerCase().trim();
    if (!q) {
      filtered = allItems.slice();
    } else {
      filtered = allItems.filter((it) => {
        const hay = [
          it.productName || "",
          it.reason || "",
          it.approval || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
  }

  function badgeForApproval(status) {
    const s = String(status || "").toLowerCase();
    if (s === "approved")
      return `<span class="pill pill-success" title="S.V Approval">Approved</span>`;
    if (s === "rejected")
      return `<span class="pill pill-danger" title="S.V Approval">Rejected</span>`;
    return `<span class="pill" title="S.V Approval">Not Started</span>`;
  }

  // ---------- grouping by reason ----------
  function groupByReason(items) {
    const groups = new Map();
    for (const it of items) {
      const key = (it.reason || "No Reason").trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { reason: it.reason || "No Reason", items: [], firstCreated: it.createdTime });
      const g = groups.get(key);
      g.items.push(it);
      try {
        if (new Date(it.createdTime) < new Date(g.firstCreated)) g.firstCreated = it.createdTime;
      } catch {}
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => new Date(b.firstCreated) - new Date(a.firstCreated));
    return arr;
  }

  function renderGroupCard(group) {
    const count = group.items.length;
    const chips = `
      <span class="pill">${count} ${count === 1 ? "Item" : "Items"}</span>
      <span class="pill">${fmtDate(group.firstCreated)}</span>
    `;

    const rows = group.items
      .map((it) => {
        const qty = N(it.quantity);
        const approval = it.approval || "";
        return `
          <div class="sv-item-row" data-id="${it.id}">
            <div class="row-left">
              <div class="name">${escapeHTML(it.productName || "Unnamed product")}</div>
              <div class="sub muted">Qty: <strong>${qty}</strong></div>
            </div>
            <div class="row-right">
              <div class="approval">${badgeForApproval(approval)}</div>
              <div class="btn-group">
                <button class="btn btn-light btn-xs sv-edit" data-id="${it.id}" aria-label="Edit quantity">
                  <i data-feather="edit-2"></i> Edit
                </button>
                <button class="btn btn-success btn-xs sv-approve" data-id="${it.id}">
                  <i data-feather="check"></i> Approve
                </button>
                <button class="btn btn-danger btn-xs sv-reject" data-id="${it.id}">
                  <i data-feather="x"></i> Reject
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="card sv-group">
        <div class="group-header">
          <div class="title">${escapeHTML(group.reason || "No Reason")}</div>
          <div class="badges">${chips}</div>
        </div>
        <div class="group-items">
          ${rows}
        </div>
      </div>
    `;
  }

  function render() {
    if (!container) return;

    if (loading) {
      container.innerHTML =
        `<p class="muted"><i data-feather="loader" class="loading-icon"></i> Loading S.V schools orders…</p>`;
      if (window.feather) feather.replace();
      return;
    }

    if (!filtered.length) {
      container.innerHTML =
        `<div class="empty-state">
          <i data-feather="inbox"></i>
          <div>No orders to review</div>
          <small class="muted">You’ll see any requests linked to you via the “S.V Schools” relation.</small>
        </div>`;
      if (window.feather) feather.replace();
      return;
    }

    // --- group items by reason and render one card per reason
    const groups = groupByReason(filtered);
    const html = groups.map(renderGroupCard).join("");

    container.innerHTML = html;
    if (window.feather) feather.replace();
  }

  // ---------- actions ----------
  async function approve(id, decision) {
    try {
      await http.post(`/api/sv-orders/${encodeURIComponent(id)}/approval`, {
        decision,
      });
      toastOK(`Marked as ${decision}.`);
      await reloadAfterAction();
    } catch (e) {
      console.error(e);
      toastERR(`Failed to set ${decision}.`);
    }
  }

  async function saveQuantity(id, value) {
    try {
      await http.post(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, {
        value: Number(value),
      });
      toastOK("Quantity updated.");
      await reloadAfterAction();
    } catch (e) {
      console.error(e);
      toastERR("Failed to update quantity.");
    }
  }

  async function reloadAfterAction() {
    const scrollY = window.scrollY;
    await loadList();
    window.scrollTo(0, scrollY);
  }

  // ---------- edit modal ----------
  function openQtyModal(id) {
    qtyEditingId = id;
    const current = allItems.find((x) => x.id === id);
    if (qtyInput) qtyInput.value = current ? N(current.quantity) : 0;

    if (qtyModal) {
      qtyModal.classList.add("show");
      qtyModal.setAttribute("aria-hidden", "false");
      setTimeout(() => qtyInput && qtyInput.focus(), 50);
    }
  }
  function closeQtyModal() {
    qtyEditingId = null;
    if (qtyModal) {
      qtyModal.classList.remove("show");
      qtyModal.setAttribute("aria-hidden", "true");
    }
  }

  // ---------- events ----------
  function wireEvents() {
    // Search
    on(searchInput, "input", () => {
      applyFilter();
      render();
    });

    // Clicks in list (event delegation)
    on(container, "click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (btn.classList.contains("sv-edit")) {
        openQtyModal(id);
        return;
      }
      if (btn.classList.contains("sv-approve")) {
        approve(id, "Approved");
        return;
      }
      if (btn.classList.contains("sv-reject")) {
        approve(id, "Rejected");
        return;
      }
    });

    // Modal buttons/inputs
    qtyModal = $("#svQtyModal");
    qtyInput = $("#svQtyInput");
    qtyCloseBtn = $("#svQtyClose");
    qtyCancelBtn = $("#svQtyCancel");
    qtySaveBtn = $("#svQtySave");

    on(qtyCloseBtn, "click", closeQtyModal);
    on(qtyCancelBtn, "click", closeQtyModal);
    on(qtyModal, "click", (e) => {
      if (e.target === qtyModal) closeQtyModal(); // backdrop click
    });
    on(qtyInput, "keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (qtyEditingId && qtyInput) saveQuantity(qtyEditingId, qtyInput.value);
        closeQtyModal();
      }
    });
    on(qtySaveBtn, "click", () => {
      if (!qtyEditingId) return;
      const v = Math.max(0, Math.floor(N(qtyInput.value)));
      saveQuantity(qtyEditingId, v);
      closeQtyModal();
    });
  }

  // ---------- escape util ----------
  function escapeHTML(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if (window.initSidebarToggle) window.initSidebarToggle();
      if (window.hydrateGreeting) window.hydrateGreeting();
    } catch {}
    setActiveTab();
    wireEvents();
    await loadList();
  });
})();
