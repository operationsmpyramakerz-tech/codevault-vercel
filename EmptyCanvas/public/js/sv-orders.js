/* =========================================================================
   sv-orders.js  —  Controller for "S.V schools orders"
   Depends on: /js/common-ui.js  (getJSON, postJSON, toast, etc.)
   ========================================================================= */

(function () {
  "use strict";

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

  // ---------- fetch & render ----------
  async function loadList() {
    loading = true;
    render();
    try {
      const data = await http.get("/api/sv-orders");
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
    const q = (searchInput?.value || "").toLowerCase().trim();
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
    return `<span class="pill" title="S.V Approval">Pending</span>`;
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

    const cards = filtered.map((it) => {
      const qty = N(it.quantity);
      const approval = it.approval || "";
      return `
        <div class="card sv-item" data-id="${it.id}">
          <div class="card-row">
            <div class="col col-main">
              <div class="title">${escapeHTML(it.productName || "Unnamed product")}</div>
              <div class="sub muted">${escapeHTML(it.reason || "No Reason")}</div>
              <div class="meta muted">Created: ${fmtDate(it.createdTime)}</div>
            </div>
            <div class="col col-qty">
              <div class="label">Quantity</div>
              <div class="value"><strong>${qty}</strong></div>
              <button class="btn btn-light btn-xs sv-edit" data-id="${it.id}" aria-label="Edit quantity">
                <i data-feather="edit-2"></i> Edit
              </button>
            </div>
            <div class="col col-approval">
              <div class="label">S.V Approval</div>
              <div class="value">${badgeForApproval(approval)}</div>
              <div class="btn-group">
                <button class="btn btn-success btn-xs sv-approve" data-id="${it.id}">
                  <i data-feather="check"></i> Approve
                </button>
                <button class="btn btn-danger btn-xs sv-reject" data-id="${it.id}">
                  <i data-feather="x"></i> Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = cards.join("");
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
    // keep the page position; minor nicety
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
      const target = ev.target.closest("button");
      if (!target) return;

      const id = target.getAttribute("data-id");
      if (!id) return;

      if (target.classList.contains("sv-edit")) {
        openQtyModal(id);
        return;
      }
      if (target.classList.contains("sv-approve")) {
        approve(id, "Approved");
        return;
      }
      if (target.classList.contains("sv-reject")) {
        approve(id, "Rejected");
        return;
      }
    });

    // Modal buttons
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
      // common-ui hooks (best-effort)
      if (window.initSidebarToggle) window.initSidebarToggle();
      if (window.hydrateGreeting) window.hydrateGreeting();
    } catch {}

    wireEvents();
    await loadList();
  });
})();