// public/js/order-products.step.js
(() => {
  let components = [];
  let isComponentsLoaded = false;
  const toHydrate = []; // { inst, container, defaultId }

  const rowsContainer = document.getElementById('products-container');
  const addBtn = document.getElementById('addProductBtn');
  const nextBtn = document.getElementById('nextReviewBtn');

  async function loadComponents() {
    try {
      const res = await fetch('/api/components');
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
      value: c.id,
      label: c.name,
      selected: false,
      disabled: false
    }));
  }

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
      // ### START: MODIFICATION ###
      // This tells the search how to filter properly
      fuseOptions: {
        keys: ['label'], // Search within the product's name
        threshold: 0.3   // Adjust how "fuzzy" the search is (0=exact, 1=anything)
      }
      // ### END: MODIFICATION ###
    });

    const container =
      inst.containerOuter?.element ||
      select.closest('.choices') ||
      select.parentElement.querySelector('.choices');

    if (!isComponentsLoaded) {
      container?.classList.add('is-loading');
      inst.disable(); // لغاية ما الداتا تيجي
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

  function addRow(defaultId = '', defaultQty = 1) {
    const row = document.createElement('div');
    row.className = 'product-row';

    // Product cell
    const productCell = document.createElement('div');
    productCell.className = 'field';
    const select = document.createElement('select');
    select.className = 'product-select';
    // placeholder (لو لسه بنحمّل، يبقى loading)
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = isComponentsLoaded
      ? 'Select a product...'
      : 'Loading products list...';
    select.appendChild(placeholder);
    productCell.appendChild(select);

    // Quantity cell
    const qtyCell = document.createElement('div');
    qtyCell.className = 'field';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.value = String(defaultQty || 1);
    qtyInput.className = 'qty-input';
    qtyCell.appendChild(qtyInput);

    // Remove X red
    const actionsCell = document.createElement('div');
    actionsCell.className = 'field actions-cell';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn icon-btn--danger icon-btn--x';
    removeBtn.title = 'Remove';
    removeBtn.setAttribute('aria-label', 'Remove product');
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => row.remove());
    actionsCell.appendChild(removeBtn);

    row.appendChild(productCell);
    row.appendChild(qtyCell);
    row.appendChild(actionsCell);
    rowsContainer.appendChild(row);

    // فعّل Choices فورًا علشان الشكل يبقى ثابت من أول لحظة
    enhanceWithChoices(select, defaultId);
  }

  async function saveAndGoNext() {
    const rows = [...rowsContainer.querySelectorAll('.product-row')];
    const payload = [];

    for (const r of rows) {
      const selectEl = r.querySelector('select');
      const id = selectEl?.value;
      const qty = Number(r.querySelector('input[type="number"]')?.value);
      if (id && Number.isFinite(qty) && qty > 0) {
        payload.push({ id, quantity: qty });
      }
    }

    if (payload.length === 0) {
      alert('Please choose at least one product and quantity.');
      return;
    }

    const res = await fetch('/api/order-draft/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error || 'Failed to save products.');
      return;
    }
    window.location.href = '/orders/new/review';
  }

  async function init() {
    if (!rowsContainer) {
      console.error('Missing #products-container in DOM');
      return;
    }

    // زر الإضافة
    if (addBtn && !addBtn.dataset.enhanced) {
      addBtn.dataset.enhanced = '1';
      addBtn.innerHTML = '<i data-feather="plus"></i><span>Add Another Product</span>';
      if (window.feather) feather.replace();
    }

    // 1) اعرض صف افتراضي بشكل Choices من البداية
    addRow();

    // 2) حمّل المنتجات ثم روّق الـ selects
    components = await loadComponents();
    isComponentsLoaded = true;
    hydratePendingChoices();

    // 3) Hydrate من الـ draft (لو موجود) — نستبدل الصفوف الحالية
    try {
      const res = await fetch('/api/order-draft');
      if (res.ok) {
        const draft = await res.json();
        if (Array.isArray(draft.products) && draft.products.length) {
          rowsContainer.innerHTML = '';
          for (const p of draft.products) {
            addRow(String(p.id), Number(p.quantity) || 1);
          }
        }
      }
    } catch { /* ignore */ }

    addBtn?.addEventListener('click', () => addRow());
    nextBtn?.addEventListener('click', saveAndGoNext);

    if (window.feather) feather.replace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();