// EmptyCanvas/public/js/logistics.js
// Logistics page: إظهار الطلبات الـ Fully prepared (نفس منطق Storage)
// + مزامنة كارت KPI: تغيير العنوان إلى "Fully prepared" وتحديث العدد حتى بدون IDs ثابتة.

(function () {
  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fmt = (n) => String(Number(n ?? 0));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  // ---------- DOM refs (flexible) ----------
  const searchInput = $('#search') || $('#logistics-search') || $('input[type="search"]');

  // الحاوية اللي بنرندر فيها الكروت
  const grid = $('#assigned-grid') || $('#logistics-grid') || $('.assigned-grid') || $('#list') || $('main');

  // رسالة فاضية
  const emptyMsg = $('#assigned-empty') || $('#logistics-empty') || (() => {
    const d = document.createElement('div');
    d.id = 'assigned-empty';
    d.style.display = 'none';
    d.textContent = 'No items.';
    (grid?.parentElement || document.body).appendChild(d);
    return d;
  })();

  let allItems = [];

  // ---------- grouping واحتساب الـ Fully prepared ----------
  const groupKeyOf = (it) => {
    const reason = (it.reason && String(it.reason).trim()) || 'No Reason';
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

  function recomputeGroupStats(g) {
    const total = g.items.length;
    const full  = g.items.filter(x => Number(x.remaining ?? x.rem ?? 0) === 0).length;
    g.total = total;
    g.miss  = total - full;

    // المجموعة تعتبر Fully prepared لو كل العناصر remaining=0 ومفيش missing
    g.prepared = g.items.every(x => Number(x.remaining ?? x.rem ?? 0) === 0) && g.miss === 0;
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

  // ---------- KPI sync (بدون IDs) ----------
  function syncPreparedKPIFromDOM() {
    // عدد الكروت المعروضة (كل مجموعة Fully prepared ككارت واحد)
    const preparedCount = $$('.order-card', grid).length;

    // دور على أي كارت KPI عنوانه يحتوي Prepared وغيّر العنوان والقيمة
    const kpiCandidates = $$(
      // شوية احتمالات شائعة لأقسام الـ KPI/summary
      '.summary, .stats, .kpi, .summary-cards, .header-cards, .cards-row'
    ).flatMap(c => $$('.card, .stat, .kpi-card, .summary-card, .kpi-box, .box', c));

    // لو مالقيناش حاجة، جرّب ندور في أول صف فوق الصفحة
    if (!kpiCandidates.length) {
      kpiCandidates.push(...$$('.card, .stat, .kpi-card, .summary-card, .kpi-box, .box'));
    }

    let updated = false;

    for (const card of kpiCandidates) {
      // عنصر العنوان داخل كارت KPI
      const labelEl =
        card.querySelector('.label, .title, .name, .stat-label, .kpi-label, .text-muted, small, .card-subtitle') ||
        // fallback: أصغر نص داخل الكارت
        (function () {
          const smallish = card.querySelector('small, .text-muted');
          return smallish || null;
        })();

      if (!labelEl) continue;

      const labelText = labelEl.textContent.trim();
      if (/^prepared$/i.test(labelText)) {
        // غيّر العنوان
        labelEl.textContent = 'Fully prepared';

        // عنصر القيمة داخل كارت KPI
        const valueEl =
          card.querySelector('.value, .count, .num, .kpi-value, .card-title strong, .h4, .stat-value, .digit') ||
          // fallback: أول عنصر رقمي بداخل الكارت
          (function () {
            const digits = card.querySelectorAll('*');
            for (const el of digits) {
              if (/^\d+$/.test(el.textContent.trim())) return el;
            }
            return null;
          })();

        if (valueEl) valueEl.textContent = fmt(preparedCount);
        updated = true;
      }
    }

    // كحل أخير لو مالقيناش كارت KPI: اعمل واحد بسيط (لن يحدث غالبًا)
    if (!updated) {
      let headerRow = $('.summary') || $('.stats') || grid.previousElementSibling;
      if (!headerRow) return;
      const pill = document.createElement('div');
      pill.className = 'summary-card';
      pill.innerHTML = `
        <div class="label">Fully prepared</div>
        <div class="value">${fmt(preparedCount)}</div>
      `;
      headerRow.appendChild(pill);
    }
  }

  // ---------- render ----------
  function render(list) {
    if (!grid) return;

    grid.innerHTML = '';

    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? list.filter(x =>
          (x.reason || '').toLowerCase().includes(q) ||
          (x.productName || x.product_name || '').toLowerCase().includes(q)
        )
      : list;

    const viewGroups = buildGroups(filtered).filter(g => g.prepared);

    if (!viewGroups.length) {
      emptyMsg.style.display = '';
      syncPreparedKPIFromDOM(); // يحدّث العداد إلى 0 ويعيد تسمية اللابل
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
            </div>
          `).join('')}
        </div>
      `;

      grid.appendChild(card);
    }

    if (window.feather?.replace) window.feather.replace({ 'stroke-width': 2 });

    // بعد الريندر حدّث كارت KPI (تغيير Prepared -> Fully prepared + العدد الصحيح)
    syncPreparedKPIFromDOM();
  }

  // ---------- init ----------
  async function load() {
    try {
      allItems = await fetchAssigned();
      render(allItems);
    } catch (e) {
      console.error(e);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
      syncPreparedKPIFromDOM();
    }
  }

  searchInput && searchInput.addEventListener('input', () => render(allItems));

  load();
})();