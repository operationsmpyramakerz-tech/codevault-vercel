// public/js/logistics.js
document.addEventListener('DOMContentLoaded', () => {
  const grid   = document.getElementById('assigned-grid');        // reuse Storage grid styles
  const empty  = document.getElementById('assigned-empty');

  const btnPrepared = document.getElementById('lg-btn-prepared');
  const btnReceived = document.getElementById('lg-btn-received');
  const btnDelivered= document.getElementById('lg-btn-delivered');

  const cPrepared = document.getElementById('lg-count-prepared');
  const cReceived = document.getElementById('lg-count-received');
  const cDelivered= document.getElementById('lg-count-delivered');

  const fileInput  = document.getElementById('lg-upload');

  const search = document.getElementById('logisticsSearch');

  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n) => String(Number(n || 0));

  // Parse initial tab from query (?tab=Prepared|Received|Delivered)
  const url = new URL(window.location.href);
  let currentTab = url.searchParams.get('tab') || 'Prepared';

  // Keep a copy for search / re-render
  let currentItems = [];
  let currentGroups = [];

  function groupKeyOf(it) {
    const reason = (it.reason && String(it.reason).trim()) || 'No Reason';
    const bucket = (it.createdTime || '').slice(0, 10);
    return `grp:${reason}|${bucket}`;
  }

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
    return Array.from(map.values());
  }

  function setActiveTab(tab) {
    currentTab = tab;
    btnPrepared.classList.toggle('active', tab === 'Prepared');
    btnReceived.classList.toggle('active', tab === 'Received');
    btnDelivered.classList.toggle('active', tab === 'Delivered');
    btnPrepared.setAttribute('aria-pressed', tab === 'Prepared' ? 'true' : 'false');
    btnReceived.setAttribute('aria-pressed', tab === 'Received' ? 'true' : 'false');
    btnDelivered.setAttribute('aria-pressed', tab === 'Delivered' ? 'true' : 'false');

    const u = new URL(window.location.href);
    u.searchParams.set('tab', tab);
    history.replaceState(null, '', u.toString());

    loadList(tab);
  }

  btnPrepared.addEventListener('click', () => setActiveTab('Prepared'));
  btnReceived.addEventListener('click', () => setActiveTab('Received'));
  btnDelivered.addEventListener('click', () => setActiveTab('Delivered'));

  // Fetch counts for all tabs (3 small calls to keep backend simple)
  async function loadCounts() {
    try {
      const [p, r, d] = await Promise.all([
        fetch('/api/logistics/list?tab=Prepared', { cache: 'no-store', credentials: 'same-origin' }).then(x => x.json()).catch(()=>[]),
        fetch('/api/logistics/list?tab=Received', { cache: 'no-store', credentials: 'same-origin' }).then(x => x.json()).catch(()=>[]),
        fetch('/api/logistics/list?tab=Delivered',{ cache: 'no-store', credentials: 'same-origin' }).then(x => x.json()).catch(()=>[]),
      ]);
      cPrepared.textContent = fmt(p.length || 0);
      cReceived.textContent = fmt(r.length || 0);
      cDelivered.textContent = fmt(d.length || 0);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadList(tab) {
    grid.innerHTML = '<div class="loading">Loading...</div>';
    empty.style.display = 'none';
    try {
      const res = await fetch('/api/logistics/list?tab=' + encodeURIComponent(tab), { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to load list');
      currentItems = await res.json();
      currentGroups = buildGroups(currentItems);
      render(currentGroups);
    } catch (e) {
      console.error(e);
      grid.innerHTML = '';
      empty.style.display = '';
    }
  }

  function render(groups) {
    const q = (search.value || '').trim().toLowerCase();
    grid.innerHTML = '';

    // quick search filter
    const matches = (g) => {
      if (!q) return true;
      if (String(g.title).toLowerCase().includes(q)) return true;
      return g.items.some(it => String(it.productName || it.name || '').toLowerCase().includes(q));
    };

    const list = groups.filter(matches);
    if (!list.length) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    for (const g of list) {
      const itemsHtml = g.items.map(it => `
        <div class="order-item">
          <div class="item-left">
            <div class="item-name">${esc(it.productName || it.name || '-')}</div>
          </div>
          <div class="item-mid">
            <div class="num">Req: <strong>${fmt(it.requested)}</strong></div>
            <div class="num">Avail: <strong>${fmt(it.available)}</strong></div>
            <div class="num">Rem:
              <span class="pill ${Number(it.remaining) > 0 ? 'pill--danger' : 'pill--success'}">${fmt(it.remaining)}</span>
            </div>
          </div>
        </div>
      `).join('');

      let rightBtn = '';
      if (currentTab === 'Prepared') {
        rightBtn = `<button class="btn btn-3d btn-3d-blue btn-icon" data-action="receive" data-key="${esc(g.key)}">
                      <i data-feather="download"></i><span>Received</span>
                    </button>`;
      } else if (currentTab === 'Received') {
        rightBtn = `<button class="btn btn-3d btn-3d-green btn-icon" data-action="deliver" data-key="${esc(g.key)}">
                      <i data-feather="check"></i><span>Delivered</span>
                    </button>`;
      } else {
        rightBtn = '';
      }

      const card = document.createElement('div');
      card.className = 'order-card';
      card.dataset.key = g.key;
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
            <span class="badge badge--count">Items: ${fmt(g.items.length)}</span>
            ${rightBtn}
          </div>
        </div>
        <div class="order-card__items">
          ${itemsHtml}
        </div>
      `;
      grid.appendChild(card);
    }

    if (window.feather) window.feather.replace({ 'stroke-width': 2 });
  }

  // Upload helpers for receive/deliver
  function promptImage() {
    return new Promise((resolve) => {
      fileInput.value = '';
      const onChange = () => {
        fileInput.removeEventListener('change', onChange);
        resolve(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);
      };
      fileInput.addEventListener('change', onChange, { once: true });
      fileInput.click();
    });
  }

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const key = btn.getAttribute('data-key');

    // Resolve group to item ids
    const group = currentGroups.find(g => g.key === key);
    if (!group) return;
    const ids = group.items.map(it => it.id).filter(Boolean);

    if (action === 'receive') {
      const img = await promptImage();
      if (!img) return;
      const fd = new FormData();
      fd.append('orderIds', JSON.stringify(ids));
      fd.append('image', img);
      try {
        btn.disabled = true;
        const res = await fetch('/api/logistics/receive', { method: 'POST', body: fd, credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
        await Promise.all([loadCounts(), loadList(currentTab)]);
        toast({ type:'success', title:'Received saved', message:'Receipt image uploaded and order moved to Received.' });
      } catch (e) {
        console.error(e);
        toast({ type:'error', title:'Error', message:e.message || 'Error' });
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'deliver') {
      const img = await promptImage();
      if (!img) return;
      const fd = new FormData();
      fd.append('orderIds', JSON.stringify(ids));
      fd.append('image', img);
      try {
        btn.disabled = true;
        const res = await fetch('/api/logistics/deliver', { method: 'POST', body: fd, credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
        await Promise.all([loadCounts(), loadList(currentTab)]);
        toast({ type:'success', title:'Delivered saved', message:'Delivery receipt uploaded and order moved to Delivered.' });
      } catch (e) {
        console.error(e);
        toast({ type:'error', title:'Error', message:e.message || 'Error' });
      } finally {
        btn.disabled = false;
      }
      return;
    }
  });

  function toast({ type='info', title='', message='', duration=6000 }) {
    if (window.UI && typeof UI.toast === 'function') {
      try { const t = UI.toast({ type, title, message, duration }); if (t) return; } catch(_) {}
    }
    let stack = document.getElementById('toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.id = 'toast-stack'; document.body.appendChild(stack); }
    const el = document.createElement('div');
    el.className = `toast-box toast-${type}`;
    el.innerHTML = `<div class="toast-icon">${type==='success'?'✓':(type==='error'?'!':'i')}</div>
                    <div class="toast-content">
                      ${title?`<div class="toast-title">${title}</div>`:''}
                      ${message?`<div class="toast-msg">${message}</div>`:''}
                    </div>
                    <button class="toast-close" aria-label="Close">×</button>`;
    stack.appendChild(el);
    const close = () => { el.classList.add('hide'); setTimeout(() => el.remove(), 200); };
    el.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, duration);
  }

  // Live search
  search.addEventListener('input', () => render(currentGroups));

  // Initial load
  loadCounts();
  setActiveTab(currentTab);
});
