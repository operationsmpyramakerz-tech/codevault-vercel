/* Logistics page – show cards exactly like Storage (no action buttons) */
(function () {
  // ====== Helpers ======
  const qs  = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));

  const $ordersList = qs('#ordersList');
  const $helloName  = qs('#helloName');
  const $search     = qs('#searchInput');

  const $countPrepared = qs('#countPrepared');
  const $countReceived = qs('#countReceived');
  const $countDelivered = qs('#countDelivered');
  const $loading = qs('#loadingRow');

  // أي دالة عندك بترجع اسم المستخدم – إن لم تتوفر نقرأ من سشن
  async function getMe() {
    try {
      const r = await fetch('/api/session/me');
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  // نفس شكل الكارت المستعمل في Storage (بدون أزرار)
  function renderOrderCard(group) {
    // group: { id, schoolName, createdAtISO, items: [{name, req, avail, rem}], missingCount, itemsCount }
    const created = group.createdAtISO
      ? new Date(group.createdAtISO).toLocaleString()
      : '';

    const itemsBadges = `
      <div class="inline-badges">
        <span class="badge badge-pill">Items: ${group.itemsCount ?? group.items?.length ?? 0}</span>
        <span class="badge badge-pill badge-missing">Missing: ${group.missingCount ?? 0}</span>
      </div>
    `;

    const itemsList = (group.items || []).map(it => `
      <div class="order-item">
        <div class="order-item__name">${it.name}</div>
        <div class="order-item__badges">
          <span class="tag tag-req">Req: ${it.req ?? 0}</span>
          <span class="tag tag-avail">Avail: ${it.avail ?? 0}</span>
          <span class="tag tag-rem">Rem: ${it.rem ?? 0}</span>
        </div>
      </div>
    `).join('');

    return `
      <article class="order-card">
        <header class="order-card__head">
          <div class="head-left">
            <div class="school-icon" aria-hidden="true"></div>
            <div class="meta">
              <div class="school-name">${group.schoolName || ''}</div>
              <div class="created-at">${created}</div>
            </div>
          </div>
          <div class="head-right">
            ${itemsBadges}
          </div>
        </header>

        <div class="order-card__body">
          ${itemsList || '<div class="muted">No items.</div>'}
        </div>
      </article>
    `;
  }

  function mountOrders(list) {
    if (!Array.isArray(list) || !list.length) {
      $ordersList.innerHTML = '<div class="muted px-2 py-6">No items.</div>';
      return;
    }
    $ordersList.innerHTML = list.map(renderOrderCard).join('');
  }

  function filterOrders(text, src) {
    const t = (text || '').trim().toLowerCase();
    if (!t) return src;
    return src.filter(g =>
      (g.schoolName || '').toLowerCase().includes(t) ||
      (g.items || []).some(it => (it.name || '').toLowerCase().includes(t))
    );
  }

  // ====== Data fetching ======
  // نفس مصدر “Fully available” في Storage
  async function fetchPrepared() {
    // يعتمد على ما عندك في السيرفر، هذا المسار متوافق مع تعديلات Storage السابقة
    const url = '/api/orders/assigned?tab=FullyAvailable';
    const r = await fetch(url);
    if (!r.ok) throw new Error('Failed to load prepared');
    const data = await r.json();
    // نتوقع شكلاً قريبًا من { groups: [{ schoolName, createdAtISO, items:[{name,req,avail,rem}], missingCount, itemsCount }]}
    return Array.isArray(data?.groups) ? data.groups : [];
  }

  // احصائيات اللوجستيات (اختياري؛ إن لم تتوفر أرقام، سنحسب prepared فقط)
  async function fetchLogisticsCounts() {
    try {
      const r = await fetch('/api/logistics/counts'); // إن لم يوجد يرجع 404
      if (!r.ok) throw 0;
      const j = await r.json();
      return {
        prepared: j?.prepared ?? 0,
        received: j?.received ?? 0,
        delivered: j?.delivered ?? 0
      };
    } catch {
      // fallback بسيط: نحسب Prepared فقط من طول القائمة
      return null;
    }
  }

  // ====== State ======
  let ALL_PREPARED = [];

  async function load() {
    try {
      $loading.style.display = '';
      const me = await getMe();
      if (me?.name) $helloName.textContent = me.name;

      const [preparedList, counts] = await Promise.all([
        fetchPrepared(),
        fetchLogisticsCounts()
      ]);

      ALL_PREPARED = preparedList;
      const filtered = filterOrders($search.value, ALL_PREPARED);
      mountOrders(filtered);

      if (counts) {
        $countPrepared.textContent = counts.prepared;
        $countReceived.textContent = counts.received;
        $countDelivered.textContent = counts.delivered;
      } else {
        $countPrepared.textContent = ALL_PREPARED.length;
      }
    } catch (e) {
      $ordersList.innerHTML = `<div class="error px-2 py-6">Failed to load items.</div>`;
      // console.error(e);
    } finally {
      $loading.style.display = 'none';
    }
  }

  // ====== Events ======
  $search.addEventListener('input', () => {
    const filtered = filterOrders($search.value, ALL_PREPARED);
    mountOrders(filtered);
  });

  // (اختياري) جعل الكروت تتغير عند الضغط على الشرائح
  qs('#statPrepared').addEventListener('click', () => {
    const filtered = filterOrders($search.value, ALL_PREPARED);
    mountOrders(filtered);
  });
  qs('#statReceived').addEventListener('click', () => {
    // مستقبلاً عند إضافة تبويب Received هنا
  });
  qs('#statDelivered').addEventListener('click', () => {
    // مستقبلاً عند إضافة تبويب Delivered هنا
  });

  // Start
  load();
})();