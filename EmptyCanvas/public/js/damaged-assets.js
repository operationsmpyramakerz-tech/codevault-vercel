/* damaged-assets.js — Damaged Assets (Funds-like) with searchable Products select
   لا يوجد حذف لأي منطق: نفس IDs ونفس تدفق الإرسال، فقط إصلاح تحميل الخيارات + سيرش داخلي.
*/

let itemCounter = 0;
let PRODUCT_OPTIONS = []; // [{id, name}]

// ---------------------- Options loader (Notion) ----------------------
async function loadProductOptions() {
  // نجرب أكثر من endpoint مستخدم في المشروع (زي صفحة Create Order)
  const candidates = [
    '/api/options/products',
    '/api/products/options',
    '/api/order-products/options',
    '/api/orders/products/options',
    '/api/damaged-assets/options' // لو كنت عامل واحد خاص بالصفحة
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) continue;
      const j = await r.json();
      const list = Array.isArray(j) ? j : (Array.isArray(j.options) ? j.options : []);
      if (list.length) {
        // نوحّد الشكل إلى {id, name}
        PRODUCT_OPTIONS = list.map(o => ({
          id: String(o.id ?? o.pageId ?? o.value ?? o.slug ?? ''),
          name: String(o.name ?? o.title ?? o.label ?? o.text ?? '').trim() || String(o.id ?? '')
        })).filter(x => x.id);
        console.debug('[DamagedAssets] loaded products from', url, PRODUCT_OPTIONS.length);
        return;
      }
    } catch (e) {
      // نكمل نجرب الباقيين
    }
  }
  console.warn('[DamagedAssets] no products options found from any endpoint');
  PRODUCT_OPTIONS = [];
}

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

// ---------------------- Searchable select ----------------------
// يحوّل <select> إلى كومبوبوكس searchable بدون حذف الـ<select> الأصلية
function makeSearchableSelect(selectEl, options) {
  if (!selectEl || selectEl.dataset.searchable === '1') return;
  selectEl.dataset.searchable = '1';

  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select-wrapper';
  wrapper.style.position = 'relative';
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  // نخلي الـ<select> موجودة بس مخفية بصرياً
  Object.assign(selectEl.style, {
    position: 'absolute',
    opacity: '0',
    pointerEvents: 'none',
    width: '100%',
    height: '40px'
  });

  // input ظاهر للمستخدم
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'form-input';
  input.placeholder = 'Select product...';
  input.autocomplete = 'off';
  input.style.paddingRight = '34px';
  wrapper.insertBefore(input, selectEl);

  // قائمة منسدلة
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-panel';
  Object.assign(dropdown.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '100%',
    zIndex: '50',
    maxHeight: '260px',
    overflow: 'auto',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    boxShadow: '0 8px 20px rgba(0,0,0,.06)',
    marginTop: '6px',
    display: 'none'
  });
  wrapper.appendChild(dropdown);

  function render(list, query = '') {
    dropdown.innerHTML = '';
    const q = (query || '').trim().toLowerCase();
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
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        border: '0',
        background: 'transparent',
        cursor: 'pointer'
      });
      row.onmouseenter = () => (row.style.background = '#f9fafb');
      row.onmouseleave = () => (row.style.background = 'transparent');
      row.textContent = o.name || o.id;
      row.dataset.value = o.id || '';
      row.addEventListener('click', () => commit(o));
      dropdown.appendChild(row);
    }
  }

  function commit(opt) {
    const v = String(opt.id || '');
    // حدّث option المختار أو اضف واحد جديد بنفس القيمة/الاسم
    let found = false;
    for (const op of selectEl.options) {
      if (op.value === v) { selectEl.value = v; found = true; break; }
    }
    if (!found) {
      const op = document.createElement('option');
      op.value = v;
      op.textContent = opt.name || v;
      selectEl.appendChild(op);
      selectEl.value = v;
    }
    input.value = opt.name || v;
    dropdown.style.display = 'none';
    input.blur();
  }

  input.addEventListener('focus', () => {
    render(PRODUCT_OPTIONS);
    dropdown.style.display = 'block';
  });
  input.addEventListener('input', () => render(PRODUCT_OPTIONS, input.value));

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
  });

  // مزامنة الاسم الظاهر لو كان في قيمة مختارة
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
  if (!selectEl) return;
  // املاّ الدروبلست
  selectEl.innerHTML = '<option value="">Select product...</option>';
  for (const o of PRODUCT_OPTIONS) {
    const op = document.createElement('option');
    op.value = String(o.id || '');
    op.textContent = o.name || o.id || 'Unnamed';
    selectEl.appendChild(op);
  }
  // فعل البحث
  makeSearchableSelect(selectEl, PRODUCT_OPTIONS);
}

function addItemEntry() {
  itemCounter++;
  const list = document.getElementById('itemsList');
  const node = buildEntryDom(itemCounter);
  list.appendChild(node);
  feather.replace();

  const sel = document.getElementById(`product${itemCounter}`);
  if (PRODUCT_OPTIONS.length) {
    populateSelect(sel);
  } else {
    // لو الخيارات لسه ماوصلتش، علّم إن ده يحتاج Populate لاحقًا
    sel.dataset.needsPopulate = '1';
  }

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

async function collectPayload() {
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
      reason: (reason?.value || '').trim(),          // Text
      files: []                                      // meta (اختياري)
    };

    if (files?.files?.length) {
      for (const f of files.files) item.files.push({ name: f.name, type: f.type, size: f.size });
    }
    items.push(item);
  }
  return { items };
}

async function handleFormSubmit(ev) {
  ev.preventDefault();
  const btn = document.getElementById('submitBtn');

  try {
    if (!validateForm()) return;

    btn.disabled = true;
    btn.innerHTML = '<i data-feather="loader"></i> Submitting...';
    feather.replace();

    const payload = await collectPayload();
    const r = await fetch('/api/damaged-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    const ct = r.headers.get('content-type') || '';
    const j = ct.includes('application/json') ? await r.json() : { success: false, error: 'Non-JSON response' };
    if (!r.ok || !j.success) throw new Error(j.error || 'Failed to submit');

    showToast(j.message || 'Damage report submitted successfully!', 'success');

    // reset
    document.getElementById('damagedForm').reset();
    document.getElementById('itemsList').innerHTML = '';
    itemCounter = 0;
    addItemEntry();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Failed to submit', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-feather="save"></i> Submit Report';
    feather.replace();
  }
}

// ---------------------- Init ----------------------
document.addEventListener('DOMContentLoaded', async () => {
  // ضيف أول سطر فورًا عشان الواجهة تظهر
  addItemEntry();

  // حمّل المنتجات ثم عبّي أي select منتظر
  await loadProductOptions();
  const toPopulate = document.querySelectorAll('select[data-needs-populate="1"], select[id^="product"]');
  toPopulate.forEach(sel => populateSelect(sel));

  // أحداث الأزرار
  const addBtn = document.getElementById('addItemBtn');
  const form = document.getElementById('damagedForm');
  const logoutBtn = document.getElementById('logoutBtn');

  if (addBtn) addBtn.addEventListener('click', addItemEntry);
  if (form) form.addEventListener('submit', handleFormSubmit);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});
