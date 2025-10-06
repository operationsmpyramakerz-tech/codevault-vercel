
// Logistics page script: show Prepared / Received / Delivered lists
(function () {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const fmt = n => typeof n === 'number' ? n.toLocaleString() : n ?? '';

  // DOM
  const searchInput = $('#search');
  const preparedCount = $('#prepared-count');
  const receivedCount = $('#received-count');
  const deliveredCount = $('#delivered-count');
  const grid = $('#assigned-grid');
  const emptyMsg = $('#assigned-empty');

  const url = new URL(location.href);
  let currentTab = (url.searchParams.get('tab') || 'Prepared').toLowerCase();

  let allItems = [];
  let groups = [];

  function groupByOrder(items) {
    const map = new Map();
    for (const it of items) {
      // derive key by order (reason + orderId or created time)
      const key = `${it.reason || 'Unknown'}|${it.orderId || it.order_id || it.createdTime || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          reason: it.reason || 'Unknown',
          createdTime: it.createdTime || it.created_time || '',
          items: [],
          total: 0,
          miss: 0,
          prepared: false,
        });
      }
      const g = map.get(key);
      g.items.push(it);
    }
    // finalize
    for (const g of map.values()) {
      g.total = g.items.length;
      g.miss  = g.items.filter(x => (Number(x.remaining ?? x.rem ?? 0) > 0)).length;
      g.prepared = g.miss === 0; // all items fully available
    }
    // newest first
    return Array.from(map.values()).sort((a,b) => (b.createdTime||'').localeCompare(a.createdTime||''));
  }

  async function fetchAssigned() {
    const res = await fetch('/api/orders/assigned', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  }

  async function fetchLogisticsList(state) {
    // Try dedicated logistics APIs first
    const endpoints = [
      `/api/logistics/${state}`,
      `/api/logistics?status=${encodeURIComponent(state)}`
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, { cache: 'no-store', credentials: 'same-origin' });
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length) return data;
        }
      } catch (e) {
        // ignore and fall back
      }
    }
    // Fallback for Prepared: compute from /api/orders/assigned
    if (state.toLowerCase() === 'prepared') {
      const items = await fetchAssigned();
      return items.filter(it => Number(it.remaining ?? it.rem ?? 0) === 0);
    }
    // Otherwise empty
    return [];
  }

  function render(list) {
    grid.innerHTML = '';
    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? list.filter(x => (x.reason||'').toLowerCase().includes(q) ||
                         (x.productName||'').toLowerCase().includes(q))
      : list;

    const gs = groupByOrder(filtered);

    // Update summary
    const preparedItems = (allItems.filter(it => Number(it.remaining ?? it.rem ?? 0) === 0)).length;
    preparedCount.textContent = fmt(preparedItems);
    receivedCount.textContent = fmt(0); // will be wired when backend is ready
    deliveredCount.textContent = fmt(0);

    if (!gs.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of gs) {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.innerHTML = `
        <div class="order-card__header">
          <div class="order-card__title">
            <div class="order-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <div class="order-meta">
              <div class="reason">${g.reason}</div>
              <div class="created">${g.createdTime || ''}</div>
            </div>
          </div>
          <div class="order-card__actions">
            <span class="badge badge--count">Items: ${fmt(g.total)}</span>
            <span class="badge badge--missing">Missing: ${fmt(g.miss)}</span>
            ${currentTab==='prepared' ? `<button class="btn btn-3d btn-3d-blue btn-icon" data-action="receive" data-ids="${g.items.map(i=>i.id).join(',')}">
              <i data-feather="inbox"></i><span>Received</span></button>` : ''}
          </div>
        </div>
        <div class="order-card__items">
          ${g.items.map(it => `
            <div class="order-item" id="row-${it.id}">
              <div class="item-left">
                <div class="prod">${it.productName || it.product_name || ''}</div>
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

    // hydrate icons if feather is on page
    if (window.feather?.replace) window.feather.replace();
  }

  async function load() {
    try {
      allItems = await fetchLogisticsList(currentTab);
      render(allItems);
    } catch (e) {
      console.error(e);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
    }
  }

  // Search
  if (searchInput) searchInput.addEventListener('input', () => render(allItems));

  // Initial
  load();
})();
