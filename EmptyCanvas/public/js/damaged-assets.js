// damaged-assets.js — Damaged Assets Form Handler (like funds.js pattern)

let itemCounter = 0;
let PRODUCT_OPTIONS = []; // {id, name}

// Load options for Products (relation)
async function loadProductOptions() {
  try {
    // Endpoint مخصص للخيارات (خليه يرجع [{id,name},...])
    const res = await fetch('/api/damaged-assets/options', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load options');
    const data = await res.json();
    PRODUCT_OPTIONS = Array.isArray(data.options) ? data.options : [];
  } catch (e) {
    // Fallback بسيط (هتغيره حسب ما تحب)
    PRODUCT_OPTIONS = [];
  }
}

function populateProductSelect(selectEl, selectedId) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Select product...';
  selectEl.appendChild(def);

  for (const opt of PRODUCT_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.id || opt.name || '';
    o.textContent = opt.name || opt.title || opt.id || 'Unnamed';
    if (selectedId && selectedId === o.value) o.selected = true;
    selectEl.appendChild(o);
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  await initializePage();

  document.getElementById('addItemBtn').addEventListener('click', addItemEntry);
  document.getElementById('damagedForm').addEventListener('submit', handleFormSubmit);

  // Entry أولى
  addItemEntry();

  // فحص إعدادات قاعدة البيانات (اختياري لرسائل التنبيه)
  checkDatabaseConfiguration();
});

async function initializePage() {
  await loadProductOptions();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

// Add one component entry
function addItemEntry() {
  itemCounter++;

  const itemsList = document.getElementById('itemsList');
  const wrap = document.createElement('div');
  wrap.className = 'expense-entry';
  wrap.dataset.itemId = itemCounter;

  wrap.innerHTML = `
    <div class="expense-header">
      <h4><i data-feather="package"></i> Component ${itemCounter}</h4>
      <button type="button" class="expense-status remove-expense" data-item-id="${itemCounter}" title="Delete component"></button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="product${itemCounter}">
          <i data-feather="box"></i>
          Products *
        </label>
        <select id="product${itemCounter}" name="items[${itemCounter}][productId]" class="form-select" required>
          <option value="">Select product...</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="title${itemCounter}">
          <i data-feather="type"></i>
          Description of issue (Title) *
        </label>
        <input type="text" id="title${itemCounter}" name="items[${itemCounter}][title]" class="form-input"
               placeholder="Short issue summary..." required/>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group" style="flex:1 1 100%">
        <label class="form-label" for="reason${itemCounter}">
          <i data-feather="message-square"></i>
          Issue Reason
        </label>
        <textarea id="reason${itemCounter}" name="items[${itemCounter}][reason]" class="form-input"
                  placeholder="Extra details, when/how it happened, etc."></textarea>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group" style="flex:1 1 100%">
        <label class="form-label" for="files${itemCounter}">
          <i data-feather="image"></i>
          Files &amp; media
        </label>
        <input type="file" id="files${itemCounter}" name="items[${itemCounter}][files]" class="form-input" multiple
               accept="image/*,.pdf,.heic,.jpg,.jpeg,.png"/>
        <small class="form-help">Upload photos/screenshots (optional)</small>
      </div>
    </div>
  `;

  itemsList.appendChild(wrap);

  // Populate products
  populateProductSelect(document.getElementById(`product${itemCounter}`));

  // Remove handler
  const rm = wrap.querySelector('.remove-expense');
  rm.addEventListener('click', () => removeItemEntry(itemCounter));

  // Feather for injected nodes
  feather.replace();

  // Focus on the product select
  document.getElementById(`product${itemCounter}`).focus();
}

function removeItemEntry(id) {
  const el = document.querySelector(`[data-item-id="${id}"]`);
  if (!el) return;
  const total = document.querySelectorAll('.expense-entry').length;
  if (total <= 1) return showToast('At least one component is required', 'error');
  el.remove();
}

function validateForm() {
  const nodes = document.querySelectorAll('.expense-entry');
  let ok = false;
  for (const n of nodes) {
    const product = n.querySelector('[name*="[productId]"]');
    const title   = n.querySelector('[name*="[title]"]');
    if (product?.value && title?.value?.trim()) {
      ok = true; break;
    }
  }
  if (!ok) showToast('Please add at least one complete component', 'error');
  return ok;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');

  try {
    btn.disabled = true;
    btn.innerHTML = '<i data-feather="loader"></i> Submitting...';
    feather.replace();

    if (!validateForm()) return;

    const payload = await collectPayload();
    // أرسل JSON — مثل funds.js (رفع الملفات الحقيقي اختياري لاحقًا)
    const res = await fetch('/api/damaged-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    // تأكد إنه JSON
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const t = await res.text();
      console.error('Non-JSON response:', t.slice(0, 400));
      throw new Error('Server configuration error. Please check Notion database setup.');
    }

    const result = await res.json();
    if (!res.ok || !result?.success) {
      throw new Error(result?.error || 'Failed to submit damage report');
    }

    showToast(result.message || 'Damage report submitted successfully!', 'success');
    resetForm();
  } catch (err) {
    console.error('Submit error:', err);
    showToast(err.message || 'Failed to submit damage report', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-feather="save"></i> Submit Report';
    feather.replace();
  }
}

async function collectPayload() {
  const items = [];
  const entries = document.querySelectorAll('.expense-entry');
  for (const entry of entries) {
    const id    = entry.dataset.itemId;
    const sel   = document.getElementById(`product${id}`);
    const title = document.getElementById(`title${id}`);
    const reason= document.getElementById(`reason${id}`);
    const files = document.getElementById(`files${id}`);

    if (!(sel?.value && title?.value?.trim())) continue;

    const productId   = sel.value;
    const productName = sel.options[sel.selectedIndex]?.text || '';

    const item = {
      product: { id: productId, name: productName }, // relation Products
      title: title.value.trim(),                      // Title (Description of issue)
      reason: (reason?.value || '').trim(),          // Text (Issue Reason)
      files: []                                      // Files metadata (optional)
    };

    if (files && files.files && files.files.length) {
      for (const f of files.files) {
        item.files.push({ name: f.name, type: f.type, size: f.size });
      }
    }

    items.push(item);
  }

  return { items };
}

function resetForm() {
  document.getElementById('damagedForm').reset();
  const list = document.getElementById('itemsList');
  list.innerHTML = '';
  itemCounter = 0;
  addItemEntry();
}

function showToast(message, type='info') {
  if (typeof UI !== 'undefined' && UI.toast) UI.toast({ type, message });
  else alert(message);
}

async function handleLogout() {
  try {
    const r = await fetch('/api/logout', { method:'POST', credentials:'same-origin' });
    if (r.ok) location.href = '/login';
  } catch {
    location.href = '/login';
  }
}

// Ping simple check (اختياري لعرض رسائل إعداد القاعدة)
async function checkDatabaseConfiguration() {
  try {
    const r = await fetch('/api/damaged-assets/check', { credentials:'same-origin' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j?.configured) {
      console.error('Damaged Assets DB config issue:', j?.error);
      showToast('⚠️ Damaged Assets DB not accessible. Please check Notion & env.', 'warning');
    }
  } catch (e) {
    console.warn('Cannot verify Damaged Assets DB:', e);
  }
}
