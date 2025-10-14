/* EmptyCanvas/public/js/logistics.js
   Logistics:
   - Tabs: prepared / missing / partial / received / delivered
   - Missing tab shows FULL order items as long as ANY item has rem>0
   - "Mark Received" (prepared) & "Mark Received Anyway" (missing)
   - Status rules on "Mark Received Anyway":
       * rem == 0                       => Received by operations
       * rem > 0 && avail > 0           => Partially received by operations
       * rem > 0 && avail == 0          => (no change)
*/

(function () {
  // ------------ helpers ------------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const N  = (v) => Number.isFinite(+v) ? +v : 0;
  const S  = (v) => String(v ?? '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v) => String(N(v));

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      throw new Error(`POST ${url} -> ${res.status} ${t}`);
    }
    try { return await res.json(); } catch { return {}; }
  }

  // ------------ DOM refs ------------
  const searchInput   = $('#logisticsSearch') || $('#search') || $('input[type="search"]');
  const grid          = $('#logistics-grid') || $('#assigned-grid') || $('main');
  const emptyMsg      = $('#logistics-empty') || $('#assigned-empty');

  const btnPrepared   = $('#lg-btn-prepared');
  const btnMissing    = $('#lg-btn-missing');
  const btnPartial    = $('#lg-btn-partial');
  const btnReceived   = $('#lg-btn-received');
  const btnDelivered  = $('#lg-btn-delivered');

  const cPrepared   = $('#lg-prepared')  || $('#lg-count-prepared');
  const cMissing    = $('#lg-missing')   || $('#lg-count-missing');
  const cPartial    = $('#lg-partial')   || $('#lg-count-partial');
  const cReceived   = $('#lg-received')  || $('#lg-count-received');
  const cDelivered  = $('#lg-delivered') || $('#lg-count-delivered');

  // ------------ state ------------
  let allItems  = [];
  let activeTab = (new URLSearchParams(location.search).get('tab') || 'prepared').toLowerCase();

  // ------------ normalize & grouping ------------
  const statusOf   = (it) => S(it.operationsStatus || it.opsStatus || it.status || '').toLowerCase();
  const isReceived = (it) => statusOf(it) === 'received by operations';
  const isPartial  = (it) => statusOf(it) === 'partially received by operations';
  const isDelivered= (it) => statusOf(it) === 'delivered';

  function normalizeItem(it) {
    const req   = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    let rem     = it.remaining ?? it.rem;
    rem = (rem == null ? Math.max(0, req - avail) : N(rem));
    return {
      id: it.id,
      reason: S(it.reason || ''),
      created: S(it.createdTime || it.created_time || it.created || ''),
      productName: S(it.productName ?? it.product_name ?? ''),
      requested: req,
      available: avail,
      remaining: rem,
      status: statusOf(it),
      rec: N(it.quantityReceivedByOperations ?? it.rec ?? 0) // للعرض لو موجود
    };
  }

  const groupKeyOf = (it) => {
    const reason = (it.reason && String(it.reason).trim()) || 'No Reason';
    const day    = (it.created || '').slice(0,10);
    return `grp:${reason}|${day}`;
  };

  function buildGroups(list) {
    const map = new Map();
    for (const raw of list) {
      const it  = normalizeItem(raw);
      const key = groupKeyOf(it);
      const g = map.get(key) || {
        key,
        title: it.reason || 'No Reason',
        subtitle: new Date(it.created || Date.now()).toLocaleString(),
        items: []
      };
      g.items.push(it);
      map.set(key, g);
    }
    const arr = [...map.values()];
    arr.forEach(recomputeGroupStats);
    return arr;
  }

  function recomputeGroupStats(g) {
    g.total       = g.items.length;
    g.missingCnt  = g.items.filter(x => N(x.remaining) > 0).length;
    g.allPrepared = g.items.every(x => N(x.remaining) === 0 && !isReceived(x) && !isDelivered(x) && !isPartial(x));
    g.anyMissing  = g.missingCnt > 0;
    g.anyPartial  = g.items.some(isPartial);
    g.anyReceived = g.items.some(isReceived);
  }

  // ------------ API ------------
  async function fetchAssigned() {
    const res = await fetch('/api/orders/assigned', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ------------ counters ------------
  const setCounter = (el, v) => el && (el.textContent = fmt(v));

  function updateAllCounters(sets) {
    setCounter(cPrepared , sets.prepared.length);
    setCounter(cMissing  , sets.missing.length);
    setCounter(cPartial  , sets.partial.length);
    setCounter(cReceived , sets.received.length);
    setCounter(cDelivered, sets.delivered.length);
  }

  // ------------ tab switch ------------
  function setActiveTab(tab) {
    activeTab = tab;
    const entries = [
      [btnPrepared ,'prepared'],
      [btnMissing  ,'missing'],
      [btnPartial  ,'partial'],
      [btnReceived ,'received'],
      [btnDelivered,'delivered'],
    ];
    entries.forEach(([b, t])=>{
      if (!b) return;
      const on = (t === tab);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    history.replaceState({}, '', url);
  }

  // ------------ actions ------------
  async function markGroupReceived(group, buttonEl) {
  const originalText = buttonEl ? buttonEl.textContent : "";
  try {
    if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = "Saving..."; }

    let receivedIds = [];
    let partialIds  = [];

    if (activeTab === "prepared") {
      // في تبويب Fully prepared: كل العناصر تُعلَّم Received
      receivedIds = group.items
        .filter(it => !isReceived(it))
        .map(it => String(it.pageId || it.page_id || it.notionPageId || it.id))
        .filter(Boolean);

    } else if (activeTab === "missing") {
      // في تبويب Missing:
      // - العناصر التي rem == 0 => Received
      // - العناصر التي rem > 0 & avail > 0 => Partially received
      // - العناصر التي rem > 0 & avail == 0 => نسيبها كما هي
      for (const it of group.items) {
        const pid = String(it.pageId || it.page_id || it.notionPageId || it.id);
        if (!pid) continue;
        const rem = N(it.remaining);
        const avail = N(it.available);

        if (rem === 0) {
          receivedIds.push(pid);
        } else if (rem > 0 && avail > 0) {
          partialIds.push(pid);
        }
      }
    } else {
      // في تبويبات أخرى (لو احتجت مستقبلاً)
      receivedIds = group.items
        .map(it => String(it.pageId || it.page_id || it.notionPageId || it.id))
        .filter(Boolean);
    }

    if (receivedIds.length === 0 && partialIds.length === 0) {
      throw new Error("No eligible items to update");
    }

    // نرسل النوعين للـ API
    await postJSON("/api/logistics/mark-received", { receivedIds, partialIds });

    // حدّث الحالة محليًا علشان الـ UI يتحدّث فورًا
    const recSet = new Set(receivedIds);
    const parSet = new Set(partialIds);

    allItems = allItems.map(r => {
      const pid = String(r.pageId || r.page_id || r.notionPageId || r.id || "");
      if (recSet.has(pid)) {
        return { ...r, operationsStatus: "Received by operations", status: "Received by operations" };
      }
      if (parSet.has(pid)) {
        return { ...r, operationsStatus: "Partially received by operations", status: "Partially received by operations" };
      }
      return r;
    });

    render();
  } catch (e) {
    console.error(e);
    if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = originalText || "Mark Received"; }
    alert("Failed to mark as received. Please try again.");
  }
}

  // === المطلوب هنا ===
  async function markGroupReceivedAnyway(group, btn) {
    // 1) نخلي Missing يعرض كامل الطلب طالما فيه rem>0 (ده معمول في render)
    // 2) على الضغط:
    //   - rem == 0            => Received by operations
    //   - rem > 0 && avail>0  => Partially received by operations
    //   - rem > 0 && avail==0 => بلا تغيير
    const updates = [];
    for (const it of group.items) {
      const rem   = N(it.remaining);
      const avail = N(it.available);
      if (rem === 0) {
        updates.push({ id: it.id, rem: 0 });
      } else if (rem > 0 && avail > 0) {
        updates.push({ id: it.id, rem }); // السيرفر هيفهم إن دي Partial
      } // rem>0 && avail==0 => skip
    }
    if (!updates.length) return;

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      await postJSON('/api/logistics/mark-received', { updates });

      const m = new Map(updates.map(u => [u.id, u]));
      allItems = allItems.map(r => {
        const u = m.get(r.id);
        if (!u) return r;
        const next = (N(u.rem) > 0) ? 'Partially received by operations' : 'Received by operations';
        return { ...r, operationsStatus: next, status: next };
      });
      render(); // هيبقى في Missing طول ما فيه rem>0 لأي عنصر
    } catch (e) {
      console.error(e);
      if (btn) { btn.disabled = false; btn.textContent = 'Mark Received Anyway'; }
      alert('Failed to mark as received. Please try again.');
    }
  }

  // ------------ render ------------
  function render() {
    if (!grid) return;
    grid.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();

    const groupsAll = buildGroups(allItems);

    // sets:
    const sets = {
      prepared : groupsAll.filter(g => g.allPrepared),
      // ⬇️ Missing: لو فيه rem>0 في أي عنصر ⇒ أعرض كل عناصر الجروب (بدون تصفية)
      missing  : groupsAll.filter(g => g.missingCnt > 0),
      partial  : groupsAll.map(g => ({...g, items: g.items.filter(it => isPartial(it))})).filter(g => g.items.length),
      received : groupsAll.map(g => ({...g, items: g.items.filter(it => isReceived(it))})).filter(g => g.items.length),
      delivered: groupsAll.map(g => ({...g, items: g.items.filter(it => isDelivered(it))})).filter(g => g.items.length),
    };

    // counters
    updateAllCounters(sets);

    const view = (sets[activeTab] || []).map(g => {
      if (!q) return g;
      const gi = g.items.filter(it =>
        it.productName.toLowerCase().includes(q) ||
        (g.title || '').toLowerCase().includes(q)
      );
      return { ...g, items: gi };
    }).filter(g => g.items.length);

    if (!view.length) {
      if (emptyMsg) emptyMsg.style.display = '';
      return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    for (const g of view) {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.key = g.key;

      const showPreparedButton = (activeTab === 'prepared');
      const showMissingButton  = (activeTab === 'missing');

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
            ${ showPreparedButton ? `<button class="btn btn-primary btn-sm" data-act="mr">Mark Received</button>` : '' }
            ${ showMissingButton  ? `<button class="btn btn-danger  btn-sm" data-act="mra">Mark Received Anyway</button>` : '' }
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
                <div class="num">Rec: <strong data-col="rec">${fmt(it.rec)}</strong></div>
                <div class="num">
                  Rem:
                  <span class="pill ${N(it.remaining) > 0 ? 'pill--danger' : 'pill--success'}"
                        data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      const btnMr  = card.querySelector('[data-act="mr"]');
      const btnMra = card.querySelector('[data-act="mra"]');
      if (btnMr ) btnMr .addEventListener('click', () => markGroupReceived(g, btnMr));
      if (btnMra) btnMra.addEventListener('click', () => markGroupReceivedAnyway(g, btnMra));

      grid.appendChild(card);
    }

    window.feather?.replace?.({ 'stroke-width': 2 });
  }

  // ------------ init ------------
  async function load() {
    try {
      const raw = await fetchAssigned();
      allItems = raw;
      render();
    } catch (e) {
      console.error(e);
      if (grid) grid.innerHTML = '<div class="error">Failed to load items.</div>';
      [cPrepared,cMissing,cPartial,cReceived,cDelivered].forEach(el => el && (el.textContent='0'));
    }
  }

  [[btnPrepared,'prepared'],[btnMissing,'missing'],[btnPartial,'partial'],[btnReceived,'received'],[btnDelivered,'delivered']]
    .forEach(([b,t]) => b && b.addEventListener('click', () => { setActiveTab(t); render(); }));

  setActiveTab(activeTab);
  searchInput && searchInput.addEventListener('input', render);
  load();
})();