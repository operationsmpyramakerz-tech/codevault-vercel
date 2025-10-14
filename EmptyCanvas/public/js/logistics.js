// Logistics tabs: Fully prepared / Missing / Partially received / Received / Delivered
// - Mark Received (in prepared) يستلم الكل
// - Mark Received Anyway (in missing/partial) يقسم العناصر إلى Received/Partially Received حسب remaining

(function () {
  // ---------- config ----------
  const MARK_RECEIVED_URL = "/api/logistics/mark-received";

  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const N  = (v) => (Number.isFinite(+v) ? +v : 0);
  const S  = (v) => String(v ?? "");
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
      const msg = (data && (data.error || data.details)) || `POST ${url} failed: ${res.status}`;
      throw new Error(msg);
    }
    return data || {};
  }

  // ---------- DOM refs ----------
  const searchInput = $("#logisticsSearch") || $("#search") || $('input[type="search"]');
  const grid        = $("#assigned-grid") || $("#logistics-grid") || $("main");
  const emptyMsg    = $("#assigned-empty") || $("#logistics-empty");

  const btnPrepared  = $("#lg-btn-prepared");
  const btnMissing   = $("#lg-btn-missing");
  const btnPartial   = $("#lg-btn-partial");
  const btnReceived  = $("#lg-btn-received");
  const btnDelivered = $("#lg-btn-delivered");

  const cPrepared  = $("#lg-count-prepared");
  const cMissing   = $("#lg-count-missing");
  const cPartial   = $("#lg-count-partial");
  const cReceived  = $("#lg-count-received");
  const cDelivered = $("#lg-count-delivered");

  // ---------- state ----------
  let allItems  = [];
  let activeTab = (new URLSearchParams(location.search).get("tab") || "prepared").toLowerCase();

  // ---------- data helpers ----------
  const statusOf    = (it) => S(it.operationsStatus || it.opsStatus || it.status || "").toLowerCase();
  const isReceived  = (it) => statusOf(it) === "received by operations";
  const isPartial   = (it) => statusOf(it) === "partially received by operations";
  const isDelivered = (it) => statusOf(it) === "delivered";

  function normalizeItem(it) {
    const req   = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    let rem     = it.remaining ?? it.rem;
    rem = rem == null ? Math.max(0, req - avail) : N(rem);

    const pageId = S(it.pageId ?? it.page_id ?? it.notionPageId ?? it.notion_page_id ?? it.id);

    return {
      id: S(it.id ?? pageId),
      pageId,
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
    const day    = (it.created || "").slice(0, 10);
    return `grp:${reason}|${day}`;
  };

  function buildGroups(list) {
    const map = new Map();
    for (const raw of list) {
      const it  = normalizeItem(raw);
      const key = groupKeyOf(it);
      const g   = map.get(key) || {
        key,
        title: it.reason || "No Reason",
        subtitle: new Date(it.created || Date.now()).toLocaleString(),
        items: [],
      };
      g.items.push(it);
      map.set(key, g);
    }
    const arr = [...map.values()];
    arr.forEach(recomputeGroupStats);
    return arr;
  }

  function recomputeGroupStats(g) {
    g.total        = g.items.length;
    g.miss         = g.items.filter((x) => N(x.remaining) > 0).length;
    g.anyReceived  = g.items.some(isReceived);
    g.anyPartial   = g.items.some(isPartial);
    g.allReceived  = g.items.length > 0 && g.items.every(isReceived);
    g.allPrepared  = g.items.every((x) => N(x.remaining) === 0 && !isReceived(x) && !isDelivered(x));
  }

  // ---------- API ----------
  async function fetchAssigned() {
    const res = await fetch("/api/orders/assigned", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load assigned orders");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ---------- counters ----------
  const setCounter = (el, val) => { if (el) el.textContent = fmt(val); };
  function updateAllCounters(groupsPrepared, groupsMissing, groupsPartial, groupsReceived, groupsDelivered) {
    setCounter(cPrepared , groupsPrepared.length);
    setCounter(cMissing  , groupsMissing.length);
    setCounter(cPartial  , groupsPartial.length);
    setCounter(cReceived , groupsReceived.length);
    setCounter(cDelivered, groupsDelivered.length);
  }

  // ---------- UI tabs ----------
  function setActiveTab(tab) {
    activeTab = tab;
    [
      [btnPrepared,"prepared"],
      [btnMissing,"missing"],
      [btnPartial,"partial"],
      [btnReceived,"received"],
      [btnDelivered,"delivered"]
    ].forEach(([b,t])=>{
      if (!b) return;
      const on = (t === tab);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const url = new URL(location.href);
    url.searchParams.set("tab", tab);
    history.replaceState({}, "", url);
  }

  // ---------- actions ----------
  async function markGroupReceived(group, buttonEl) {
    const prevText = buttonEl ? buttonEl.textContent : "";
    try {
      if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = "Saving..."; }

      // العناصر القابلة للاستلام
      const candidates = (activeTab === "prepared")
        ? group.items.filter(it => !isReceived(it))
        : group.items.filter(it => !isReceived(it) && N(it.available) > 0);

      // تقسيم: كامل vs جزئي (حسب remaining)
      const toReceivedIds = [];
      const toPartialIds  = [];
      for (const it of candidates) {
        const pid = it.pageId;
        if (!pid) continue;
        if (N(it.remaining) > 0) toPartialIds.push(pid);
        else                     toReceivedIds.push(pid);
      }

      if (toReceivedIds.length === 0 && toPartialIds.length === 0) {
        throw new Error("No eligible items to receive");
      }

      await postJSON(MARK_RECEIVED_URL, {
        pageIds: toReceivedIds,
        pageIdsPartial: toPartialIds,
      });

      // تحديث محلي للحالة
      const setReceived = new Set(toReceivedIds.map(String));
      const setPartial  = new Set(toPartialIds.map(String));
      allItems = allItems.map(r => {
        const rPageId = r.pageId || r.page_id || r.notionPageId || r.notion_page_id || r.id;
        const key = String(rPageId);
        if (setReceived.has(key)) {
          return { ...r, operationsStatus: "Received by operations", status: "Received by operations" };
        }
        if (setPartial.has(key)) {
          return { ...r, operationsStatus: "Partially received by operations", status: "Partially received by operations" };
        }
        return r;
      });

      render();
    } catch (e) {
      console.error(e);
      if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = prevText || "Mark Received"; }
      alert("Failed to mark as received. Please try again.");
    }
  }

  // ---------- render ----------
  function render() {
    if (!grid) return;
    grid.innerHTML = "";

    const q = (searchInput?.value || "").trim().toLowerCase();

    const groupsAll = buildGroups(allItems);

    const groupsPrepared = groupsAll.filter(g => g.allPrepared);

    // Missing: فيها ناقص، ومافيهاش لا Received ولا Partial
    const groupsMissing  = groupsAll.filter(g =>
      g.items.some(x => N(x.remaining) > 0) &&
      g.items.every(x => !isReceived(x) && !isPartial(x))
    );

    // Partially received: فيها عنصر Partial أو (ناقص + فيها Received)
    const groupsPartial  = groupsAll.filter(g =>
      g.anyPartial || (g.items.some(x => N(x.remaining) > 0) && g.items.some(isReceived))
    );

    // Received: كل العناصر Received
    const groupsReceived = groupsAll.filter(g => g.allReceived);

    // Delivered (لو عندك تعريف للحالة)
    const groupsDelivered = groupsAll
      .map(g => ({ ...g, items: g.items.filter(isDelivered) }))
      .filter(g => g.items.length);

    // counters
    updateAllCounters(groupsPrepared, groupsMissing, groupsPartial, groupsReceived, groupsDelivered);

    // search
    const filterByQuery = (gs) => {
      if (!q) return gs;
      return gs.map(g => ({
        ...g,
        items: g.items.filter(it =>
          it.productName.toLowerCase().includes(q) ||
          (g.title || "").toLowerCase().includes(q)
        )
      })).filter(g => g.items.length);
    };

    const viewSets = {
      prepared : filterByQuery(groupsPrepared),
      missing  : filterByQuery(groupsMissing),
      partial  : filterByQuery(groupsPartial),
      received : filterByQuery(groupsReceived),
      delivered: filterByQuery(groupsDelivered)
    };

    const view = viewSets[activeTab] || [];
    if (!view.length) { if (emptyMsg) emptyMsg.style.display = ""; return; }
    if (emptyMsg) emptyMsg.style.display = "none";

    for (const g of view) {
      const card = document.createElement("div");
      card.className = "order-card";
      card.dataset.key  = g.key;
      card.dataset.miss = String(g.miss);

      let actionsHTML = "";
      if (activeTab === "prepared") {
        actionsHTML = `<button class="btn btn-primary btn-sm" data-act="mark-received">Mark Received</button>`;
      } else if (activeTab === "missing" || activeTab === "partial") {
        actionsHTML = `<button class="btn btn-primary btn-sm" data-act="mark-received">Mark Received Anyway</button>`;
      }

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
              <div class="item-left">
                <div class="item-name">${esc(it.productName)}</div>
              </div>
              <div class="item-mid">
                <div class="num">Req: <strong>${fmt(it.requested)}</strong></div>
                <div class="num">Avail: <strong data-col="available">${fmt(it.available)}</strong></div>
                <div class="num">
                  Rem:
                  <span class="pill ${N(it.remaining) > 0 ? "pill--danger" : "pill--success"}" data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `;

      const btn = card.querySelector('[data-act="mark-received"]');
      if (btn) btn.addEventListener("click", () => markGroupReceived(g, btn));

      grid.appendChild(card);
    }

    window.feather?.replace?.({ "stroke-width": 2 });
  }

  // ---------- init ----------
  async function load() {
    try {
      const raw = await fetchAssigned();
      allItems = raw;
      render();
    } catch (e) {
      console.error(e);
      if (grid) grid.innerHTML = '<div class="error">Failed to load items.</div>';
      [cPrepared,cMissing,cPartial,cReceived,cDelivered].forEach(el => el && (el.textContent="0"));
    }
  }

  [[btnPrepared,"prepared"],[btnMissing,"missing"],[btnPartial,"partial"],[btnReceived,"received"],[btnDelivered,"delivered"]]
    .forEach(([btn,tab])=>{
      btn && btn.addEventListener("click", ()=>{ setActiveTab(tab); render(); });
    });

  setActiveTab(activeTab);
  searchInput && searchInput.addEventListener("input", render);
  load();
})();