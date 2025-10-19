/* EmptyCanvas/public/js/logistics.js */
(function () {
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

  const searchInput   = $('#logisticsSearch') || $('#search');
  const grid          = $('#logistics-grid');
  const emptyMsg      = $('#logistics-empty');

  const btnPrepared   = $('#lg-btn-prepared');
  const btnMissing    = $('#lg-btn-missing');
  const btnPartial    = $('#lg-btn-partial');
  const btnReceived   = $('#lg-btn-received');
  const btnDelivered  = $('#lg-btn-delivered');

  const cPrepared   = $('#lg-prepared');
  const cMissing    = $('#lg-missing');
  const cPartial    = $('#lg-partial');
  const cReceived   = $('#lg-received');
  const cDelivered  = $('#lg-delivered');

  let allItems  = [];
  let activeTab = (new URLSearchParams(location.search).get('tab') || 'prepared').toLowerCase();

  const statusOf   = (it) => S(it.operationsStatus || it.status || '').toLowerCase();
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
      created: S(it.createdTime || it.created || ''),
      productName: S(it.productName ?? ''),
      requested: req,
      available: avail,
      remaining: rem,
      status: statusOf(it),
      rec: N(it.quantityReceivedByOperations ?? it.rec ?? 0)
    };
  }

  const groupKeyOf = (it) => `${it.reason || 'No Reason'}|${(it.created || '').slice(0,10)}`;

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
    return [...map.values()];
  }

  async function fetchAssigned() {
    const res = await fetch('/api/orders/assigned', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  const setCounter = (el, v) => el && (el.textContent = fmt(v));
  function updateAllCounters(sets) {
    setCounter(cPrepared , sets.prepared.length);
    setCounter(cMissing  , sets.missing.length);
    setCounter(cPartial  , sets.partial.length);
    setCounter(cReceived , sets.received.length);
    setCounter(cDelivered, sets.delivered.length);
  }

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

  // ----------- تعديل الجزء المطلوب فقط -----------
  async function markGroupReceivedAnyway(group, buttonEl) {
    try {
      if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Saving...'; }

      const itemIds = [];
      const statusById = {};
      const recMap = {};

      for (const it of group.items) {
        const rem = N(it.remaining);
        const avail = N(it.available);
        const id = it.id;
        if (!id) continue;
        if (rem === 0) {
          itemIds.push(id);
          statusById[id] = 'Received by operations';
          recMap[id] = avail;
        } else if (rem > 0 && avail > 0) {
          itemIds.push(id);
          statusById[id] = 'Partially received by operations';
          recMap[id] = avail;
        }
      }

      if (!itemIds.length) {
        if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Mark Received Anyway'; }
        alert('Nothing to update for this group.');
        return;
      }

      const res = await fetch('/api/logistics/mark-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ itemIds, statusById, recMap })
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || 'Unknown error');

      // ✅ تحديث الحالة محليًا
      allItems = allItems.map(r => {
        const id = r.id;
        if (statusById[id]) {
          r.operationsStatus = statusById[id];
          r.status = statusById[id];
          r.rec = recMap[id];
        }
        return r;
      });

      // ✅ اخفاء العناصر rem=0 من تبويب Missing فقط
      if (activeTab === 'missing') {
        allItems = allItems.filter(r => !(statusById[r.id] === 'Received by operations' && N(r.remaining) === 0));
      }

      render();
    } catch (err) {
      console.error(err);
      alert('Failed to mark as received. Please try again.');
      if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Mark Received Anyway'; }
    }
  }
  // -----------------------------------------------

  function render() {
    if (!grid) return;
    grid.innerHTML = '';
    const q = (searchInput?.value || '').trim().toLowerCase();
    const groupsAll = buildGroups(allItems);
    const sets = {
      prepared : groupsAll.filter(g => g.items.every(it => it.remaining === 0 && !isReceived(it))),
      missing  : groupsAll.filter(g => g.items.some(it => N(it.remaining) > 0)),
      partial  : groupsAll.map(g => ({...g, items: g.items.filter(it => isPartial(it))})).filter(g => g.items.length),
      received : groupsAll.map(g => ({...g, items: g.items.filter(it => isReceived(it))})).filter(g => g.items.length),
      delivered: groupsAll.map(g => ({...g, items: g.items.filter(it => isDelivered(it))})).filter(g => g.items.length),
    };
    updateAllCounters(sets);

    const view = (sets[activeTab] || []).map(g => {
      if (!q) return g;
      const gi = g.items.filter(it =>
        it.productName.toLowerCase().includes(q) ||
        (g.title || '').toLowerCase().includes(q)
      );
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

      const btnMra = card.querySelector('[data-act="mra"]');
      if (btnMra) btnMra.addEventListener('click', () => markGroupReceivedAnyway(g, btnMra));
      grid.appendChild(card);
    }

    window.feather?.replace?.({ 'stroke-width': 2 });
  }

  async function load() {
    try {
      allItems = await fetchAssigned();
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