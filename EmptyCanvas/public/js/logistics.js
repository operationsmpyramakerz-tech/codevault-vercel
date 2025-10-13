// EmptyCanvas/public/js/logistics.js
// Logistics page: Prepared = Storage (Fully available). Received/Delivered placeholders.
// Renders cards بنفس ستايل Storage (order-card, pills, badges)

(function () {
  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) =>
    typeof n === 'number' ? n.toLocaleString() : (n ?? '');

  // ---------- DOM ----------
  const searchInput     = $('#search');
  const preparedCountEl = $('#prepared-count');
  const receivedCountEl = $('#received-count');
  const deliveredCountEl= $('#delivered-count');
  const grid            = $('#assigned-grid');
  const emptyMsg        = $('#assigned-empty');

  // ---------- routing (tab) ----------
  const url = new URL(location.href);
  let currentTab = (url.searchParams.get('tab') || 'Prepared').toLowerCase();

  let allItems = [];

  // ---------- data ----------
  async function fetchAssigned() {
    // نفس الـ API المستخدم في Storage
    const res = await fetch('/api/orders/assigned', {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function fetchLogistics(state /* 'prepared' | 'received' | 'delivered' */) {
    state = state.toLowerCase();

    if (state === 'prepared') {
      // Prepared = Fully available من Storage
      const items = await fetchAssigned();
      // العنصر جاهز لو remaining/rem == 0
      return items.filter(it => Number(it.remaining ?? it.rem ?? 0) === 0);
    }

    // أما Received / Delivered فلو لسه مش موصولة، نرجّع فاضي (هنوصلها لاحقاً)
    // حطينا محاولة على /api/logistics كإحتياط لو موجود عندك
    const endpoints = [
      `/api/logistics/${state}`,
      `/api/logistics?status=${encodeURIComponent(state)}`
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, { cache: 'no-store', credentials: 'same-origin' });
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr)) return arr;
        }
      } catch { /* ignore */ }
    }
    return [];
  }

  // ---------- grouping بنفس منطق Storage ----------
  function groupByOrder(items) {
    const map = new Map();
    for (const it of items) {
      // key by order (reason + createdTime or orderId)
      const key = `${it.reason || 'Unknown'}|${it.orderId || it.order_id || it.createdTime || it.created_time || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          reason: it.reason || 'Unknown',
          createdTime: it.createdTime || it.created_time || '',
          items: []
        });
      }
      map.get(key).items.push(it);
    }
    // newest first
    return Array.from(map.values()).sort(
      (a, b) => (b.createdTime || '').localeCompare(a.createdTime || '')
    );
  }

  // ---------- render ----------
  function render(list) {
    grid.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? list.filter(x =>
          (x.reason || '').toLowerCase().includes(q) ||
          (x.productName || x.product_name || '').toLowerCase().includes(q)
        )
      : list;

    const groups = groupByOrder(filtered);

    // counters
    if (preparedCountEl)  preparedCountEl.textContent  = fmt(list.length);
    if (receivedCountEl)  receivedCountEl.textContent  = fmt(0);
    if (deliveredCountEl) deliveredCountEl.textContent = fmt(0);

    if (!groups.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of groups) {
      const total = g.items.length;
      const missing = g.items.filter(x => Number(x.remaining ?? x.rem ?? 0) > 0).length;

      const card = document.createElement('div');
      card.className = 'order-card';

      card.innerHTML = `
        <div class="order-card__header">
          <div class="order-card__title">
            <div class="order-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="order-meta">
              <div class="reason">${g.reason}</div>
              <div class="created">${g.createdTime || ''}</div>
            </div>
          </div>
          <div class="order-card__actions">
            <span class="badge badge--count">Items: ${fmt(total)}</span>
            <span class="badge badge--missing">Missing: ${fmt(missing)}</span>
          </div>
        </div>
        <div class="order-card__items">
          ${g.items
            .map(
              (it) => `
              <div class="order-item" id="row-${it.id}">
                <div class="item-left">
                  <div class="prod">${it.productName || it.product_name || ''}</div>
                </div>
                <div class="item-right">
                  <span class="pill pill-gray">Req: ${fmt(it.requested ?? it.req ?? 0)}</span>
                  <span class="pill pill-green">Avail: ${fmt(it.available ?? it.avail ?? 0)}</span>
                  <span class="pill pill-amber">Rem: ${fmt(it.remaining ?? it.rem ?? 0)}</span>
                </div>
              </div>`
            )
            .join('')}
        </div>
      `;

      grid.appendChild(card);
    }

    // Feather icons (لو متحملة)
    if (window.feather?.replace) window.feather.replace();
  }

  // ---------- load ----------
  async function load() {
    try {
      const list = await fetchLogistics(currentTab);
      allItems = list;
      render(allItems);
    } catch (err) {
      console.error(err);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
    }
  }

  // search
  if (searchInput) searchInput.addEventListener('input', () => render(allItems));

  // initial
  load();
})();