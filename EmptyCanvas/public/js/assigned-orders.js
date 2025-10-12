// === Mark Received flow with image upload -> server -> Notion ===
function openMarkReceivedModal(orderIds) {
  if (window.UI && typeof UI.modal === 'function') {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-row">
        <label class="form-label">Upload receipt image</label>
        <input type="file" id="mr-file" accept="image/*" class="form-input" />
      </div>`;
    const modal = UI.modal({
      title: "Mark Received",
      body,
      primary: { label: "Save", action: async () => {
        const inp = body.querySelector('#mr-file');
        const file = inp?.files?.[0];
        if (!file) { UI.toast({ type:'error', title:'Missing image', message:'Please choose an image.' }); return; }
        const dataUrl = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = reject;
          fr.readAsDataURL(file);
        });
        try {
          const resp = await fetch('/api/orders/assigned/mark-received', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderIds, filename: file.name, dataUrl })
          });
          const json = await resp.json();
          if (!resp.ok || !json.success) throw new Error(json.error || 'Failed');
          UI.toast({ type:'success', title:'Saved', message:'Receipt saved to Notion.' });
          modal.close();
          if (typeof reloadAssigned === 'function') reloadAssigned();
          else location.reload();
        } catch (e) {
          UI.toast({ type:'error', title:'Error', message:String(e.message||e) });
        }
      }},
      secondary: { label: "Cancel" }
    });
    return;
  }
}

// === Delegate clicks for Mark Received buttons (only outside the Missing/Prepared rules) ===
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="mark-prepared"], [data-action="mark-received"]');
  if (!btn) return;
  const idsAttr = btn.getAttribute('data-ids') || btn.getAttribute('data-order-id');
  if (!idsAttr) return;
  const orderIds = idsAttr.split(',').map(s => s.trim()).filter(Boolean);
  e.preventDefault();
  openMarkReceivedModal(orderIds);
});


// === public/js/assigned-orders.js ===
document.addEventListener('DOMContentLoaded', () => {
  const grid   = document.getElementById('assigned-grid');
  const empty  = document.getElementById('assigned-empty');

  const stTotal = document.getElementById('st-total');
  const stFull  = document.getElementById('st-full');
  const stMiss  = document.getElementById('st-missing');

  const btnAll      = document.getElementById('st-btn-total');
  const btnPrepared = document.getElementById('st-btn-full');
  const btnMissing  = document.getElementById('st-btn-missing');

  const popover      = document.getElementById('partial-popover');
  const popInput     = document.getElementById('popover-input');
  const popHint      = document.getElementById('popover-hint');
  const popBtnSave   = popover.querySelector('[data-pop="save"]');
  const popBtnCancel = popover.querySelector('[data-pop="cancel"]');

  let items = [];
  let groups = [];
  let currentFilter = 'all';
  const itemById = new Map();
  let currentEdit = null;

  const fmt = (n) => String(Number(n || 0));
  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );

  const groupKeyOf = (it) => {
    const reason = (it.reason && String(it.reason).trim()) || 'No Reason';
    const bucket = (it.createdTime || '').slice(0, 10);
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

  // prepared = (no missing) AND (every item.status === 'Prepared')
  function recomputeGroupStats(g) {
    const total = g.items.length;
    const full  = g.items.filter(x => Number(x.remaining) === 0).length;
    g.total = total;
    g.miss  = total - full;
    const allPreparedStatus = g.items.every(x => String(x.status || '') === 'Prepared');
    g.prepared  = (g.miss === 0) && allPreparedStatus;
  }

  function updatePageStats() {
    const totalOrders    = groups.length;
    const preparedOrders = groups.filter(g => g.prepared).length;
    const notCompleted   = totalOrders - preparedOrders;
    stTotal.textContent = fmt(totalOrders);
    stFull.textContent  = fmt(preparedOrders);
    stMiss.textContent  = fmt(notCompleted);
  }

  function applyFilterAndRender() {
    let view = groups;
    if (currentFilter === 'prepared') view = groups.filter(g => g.prepared);
    else if (currentFilter === 'missing') view = groups.filter(g => !g.prepared);
    renderGroups(view);
  }

  async function load() {
    try {
      const res = await fetch('/api/orders/assigned', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to load assigned orders');
      items = await res.json();
      itemById.clear();
      items.forEach(it => itemById.set(it.id, it));

      groups = buildGroups(items);
      updatePageStats();
      applyFilterAndRender();
    } catch (e) {
      console.error(e);
      toast({ type: 'error', title: 'Error', message: 'Failed to load assigned orders' });
    }
  }

  function renderGroups(list) {
    grid.innerHTML = '';
    if (!list.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    const isMissingTab   = currentFilter === 'missing';
    const isPreparedTab  = currentFilter === 'prepared';
    const showRowActions = !isPreparedTab;          // إخفاء أزرار الصفوف داخل تبويب Prepared
    const showHeadActions = !isPreparedTab;         // إخفاء زراري Mark Received & Download في Prepared فقط

    for (const g of list) {
      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.key = g.key;
      card.dataset.miss = String(g.miss);

      const idsAttr = g.items.map(x => x.id).join(',');
      const softDisabled = g.miss > 0 ? ' is-disabled' : '';
      const aria = g.miss > 0 ? 'aria-disabled="true"' : '';

      // Missing tab -> "Mark Prepared" (بدون رفع صورة)
      // غير ذلك -> Mark Received (مع نافذة رفع الصورة)
      const actionAttr = isMissingTab ? 'prepared-order' : 'mark-received';
      const btnLabel   = isMissingTab ? 'Mark Prepared' : 'Mark Received';

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
            ${ showHeadActions ? `
              <button class="btn btn-3d btn-3d-blue btn-icon${softDisabled}" data-action="${actionAttr}" data-ids="${idsAttr}" ${aria}>
                <i data-feather="check-square"></i><span>${btnLabel}</span>
              </button>
              <button class="btn btn-3d btn-3d-blue btn-icon" data-action="pdf" data-ids="${idsAttr}">
                <i data-feather="download-cloud"></i><span>Download</span>
              </button>
            ` : ``}
          </div>
        </div>
        <div class="order-card__items">
          ${g.items.map(it => `
            <div class="order-item" id="row-${it.id}">
              <div class="item-left">
                <div class="item-name">${esc(it.productName || '-')}</div>
              </div>
              <div class="item-mid">
                <div class="num">Req: <strong>${fmt(it.requested)}</strong></div>
                <div class="num">Avail: <strong data-col="available">${fmt(it.available)}</strong></div>
                <div class="num">
                  Rem:
                  <span class="pill ${Number(it.remaining) > 0 ? 'pill--danger' : 'pill--success'}" data-col="remaining">${fmt(it.remaining)}</span>
                </div>
              </div>
              ${ showRowActions ? `
              <div class="item-actions">
                <button class="btn btn-3d btn-3d-green btn-icon btn-sm" data-action="mark" data-id="${it.id}">
                  <i data-feather="check-circle"></i><span>In Stock</span>
                </button>
                <button class="btn btn-3d btn-3d-orange btn-icon btn-sm" data-action="partial" data-id="${it.id}">
                  <i data-feather="edit-3"></i><span>Partial / Not In Stock</span>
                </button>
              </div>` : ``}
            </div>
          `).join('')}
        </div>
      `;
      grid.appendChild(card);
    }
    if (window.feather) feather.replace({ 'stroke-width': 2 });
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'pdf') {
      const ids = (btn.getAttribute('data-ids') || '').split(',').filter(Boolean);
      if (ids.length) downloadOrderPDF(ids, btn);
      return;
    }

    // Missing tab -> data-action="prepared-order" (no upload modal)
    if (action === 'prepared-order') {
      const card = btn.closest('.order-card');
      const miss = Number(card?.dataset?.miss || '0');
      const ids  = (btn.getAttribute('data-ids') || '').split(',').filter(Boolean);

      if (miss > 0) {
        toast({
          type: 'warning',
          title: 'Missing items',
          message: `There are ${miss} missing item(s). You can mark all components as available and prepare the order.`,
          actionText: 'Mark all available & prepare',
          onAction: () => makeAllAvailableAndPrepare(card, ids)
        });
        return;
      }

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

  function setFilter(f) {
    currentFilter = f;
    [btnAll, btnPrepared, btnMissing].forEach(b => {
      const active = b.dataset.filter === f;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    applyFilterAndRender();
  }
  btnAll?.addEventListener('click', () => setFilter('all'));
  btnPrepared?.addEventListener('click', () => setFilter('prepared'));
  btnMissing?.addEventListener('click', () => setFilter('missing'));

  async function makeAllAvailableAndPrepare(cardEl, ids) {
    try {
      const rows = cardEl.querySelectorAll('.order-item');
      const ops = [];
      rows.forEach(row => {
        const id = row.id.replace('row-', '');
        const it = itemById.get(id);
        if (!it) return;
        const newAvail = Number(it.requested) || 0;
        ops.push(fetch('/api/orders/assigned/available', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ orderPageId: id, available: newAvail })
        }).then(r => r.json()).then(data => {
          if (!data.success) throw new Error(data.error || 'Failed');
          applyRowUpdate(id, data.available, data.remaining);
        }));
      });
      await Promise.all(ops);

      await markOrderPrepared(ids, null, /*silent=*/true);
      toast({ type: 'success', title: 'Order Prepared', message: 'All items set to available and order marked as Prepared.' });
    } catch (e) {
      console.error(e);
      toast({ type: 'error', title: 'Error', message: e.message || 'Operation failed' });
    }
  }

  async function markOrderPrepared(ids, btn, silent=false) {
    try {
      if (btn) setBusy(btn, true);
      const res = await fetch('/api/orders/assigned/mark-prepared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds: ids })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      ids.forEach((id) => {
        const it = itemById.get(id);
        if (it) it.status = 'Prepared';
      });
      groups.forEach(recomputeGroupStats);
      updatePageStats();
      applyFilterAndRender();
      if (!silent) toast({ type: 'success', title: 'Order Prepared', message: 'The order has been marked as Prepared.' });
    } catch (e) {
      console.error(e);
      if (!silent) toast({ type: 'error', title: 'Error', message: e.message || 'Error' });
      else toast({ type: 'error', title: 'Error', message: e.message || 'Failed to Mark Received' });
    } finally {
      if (btn) setBusy(btn, false);
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
      toast({ type: 'success', title: 'Updated', message: 'Marked as In Stock' });
    } catch (e) {
      console.error(e);
      toast({ type: 'error', title: 'Error', message: e.message || 'Error' });
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
  function hidePopover() { popover.classList.add('hidden'); currentEdit = null; }
  function positionPopover(anchorBtn) {
    const r = anchorBtn.getBoundingClientRect();
    const pad = 8, pw = 260, ph = 130;
    let top = r.bottom + pad, left = r.left + (r.width/2) - (pw/2);
    const vw = innerWidth, vh = innerHeight;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > vh - 8) top = r.top - ph - pad;
    Object.assign(popover.style, { position:'fixed', top:`${top}px`, left:`${left}px` });
  }
  document.addEventListener('click', (e) => {
    if (!currentEdit) return;
    if (popover.contains(e.target) || currentEdit.anchor.contains(e.target)) return;
    hidePopover();
  });
  addEventListener('resize', () => { if (currentEdit) positionPopover(currentEdit.anchor); });
  popBtnCancel.addEventListener('click', hidePopover);
  popBtnSave.addEventListener('click', async () => {
    if (!currentEdit) return;
    const val = Number(popInput.value);
    if (Number.isNaN(val) || val < 0) { toast({ type:'warning', title:'Invalid value', message:'Please enter a valid number' }); return; }
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
      toast({ type:'success', title:'Updated', message:'Availability updated' });
      hidePopover();
    } catch (e) {
      console.error(e);
      toast({ type:'error', title:'Error', message:e.message || 'Error' });
    } finally {
      popBtnSave.disabled = false;
    }
  });

  // If user is on Prepared tab and an edit causes Missing > 0, auto-switch to Missing
  function applyRowUpdate(id, available, remaining) {
    const it = itemById.get(id);
    if (it) { it.available = Number(available); it.remaining = Number(remaining); }
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

    groups.forEach(recomputeGroupStats);
    updatePageStats();

    if (currentFilter === 'prepared' && it) {
      const key = groupKeyOf(it);
      const g = groups.find(x => x.key === key);
      if (g && g.miss > 0) {
        setFilter('missing');
        return;
      }
    }

    applyFilterAndRender();
  }

  async function downloadOrderPDF(ids, btn) {
    try {
      setBusy(btn, true);
      const endpoint = (currentFilter === 'prepared')
        ? '/api/orders/assigned/receipt'
        : '/api/orders/assigned/pdf';
      const url = endpoint + '?ids=' + encodeURIComponent(ids.join(','));
      window.open(url, '_blank');
    } finally {
      setTimeout(() => setBusy(btn, false), 500);
    }
  }
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.classList.toggle('is-busy', !!busy);
  }

  function toast({ type='info', title='', message='', actionText='', onAction=null, duration=6000 }) {
    if (window.UI && typeof UI.toast === 'function') {
      try {
        const t = UI.toast({ type, title, message, actionText, onAction, duration });
        if (t) return;
      } catch(e) { /* fallback */ }
    }
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast-box toast-${type}`;
    el.innerHTML = `
      <div class="toast-icon">${type === 'success' ? '✓' : (type==='warning'?'!':'i')}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${esc(title)}</div>` : ''}
        ${message ? `<div class="toast-msg">${esc(message)}</div>` : ''}
      </div>
      ${actionText ? `<button class="btn btn-primary btn-sm toast-action">${esc(actionText)}</button>` : ''}
      <button class="toast-close" aria-label="Close">×</button>
    `;
    stack.appendChild(el);

    const close = () => { el.classList.add('hide'); setTimeout(()=>el.remove(), 200); };
    el.querySelector('.toast-close').addEventListener('click', close);
    if (actionText && typeof onAction === 'function') {
      el.querySelector('.toast-action').addEventListener('click', async () => {
        try { await onAction(); } finally { close(); }
      });
    }
    setTimeout(close, duration);
  }

  // --- Active stat helper (keeps URL ?tab= sync) ---
  (function(){
    function setActiveStatFromParam(){
      var params = new URLSearchParams(location.search);
      var tab = (params.get('tab')||'').toLowerCase();
      if (tab === 'prepared') currentFilter = 'prepared';
      else if (tab === 'missing') currentFilter = 'missing';
      else currentFilter = 'all';
      [btnAll, btnPrepared, btnMissing].forEach(b => {
        const active = b?.dataset?.filter === currentFilter;
        if (!b) return;
        b.classList.toggle('active', !!active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    setActiveStatFromParam();
    window.addEventListener('storage:stats:rerender', setActiveStatFromParam);
  })();

  load();
});