// EmptyCanvas/public/js/logistics.js
// Logistics: يعرض Prepared (= Fully available من Storage) بنفس كروت Storage.
// Received/Delivered لسه بدون مصدر بيانات، فبنعدّهم 0 مؤقتاً.

(function () {
  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) => String(Number(n ?? 0));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  // ---------- DOM ----------
  const searchInput      = $('#search');
  const preparedCountEl  = $('#prepared-count');
  const receivedCountEl  = $('#received-count');
  const deliveredCountEl = $('#delivered-count');
  const grid             = $('#assigned-grid');
  const emptyMsg         = $('#assigned-empty');

  let allItems = [];
  let groups   = [];

  // ---------- storage-like grouping ----------
  const groupKeyOf = (it) => {
    const reason = (it.reason && String(it.reason).trim()) || 'No Reason';
    // نخلي الـ subtitle تاريخ الإنشاء زي Storage
    const created = it.createdTime || it.created_time || it.created || '';
    const bucket  = (created || '').slice(0, 10);
    return `grp:${reason}|${bucket}`;
  };

  function buildGroups(list) {
    const map = new Map();
    for (const it of list) {
      const key = groupKeyOf(it);
      const g = map.get(key) || {
        key,
        title: (it.reason && String(it.reason).trim()) || 'No Reason',
        subtitle: new Date(it.createdTime || Date.now()).toLocaleString(),
        items: []
      };
      g.items.push(it);
      map.set(key, g);
    }
    const arr = [...map.values()];
    arr.forEach(recomputeGroupStats);
    return arr;
  }

  // نفس منطق Storage: prepared لما rem=0 لكل عناصر الجروب
  function recomputeGroupStats(g) {
    const total = g.items.length;
    const full  = g.items.filter(x => Number(x.remaining ?? x.rem ?? 0) === 0).length;
    g.total = total;
    g.miss  = total - full;

    const allPrepared = g.items.every(x => Number(x.remaining ?? x.rem ?? 0) === 0);
    // لو بتستخدم status في النوشن/الـ API ممكن تضيف شرط إضافي هنا:
    // const allPrepared = g.items.every(x => String(x.status||'') === 'Prepared');
    g.prepared = allPrepared && g.miss === 0;
  }

  function updateHeaderCounts() {
    const preparedOrders = groups.filter(g => g.prepared).length;
    // لحد ما نوصل داتا Received/Delivered هنسيبهم 0
    preparedCountEl && (preparedCountEl.textContent = fmt(preparedOrders));
    receivedCountEl && (receivedCountEl.textContent = fmt(0));
    deliveredCountEl && (deliveredCountEl.textContent = fmt(0));
  }

  // ---------- fetch ----------
  async function fetchAssigned() {
    const res = await fetch('/api/orders/assigned', {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error('Failed to load assigned orders');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ---------- render (نفس كارت Storage بدون أزرار) ----------
  function render(list) {
    grid.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? list.filter(x =>
          (x.reason || '').toLowerCase().includes(q) ||
          (x.productName || x.product_name || '').toLowerCase().includes(q)
        )
      : list;

    const viewGroups = buildGroups(filtered).filter(g => g.prepared);

    updateHeaderCounts();

    if (!viewGroups.length) {
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of viewGroups) {
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
            <!-- لا أزرار في اللوجستكس -->
          </div>
        </div>

        <div class="order-card__items">
          ${g.items.map(it => `
            <div class="order-item" id="row-${it.id}">
              <div class="item-left">
                <div class="item-name">${esc(it.productName || it.product_name || '-')}</div>
              </div>
              <div class="item-mid">
                <div class="num">Req: <strong>${fmt(it.requested ?? it.req)}</strong></div>
                <div class="num">Avail: <strong data-col="available">${fmt(it.available ?? it.avail)}</strong></div>
                <div class="num">
                  Rem:
                  <span class="pill ${Number(it.remaining ?? it.rem ?? 0) > 0 ? 'pill--danger' : 'pill--success'}"
                        data-col="remaining">${fmt(it.remaining ?? it.rem)}</span>
                </div>
              </div>
              <!-- لا أزرار في الصف -->
            </div>
          `).join('')}
        </div>
      `;

      grid.appendChild(card);
    }

    if (window.feather?.replace) window.feather.replace({ 'stroke-width': 2 });
  }

  // ---------- init ----------
  async function load() {
    try {
      allItems = await fetchAssigned();
      groups   = buildGroups(allItems);
      render(allItems);
    } catch (e) {
      console.error(e);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
    }
  }

  searchInput && searchInput.addEventListener('input', () => render(allItems));

  load();
})();