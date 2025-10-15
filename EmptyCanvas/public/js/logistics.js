/* EmptyCanvas/public/js/logistics.js
   Logistics:
   - Tabs: prepared / missing / partial / received / delivered
   - Missing tab shows full order items UNTIL user presses "Mark Received Anyway".
     After pressing it, items whose status becomes "Received by operations"
     will be hidden from the Missing tab (others remain).
   - "Mark Received" (prepared) & "Mark Received Anyway" (missing)
   - Status rules on "Mark Received Anyway":
       * rem == 0                       => Received by operations (rec = avail)
       * rem > 0 && avail > 0           => Partially received by operations (rec = avail)
       * rem > 0 && avail == 0          => (no change)
   - On any receive action we record the current Avail into Notion number
     field "Quantity received by operations" via `recMap`.
*/

(function () {
  // ------------ helpers ------------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const N  = (v) => Number.isFinite(+v) ? +v : 0;
  const S  = (v) => String(v ?? '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c]));
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
      pageId: it.pageId || it.page_id || it.notionPageId || it.id,
      reason: S(it.reason || ''),
      created: S(it.createdTime || it.created_time || it.created || ''),
      productName: S(it.productName ?? it.product_name ?? ''),
      requested: req,
      available: avail,
      remaining: rem,
      status: statusOf(it),
      rec: N(it.quantityReceivedByOperations ?? it.rec ?? 0),
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
  // Prepared tab: mark whole group as 'Received by operations'
  async function markGroupReceived(group, buttonEl) {
    try {
      if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Saving...'; }
      const itemIds = group.items.map(i => i.id).filter(Boolean);
      if (!itemIds.length) return;

      const statusById = {};
      const recMap = {};
      for (const it of group.items) {
        if (!it.id) continue;
        statusById[it.id] = 'Received by operations';
        recMap[it.id] = N(it.available);
      }

      const out = await postJSON('/api/logistics/mark-received', { itemIds, statusById, recMap });
      if (!out.ok) throw new Error(out.error || 'API failed');

      // Update local state
      allItems = allItems.map(r => {
        const id = r.id;
        if (!id || !statusById[id]) return r;
        return { ...r, operationsStatus: statusById[id], status: statusById[id], rec: recMap[id] };
      });
      render();
    } catch (e) {
      console.error(e);
      alert('Failed to mark as received. Please try again.');
      if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Mark Received'; }
    }
  }

  // Missing tab: smart status depending on rem/avail
  async function markGroupReceivedAnyway(group, buttonEl) {
    try {
      if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Saving...'; }

      const itemIds = [];
      const statusById = {};
      const recMap = {};

      for (const it of group.items) {
        const rem = N(it.remaining);
        const avail = N(it.available);
        if (!it.id) continue;

        if (rem === 0) {
          itemIds.push(it.id);
          statusById[it.id] = 'Received by operations';
          recMap[it.id] = avail;
        } else if (rem > 0 && avail > 0) {
          itemIds.push(it.id);
          statusById[it.id] = 'Partially received by operations';
          recMap[it.id] = avail;
        }
        // rem>0 && avail==0 => skip (still Missing/Pending)
      }

      if (!itemIds.length) {
        if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Mark Received Anyway'; }
        alert('Nothing to update for this group.');
        return;
      }

      const out = await postJSON('/api/logistics/mark-received', { itemIds, statusById, recMap });
      if (!out.ok) throw new Error(out.error || 'API failed');

      // Local update & re-render (items that became "Received" disappear from Missing tab)
      allItems = allItems.map(r => {
        const id = r.id;
        if (!id || !statusById[id]) return r;
        return { ...r, operationsStatus: statusById[id], status: statusById[id], rec: recMap[id] };
      });
      render();
    } catch (err) {
      console.error(err);
      alert('Failed to mark as received. Please try again.');
      if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Mark Received Anyway'; }
    }
  }

  // ------------ render ------------
  function render() {
    if (!grid) return;
    grid.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();
    const groupsAll = buildGroups(allItems);

    const sets = {
      prepared : groupsAll.filter(g => g.allPrepared),
      // Keep a group in "missing" while ANY item has rem>0;
      // But hide items whose status became "Received by operations"
      // (so they disappear after pressing 'Mark Received Anyway').
      missing  : groupsAll.filter(g => g.missingCnt > 0),
      partial  : groupsAll.map(g => ({...g, items: g.items.filter(it => isPartial(it))})).filter(g => g.items.length),
      received : groupsAll.map(g => ({...g, items: g.items.filter(it => isReceived(it))})).filter(g => g.items.length),
      delivered: groupsAll.map(g => ({...g, items: g.items.filter(it => isDelivered(it))})).filter(g => g.items.length),
    };

    updateAllCounters(sets);

    const view = (sets[activeTab] || []).map(g => {
      let gi = g.items;
      if (activeTab === 'missing') {
        gi = g.items.filter(it => !isReceived(it)); // hide received items only in Missing tab
      }
      if (q) {
        gi = gi.filter(it =>
          it.productName.toLowerCase().includes(q) ||
          (g.title || '').toLowerCase().includes(q)
        );
      }
      return { ...g, items: gi };
    }).filter(g => g.items.length);

    if (!view.length) { if (emptyMsg) emptyMsg.style.display = ''; return; }
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