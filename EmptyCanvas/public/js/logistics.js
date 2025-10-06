(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const currentTab = qs.get('tab') || 'Prepared';
  let cache = { Prepared: [], Received: [], Delivered: [] };

  function setActivePill(tab){
    $$('#logi-pills .stat-card').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.tab||'')===tab);
    });
  }

  async function fetchTab(tab){
    const res = await fetch(`/api/logistics?status=${encodeURIComponent(tab)}`, { cache: 'no-store' });
    if(!res.ok){ byId('logi-items').innerHTML = `<p class="text-error">Failed to load.</p>`; return; }
    const items = await res.json();
    cache[tab] = items;
    renderList(tab, items);
    byId('prepared-count').textContent = cache.Prepared.length||0;
    byId('received-count').textContent = cache.Received.length||0;
    byId('delivered-count').textContent = cache.Delivered.length||0;
  }

  function card(item, tab){
    const rem = Math.max(0, Number(item.requested||0)-Number(item.available||0));
    const rightBtn =
      tab==='Prepared' ? `<button class="btn btn-primary btn-sm" data-action="receive" data-id="${item.id}">Received</button>` :
      tab==='Received' ? `<button class="btn btn-primary btn-sm" data-action="deliver" data-id="${item.id}">Delivered</button>` : '';

    return `<div class="order-row">
      <div class="order-row-main">
        <div class="order-title">${escapeHtml(item.reason||'No Reason')}</div>
        <div class="order-sub">Product: ${escapeHtml(item.productName||'-')}</div>
        <div class="order-stats">
          <span class="pill pill-gray">Req: ${item.requested||0}</span>
          <span class="pill pill-green">Avail: ${item.available||0}</span>
          <span class="pill ${rem>0?'pill-amber':'pill-green'}">Rem: ${rem}</span>
        </div>
      </div>
      <div class="order-row-actions">${rightBtn||''}</div>
    </div>`;
  }

  function renderList(tab, items){
    setActivePill(tab);
    const q = (byId('logiSearch')?.value||'').toLowerCase();
    const filtered = items.filter(it =>
      (it.reason||'').toLowerCase().includes(q) ||
      (it.productName||'').toLowerCase().includes(q)
    );
    byId('logi-items').innerHTML = filtered.length
      ? filtered.map(it=>card(it,tab)).join('')
      : `<p>No items.</p>`;
  }

  function openUploadModal(kind, id){
    const modal = byId('logiModal');
    const body = byId('logiModalBody');
    body.innerHTML = `
      <h3 style="margin-bottom:10px">${kind==='receive'?'Mark as Received':'Mark as Delivered'}</h3>
      <p class="muted">Upload a photo (optional).</p>
      <input id="proofFile" type="file" accept="image/*" />
      <div style="margin-top:14px; display:flex; gap:8px; justify-content:flex-end">
        <button class="btn btn-light" id="cancelUpload">Cancel</button>
        <button class="btn btn-primary" id="confirmUpload">Confirm</button>
      </div>
    `;
    modal.setAttribute('aria-hidden','false'); modal.classList.add('open');
    byId('logiModalClose').onclick = closeModal;
    byId('cancelUpload').onclick = closeModal;
    byId('confirmUpload').onclick = async () => {
      const f = byId('proofFile').files[0];
      let dataUrl = null; if (f) dataUrl = await fileToDataURL(f);
      if (kind === 'receive') await markReceived([id], dataUrl);
      else await markDelivered([id], dataUrl);
      closeModal();
      await Promise.all(['Prepared','Received','Delivered'].map(t=>fetchTab(t)));
      const active = new URLSearchParams(location.search).get('tab') || 'Prepared';
      renderList(active, cache[active]);
    };
  }
  function closeModal(){ const modal = byId('logiModal'); modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }

  async function markReceived(ids, proof){
    await fetch('/api/logistics/mark-received', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ orderIds: ids, proof })
    });
  }
  async function markDelivered(ids, proof){
    await fetch('/api/logistics/mark-delivered', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ orderIds: ids, proof })
    });
  }

  function fileToDataURL(file){
    return new Promise((res,rej)=>{
      const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);
    });
  }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
  }

  byId('logi-pills').addEventListener('click', (e)=>{
    const btn=e.target.closest('.stat-card'); if(!btn) return;
    const tab=btn.dataset.tab; const url=new URL(location.href);
    url.searchParams.set('tab',tab); history.pushState({},'',url);
    renderList(tab, cache[tab]||[]); 
  });
  byId('logi-items').addEventListener('click', (e)=>{
    const btn=e.target.closest('button[data-action]'); if(!btn) return;
    openUploadModal(btn.dataset.action, btn.dataset.id);
  });

  
  function activeTab(){
    const a = $('#logi-pills .stat-card.active');
    return a ? (a.dataset.tab||'Prepared') : 'Prepared';
  }
  const searchEl = byId('logiSearch');
  if (searchEl) {
    searchEl.addEventListener('input', ()=>{
      const tab = activeTab();
      renderList(tab, cache[tab]||[]);
    });
  }

  (async function init(){
    await Promise.all(['Prepared','Received','Delivered'].map(t=>fetchTab(t)));
    const initTab = currentTab; setActivePill(initTab); renderList(initTab, cache[initTab]||[]);
  })();
})();