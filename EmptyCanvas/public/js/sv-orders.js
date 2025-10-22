/*! sv-orders.js : S.V schools orders (one order per card, professional layout) */
(() => {
  "use strict";

  // ---- helpers ----
  const qs = new URLSearchParams(location.search);
  const TAB = (qs.get("tab") || "not-started").toLowerCase();

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const http = {
    async get(url) {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
      return await res.json();
    },
    async post(url, body) {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
      try { return await res.json(); } catch { return { ok:true }; }
    },
  };

  const N = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  const fmtDate = (d) => {
    try { 
      const dt = new Date(d);
      if (!isNaN(+dt)) return dt.toLocaleString();
      return d || "";
    } catch { return d || ""; }
  };
  const escapeHTML = (s) =>
    String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
                   .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const toastOK  = (m) => (window.toast ? window.toast.success(m) : console.log("[OK]", m));
  const toastERR = (m) => (window.toast ? window.toast.error(m)   : console.error("[ERR]", m));

  // ---- state/els ----
  let allItems = [];
  let filtered = [];
  let loading = false;

  const container   = $("#sv-list");
  const searchInput = $("#svSearch");
  const tabsWrap    = $("#svTabs");

  // ---- tabs (keep URL in sync) ----
  function setActiveTab() {
    if (!tabsWrap) return;
    $$("#svTabs a.tab-portfolio").forEach(a => {
      const tab = (a.dataset.tab || "").toLowerCase();
      const active = tab === TAB;
      a.classList.toggle("active", active);
      a.setAttribute("aria-selected", active ? "true" : "false");
      try {
        const u = new URL(a.getAttribute("href"), location.origin);
        u.searchParams.set("tab", a.dataset.tab || "not-started");
        a.href = u.pathname + "?" + u.searchParams.toString();
      } catch {}
    });
  }

  // ---- fetch list ----
  async function loadList() {
    loading = true; render();
    try {
      const url = `/api/sv-orders?tab=${encodeURIComponent(TAB)}`;
      const data = await http.get(url);
      allItems = Array.isArray(data) ? data : [];
      applyFilter();
    } catch (e) {
      console.error("loadList()", e);
      toastERR("Failed to load S.V orders.");
      allItems = [];
      filtered = [];
    } finally {
      loading = false;
      render();
    }
  }

  // ---- search ----
  function applyFilter() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    if (!q) { filtered = allItems.slice(); return; }
    filtered = allItems.filter(it => {
      const hay = [
        it.reason || it.requestReason || "",
        it.productName || it.item || "",
        it.approval || ""
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // ---- grouping: one order per card (group by request/reason) ----
  function groupByOrder(items) {
    function groupKey(it) {
      const id =
        it.reasonId || it.requestId || it.groupId || it.orderId ||
        it.parentId || it.req_id || it.orderPageId || it.reason_page_id ||
        it.pageId || it.page_id;
      if (id) return `id:${id}`;

      const txt = String(it.reason || it.requestReason || "No Reason").trim().toLowerCase();
      const created = it.reasonCreated || it.createdAt || it.created_time || it.createdTime || "";
      return `txt:${txt}|${String(created).slice(0,19)}`;
    }

    const groups = new Map();
    for (const it of items) {
      const key = groupKey(it);
      if (!groups.has(key)) groups.set(key, {
        reason: it.reason || it.requestReason || "No Reason",
        items: [],
        firstCreated: it.createdTime || it.created_at || it.createdAt || ""
      });
      const g = groups.get(key);
      g.items.push(it);
      try {
        const d = new Date(it.createdTime || it.created_at || it.createdAt || 0);
        const g0 = new Date(g.firstCreated || 0);
        if (g0 > d) g.firstCreated = d.toISOString();
      } catch {}
    }
    return Array.from(groups.values())
      .sort((a,b) => new Date(b.firstCreated) - new Date(a.firstCreated));
  }

  // ---- badges (unified) ----
  function badgeForApproval(status) {
    const s = String(status || "").toLowerCase();
    if (s === "approved") return `<span class="badge badge--approved">Approved</span>`;
    if (s === "rejected") return `<span class="badge badge--rejected">Rejected</span>`;
    return `<span class="badge badge--notstarted">Not Started</span>`;
  }

  // ---- UI templates ----
  function renderItemRow(it) {
    const qty = Math.max(0, N(it.quantity));
    return `
      <div class="order-item-card" data-id="${it.id}">
        <div class="order-item__left">
          <div class="name">${escapeHTML(it.productName || it.item || "Unnamed")}</div>
          <div class="muted">Qty: <strong>${qty}</strong></div>
        </div>
        <div class="order-item__right">
          <div class="approval">${badgeForApproval(it.approval)}</div>
          <div class="btn-group">
            <button class="btn btn-warning btn-xs sv-edit"    data-id="${it.id}" title="Edit qty"><i data-feather="edit-2"></i> Edit</button>
            <button class="btn btn-success btn-xs sv-approve" data-id="${it.id}" title="Approve"><i data-feather="check"></i> Approve</button>
            <button class="btn btn-danger  btn-xs sv-reject"  data-id="${it.id}" title="Reject"><i data-feather="x"></i> Reject</button>
          </div>
        </div>
      </div>
    `.trim();
  }

  function renderOrderCard(group) {
    const meta = `
      <div class="meta">
        <span class="badge badge--qty">${group.items.length} ${group.items.length===1?"Item":"Items"}</span>
        <span class="badge">${fmtDate(group.firstCreated)}</span>
      </div>`;

    const items = group.items.map(renderItemRow).join("");

    return `
      <article class="order-card single">
        <div class="order-head">
          <div class="head-left">
            <h3 class="order-title">${escapeHTML(group.reason || "No Reason")}</h3>
            ${meta}
          </div>
          <!-- Right side intentionally empty (Assigned/Unassigned badge hidden) -->
          <div class="order-actions"></div>
        </div>
        <div class="order-items">
          ${items}
        </div>
      </article>
    `.trim();
  }

  function render() {
    if (!container) return;

    if (loading) {
      container.innerHTML = `<p class="muted"><i data-feather="loader" class="loading-icon"></i> Loading…</p>`;
      window.feather && feather.replace();
      return;
    }
    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state">
        <i data-feather="inbox"></i>
        <div>No orders to review</div>
        <small class="muted">Linked to you via “S.V Schools”.</small>
      </div>`;
      window.feather && feather.replace();
      return;
    }

    const groups = groupByOrder(filtered);
    container.innerHTML = groups.map(renderOrderCard).join("");
    window.feather && feather.replace();
  }

  // ---- actions ----
  async function approve(id, decision) {
    try {
      await http.post(`/api/sv-orders/${encodeURIComponent(id)}/approval`, { decision });
      toastOK(`Marked as ${decision}.`);
      await reloadAfterAction();
    } catch (e) {
      console.error(e);
      toastERR(`Failed to set ${decision}.`);
    }
  }

  async function saveQuantity(id, value) {
    try {
      await http.post(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, { value: N(value) });
      toastOK("Quantity updated.");
      await reloadAfterAction();
    } catch (e) {
      console.error(e);
      toastERR("Failed to update quantity.");
    }
  }

  async function reloadAfterAction() {
    const y = window.scrollY;
    await loadList();
    window.scrollTo(0, y);
  }

  // ---- qty modal ----
  let qtyModal, qtyInput, qtySaveBtn, qtyCloseBtn, qtyCancelBtn, qtyEditingId=null;

  function openQtyModal(id) {
    qtyEditingId = id;
    const current = allItems.find(x => x.id === id);
    const currentVal = current ? N(current.quantity) : 0;

    qtyModal = document.getElementById("svQtyModal");
    qtyInput = document.getElementById("svQtyInput");
    qtySaveBtn = document.getElementById("svQtySave");
    qtyCloseBtn = document.getElementById("svQtyClose");
    qtyCancelBtn = document.getElementById("svQtyCancel");

    if (!qtyModal || !qtyInput || !qtySaveBtn) {
      const v = window.prompt("Enter quantity:", String(currentVal));
      if (v != null) saveQuantity(id, v);
      return;
    }

    qtyInput.value = currentVal;
    qtyModal.classList.add("show");
    qtyModal.setAttribute("aria-hidden","false");
    setTimeout(() => qtyInput.focus(), 30);
  }
  function closeQtyModal() {
    qtyEditingId = null;
    if (qtyModal) {
      qtyModal.classList.remove("show");
      qtyModal.setAttribute("aria-hidden","true");
    }
  }

  // ---- wire ----
  function wireEvents() {
    on(searchInput, "input", () => { applyFilter(); render(); });

    on(container, "click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (btn.classList.contains("sv-edit"))    return openQtyModal(id);
      if (btn.classList.contains("sv-approve")) return approve(id, "Approved");
      if (btn.classList.contains("sv-reject"))  return approve(id, "Rejected");
    });

    // qty modal buttons
    qtyModal     = document.getElementById("svQtyModal");
    qtyInput     = document.getElementById("svQtyInput");
    qtySaveBtn   = document.getElementById("svQtySave");
    qtyCloseBtn  = document.getElementById("svQtyClose");
    qtyCancelBtn = document.getElementById("svQtyCancel");

    on(qtyCloseBtn, "click", closeQtyModal);
    on(qtyCancelBtn,"click", closeQtyModal);
    on(qtyModal, "click", (e) => { if (e.target === qtyModal) closeQtyModal(); });
    on(qtyInput, "keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (qtyEditingId) saveQuantity(qtyEditingId, qtyInput.value);
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

  document.addEventListener("DOMContentLoaded", async () => {
    setActiveTab();
    wireEvents();
    await loadList();
    console.log("%cSV-ORDERS UI → one-card-per-order (PRO)", "color:#16A34A;font-weight:700;");
  });
})();
