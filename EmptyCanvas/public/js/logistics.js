// Logistics tabs + counters + storage-like cards
// + Mark Received (sends Notion pageIds)

(function () {
  const MARK_RECEIVED_URL = "/api/logistics/mark-received";

  const $ = (s, r = document) => r.querySelector(s);
  const N = (v) => (Number.isFinite(+v) ? +v : 0);
  const S = (v) => String(v ?? "");
  const fmt = (v) => String(N(v));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || (data && data.ok === false)) {
      const msg = (data && (data.error || (data.details && JSON.stringify(data.details)))) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data || {};
  }

  const searchInput = $("#logisticsSearch") || $("#search") || $('input[type="search"]');
  const grid = $("#logistics-grid") || $("main");
  const emptyMsg = $("#logistics-empty");

  const btnPrepared = $("#lg-btn-prepared");
  const btnReceived = $("#lg-btn-received");
  const btnDelivered = $("#lg-btn-delivered");
  const cPrepared = $("#lg-prepared");
  const cReceived = $("#lg-received");
  const cDelivered = $("#lg-delivered");

  let allItems = [];
  let activeTab = (new URLSearchParams(location.search).get("tab") || "prepared").toLowerCase();

  const statusOf = (it) => S(it.operationsStatus || it.opsStatus || it.status || "").toLowerCase();
  const isReceived = (it) => statusOf(it) === "received by operations";
  const isDelivered = (it) => statusOf(it) === "delivered";

  function normalizeItem(it) {
    const req = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    let rem = it.remaining ?? it.rem;
    rem = rem == null ? Math.max(0, req - avail) : N(rem);

    const pageId =
      S(
        it.pageId ??
        it.page_id ??
        it.notionPageId ??
        it.notion_page_id ??
        it.id
      );

    return {
      id: S(it.id ?? pageId),     // للاستخدام في DOM
      pageId,                      // ده اللي هنرسله للـ API
      reason: S(it.reason || ""),
      created: S(it.createdTime || it.created_time || it.created || ""),
      productName: S(it.productName ?? it.product_name ?? ""),
      requested: req,
      available: avail,
      remaining: rem,
      status: statusOf(it),
    };
  }

  const groupKeyOf = (it) => {
    const reason = (it.reason && String(it.reason).trim()) || "No Reason";
    const day = (it.created || "").slice(0, 10);
    return `grp:${reason}|${day}`;
  };

  function buildGroups(list) {
    const map = new Map();
    for (const raw of list) {
      const it = normalizeItem(raw);
      const key = groupKeyOf(it);
      const g = map.get(key) || {
        key,
        title: it.reason || "No Reason",
        subtitle: new Date(it.created || Date.now()).toLocaleString(),
        items: [],
      };
      g.items.push(it);
      map.set(key, g);
    }
    const arr = [...map.values()];
    arr.forEach((g) => {
      g.total = g.items.length;
      g.miss = g.items.filter((x) => N(x.remaining) > 0).length;
      g.allPrepared = g.items.every(
        (x) => N(x.remaining) === 0 && !isReceived(x) && !isDelivered(x)
      );
    });
    return arr;
  }

  async function fetchAssigned() {
    const res = await fetch("/api/orders/assigned", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load assigned orders");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  function setCounter(el, val) { if (el) el.textContent = fmt(val); }

  function setActiveTab(tab) {
    activeTab = tab;
    [[btnPrepared,"prepared"],[btnReceived,"received"],[btnDelivered,"delivered"]]
      .forEach(([b,t])=>{
        if (!b) return;
        const on = t===tab;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    const url = new URL(location.href);
    url.searchParams.set("tab", tab);
    history.replaceState({}, "", url);
  }

  async function markGroupReceived(group, buttonEl) {
    try {
      if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = "Saving..."; }

      // أهم نقطة: نبعث pageIds
      const pageIds = group.items.map(i => i.pageId).filter(Boolean);
      if (!pageIds.length) throw new Error("No pageIds to update");

      await postJSON(MARK_RECEIVED_URL, { pageIds });

      // locally flip
      const setIds = new Set(pageIds.map(String));
      allItems = allItems.map(r => {
        const rPageId = String(r.pageId || r.page_id || r.notionPageId || r.notion_page_id || r.id || "");
        if (setIds.has(rPageId)) {
          return { ...r, operationsStatus: "Received by operations", status: "Received by operations" };
        }
        return r;
      });

      render();
    } catch (e) {
      console.error(e);
      if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = "Mark Received"; }
      alert("Failed to mark as received. " + (e.message || ""));
    }
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = "";

    const q = (searchInput?.value || "").trim().toLowerCase();
    const groupsAll = buildGroups(allItems);

    const groupsPrepared = groupsAll.filter(g => g.allPrepared);
    const groupsReceived = groupsAll.map(g => ({ ...g, items: g.items.filter(isReceived) })).filter(g => g.items.length);
    const groupsDelivered = groupsAll.map(g => ({ ...g, items: g.items.filter(isDelivered) })).filter(g => g.items.length);

    setCounter(cPrepared, groupsPrepared.length);
    setCounter(cReceived, groupsReceived.length);
    setCounter(cDelivered, groupsDelivered.length);

    const sets = { prepared: groupsPrepared, received: groupsReceived, delivered: groupsDelivered };
    const view = (sets[activeTab] || []).map(g => ({
      ...g,
      items: q
        ? g.items.filter(it => it.productName.toLowerCase().includes(q) || (g.title || "").toLowerCase().includes(q))
        : g.items
    })).filter(g => g.items.length);

    if (!view.length) { if (emptyMsg) emptyMsg.style.display = ""; return; }
    if (emptyMsg) emptyMsg.style.display = "none";

    for (const g of view) {
      const card = document.createElement("div");
      card.className = "order-card";
      const actionsHTML = activeTab === "prepared"
        ? `<button class="btn btn-primary btn-sm" data-act="mark-received">Mark Received</button>`
        : ``;

      card.innerHTML = `
        <div class="order-card__head">
          <div class="order-card__title">
            <i data-feather="user-check"></i>
            <div class="order-card__title-text">
              <div class="order-card__title-main">${esc(g.title)}</div>
              <div class="order-card__subtitle">${esc(g.subtitle)}</div>
            </div>
          </div>
          <div class="order-card__right">
            <span class="badge badge--count">Items: ${fmt(g.items.length)}</span>
            <span class="badge badge--missing">Missing: ${fmt(g.items.filter(x=>N(x.remaining)>0).length)}</span>
            ${actionsHTML}
          </div>
        </div>
        <div class="order-card__items">
          ${g.items.map(it => `
            <div class="order-item" id="row-${esc(it.id)}">
              <div class="item-left"><div class="item-name">${esc(it.productName)}</div></div>
              <div class="item-mid">
                <div class="num">Req: <strong>${fmt(it.requested)}</strong></div>
                <div class="num">Avail: <strong data-col="available">${fmt(it.available)}</strong></div>
                <div class="num">Rem:
                  <span class="pill ${N(it.remaining)>0 ? "pill--danger":"pill--success"}" data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
            </div>`).join("")}
        </div>
      `;
      const btn = card.querySelector('[data-act="mark-received"]');
      if (btn) btn.addEventListener("click", () => markGroupReceived(g, btn));
      grid.appendChild(card);
    }

    window.feather?.replace?.({ "stroke-width": 2 });
  }

  async function load() {
    try { allItems = await fetchAssigned(); render(); }
    catch (e) {
      console.error(e);
      if (grid) grid.innerHTML = '<div class="error">Failed to load items.</div>';
      [cPrepared, cReceived, cDelivered].forEach(el=>el && (el.textContent="0"));
    }
  }

  [[btnPrepared,"prepared"],[btnReceived,"received"],[btnDelivered,"delivered"]]
    .forEach(([b,t]) => b && b.addEventListener("click", ()=>{ setActiveTab(t); render(); }));

  setActiveTab(activeTab);
  searchInput && searchInput.addEventListener("input", render);
  load();
})();