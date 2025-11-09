// public/js/damaged-assets.js
// Damaged Assets – products dropdown with the same UX/behavior as the Products step.
// Robust loader: tries /api/components first, then /api/damaged-assets/options,
// and normalizes different response shapes.

(() => {
  // ---------- State ----------
  let items = [];                 // normalized: [{id, name, url?}]
  let loaded = false;
  const pendingChoices = [];      // selects that were created before data arrived
  let itemCounter = 0;

  // ---------- DOM ----------
  const listEl    = document.getElementById('itemsList');
  const addBtn    = document.getElementById('addItemBtn');
  const formEl    = document.getElementById('damagedForm');
  const submitBtn = document.getElementById('submitBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // ---------- Helpers ----------
  function toast(message, type = 'info') {
    if (window.UI && typeof UI.toast === 'function') UI.toast({ type, message });
    else alert(message);
  }

  async function handleLogout() {
    try {
      const r = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/login';
    } catch {
      location.href = '/login';
    }
  }

  // ---------- Data loading ----------
  async function fetchJSON(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(await r.text());
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') ? r.json() : Promise.reject(new Error('Non-JSON response'));
  }

  function normalizeList(raw) {
    // Accept:
    // - array of {id, name}
    // - array of {value, label}
    // - {components: [...]}
    // - {options: [...]}
    // - raw Notion pages (item.properties.Name.title[0].plain_text)
    const arr = Array.isArray(raw) ? raw
              : Array.isArray(raw?.components) ? raw.components
              : Array.isArray(raw?.options)    ? raw.options
              : [];

    const out = [];
    for (const it of arr) {
      if (it?.id && it?.name) { out.push({ id: String(it.id), name: it.name, url: it.url }); continue; }
      if (it?.value && it?.label) { out.push({ id: String(it.value), name: it.label }); continue; }
      if (it?.properties) {
        const props = it.properties;
        const nameP = props.Name || props['Product Name'] || props['Component Name'];
        let txt = '';
        if (nameP?.title?.length) txt = nameP.title.map(t => t.plain_text).join('').trim();
        out.push({ id: String(it.id), name: txt || String(it.id), url: it.url });
      }
    }
    return out;
  }

  async function loadItems() {
    try {
      // 1) نفس مصدر صفحة المنتجات
      let data = await fetchJSON('/api/components');
      items = normalizeList(data);
      // 2) fallback لو مفيش بيانات
      if (!items.length) {
        data = await fetchJSON('/api/damaged-assets/options');
        items = normalizeList(data);
      }
    } catch (e) {
      console.warn('Products load failed (primary):', e);
      try {
        const data = await fetchJSON('/api/damaged-assets/options');
        items = normalizeList(data);
      } catch (err) {
        console.error('Products load failed (fallback):', err);
        items = [];
      }
    } finally {
      loaded = true;
    }
  }

  // ---------- Choices.js ----------
  function ensureChoicesOn(select, defaultId = '') {
    // ملاحظة: لازم يكون choices.min.js متحمّل في layout العام (نفس ما هو في صفحة المنتجات)
    const inst = new Choices(select, {
      searchEnabled: true,
      placeholder: true,
      placeholderValue: loaded ? 'Select a product...' : 'Loading products list...',
      itemSelectText: '',
      allowHTML: false,
      shouldSort: true,
      position: 'bottom',
      searchResultLimit: 500,
      fuseOptions: { keys: ['label'], threshold: 0.3 }
    });

    const outer = inst.containerOuter?.element || select.closest('.choices');

    if (!loaded) {
      outer?.classList.add('is-loading');
      inst.disable();
      pendingChoices.push({ inst, outer, defaultId });
    } else {
      inst.clearChoices();
      inst.setChoices(items.map(i => ({ value: i.id, label: i.name })), 'value', 'label', true);
      if (defaultId) inst.setChoiceByValue(String(defaultId));
    }
    return inst;
  }

  function hydratePending() {
    pendingChoices.splice(0).forEach(({ inst, outer, defaultId }) => {
      try {
        inst.enable();
        inst.clearChoices();
        inst.setChoices(items.map(i => ({ value: i.id, label: i.name })), 'value', 'label', true);
        if (defaultId) inst.setChoiceByValue(String(defaultId));
        outer?.classList.remove('is-loading');
      } catch (e) {
        console.warn('hydrate failed:', e);
      }
    });
  }

  // ---------- UI rows ----------
  function buildRowDom(id) {
    const wrap = document.createElement('div');
    wrap.className = 'expense-entry';
    wrap.dataset.itemId = String(id);

    wrap.innerHTML = `
      <div class="expense-header">
        <h4><i data-feather="package"></i> Component ${id}</h4>
        <button type="button" class="expense-status remove-expense" title="Delete component" data-item-id="${id}"></button>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="product${id}"><i data-feather="box"></i> Products *</label>
          <select id="product${id}" name="items[${id}][productId]" class="product-select" required>
            <option value="" disabled selected>${loaded ? 'Select a product...' : 'Loading products list...'}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="title${id}"><i data-feather="type"></i> Description of issue (Title) *</label>
          <input id="title${id}" name="items[${id}][title]" class="form-input" type="text" placeholder="Short issue summary..." required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="reason${id}"><i data-feather="message-square"></i> Issue Reason</label>
        <textarea id="reason${id}" name="items[${id}][reason]" class="form-input" placeholder="Extra details, when/how it happened, etc."></textarea>
      </div>

      <div class="form-group">
        <label class="form-label" for="files${id}"><i data-feather="image"></i> Files &amp; media</label>
        <input id="files${id}" name="items[${id}][files]" class="form-input" type="file" multiple accept="image/*,.pdf,.heic,.jpg,.jpeg,.png" />
        <small class="form-help">Upload photos/screenshots (optional)</small>
      </div>
    `;
    return wrap;
  }

  function addRow(defaultProductId = '') {
    itemCounter++;
    const row = buildRowDom(itemCounter);
    listEl.appendChild(row);
    if (window.feather) feather.replace();

    const select = row.querySelector('select.product-select');
    ensureChoicesOn(select, defaultProductId);

    row.querySelector('.remove-expense').addEventListener('click', () => {
      const total = document.querySelectorAll('.expense-entry').length;
      if (total <= 1) return toast('At least one component is required', 'error');
      row.remove();
    });

    select.focus();
  }

  // ---------- validation + payload ----------
  function validateForm() {
    const rows = document.querySelectorAll('.expense-entry');
    for (const r of rows) {
      const p = r.querySelector('select.product-select');
      const t = r.querySelector('input[name*="[title]"]');
      if (p?.value && t?.value?.trim()) return true;
    }
    toast('Please add at least one complete component', 'error');
    return false;
  }

  function collectPayload() {
    const out = [];
    document.querySelectorAll('.expense-entry').forEach(r => {
      const id = r.dataset.itemId;
      const sel = r.querySelector(`#product${id}`);
      const title = r.querySelector(`#title${id}`);
      const reason = r.querySelector(`#reason${id}`);
      const files = r.querySelector(`#files${id}`);

      if (!(sel?.value && title?.value?.trim())) return;

      const item = {
        product: { id: String(sel.value), name: sel.selectedOptions?.[0]?.text || '' },
        title: title.value.trim(),
        reason: (reason?.value || '').trim(),
        files: []
      };
      if (files?.files?.length) {
        for (const f of files.files) item.files.push({ name: f.name, type: f.type, size: f.size });
      }
      out.push(item);
    });
    return { items: out };
  }

  // ---------- submit ----------
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-feather="loader"></i> Submitting...';
    if (window.feather) feather.replace();

    try {
      const payload = collectPayload();
      const r = await fetch('/api/damaged-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const ct = r.headers.get('content-type') || '';
      const j = ct.includes('application/json') ? await r.json() : { success: false, error: 'Non-JSON response' };
      if (!r.ok || !j.success) throw new Error(j.error || 'Failed to submit');

      toast(j.message || 'Damage report submitted successfully!', 'success');
      formEl.reset();
      listEl.innerHTML = '';
      itemCounter = 0;
      addRow();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to submit', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="save"></i> Submit Report';
      if (window.feather) feather.replace();
    }
  }

  // ---------- init ----------
  async function init() {
    if (!listEl || !addBtn || !formEl) {
      console.error('Damaged Assets: required nodes not found');
      return;
    }
    addRow(); // build first row immediately (shows "Loading..." placeholder)

    // load products (components) exactly like products step
    await loadItems();
    hydratePending();

    addBtn.addEventListener('click', () => addRow());
    formEl.addEventListener('submit', handleSubmit);
    logoutBtn?.addEventListener('click', handleLogout);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
