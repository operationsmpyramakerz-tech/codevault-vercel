// Logistics page
// Prepared = Fully available من Storage
// نفس كروت Storage: order-card + نفس عناصره الداخلية

(function () {
  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n ?? ''));

  // ---------- DOM ----------
  const searchInput      = $('#logisticsSearch');
  const preparedCountEl  = $('#lg-count-prepared');
  const receivedCountEl  = $('#lg-count-received');
  const deliveredCountEl = $('#lg-count-delivered');
  const grid             = $('#assigned-grid');
  const emptyMsg         = $('#assigned-empty');

  // ---------- active tab (الزرار العلوي) ----------
  let active = 'Prepared';
  $('#lg-btn-prepared')?.addEventListener('click', () => switchTab('Prepared'));
  $('#lg-btn-received')?.addEventListener('click', () => switchTab('Received'));
  $('#lg-btn-delivered')?.addEventListener('click', () => switchTab('Delivered'));

  function switchTab(tab) {
    active = tab;
    $$('.stat.stat--btn').forEach(b => b.classList.toggle('active', b.dataset.filter === tab));
    load();
  }

  let allItems = [];

  // ---------- data ----------
  async function fetchAssigned() {
    const res = await fetch('/api/orders/assigned', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function fetchPrepared() {
    const items = await fetchAssigned();
    // Fully available = remaining/rem == 0
    return items.filter(it => Number(it.remaining ?? it.rem ?? 0) === 0);
  }

  async function fetchReceived() {
    // لو عندك API لوجستيات ممكن تغيّره هنا
    try {
      const r = await fetch('/api/logistics/received', { cache: 'no-store', credentials: 'same-origin' });
      if (r.ok) {
        const arr = await r.json();
        if (Array.isArray(arr)) return arr;
      }
    } catch {}
    return [];
  }

  async function fetchDelivered() {
    try {
      const r = await fetch('/api/logistics/delivered', { cache: 'no-store', credentials: 'same-origin' });
      if (r.ok) {
        const arr = await r.json();
        if (Array.isArray(arr)) return arr;
      }
    } catch {}
    return [];
  }

  // ---------- grouping بنفس منطق Storage ----------
  function groupByOrder(items) {
    const map = new Map();
    for (const it of items) {
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
    return Array.from(map.values()).sort(
      (a, b) => (b.createdTime || '').localeCompare(a.createdTime || '')
    );
  }

  // ---------- render card = نفس HTML Storage ----------
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
    preparedCountEl && (preparedCountEl.textContent  = fmt(active === 'Prepared' ? list.length : 0));
    receivedCountEl && (receivedCountEl.textContent  = fmt(active === 'Received' ? list.length : 0));
    deliveredCountEl && (deliveredCountEl.textContent = fmt(active === 'Delivered' ? list.length : 0));

    if (!groups.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of groups) {
      const total   = g.items.length;
      const missing = g.items.filter(x => Number(x.remaining ?? x.rem ?? 0) > 0).length;

      const card = document.createElement('div');
      card.className = 'order-card';

      card.innerHTML = `
        <div class="order-card__header">
          <div class="order-card__title">
            <div class="order-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="order-meta">
              <div class="reason">${escapeHtml(g.reason)}</div>
              <div class="created">${escapeHtml(g.createdTime || '')}</div>
            </div>
          </div>
          <div class="order-card__actions">
            <span class="badge badge--count">Items: ${fmt(total)}</span>
            <span class="badge badge--missing">Missing: ${fmt(missing)}</span>
          </div>
        </div>

        <div class="order-card__items">
          ${g.items.map(it => `
            <div class="order-item" id="row-${it.id}">
              <div class="item-left">
                <div class="prod">${escapeHtml(it.productName || it.product_name || '')}</div>
              </div>
              <div class="item-right">
                <span class="pill pill-gray">Req: ${fmt(it.requested ?? it.req ?? 0)}</span>
                <span class="pill pill-green">Avail: ${fmt(it.available ?? it.avail ?? 0)}</span>
                <span class="pill pill-amber">Rem: ${fmt(it.remaining ?? it.rem ?? 0)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      grid.appendChild(card);
    }

    if (window.feather?.replace) window.feather.replace();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  // ---------- load ----------
  async function load() {
    try {
      let list = [];
      if (active === 'Prepared')      list = await fetchPrepared();
      else if (active === 'Received') list = await fetchReceived();
      else                            list = await fetchDelivered();

      allItems = list;
      render(allItems);
    } catch (err) {
      console.error(err);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
      preparedCountEl && (preparedCountEl.textContent = '0');
      receivedCountEl && (receivedCountEl.textContent = '0');
      deliveredCountEl && (deliveredCountEl.textContent = '0');
    }
  }

  // search
  searchInput?.addEventListener('input', () => render(allItems));

  // init
  load();
})();