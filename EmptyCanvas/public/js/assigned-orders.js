// public/js/assigned-orders.js
document.addEventListener('DOMContentLoaded', () => {
  const grid   = document.getElementById('assigned-grid');
  const empty  = document.getElementById('assigned-empty');

  // Stats
  const stTotal = document.getElementById('st-total');
  const stFull  = document.getElementById('st-full');
  const stMiss  = document.getElementById('st-missing');

  // Rename labels to match your request
  const statLabels = document.querySelectorAll('.stats .stat .stat__label');
  if (statLabels[0]) statLabels[0].textContent = 'Total assigned (orders)';
  if (statLabels[1]) statLabels[1].textContent = 'Total prepared';
  if (statLabels[2]) statLabels[2].textContent = 'Not completed';

  // Popover (partial)
  const popover      = document.getElementById('partial-popover');
  const popInput     = document.getElementById('popover-input');
  const popHint      = document.getElementById('popover-hint');
  const popBtnSave   = popover.querySelector('[data-pop="save"]');
  const popBtnCancel = popover.querySelector('[data-pop="cancel"]');

  // State
  let items = [];           // flat items
  let groups = [];          // grouped by order
  const itemById = new Map();
  let currentEdit = null;   // { id, requested, available, anchor }

  const fmt = (n) => String(Number(n || 0));
  const escapeHTML = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const groupKeyOf = (it) => {
    // لو عندك orderCode مستقبلًا
    // if (it.orderCode && String(it.orderCode).trim()) return `oid:${String(it.orderCode).trim()}`;
    const reason = (it.reason && String(it.reason).trim()) || 'No Reason';
    const bucket = (it.createdTime || '').slice(0, 10); // day bucket
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
        items: [],
      };
      g.items.push(it);
      map.set(key, g);
    }
    const arr = Array.from(map.values());
    arr.forEach(recomputeGroupStats);
    return arr;
  }

  function recomputeGroupStats(g) {
    const total = g.items.length;
    const full  = g.items.filter(x => Number(x.remaining) === 0).length;
    g.total = total;
    g.miss  = total - full; // عناصر بها نقص (لعرض البادج فقط)
    // prepared order = كل عناصره Status === Prepared
    g.prepared = g.items.length > 0 && g.items.every(x => String(x.status || '') === 'Prepared');
  }

  function updatePageStats() {
    const totalOrders = groups.length;
    const preparedOrders = groups.filter(g => g.prepared).length;
    const notCompleted = totalOrders - preparedOrders;
    stTotal.textContent = fmt(totalOrders);
    stFull.textContent  = fmt(preparedOrders);
    stMiss.textContent  = fmt(notCompleted);
  }

  async function load() {
    try {
      const res = await fetch('/api/orders/assigned', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to load assigned orders');
      items = await res.json();
      itemById.clear();
      items.forEach(it => itemById.set(it.id, it));

      groups = buildGroups(items);
      renderGroups(groups);
      updatePageStats();
    } catch (e) {
      console.error(e);
      UI?.toast?.({ type: 'error', message: 'Failed to load assigned orders' });
    }
  }

  function renderGroups(groups) {
    grid.innerHTML = '';
    if (!groups.length) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    for (const g of groups) {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.key = g.key;

      const idsAttr = g.items.map(x => x.id).join(',');

      card.innerHTML = `
        <div class="order-card__head">
          <div class="order-card__title">
            <i data-feather="user-check"></i>
            <div class="order-card__title-text">
              <div class="order-card__title-main">${escapeHTML(g.title)}</div>
              <div class="order-card__subtitle">${escapeHTML(g.subtitle)}</div>
            </div>
          </div>
          <div class="order-card__right">
            <span class="badge badge--count">Items: ${fmt(g.total)}</span>
            <span class="badge badge--missing">Missing: ${fmt(g.miss)}</span>
            <button class="btn btn-success btn-icon" data-action="prepared-order" data-ids="${idsAttr}">
              <i data-feather="check-square"></i><span>Mark prepared</span>
            </button>
            <button class="btn btn-primary btn-icon" data-action="pdf" data-ids="${idsAttr}">
              <i data-feather="download-cloud"></i><span>Download</span>
            </button>
          </div>
        </div>
        <div class="order-card__items">
          ${g.items.map(it => `
            <div class="order-item" id="row-${it.id}">
              <div class="item-left">
                <div class="item-name">${escapeHTML(it.productName || '-')}</div>
              </div>
              <div class="item-mid">
                <div class="num">Req: <strong>${fmt(it.requested)}</strong></div>
                <div class="num">Avail: <strong data-col="available">${fmt(it.available)}</strong></div>
                <div class="num">
                  Rem:
                  <span class="pill ${Number(it.remaining) > 0 ? 'pill--danger' : 'pill--success'}" data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
              <div class="item-actions">
                <button class="btn btn-success btn-icon btn-sm" data-action="mark" data-id="${it.id}">
                  <i data-feather="check-circle"></i><span>In stock</span>
                </button>
                <button class="btn btn-warning btn-outline btn-icon btn-sm" data-action="partial" data-id="${it.id}">
                  <i data-feather="edit-3"></i><span>Partial / Not in stock</span>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      grid.appendChild(card);
    }

    if (window.feather) feather.replace({ 'stroke-width': 2 });
  }

  // Events (delegate on grid)
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'pdf') {
      const ids = (btn.getAttribute('data-ids') || '').split(',').filter(Boolean);
      if (ids.length) downloadOrderPDF(ids, btn);
      return;
    }
    if (action === 'prepared-order') {
      const ids = (btn.getAttribute('data-ids') || '').split(',').filter(Boolean);
      if (ids.length) markOrderPrepared(ids, btn);
      return;
    }

    const id = btn.getAttribute('data-id');
    if (!id) return;

    if (action === 'mark') markInStock(id, btn);
    else if (action === 'partial') {
      const it = itemById.get(id);
      if (it) showPopover(btn, it);
    }
  });

  async function markOrderPrepared(ids, btn) {
    try {
      setBusy(btn, true);
      const res = await fetch('/api/orders/assigned/mark-prepared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds: ids })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');

      // Update local statuses
      ids.forEach((id) => {
        const it = itemById.get(id);
        if (it) it.status = 'Prepared';
      });

      groups.forEach(recomputeGroupStats);
      updatePageStats();

      UI?.toast?.({ type: 'success', message: 'Order marked as Prepared' });
    } catch (e) {
      console.error(e);
      UI?.toast?.({ type: 'error', message: e.message || 'Error' });
    } finally {
      setBusy(btn, false);
    }
  }

  async function markInStock(id, btn) {
    try {
      setBusy(btn, true);
      const res = await fetch('/api/orders/assigned/mark-in-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderPageId: id })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      applyRowUpdate(id, data.available, data.remaining);
      UI?.toast?.({ type: 'success', message: 'Marked as in stock' });
    } catch (e) {
      console.error(e);
      UI?.toast?.({ type: 'error', message: e.message || 'Error' });
    } finally {
      setBusy(btn, false);
    }
  }

  function showPopover(anchorBtn, item) {
    currentEdit = {
      id: item.id,
      requested: Number(item.requested),
      available: Number(item.available),
      anchor: anchorBtn
    };

    popInput.value = String(currentEdit.available ?? 0);
    popInput.setAttribute('max', String(currentEdit.requested));
    popHint.textContent = `Requested: ${currentEdit.requested}`;
    positionPopover(anchorBtn);
    popover.classList.remove('hidden');
    popInput.focus();
    popInput.select();
  }

  function hidePopover() {
    popover.classList.add('hidden');
    currentEdit = null;
  }

  function positionPopover(anchorBtn) {
    const r = anchorBtn.getBoundingClientRect();
    const pad = 8;
    const pw = 260; // approximate popover width
    const ph = 130; // approximate popover height
    let top = r.bottom + pad;
    let left = r.left + (r.width/2) - (pw/2);

    const vw = window.innerWidth, vh = window.innerHeight;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > vh - 8) top = r.top - ph - pad;

    popover.style.position = 'fixed';
    popover.style.top  = `${top}px`;
    popover.style.left = `${left}px`;
  }

  document.addEventListener('click', (e) => {
    if (!currentEdit) return;
    if (popover.contains(e.target) || currentEdit.anchor.contains(e.target)) return;
    hidePopover();
  });
  window.addEventListener('resize', () => { if (currentEdit) positionPopover(currentEdit.anchor); });

  popBtnCancel.addEventListener('click', hidePopover);
  popBtnSave.addEventListener('click', async () => {
    if (!currentEdit) return;
    const val = Number(popInput.value);
    if (Number.isNaN(val) || val < 0) {
      UI?.toast?.({ type: 'warning', message: 'Please enter a valid non-negative number' });
      return;
    }
    try {
      popBtnSave.disabled = true;
      const res = await fetch('/api/orders/assigned/available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderPageId: currentEdit.id, available: val })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      applyRowUpdate(currentEdit.id, data.available, data.remaining);
      UI?.toast?.({ type: 'success', message: 'Availability updated' });
      hidePopover();
    } catch (e) {
      console.error(e);
      UI?.toast?.({ type: 'error', message: e.message || 'Error' });
    } finally {
      popBtnSave.disabled = false;
    }
  });

  function applyRowUpdate(id, available, remaining) {
    // update local
    const it = itemById.get(id);
    if (it) {
      it.available = Number(available);
      it.remaining = Number(remaining);
    }

    // update DOM
    const row = document.getElementById(`row-${id}`);
    if (row) {
      const tdA = row.querySelector('[data-col="available"]');
      const tdR = row.querySelector('[data-col="remaining"]');
      if (tdA) tdA.textContent = fmt(available);
      if (tdR) {
        tdR.textContent = fmt(remaining);
        tdR.classList.toggle('pill--danger', Number(remaining) > 0);
        tdR.classList.toggle('pill--success', Number(remaining) === 0);
      }
    }

    // recompute groups stats (for prepared detection)
    groups.forEach(recomputeGroupStats);
    updatePageStats();
  }

  // تعديل: فتح الـ PDF بعمل GET مع ids في URL
  async function downloadOrderPDF(ids, btn) {
    try {
      setBusy(btn, true);
      const url = '/api/orders/assigned/pdf?ids=' + encodeURIComponent(ids.join(','));
      window.open(url, '_blank');
    } finally {
      setTimeout(() => setBusy(btn, false), 500);
    }
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle('is-busy', !!busy);
  }

  // Init
  load();
});