// public/js/common-ui.js (Vercel-safe, supports .html links)
// NOTE: This version understands both "pretty routes" (/orders, /stocktaking)
// and direct file links inside /public (e.g., index.html, stocktaking.html).

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn     = document.getElementById('logoutBtn');
  const menuToggle    = document.getElementById('menu-toggle');   // may be absent
  const sidebarToggle = document.getElementById('sidebar-toggle'); // usually present

  const KEY_MINI = 'ui.sidebarMini';        // '1' = mini on desktop
  const CACHE_ALLOWED = 'allowedPages';     // sessionStorage key
  const isMobile = () => window.innerWidth <= 768;

  // ====== Access control (show/hide links) ======
  // We map Notion "Allowed Pages" names -> possible nav link selectors.
  // Each value is an array of selector candidates to support both pretty routes
  // and plain .html files under /public.
  const PAGE_SELECTORS = {
    'current orders': [
      'a[href="/orders"]', 'a[href="/dashboard"]', 'a[href="/"]',
      'a[href$="/index.html"]', 'a[href$="index.html"]', 'a[href*="current"]'
    ],
    'create new order': [
      'a[href="/orders/new"]',
      'a[href$="create-order-details.html"]',
      'a[href$="create-order-products.html"]',
      'a[href$="create-order-review.html"]'
    ],
    'stocktaking': [
      'a[href="/stocktaking"]', 'a[href$="stocktaking.html"]'
    ],
    'requested orders': [
      'a[href="/orders/requested"]', 'a[href$="requested-orders.html"]', 'a[href*="requested-orders"]'
    ],
    'schools requested orders': [
      'a[href="/orders/requested"]', 'a[href$="requested-orders.html"]', 'a[href*="requested-orders"]'
    ],
    'assigned schools requested orders': [
      'a[href="/orders/assigned"]', 'a[href$="assigned-orders.html"]', 'a[href*="assigned-orders"]'
    ],
    'funds': [
      'a[href="/funds"]', 'a[href$="funds.html"]'
    ],
  };
  const toKey = (s) => String(s || '').trim().toLowerCase();

  function hideEl(el){ if (el){ el.style.display = 'none'; el.setAttribute('aria-hidden','true'); } }
  function showEl(el){ if (el){ el.style.display = ''; el.removeAttribute('aria-hidden'); } }

  function firstExistingSelector(selectors) {
    if (!selectors) return null;
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of arr) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Show allowed links and hide the rest (deterministic)
  function applyAllowedPages(allowed){
    if (!Array.isArray(allowed) || allowed.length === 0) return;
    const set = new Set(allowed.map(toKey));

    // Build a set of all nav link elements mentioned in PAGE_SELECTORS
    const allMentioned = new Set();
    Object.values(PAGE_SELECTORS).forEach((sel) => {
      const arr = Array.isArray(sel) ? sel : [sel];
      arr.forEach(s => document.querySelectorAll(s).forEach(el => allMentioned.add(el)));
    });

    // Iterate known page keys and toggle visibility for found links
    Object.entries(PAGE_SELECTORS).forEach(([key, selectors]) => {
      const link = firstExistingSelector(selectors);
      if (!link) return; // nothing to toggle if not present
      const li = link.closest('li') || link;
      if (set.has(key)) showEl(li); else hideEl(li);
      // mark as handled
      if (allMentioned.has(link)) allMentioned.delete(link);
    });

    // For any nav links NOT covered by PAGE_SELECTORS, keep them visible by default.
    // (No blind hiding so we don't accidentally hide custom links.)
  }

  function cacheAllowedPages(arr){ try { sessionStorage.setItem(CACHE_ALLOWED, JSON.stringify(arr || [])); } catch {} }
  function getCachedAllowedPages(){
    try { const r = sessionStorage.getItem(CACHE_ALLOWED); const a = JSON.parse(r); return Array.isArray(a) ? a : null; }
    catch { return null; }
  }

  // ====== Greeting ======
  const getCachedName = () => (localStorage.getItem('username') || '').trim();
  const renderGreeting = (name) => {
    const n = (name || '').trim();
    document.querySelectorAll('[data-username]').forEach(el => el.textContent = n || 'User');
  };

  async function ensureGreetingAndPages(){
    const cached = getCachedName();
    if (cached) renderGreeting(cached);

    try {
      // GET /api/account returns { name, username, allowedPages: [] }
      const res = await fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      const name = (data && (data.name || data.username)) ? String(data.name || data.username) : '';
      if (name) {
        if (name !== cached) localStorage.setItem('username', name);
        renderGreeting(name);
      } else if (!cached) {
        renderGreeting('User');
      }

      if (Array.isArray(data.allowedPages)) {
        cacheAllowedPages(data.allowedPages);
        applyAllowedPages(data.allowedPages); // show/hide deterministically
      }
    } catch {}
  }

  // ====== Sidebar toggle ======
  function setAria(){
    const expanded = isMobile()
      ? !document.body.classList.contains('sidebar-collapsed')
      : !document.body.classList.contains('sidebar-mini');
    [menuToggle, sidebarToggle].forEach(btn => btn && btn.setAttribute('aria-expanded', String(!!expanded)));
  }

  function applyInitial(){
    if (isMobile()){
      document.body.classList.remove('sidebar-mini');
      document.body.classList.remove('sidebar-collapsed');
    } else {
      const pref = localStorage.getItem(KEY_MINI);
      if (pref === '1') document.body.classList.add('sidebar-mini');
      else document.body.classList.remove('sidebar-mini');
      document.body.classList.remove('sidebar-collapsed');
    }
    setAria();
  }

  function toggleSidebar(e){
    if (e){ e.preventDefault(); e.stopPropagation(); }
    if (isMobile()){
      document.body.classList.toggle('sidebar-collapsed');
    } else {
      document.body.classList.toggle('sidebar-mini');
      localStorage.setItem(KEY_MINI, document.body.classList.contains('sidebar-mini') ? '1' : '0');
    }
    setAria();
    if (window.feather) feather.replace();
  }

  sidebarToggle && sidebarToggle.addEventListener('click', toggleSidebar);
  menuToggle    && menuToggle.addEventListener('click', toggleSidebar);

  // Close sidebar by clicking outside (mobile)
  document.addEventListener('click', (event) => {
    if (!isMobile()) return;
    const clickedInteractive = event.target.closest('button,[type="button"],[type="submit"],a,input,select,textarea,.choices,.form-actions');
    if (clickedInteractive) return;
    const insideSidebar = event.target.closest('.sidebar');
    const onToggles = event.target.closest('#menu-toggle, #sidebar-toggle');
    if (insideSidebar || onToggles) return;
    if (!document.body.classList.contains('sidebar-collapsed')) return;
    toggleSidebar(event);
  });

  document.addEventListener('keydown', (e) => {
    if (isMobile() && e.key === 'Escape' && !document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.add('sidebar-collapsed');
      setAria();
    }
  });

  // ====== Logout ======
  logoutBtn && logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
    try { sessionStorage.clear(); } catch {}
    try { localStorage.removeItem(KEY_MINI); localStorage.removeItem('username'); } catch {}
    window.location.href = '/login';
  });

  // Init
  applyInitial();
  ensureGreetingAndPages();

  window.addEventListener('user:updated', () => {
    renderGreeting(getCachedName());
    const allowed = getCachedAllowedPages();
    if (allowed) applyAllowedPages(allowed);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyInitial, 150);
  });

  if (window.feather) feather.replace();
});

// UI Toast — modern notifications
(() => {
  const ROOT_ID = 'toast-root';

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      document.body.appendChild(root);
    }
    return root;
  }

  function iconNameByType(type) {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error':   return 'x-circle';
      case 'warning': return 'alert-triangle';
      default:        return 'info';
    }
  }

  function toast({ title = '', message = '', type = 'success', duration = 4000 } = {}) {
    const root = ensureRoot();

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    el.innerHTML = `
      <div class="toast__icon"><i data-feather="${iconNameByType(type)}"></i></div>
      <div class="toast__body">
        ${title ? `<div class="toast__title">${title}</div>` : ''}
        <div class="toast__msg">${message}</div>
      </div>
      <button class="toast__close" aria-label="Close">&times;</button>
      <div class="toast__progress"></div>
    `;

    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (window.feather) feather.replace({ 'stroke-width': 2 });

    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast__close').addEventListener('click', close);

    let start = Date.now();
    const prog = el.querySelector('.toast__progress');
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - start) / duration) * 100);
      prog.style.width = `${100 - pct}%`;
      if (pct < 100 && document.body.contains(el)) requestAnimationFrame(tick);
      else close();
    };
    requestAnimationFrame(tick);
  }

  window.UI = window.UI || {};
  window.UI.toast = toast;
})();