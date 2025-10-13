// EmptyCanvas/public/js/logistics.js
// Logistics: عرض المجموعات fully prepared + تحديث كارت KPI في الهيدر بعنوان Fully prepared مع العدد الصحيح.

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
    $('#search') || $('#logistics-search') || $('input[type="search"]') || null;

  const grid =
    $('#assigned-grid') ||
    $('#logistics-grid') ||
    $('.assigned-grid') ||
    $('#list') ||
    $('main');

  const emptyMsg =
    $('#assigned-empty') ||
    $('#logistics-empty') ||
    (() => {
      const d = document.createElement('div');
      d.id = 'assigned-empty';
      d.style.display = 'none';
      d.textContent = 'No items.';
      (grid?.parentElement || document.body).appendChild(d);
      return d;
    })();

  let allItems = [];

  // ---------- grouping ----------
  const groupKeyOf = (it) => {
    const reason  = (it.reason && String(it.reason).trim()) || 'No Reason';
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
      g.items.push(normalizeItem(it));
      map.set(key, g);
    }
    const arr = [...map.values()];
    arr.forEach(recomputeGroupStats);
    return arr;
  }

  // نوحّد الحقول ونحسب remaining لو مش موجود
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
    };
  }

  function recomputeGroupStats(g) {
    g.total = g.items.length;
    // عناصر ناقصة = أي عنصر remaining > 0
    g.miss  = g.items.filter(x => N(x.remaining) > 0).length;
    // المجموعة fully prepared فقط لو كل العناصر remaining = 0
    g.prepared = g.items.every(x => N(x.remaining) === 0);
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

  // ---------- KPI (الهيدر نفسه) ----------
  function updatePreparedKPI(preparedCount) {
    const kpiRow =
      $('.summary') ||
      $('.stats') ||
      $('.summary-cards') ||
      $('.header-cards') ||
      $('.cards-row') ||
      (grid ? grid.previousElementSibling : null);

    if (!kpiRow) return;

    // لاقي كارت الهيدر اللي كان عنوانه Prepared وعدّل عليه
    const candidates = $$('.card, .stat, .kpi-card, .summary-card, .kpi, .box, div', kpiRow);
    let preparedCard = null, preparedLabelNode = null;
    for (const el of candidates) {
      const label = Array.from(el.querySelectorAll('*')).find(x =>
        /prepared/i.test((x.textContent || '').trim())
      );
      if (label) {
        let cur = label;
        while (cur && cur !== el && cur !== kpiRow) {
          if (cur.classList && /card|stat|kpi/i.test(cur.className)) {
            preparedCard = cur; preparedLabelNode = label; break;
          }
          cur = cur.parentElement;
        }
      }
      if (preparedCard) break;
    }
    if (!preparedCard) return;

    if (preparedLabelNode) preparedLabelNode.textContent = 'Fully prepared';

    // ابحث عن عنصر القيمة داخل نفس الكارت وحدثه
    let valueNode =
      preparedCard.querySelector('.value, .count, .num, .kpi-value, .stat-value, strong, b, .digit');

    if (!valueNode) {
      const texts = preparedCard.querySelectorAll('*');
      for (const t of texts) {
        if (/^\d+$/.test((t.textContent || '').trim())) { valueNode = t; break; }
      }
    }
    if (valueNode) valueNode.textContent = fmt(preparedCount);
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

    // جهّز المجموعات واختر فقط fully prepared
    const groupsAll = buildGroups(filtered);
    const groups    = groupsAll.filter(g => g.prepared);

    if (!groups.length) {
      emptyMsg.style.display = '';
      updatePreparedKPI(0);
      return;
    }
    emptyMsg.style.display = 'none';

    for (const g of groups) {
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
                  <span class="pill ${N(it.remaining) > 0 ? 'pill--danger' : 'pill--success'}"
                        data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      grid.appendChild(card);
    }

    if (window.feather?.replace) window.feather.replace({ 'stroke-width': 2 });

    // العدد الصحيح = عدد المجموعات fully prepared المعروضة
    const preparedCount = groups.length;
    updatePreparedKPI(preparedCount);
  }

  // ---------- init ----------
  async function load() {
    try {
      allItems = await fetchAssigned();
      render(allItems);
    } catch (e) {
      console.error(e);
      grid.innerHTML = '<div class="error">Failed to load items.</div>';
      updatePreparedKPI(0);
    }
  }

  searchInput && searchInput.addEventListener('input', () => render(allItems));

  load();
})();