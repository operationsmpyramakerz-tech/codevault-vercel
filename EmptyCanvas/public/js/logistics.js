// Logistics page: Tabs (Fully prepared / Received / Delivered) + counters + Storage-like cards
(function () {
  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const N  = (v) => Number.isFinite(+v) ? +v : 0;
  const fmt = (v) => String(N(v));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  // ---------- DOM ----------
  const searchInput = $('#logisticsSearch') || $('#search') || $('input[type="search"]');
  // الحاوية: خليك مرن — لو موجودة logistics-grid استخدمها، وإلا assigned-grid
  const grid = $('#logistics-grid') || $('#assigned-grid') || $('.assigned-grid') || $('main');
  const emptyMsg = $('#logistics-empty') || $('#assigned-empty') || (() => {
    const d = document.createElement('div');
    d.id = 'logistics-empty';
    d.className = 'muted';
    d.style.display = 'none';
    d.textContent = 'No items.';
    (grid?.parentElement || document.body).appendChild(d);
    return d;
  })();

  // أزرار التبويب (بتعمل shadow من الـ HTML)
  const tabs = {
    prepared:  $('#lg-btn-prepared'),
    received:  $('#lg-btn-received'),
    delivered: $('#lg-btn-delivered'),
  };

  // العدادات
  const kpi = {
    prepared:  $('#lg-prepared'),
    received:  $('#lg-received'),
    delivered: $('#lg-delivered'),
  };

  let groups   = [];
  let currentTab = readTabFromURL();

  // ---------- API ----------
  async function fetchAssigned() {
    const res = await fetch('/api/orders/assigned', {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ---------- normalize & grouping ----------
  function normalizeItem(it) {
    const req   = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    let rem     = it.remaining ?? it.rem;
    rem = (rem == null ? Math.max(0, req - avail) : N(rem));
    return {
      id: it.id,
      productName: it.productName ?? it.product_name ?? '-',
      reason: (it.reason && String(it.reason).trim()) || 'No Reason',
      requested: req,
      available: avail,
      remaining: rem,
      status: String(it.status || ''),
      created: it.createdTime || it.created_time || it.created || ''
    };
  }

  function groupKeyOf(it) {
    const bucket = (it.created || '').slice(0, 10);
    return `grp:${it.reason}|${bucket}`;
  }

  function recomputeGroupStats(g) {
    g.total = g.items.length;
    g.miss  = g.items.filter(x => N(x.remaining) > 0).length;

    // Fully prepared = كل العناصر remaining=0 وحالتها Prepared
    const allZero = g.items.every(x => N(x.remaining) === 0);
    const allPreparedStatus = g.items.every(x => x.status === 'Prepared');

    // Received tab = كل العناصر status='Received by operations'
    const allReceived = g.items.every(x => x.status === 'Received by operations');

    // Delivered tab = كل العناصر status='Delivered'
    const allDelivered = g.items.every(x => x.status === 'Delivered');

    g.prepared  = allZero && allPreparedStatus;
    g.received  = allReceived;
    g.delivered = allDelivered;
  }

  function buildGroups(list) {
    const map = new Map();
    for (const raw of list) {
      const it = normalizeItem(raw);
      const key = groupKeyOf(it);
      const g = map.get(key) || {
        key,
        title: it.reason,
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

  // ---------- counters ----------
  function updateCounters() {
    const preparedCount  = groups.filter(g => g.prepared).length;
    const receivedCount  = groups.filter(g => g.received).length;
    const deliveredCount = groups.filter(g => g.delivered).length;

    if (kpi.prepared)  kpi.prepared.textContent  = fmt(preparedCount);
    if (kpi.received)  kpi.received.textContent  = fmt(receivedCount);
    if (kpi.delivered) kpi.delivered.textContent = fmt(deliveredCount);
  }

  // ---------- filtering & render ----------
  function filteredGroups() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const base = q
      ? groups.filter(g =>
          g.title.toLowerCase().includes(q) ||
          g.items.some(it => (it.productName || '').toLowerCase().includes(q))
        )
      : groups;

    if (currentTab === 'prepared')   return base.filter(g => g.prepared);
    if (currentTab === 'received')   return base.filter(g => g.received);
    if (currentTab === 'delivered')  return base.filter(g => g.delivered);
    return base;
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = '';

    updateCounters();

    const view = filteredGroups();
    if (!view.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of view) {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.key = g.key;
      card.dataset.miss = String(g.miss);

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
            <span class="badge badge--count">Items: ${fmt(g.total)}</span>
            <span class="badge badge--missing">Missing: ${fmt(g.miss)}</span>
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
                  <span class="pill ${N(it.remaining) > 0 ? 'pill--danger' : 'pill--success'}" data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      grid.appendChild(card);
    }

    if (window.feather?.replace) window.feather.replace({ 'stroke-width': 2 });
  }

  // ---------- tabs logic ----------
  function readTabFromURL() {
    const p = (new URLSearchParams(location.search).get('tab') || '').toLowerCase();
    if (p === 'prepared' || p === 'received' || p === 'delivered') return p;
    return 'prepared';
  }

  function setActiveTab(tab) {
    currentTab = tab;
    // تفعيل/تعطيل ظل التبويب (CSS في HTML)
    Object.entries(tabs).forEach(([key, btn]) => {
      const on = key === tab;
      btn?.classList.toggle('active', on);
      btn?.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn?.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    // حدث URL بدون ريفرش
    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    history.replaceState({}, '', url);

    render();
  }

  // استمع لإيفنت من الـ HTML لما المستخدم يضغط تبويب
  window.addEventListener('logistics:set-filter-from-tab', (ev) => {
    const tab = String(ev.detail?.tab || '').toLowerCase();
    if (tab === 'prepared' || tab === 'received' || tab === 'delivered') {
      setActiveTab(tab);
    }
  });

  // لو مفيش إيفنت (فتح الصفحة مباشرة) — فعّل من الـURL
  function initTabs() {
    const tab = readTabFromURL();
    setActiveTab(tab);

    tabs.prepared?.addEventListener('click', () => setActiveTab('prepared'));
    tabs.received?.addEventListener('click', () => setActiveTab('received'));
    tabs.delivered?.addEventListener('click', () => setActiveTab('delivered'));
  }

  // ---------- init ----------
  async function load() {
    try {
      const raw = await fetchAssigned();
      groups = buildGroups(raw);
      initTabs();
    } catch (e) {
      console.error(e);
      if (grid) grid.innerHTML = '<div class="error">Failed to load items.</div>';
    }
  }

  searchInput && searchInput.addEventListener('input', render);

  load();
})();