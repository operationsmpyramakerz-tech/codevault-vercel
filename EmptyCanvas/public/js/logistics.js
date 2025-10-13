// Logistics: تبويبات أعلى الصفحة + كروت مطابقة لصفحة Storage
// - تبويب Fully prepared يعرُض الجروبات اللي كل عناصرها remaining=0
// - زر التبويب النشط عليه .active (Shadow زي Storage)
// - العداد في الكارت يتحدث بعد الفلترة

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

  // ---------- DOM refs ----------
  const searchInput =
    $('#logisticsSearch') || $('#search') || $('input[type="search"]');

  const grid = $('#assigned-grid') || $('.assigned-grid') || $('main');

  const emptyMsg = $('#assigned-empty') || (() => {
    const d = document.createElement('div');
    d.id = 'assigned-empty';
    d.className = 'muted';
    d.style.display = 'none';
    d.textContent = 'No items.';
    (grid?.parentElement || document.body).appendChild(d);
    return d;
  })();

  // تبويبات
  const tabBtns = {
    FullyPrepared: $('#lg-tab-prepared'),
    Received:      $('#lg-tab-received'),
    Delivered:     $('#lg-tab-delivered')
  };
  const kpi = {
    prepared:  $('#lg-count-prepared'),
    received:  $('#lg-count-received'),
    delivered: $('#lg-count-delivered'),
  };

  let allItems = [];
  let currentTab = 'FullyPrepared';

  // ---------- normalize & group ----------
  function normalizeItem(it) {
    const req   = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    let rem     = it.remaining ?? it.rem;
    rem = (rem == null ? Math.max(0, req - avail) : N(rem));
    return {
      id: it.id,
      productName: it.productName ?? it.product_name ?? '',
      requested: req,
      available: avail,
      remaining: rem,
      reason: (it.reason && String(it.reason).trim()) || 'No Reason',
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
    g.prepared = g.items.every(x => N(x.remaining) === 0);
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
        items: []
      };
      g.items.push(it);
      map.set(key, g);
    }
    const arr = [...map.values()];
    arr.forEach(recomputeGroupStats);
    return arr;
  }

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

  // ---------- counts ----------
  function updateCounts(groups) {
    const preparedCount  = groups.filter(g => g.prepared).length;
    // مبدئيًا: Received/Delivered = 0 لحد ما نوصل الـAPI الخاص بيهم
    const receivedCount  = 0;
    const deliveredCount = 0;
    if (kpi.prepared)  kpi.prepared.textContent  = fmt(preparedCount);
    if (kpi.received)  kpi.received.textContent  = fmt(receivedCount);
    if (kpi.delivered) kpi.delivered.textContent = fmt(deliveredCount);
  }

  // ---------- render ----------
  function render(list) {
    if (!grid) return;
    grid.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? list.filter(x =>
          (x.reason || '').toLowerCase().includes(q) ||
          (x.productName || '').toLowerCase().includes(q)
        )
      : list;

    const groupsAll = buildGroups(filtered);
    updateCounts(groupsAll);

    // تبويب: نعرض فقط fully prepared في تبويب FullyPrepared
    let groupsToShow = groupsAll;
    if (currentTab === 'FullyPrepared') {
      groupsToShow = groupsAll.filter(g => g.prepared);
    } else if (currentTab === 'Received') {
      groupsToShow = []; // هتكمل لما نربط API الاستلام
    } else if (currentTab === 'Delivered') {
      groupsToShow = []; // هتكمل لما نربط API التسليم
    }

    if (!groupsToShow.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of groupsToShow) {
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

  // ---------- tabs ----------
  function setActiveTab(tabName) {
    currentTab = tabName;
    Object.entries(tabBtns).forEach(([name, btn]) => {
      const active = name === tabName;
      btn?.classList.toggle('active', active);
      btn?.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    render(allItems);
  }

  tabBtns.FullyPrepared?.addEventListener('click', () => setActiveTab('FullyPrepared'));
  tabBtns.Received?.addEventListener('click',      () => setActiveTab('Received'));
  tabBtns.Delivered?.addEventListener('click',     () => setActiveTab('Delivered'));

  // ---------- init ----------
  async function load() {
    try {
      allItems = await fetchAssigned();
      setActiveTab('FullyPrepared'); // default
    } catch (e) {
      console.error(e);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
    }
  }

  searchInput && searchInput.addEventListener('input', () => render(allItems));

  load();
})();