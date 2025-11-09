// public/js/damaged-assets.js
// Damaged Assets page – products dropdown with Choices.js (same UX as order-products.step)

(() => {
  // -------- State ----------
  let components = [];             // [{ id, name, url? }]
  let isComponentsLoaded = false;
  const toHydrate = [];            // waits for data: { inst, container, defaultId }
  let urlById = new Map();         // (optional) id -> url

  let itemCounter = 0;

  // -------- DOM ----------
  const listEl   = document.getElementById('itemsList');      // container for components entries
  const addBtn   = document.getElementById('addItemBtn');     // "Add Component" button
  const formEl   = document.getElementById('damagedForm');    // main form
  const logoutBtn= document.getElementById('logoutBtn');      // sidebar logout (if exists)
  const submitBtn= document.getElementById('submitBtn');      // submit button

  // Use the same endpoint used by the products step
  const COMPONENTS_ENDPOINT = '/api/components';

  // ---------- Helpers ----------
  function toast(message, type = 'info') {
    if (window.UI && typeof UI.toast === 'function') UI.toast({ type, message });
    else alert(message);
  }

  async function handleLogout() {
    try {
      const r = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      if (r.ok) location.href = '/login';
      else location.href = '/login';
    } catch {
      location.href = '/login';
    }
  }

  // ---------- Data ----------
  async function loadComponents() {
    try {
      const res = await fetch(COMPONENTS_ENDPOINT);
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Bad response format');
      return list;
    } catch (e) {
      console.error('Failed to load components:', e);
      return [];
    }
  }

  function optionsFromComponents() {
    return components.map(c => ({
      value: String(c.id),
      label: c.name || String(c.id),
      selected: false,
      disabled: false
    }));
  }

  // ---------- Choices.js (same config as products step) ----------
  function enhanceWithChoices(select, defaultId = '') {
    const inst = new Choices(select, {
      searchEnabled: true,
      placeholder: true,
      placeholderValue: isComponentsLoaded ? 'Select a product...' : 'Loading products list...',
      itemSelectText: '',
      shouldSort: true,
      allowHTML: false,
      position: 'bottom',
      searchResultLimit: 500,
      fuseOptions: {
        keys: ['label'],
        threshold: 0.3
      }
    });

    const container =
      inst.containerOuter?.element ||
      select.closest('.choices') ||
      select.parentElement.querySelector('.choices');

    if (!isComponentsLoaded) {
      container?.classList.add('is-loading');
      inst.disable();
      toHydrate.push({ inst, container, defaultId });
    } else {
      inst.clearChoices();
      inst.setChoices(optionsFromComponents(), 'value', 'label', true);
      if (defaultId) inst.setChoiceByValue(String(defaultId));
    }
    return inst;
  }

  function hydratePendingChoices() {
    toHydrate.forEach(({ inst, container, defaultId }) => {
      try {
        inst.enable();
        inst.clearChoices();
        inst.setChoices(optionsFromComponents(), 'value', 'label', true);
        if (defaultId) inst.setChoiceByValue(String(defaultId));
        container?.classList.remove('is-loading');
      } catch (e) {
        console.warn('Hydration failed for a select', e);
      }
    });
    toHydrate.length = 0;
  }

  // ---------- UI: rows ----------
  function buildEntryDom(id) {
    const wrap = document.createElement('div');
    wrap.className = 'expense-entry';
    wrap.dataset.itemId = String(id);

    // layout mirrors Funds + Products pages
    wrap.innerHTML = `
      <div class="expense-header">
        <h4><i data-feather="package"></i> Component ${id}</h4>
        <button type="button" class="expense-status remove-expense" title="Delete component" data-item-id="${id}"></button>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="product${id}"><i data-feather="box"></i> Products *</label>
          <select id="product${id}" name="items[${id}][productId]" class="product-select" required>
            <option value="" disabled selected>${isComponentsLoaded ? 'Select a product...' : 'Loading products list...'}</option>
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

  function addItemEntry(defaultProductId = '') {
    itemCounter++;
    const node = buildEntryDom(itemCounter);
    listEl.appendChild(node);

    // feather icons
    if (window.feather) feather.replace();

    // enhance select
    const select = node.querySelector('select.product-select');
    enhanceWithChoices(select, defaultProductId);

    // remove handler
    node.querySelector('.remove-expense').addEventListener('click', () => {
      const total = document.querySelectorAll('.expense-entry').length;
      if (total <= 1) return toast('At least one component is required', 'error');
      node.remove();
    });

    // focus user into the newly added select (Choices will focus properly)
    select.focus();
  }

  // ---------- Validate + payload ----------
  function validateForm() {
    const entries = document.querySelectorAll('.expense-entry');
    for (const e of entries) {
      const p = e.querySelector('select.product-select');
      const t = e.querySelector('input[name*="[title]"]');
      if (p?.value && t?.value?.trim()) return true;
    }
    toast('Please add at least one complete component', 'error');
    return false;
  }

  function collectPayload() {
    const items = [];
    document.querySelectorAll('.expense-entry').forEach(e => {
      const id = e.dataset.itemId;
      const sel = e.querySelector(`#product${id}`);
      const title = e.querySelector(`#title${id}`);
      const reason = e.querySelector(`#reason${id}`);
      const files = e.querySelector(`#files${id}`);

      if (!(sel?.value && title?.value?.trim())) return;

      const productId = String(sel.value);
      const productName = sel.selectedOptions?.[0]?.text || '';

      const item = {
        product: { id: productId, name: productName }, // relation Products
        title: title.value.trim(),                      // Title
        reason: (reason?.value || '').trim(),          // Text
        files: []
      };

      if (files?.files?.length) {
        for (const f of files.files) item.files.push({ name: f.name, type: f.type, size: f.size });
      }
      items.push(item);
    });
    return { items };
  }

  // ---------- Submit ----------
  async function handleSubmit(ev) {
    ev.preventDefault();
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
      addItemEntry();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Failed to submit', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="save"></i> Submit Report';
      if (window.feather) feather.replace();
    }
  }

  // ---------- Init ----------
  async function init() {
    if (!listEl || !addBtn || !formEl) {
      console.error('Damaged Assets: missing required DOM nodes');
      return;
    }

    // Add first empty row
    addItemEntry();

    // Load components (same data source as products step)
    components = await loadComponents();
    isComponentsLoaded = true;
    urlById = new Map(components.map(c => [String(c.id), c.url || ""])); // optional
    hydratePendingChoices();

    // Hook events
    addBtn.addEventListener('click', () => addItemEntry());
    formEl.addEventListener('submit', handleSubmit);
    logoutBtn?.addEventListener('click', handleLogout);

    if (window.feather) feather.replace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
