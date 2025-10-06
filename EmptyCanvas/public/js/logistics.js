// logistics.js — renders Logistics items in Storage-like cards (Prepared / Received / Delivered)

(function () {
  const qs = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ", " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ""; }
  };

  // --- DOM targets (keeps backward compatibility with older HTML) ---
  const statePills = {
    prepared: qs('[data-pill-prepared]') || qs('#pillPrepared'),
    received: qs('[data-pill-received]') || qs('#pillReceived'),
    delivered: qs('[data-pill-delivered]') || qs('#pillDelivered'),
  };
  const counters = {
    prepared: qs('[data-count-prepared]') || qs('#countPrepared'),
    received: qs('[data-count-received]') || qs('#countReceived'),
    delivered: qs('[data-count-delivered]') || qs('#countDelivered'),
  };
  const searchInput = qs('[data-search-logistics]') || qs('#searchLogistics');
  const listRoot = qs('[data-logistics-list]') || qs('#logisticsList') || qs('#orders-list') || qs('#items-container');

  const tabFromURL = () => (new URLSearchParams(location.search).get('tab') || 'Prepared');
  let currentTab = tabFromURL(); // 'Prepared' | 'Received' | 'Delivered'

  function setActiveTab(tab) {
    currentTab = tab;
    // Visually activate pills if present
    qsa('[data-logistics-tab]').forEach(el => {
      el.classList.toggle('active', String(el.dataset.logisticsTab).toLowerCase() === tab.toLowerCase());
    });
    loadAndRender();
    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.toString());
  }

  // Attach tab clicks
  qsa('[data-logistics-tab]').forEach(el => {
    el.addEventListener('click', () => setActiveTab(el.dataset.logisticsTab));
  });

  if (!['Prepared', 'Received', 'Delivered'].includes(currentTab)) currentTab = 'Prepared';

  async function fetchList(tab) {
    const state = String(tab || 'Prepared').toLowerCase();
    const res = await fetch(`/api/logistics/${state}`, { headers: { 'Cache-Control': 'no-store' } });
    if (!res.ok) throw new Error('Failed to load logistics list');
    const json = await res.json();
    return json.items || [];
  }

  function groupByReason(items) {
    const groups = new Map();
    for (const it of items) {
      const key = (it.reason || '—') + '|' + (it.createdTime || '');
      if (!groups.has(key)) groups.set(key, { reason: it.reason || '—', createdTime: it.createdTime, items: [] });
      groups.get(key).items.push(it);
    }
    // Sort newest first
    return Array.from(groups.values()).sort((a,b) => new Date(b.createdTime||0) - new Date(a.createdTime||0));
  }

  function pill(text, tone) {
    const span = document.createElement('span');
    span.className = `pill pill-${tone||'muted'}`;
    span.textContent = text;
    return span;
  }

  function metricPill(label, value, tone) {
    const w = document.createElement('div');
    w.className = 'kv-pill';
    const k = document.createElement('span'); k.className = 'kv-k'; k.textContent = label;
    const v = document.createElement('span'); v.className = `kv-v ${tone?('tone-'+tone):''}`; v.textContent = value;
    w.append(k, v);
    return w;
  }

  function makeRow(item) {
    const row = document.createElement('div');
    row.className = 'storage-row';

    const left = document.createElement('div');
    left.className = 'sr-left';

    const title = document.createElement('div');
    title.className = 'sr-title';
    title.textContent = `Product: ${item.productName || '-'}`;

    const metrics = document.createElement('div');
    metrics.className = 'sr-metrics';

    const req = Number(item.quantity ?? item.requested ?? 0);
    // try to read available & remaining if backend sends them, otherwise assume Prepared means all available
    const avail = (item.available != null) ? Number(item.available) : (currentTab === 'Prepared' ? req : 0);
    const rem = (item.remaining != null) ? Number(item.remaining) : Math.max(0, req - avail);

    metrics.append(
      metricPill('Req', req, ''),
      metricPill('Avail', avail, avail >= req ? 'ok' : (avail > 0 ? 'warn' : 'bad')),
      metricPill('Rem', rem, rem === 0 ? 'ok' : 'bad')
    );

    left.append(title, metrics);

    const right = document.createElement('div');
    right.className = 'sr-right';

    // Status / action button depending on tab
    if (currentTab === 'Prepared') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-compact';
      btn.textContent = 'Received';
      btn.addEventListener('click', () => openUploadDialog('receive', [item.id]));
      right.append(btn);
    } else if (currentTab === 'Received') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-compact';
      btn.textContent = 'Delivered';
      btn.addEventListener('click', () => openUploadDialog('deliver', [item.id]));
      right.append(btn);
    } else {
      right.append(pill('Delivered', 'ok'));
    }

    row.append(left, right);
    return row;
  }

  function makeCard(group) {
    const card = document.createElement('div');
    card.className = 'storage-card';

    // Header
    const head = document.createElement('div');
    head.className = 'sc-head';

    const headL = document.createElement('div');
    headL.className = 'sc-head-left';
    const icon = document.createElement('span'); icon.className = 'sc-icon'; icon.textContent = '🚚';
    const dt = document.createElement('span'); dt.className = 'sc-dt'; dt.textContent = fmtDate(group.createdTime);
    headL.append(icon, dt);

    const headC = document.createElement('div');
    headC.className = 'sc-head-center';
    const hTitle = document.createElement('div'); hTitle.className = 'sc-title'; hTitle.textContent = group.reason || '—';
    headC.append(hTitle);

    const headR = document.createElement('div');
    headR.className = 'sc-head-right';
    const itemsPill = pill(`Items: ${group.items.length}`, 'muted');
    headR.append(itemsPill);

    head.append(headL, headC, headR);

    // Body
    const body = document.createElement('div');
    body.className = 'sc-body';
    group.items.forEach(it => body.appendChild(makeRow(it)));

    card.append(head, body);
    return card;
  }

  function render(groups) {
    listRoot.innerHTML = '';
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.textContent = 'No items.';
      listRoot.append(empty);
      return;
    }
    groups.forEach(g => listRoot.appendChild(makeCard(g)));
  }

  function applySearch() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    qsa('.storage-card', listRoot).forEach(card => {
      const txt = card.textContent.toLowerCase();
      card.style.display = txt.includes(q) ? '' : 'none';
    });
  }

  async function loadAndRender() {
    listRoot.classList.add('loading-skeleton');
    try {
      const items = await fetchList(currentTab);
      (counters.prepared || {}).textContent = items.filter(i => (i.state||'').toLowerCase()==='prepared').length || '';
      (counters.received || {}).textContent = items.filter(i => (i.state||'').toLowerCase()==='received').length || '';
      (counters.delivered || {}).textContent = items.filter(i => (i.state||'').toLowerCase()==='delivered').length || '';
      const groups = groupByReason(items);
      render(groups);
      applySearch();
    } catch (e) {
      console.error(e);
      listRoot.innerHTML = '<div class="empty-hint">Failed to load data.</div>';
    } finally {
      listRoot.classList.remove('loading-skeleton');
    }
  }

  // --- Upload dialog + actions ---
  function openUploadDialog(kind, ids) {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-wrap';
    wrapper.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">${kind === 'receive' ? 'Confirm Receive' : 'Confirm Deliver'}</div>
        </div>
        <div class="modal-body">
          <label class="form-label">Upload receipt image (optional)</label>
          <input type="file" accept="image/*" class="form-input" id="lgxFile">
        </div>
        <div class="modal-foot">
          <button class="btn btn-muted" id="lgxCancel">Cancel</button>
          <button class="btn btn-primary" id="lgxOk">${kind === 'receive' ? 'Mark Received' : 'Mark Delivered'}</button>
        </div>
      </div>`;
    document.body.appendChild(wrapper);
    qs('#lgxCancel', wrapper).onclick = () => wrapper.remove();
    qs('.modal-wrap', wrapper).addEventListener('click', (e) => {
      if (e.target === wrapper) wrapper.remove();
    });

    qs('#lgxOk', wrapper).onclick = async () => {
      const file = qs('#lgxFile', wrapper).files[0];
      let url = null;
      if (file) {
        // In this simple version we use an object URL; in real use you may upload to cloud storage
        url = URL.createObjectURL(file);
      }
      try {
        const payload = kind === 'receive' ? { orderIds: ids, receiptUrl: url } : { orderIds: ids, deliveryUrl: url };
        const endpoint = kind === 'receive' ? '/api/logistics/receive' : '/api/logistics/deliver';
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Action failed');
        wrapper.remove();
        await loadAndRender();
      } catch (e) {
        console.error(e);
        alert('Action failed');
      }
    };
  }

  // Search
  if (searchInput) {
    searchInput.addEventListener('input', applySearch);
  }

  // First render
  setActiveTab(currentTab);
})();