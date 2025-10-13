// EmptyCanvas/public/js/logistics.js
// Logistics page: عرض الطلبات الـ Fully prepared مثل Storage
// + تعديل كارت KPI الموجود في الهيدر نفسه:
//   تغيير العنوان من "Prepared" إلى "Fully prepared" وتحديث قيمته بعد الريندر.

(function () {
  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const n  = (v) => Number(v ?? 0);
  const fmt = (v) => String(Number(v ?? 0));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  // ---------- DOM refs ----------
  const searchInput =
    $('#search') || $('#logistics-search') || $('input[type="search"]') || null;

  // الحاوية اللي بنرندر فيها الكروت (نختار أقرب عنصر معروف)
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

  // ---------- تجميع وفلترة fully prepared ----------
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
    const full  = g.items.filter(x => n(x.remaining ?? x.rem) === 0).length;
    g.total = total;
    g.miss  = total - full;
    // المجموعة تعتبر fully prepared لو كل الآيتيمز remaining=0 ومفيش missing
    g.prepared = g.items.every(x => n(x.remaining ?? x.rem) === 0) && g.miss === 0;
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

  // ---------- تحديث كارت KPI الموجود (بدون إنشاء كروت جديدة) ----------
  function updatePreparedKPI(preparedCardsCount) {
    // نحدد الحاوية اللي فيها كروت الـ KPI أعلى الصفحة
    const kpiRow =
      $('.summary') ||
      $('.stats') ||
      $('.summary-cards') ||
      $('.header-cards') ||
      $('.cards-row') ||
      // fallback: الصف اللي قبل الجريد مباشرة
      (grid ? grid.previousElementSibling : null);

    if (!kpiRow) return;

    // هنبحث عن الكارت اللي عنوانه Prepared داخل الهيدر
    const allEls = $$('.card, .stat, .kpi-card, .summary-card, .kpi, .box, div', kpiRow);

    // نلاقي عنصر فيه كلمة Prepared (case-insensitive)
    let preparedCard = null;
    let preparedLabelNode = null;

    for (const el of allEls) {
      // ندور على عنصر نصّي جوه الكارت مكتوب فيه Prepared
      const cand = Array.from(el.querySelectorAll('*')).find(x =>
        /prepared/i.test((x.textContent || '').trim())
      );
      if (cand) {
        // نطلع لأعلى لحد أقرب "كارت"
        let cur = cand;
        while (cur && cur !== el && cur !== kpiRow) {
          if (cur.classList &&
              /card|stat|kpi/i.test(cur.className)) {
            preparedCard = cur;
            preparedLabelNode = cand;
            break;
          }
          cur = cur.parentElement;
        }
        if (preparedCard) break;
      }
    }

    if (!preparedCard) return;

    // غير عنوان الكارت
    if (preparedLabelNode) preparedLabelNode.textContent = 'Fully prepared';

    // حدث القيمة الرقمية داخل نفس الكارت
    let valueNode =
      preparedCard.querySelector('.value, .count, .num, .kpi-value, .stat-value, strong, b, .digit');

    if (!valueNode) {
      // لو مفيش، نختار أول عنصر رقمي داخل الكارت
      const texts = preparedCard.querySelectorAll('*');
      for (const t of texts) {
        if (/^\d+$/.test((t.textContent || '').trim())) {
          valueNode = t;
          break;
        }
      }
    }

    if (valueNode) valueNode.textContent = fmt(preparedCardsCount);
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

    const groups = buildGroups(filtered).filter(g => g.prepared);

    if (!groups.length) {
      emptyMsg.style.display = '';
      updatePreparedKPI(0); // Prepared -> Fully prepared + 0
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
                <div class="item-name">${esc(it.productName || it.product_name || '-')}</div>
              </div>
              <div class="item-mid">
                <div class="num">Req: <strong>${fmt(it.requested ?? it.req)}</strong></div>
                <div class="num">Avail: <strong data-col="available">${fmt(it.available ?? it.avail)}</strong></div>
                <div class="num">
                  Rem:
                  <span class="pill ${n(it.remaining ?? it.rem) > 0 ? 'pill--danger' : 'pill--success'}"
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

    // عدّ الكروت المعروضة (المجموعات fully prepared) وحدِّث كارت الهيدر الموجود
    const preparedCardsCount = $$('.order-card', grid).length;
    updatePreparedKPI(preparedCardsCount);
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