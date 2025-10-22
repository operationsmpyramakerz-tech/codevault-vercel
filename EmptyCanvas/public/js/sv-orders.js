/*! sv-orders.js : S.V schools orders — one order per card + inline quantity popover */
(() => {
  "use strict";

  // ---- helpers ----
  const qs = new URLSearchParams(location.search);
  const TAB = (qs.get("tab") || "not-started").toLowerCase();

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

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
          <div class="muted">Qty: <strong data-role="qty-val">${qty}</strong></div>
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

  // ---- qty popover (inline dropdown) ----
  let popEl = null;
  let popForId = null;
  function destroyPopover() {
    if (popEl?.parentNode) popEl.parentNode.removeChild(popEl);
    popEl = null;
    popForId = null;
    window.removeEventListener("click", onDocClick, true);
    window.removeEventListener("keydown", onEsc, true);
    window.removeEventListener("resize", destroyPopover);
    window.removeEventListener("scroll", destroyPopover, true);
  }
  function onDocClick(e) {
    if (!popEl) return;
    if (popEl.contains(e.target)) return;
    const editBtn = document.querySelector(`.sv-edit[data-id="${popForId}"]`);
    if (editBtn && editBtn.contains(e.target)) return;
    destroyPopover();
  }
  function onEsc(e) {
    if (e.key === "Escape") destroyPopover();
  }

  function placePopoverNear(btn) {
    const r = btn.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 260, Math.max(8, r.right - 220));
    const y = Math.min(window.innerHeight - 140, r.bottom + 8);
    popEl.style.left = `${x + window.scrollX}px`;
    popEl.style.top  = `${y + window.scrollY}px`;
  }

  async function openQtyPopover(btn, id) {
    // toggle if same id
    if (popEl && popForId === id) {
      destroyPopover();
      return;
    }
    destroyPopover();
    popForId = id;

    // current quantity
    const row = btn.closest(".order-item-card");
    const currentQtyNode = row?.querySelector('[data-role="qty-val"]');
    const currentVal = currentQtyNode ? N(currentQtyNode.textContent) : 0;

    popEl = document.createElement("div");
    popEl.className = "sv-qty-popover";
    popEl.innerHTML = `
      <div class="sv-qty-popover__arrow"></div>
      <div class="sv-qty-popover__body">
        <div class="sv-qty-row">
          <button class="sv-qty-btn sv-qty-dec" type="button" aria-label="Decrease">−</button>
          <input class="sv-qty-input" type="number" min="0" step="1" value="${currentVal}" />
          <button class="sv-qty-btn sv-qty-inc" type="button" aria-label="Increase">+</button>
        </div>
        <div class="sv-qty-actions">
          <button class="btn btn-success btn-xs sv-qty-save">Save</button>
          <button class="btn btn-danger btn-xs sv-qty-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(popEl);
    placePopoverNear(btn);

    const input  = popEl.querySelector(".sv-qty-input");
    const decBtn = popEl.querySelector(".sv-qty-dec");
    const incBtn = popEl.querySelector(".sv-qty-inc");
    const saveBtn= popEl.querySelector(".sv-qty-save");
    const cancel = popEl.querySelector(".sv-qty-cancel");

    input.focus();
    input.select();

    on(decBtn, "click", () => { input.value = Math.max(0, N(input.value) - 1); input.dispatchEvent(new Event("input")); });
    on(incBtn, "click", () => { input.value = Math.max(0, N(input.value) + 1); input.dispatchEvent(new Event("input")); });
    on(input, "keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });
    on(saveBtn, "click", async () => {
      const v = Math.max(0, Math.floor(N(input.value)));
      try {
        await http.post(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, { value: v });
        // immediate UI feedback
        if (currentQtyNode) currentQtyNode.textContent = String(v);
        toastOK("Quantity updated.");
        destroyPopover();
      } catch (e) {
        toastERR("Failed to update quantity.");
      }
    });
    on(cancel, "click", destroyPopover);

    window.addEventListener("click", onDocClick, true);
    window.addEventListener("keydown", onEsc, true);
    window.addEventListener("resize", destroyPopover);
    window.addEventListener("scroll", destroyPopover, true);
  }

  // ---- approve/reject wrappers ----
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

  async function reloadAfterAction() {
    const y = window.scrollY;
    await loadList();
    window.scrollTo(0, y);
  }

  // ---- wire ----
  function wireEvents() {
    on(searchInput, "input", () => { applyFilter(); render(); });

    on(container, "click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (btn.classList.contains("sv-edit"))    { ev.preventDefault(); ev.stopPropagation(); return openQtyPopover(btn, id); }
      if (btn.classList.contains("sv-approve")) return approve(id, "Approved");
      if (btn.classList.contains("sv-reject"))  return approve(id, "Rejected");
    });
  }

  // ---- initial render ----
  function mount() {
    setActiveTab();
    wireEvents();
    loadList();
    console.log("%cSV-ORDERS UI → QTY popover enabled", "color:#16A34A;font-weight:700;");
  }

  document.addEventListener("DOMContentLoaded", mount);
})();
