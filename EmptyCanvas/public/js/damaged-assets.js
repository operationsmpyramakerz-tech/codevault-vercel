// damaged-assets.js — Damaged Assets (Funds-like) with searchable Products select
(() => {
  let itemCounter = 0;
  let PRODUCT_OPTIONS = []; // [{id, name}]

  // ---------------------- Basic UI helpers ----------------------
  function showToast(message, type = 'info') {
    if (typeof UI !== 'undefined' && UI.toast) UI.toast({ type, message });
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

  // ---------------------- Options loader (Notion via /api/components) ----------------------
  async function loadProductOptions() {
    try {
      // نفس الـ endpoint المستخدم في صفحة Create Products
      const res = await fetch('/api/components', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      PRODUCT_OPTIONS = Array.isArray(list)
        ? list.map(c => ({ id: String(c.id), name: c.name || String(c.id) }))
        : [];
    } catch (e) {
      console.error('options error:', e);
      PRODUCT_OPTIONS = [];
    }
  }

  // ---------------------- Searchable select ----------------------
  function makeSearchableSelect(selectEl, options) {
    if (!selectEl) return;
    if (selectEl.dataset.searchable === '1') return;
    selectEl.dataset.searchable = '1';

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.className = 'searchable-select';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    selectEl.style.position = 'absolute';
    selectEl.style.opacity = '0';
    selectEl.style.pointerEvents = 'none';
    selectEl.style.width = '100%';
    selectEl.style.height = '40px';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'form-input';
    input.placeholder = 'Select product...';
    input.autocomplete = 'off';
    input.style.paddingRight = '34px';
    wrapper.insertBefore(input, selectEl);

    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown-panel';
    Object.assign(dropdown.style, {
      position: 'absolute',
      left: '0', right: '0', top: '100%',
      zIndex: '50', maxHeight: '260px', overflow: 'auto',
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: '10px', boxShadow: '0 8px 20px rgba(0,0,0,.06)',
      marginTop: '6px', display: 'none'
    });
    wrapper.appendChild(dropdown);

    function render(list, query = '') {
      dropdown.innerHTML = '';
      const q = query.trim().toLowerCase();
      const filtered = !q ? list : list.filter(o => (o.name || '').toLowerCase().includes(q));
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.style.padding = '10px 12px';
        empty.style.color = '#6b7280';
        empty.textContent = 'No results';
        dropdown.appendChild(empty);
        return;
      }
      for (const o of filtered) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'dropdown-item';
        Object.assign(row.style, {
          display: 'block', width: '100%', textAlign: 'left',
          padding: '10px 12px', border: '0', background: 'transparent', cursor: 'pointer'
        });
        row.onmouseenter = () => (row.style.background = '#f9fafb');
        row.onmouseleave = () => (row.style.background = 'transparent');
        row.textContent = o.name || o.id;
        row.dataset.value = o.id || o.name || '';
        row.addEventListener('click', () => commit(o));
        dropdown.appendChild(row);
      }
    }

    function commit(opt) {
      const v = String(opt.id || opt.name || '');
      let found = false;
      for (const op of selectEl.options) {
        if (op.value === v) { selectEl.value = v; found = true; break; }
      }
      if (!found) {
        const op = document.createElement('option');
        op.value = v;
        op.textContent = opt.name || opt.id || 'Unnamed';
        selectEl.appendChild(op);
        selectEl.value = v;
      }
      input.value = opt.name || opt.id || '';
      dropdown.style.display = 'none';
      input.blur();
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('focus', () => { render(PRODUCT_OPTIONS); dropdown.style.display = 'block'; });
    input.addEventListener('input', () => render(PRODUCT_OPTIONS, input.value));
    document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) dropdown.style.display = 'none'; });

    const selected = selectEl.selectedOptions?.[0];
    if (selected) input.value = selected.textContent || '';
  }

  // ---------------------- Entry builder ----------------------
  function buildEntryDom(id) {
    const wrap = document.createElement('div');
    wrap.className = 'expense-entry';
    wrap.dataset.itemId = id;

    wrap.innerHTML = `
      <div class="expense-header">
        <h4><i data-feather="package"></i> Component ${id}</h4>
        <button type="button" class="expense-status remove-expense" title="Delete component" data-item-id="${id}"></button>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="product${id}"><i data-feather="box"></i> Products *</label>
          <select id="product${id}" name="items[${id}][productId]" class="form-input" required>
            <option value="">Select product...</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="title${id}"><i data-feather="type"></i> Description of issue (Title) *</label>
          <input id="title${id}" name="items[${id}][title]" class="form-input" type="text" placeholder="Short issue summary..." required/>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="reason${id}"><i data-feather="message-square"></i> Issue Reason</label>
        <textarea id="reason${id}" name="items[${id}][reason]" class="form-input" placeholder="Extra details, when/how it happened, etc."></textarea>
      </div>

      <div class="form-group">
        <label class="form-label" for="files${id}"><i data-feather="image"></i> Files &amp; media</label>
        <input id="files${id}" name="items[${id}][files]" class="form-input" type="file" multiple accept="image/*,.pdf,.heic,.jpg,.jpeg,.png"/>
        <small class="form-help">Upload photos/screenshots (optional)</small>
      </div>
    `;
    return wrap;
  }

  function populateSelect(selectEl) {
    selectEl.innerHTML = '<option value="">Select product...</option>';
    for (const o of PRODUCT_OPTIONS) {
      const op = document.createElement('option');
      op.value = String(o.id || o.name || '');
      op.textContent = o.name || o.id || 'Unnamed';
      selectEl.appendChild(op);
    }
    makeSearchableSelect(selectEl, PRODUCT_OPTIONS);
  }

  function addItemEntry() {
    itemCounter++;
    const list = document.getElementById('itemsList');
    const node = buildEntryDom(itemCounter);
    list.appendChild(node);
    if (window.feather) feather.replace();

    const sel = document.getElementById(`product${itemCounter}`);
    populateSelect(sel);

    node.querySelector('.remove-expense').addEventListener('click', () => {
      const total = document.querySelectorAll('.expense-entry').length;
      if (total <= 1) return showToast('At least one component is required', 'error');
      node.remove();
    });

    sel.focus();
  }

  function validateForm() {
    const entries = document.querySelectorAll('.expense-entry');
    for (const e of entries) {
      const p = e.querySelector('[name*="[productId]"]');
      const t = e.querySelector('[name*="[title]"]');
      if (p?.value && t?.value?.trim()) return true;
    }
    showToast('Please add at least one complete component', 'error');
    return false;
  }

  function collectStructuredItems() {
    const items = [];
    const entries = document.querySelectorAll('.expense-entry');
    for (const e of entries) {
      const id = e.dataset.itemId;
      const sel = document.getElementById(`product${id}`);
      const title = document.getElementById(`title${id}`);
      const reason = document.getElementById(`reason${id}`);
      const files = document.getElementById(`files${id}`);

      if (!(sel?.value && title?.value?.trim())) continue;

      const productId = sel.value;
      const productName = sel.selectedOptions?.[0]?.text || '';

      const item = {
        product: { id: productId, name: productName }, // relation Products
        title: title.value.trim(),                      // Title
        reason: (reason?.value || '').trim()           // Text
      };

      items.push({ item, filesEl: files });
    }
    return items;
  }

  // ---------------------- Submit ----------------------
  async function handleFormSubmit(ev) {
    ev.preventDefault();
    const btn = document.getElementById('submitBtn');

    try {
      if (!validateForm()) return;

      btn.disabled = true;
      btn.innerHTML = '<i data-feather="loader"></i> Submitting...';
      if (window.feather) feather.replace();

      // 1) جهّز البيانات
      const packed = collectStructuredItems();
      const payload = { items: packed.map(p => p.item) };

      // 2) استخدم FormData لإرسال الملفات فعليًا (مثل صفحة Funds)
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));

      // ألحق الملفات لكل عنصر: files[0][], files[1][] ...
      packed.forEach((p, idx) => {
        const input = p.filesEl;
        if (input?.files?.length) {
          Array.from(input.files).forEach(file => {
            fd.append(`files[${idx}][]`, file, file.name);
          });
        }
      });

      const r = await fetch('/api/damaged-assets', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd // اترك الـ Content-Type للمتصفح يحدده بالـ boundary
      });

      const ct = r.headers.get('content-type') || '';
      const raw = ct.includes('application/json') ? await r.json() : { success: false, error: await r.text() || 'Non-JSON response' };
      if (!r.ok || !raw.success) throw new Error(raw.error || 'Failed to submit');

      showToast(raw.message || 'Damage report submitted successfully!', 'success');

      // reset
      document.getElementById('damagedForm').reset();
      document.getElementById('itemsList').innerHTML = '';
      itemCounter = 0;
      addItemEntry();
    } catch (e) {
      console.error('submit error:', e);
      showToast(e.message || 'Failed to submit', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-feather="save"></i> Submit Report';
      if (window.feather) feather.replace();
    }
  }

  // ---------------------- Init ----------------------
  document.addEventListener('DOMContentLoaded', async () => {
    await loadProductOptions();

    const addBtn = document.getElementById('addItemBtn');
    const form = document.getElementById('damagedForm');
    const logoutBtn = document.getElementById('logoutBtn');

    addBtn?.addEventListener('click', addItemEntry);
    form?.addEventListener('submit', handleFormSubmit);
    logoutBtn?.addEventListener('click', handleLogout);

    addItemEntry(); // أول عنصر بعد ما الخيارات بقت جاهزة
  });
})();
