// EmptyCanvas/public/js/new-report-request.js
// Single-bundle controller for the "New Report / Request" page.
// Contains BOTH:
//   1) The Request Additional Components wizard (merged from request-additional-components.js)
//   2) The page controller for tabs and small bridges
//
// NOTE: This file replaces the need to include /js/request-additional-components.js on this page.
/* ==== BEGIN: Request Additional Components wizard (merged) ==== */
// EmptyCanvas/public/js/request-additional-components.js
// Merged single-file flow for "Create New Order" replicated inside
// the "Request Additional Components" tab as a 3-step inline wizard.
//
// Steps:
//   1) Details (reason)
//   2) Products (add items + qty)
//   3) Review  (summary + submit)
//
// Expected HTML (IDs / classes):
// - Step wrappers (display one at a time):
//     #rac-step-details
//     #rac-step-products
//     #rac-step-review
// - Navigation:
//     #rac-prevBtn, #rac-nextBtn, #rac-submitBtn
// - Details step:
//     #rac-details-form (form), #orderReason (textarea or input)
// - Products step:
//     #rac-products-container (div)
//     #rac-addProductBtn (button)
// - Review step (summary placeholders):
//     #rac-review-reason, #rac-review-total, #rac-review-list
// - Optional loading containers:
//     #rac-loading, #rac-content
//
// Notes:
// - Uses the same backend APIs as the original flow:
//   /api/order-draft, /api/order-draft/details, /api/order-draft/products,
//   /api/components, /api/submit-order
// - Requires Choices.js for searchable selects (will gracefully fallback).
// - If feather icons are present (window.feather), icons are rendered.
//
// Author: merged from order-details.step.js, order-products.step.js, order-review.step.js

(function () {
  'use strict';

  // ===== Lightweight toast (from review step, slightly trimmed) =====
  const toast = ((doc) => {
    const icons = {
      success:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
      error:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const ensureStack = () => {
      let stack = doc.getElementById('toast-stack');
      if (!stack) {
        stack = doc.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        doc.body.appendChild(stack);
      }
      return stack;
    };

    return ({ type = 'info', title = '', message = '', duration = 3200 } = {}) => {
      const stack = ensureStack();
      const el = doc.createElement('div');
      el.className = `toast toast--${type}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');

      el.innerHTML = `
        <div class="toast__icon">${icons[type] || icons.info}</div>
        <div class="toast__content">
          <div class="toast__title">${title ? String(title) : ''}</div>
          ${message ? `<div class="toast__msg">${String(message)}</div>` : ''}
        </div>
        <button class="toast__close" aria-label="Close">✕</button>
      `;

      const remove = () => {
        if (!el.isConnected) return;
        el.classList.remove('is-in');
        setTimeout(() => el.remove(), 180);
      };

      el.querySelector('.toast__close').addEventListener('click', remove);

      let timer = null;
      const startTimer = () => { if (duration > 0) timer = setTimeout(remove, duration); };
      const stopTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
      el.addEventListener('mouseenter', stopTimer);
      el.addEventListener('mouseleave', startTimer);

      stack.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-in'));
      startTimer();
      return el;
    };
  })(document);
  // ===== End toast =====

  // ====== DOM refs ======
  const stepDetails = document.getElementById('rac-step-details');
  const stepProducts = document.getElementById('rac-step-products');
  const stepReview  = document.getElementById('rac-step-review');

  const prevBtn   = document.getElementById('rac-prevBtn');
  const nextBtn   = document.getElementById('rac-nextBtn');
  const submitBtn = document.getElementById('rac-submitBtn');

  const loadingEl = document.getElementById('rac-loading');
  const contentEl = document.getElementById('rac-content');

  // Details
  const detailsForm = document.getElementById('rac-details-form') || document.getElementById('detailsForm');
  const reasonInput = document.getElementById('orderReason');

  // Products
  const rowsContainer = document.getElementById('rac-products-container') || document.getElementById('products-container');
  const addBtn = document.getElementById('rac-addProductBtn') || document.getElementById('addProductBtn');

  // Review
  const reviewReason = document.getElementById('rac-review-reason');
  const reviewTotal  = document.getElementById('rac-review-total');
  const reviewList   = document.getElementById('rac-review-list');

  // ====== State ======
  let currentStep = 1; // 1,2,3
  let components = [];
  let isComponentsLoaded = false;
  let urlById = new Map();
  const toHydrate = []; // pending Choices instances
  const hasChoices = typeof window.Choices === 'function';

  function showLoading() {
    if (loadingEl) loadingEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';
  }
  function showContent() {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';
  }

  function showStep(step) {
    currentStep = step;
    if (stepDetails) stepDetails.style.display = step === 1 ? '' : 'none';
    if (stepProducts) stepProducts.style.display = step === 2 ? '' : 'none';
    if (stepReview) stepReview.style.display = step === 3 ? '' : 'none';

    if (prevBtn) prevBtn.style.display = step > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = step < 3 ? '' : 'none';
    if (submitBtn) submitBtn.style.display = step === 3 ? '' : 'none';
  }

  // ====== API helpers ======
  async function getJSON(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(await res.text().catch(() => 'Network error'));
    return res.json();
  }
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || 'Request failed');
    return data;
  }

  // ====== DETAILS ======
  async function prefillDetails() {
    try {
      const d = await getJSON('/api/order-draft');
      if (d?.reason && reasonInput) reasonInput.value = d.reason;
    } catch { /* ignore */ }
  }

  async function saveDetails() {
    const reason = (reasonInput?.value || '').trim();
    if (!reason) {
      toast({ type: 'error', title: 'Missing reason', message: 'Please enter the order reason.' });
      return false;
    }
    await postJSON('/api/order-draft/details', { reason });
    return true;
  }

  // ====== PRODUCTS ======
  async function loadComponents() {
    try {
      const list = await getJSON('/api/components');
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
      label: c.name,
      selected: false,
      disabled: false
    }));
  }

  function enhanceWithChoices(select, defaultId = '') {
    if (!hasChoices) return null;
    const inst = new Choices(select, {
      searchEnabled: true,
      placeholder: true,
      placeholderValue: isComponentsLoaded ? 'Select a product...' : 'Loading products list...',
      itemSelectText: '',
      shouldSort: true,
      allowHTML: false,
      position: 'bottom',
      searchResultLimit: 500,
      fuseOptions: { keys: ['label'], threshold: 0.3 }
    });

    const container =
      inst.containerOuter?.element ||
      select.closest('.choices') ||
      select.parentElement?.querySelector?.('.choices');

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

  function updateAllLinks() {
    if (!rowsContainer) return;
    const rows = [...rowsContainer.querySelectorAll('.product-row')];
    rows.forEach(r => {
      const select = r.querySelector('select.product-select');
      const link = r.querySelector('a.product-url-link');
      if (!select || !link) return;
      const url = urlById.get(String(select.value));
      if (url) {
        link.href = url;
        link.style.display = 'inline-flex';
      } else {
        link.removeAttribute('href');
        link.style.display = 'none';
      }
    });
  }

  function addRow(defaultId = '', defaultQty = 1) {
    if (!rowsContainer) return;
    const row = document.createElement('div');
    row.className = 'product-row';

    // Product cell
    const productCell = document.createElement('div');
    productCell.className = 'field';
    const select = document.createElement('select');
    select.className = 'product-select';
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

    // Actions: product URL icon + remove
    const actionsCell = document.createElement('div');
    actionsCell.className = 'field actions-cell';

    const linkEl = document.createElement('a');
    linkEl.className = 'product-url-link';
    linkEl.setAttribute('aria-label', 'Open product page');
    linkEl.target = '_blank';
    linkEl.rel = 'noopener';
    linkEl.href = '#';
    linkEl.style.display = 'none';
    linkEl.style.marginRight = '8px';
    linkEl.style.textDecoration = 'none';
    linkEl.style.alignItems = 'center';
    linkEl.style.justifyContent = 'center';
    linkEl.style.width = '28px';
    linkEl.style.height = '28px';
    linkEl.style.borderRadius = '6px';
    linkEl.style.color = '#2563eb';
    const icon = document.createElement('i');
    icon.setAttribute('data-feather', 'link-2');
    linkEl.appendChild(icon);
    linkEl.addEventListener('mouseenter', () => { linkEl.style.background = '#EFF6FF'; });
    linkEl.addEventListener('mouseleave', () => { linkEl.style.background = 'transparent'; });
    actionsCell.appendChild(linkEl);

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

    if (hasChoices) {
      enhanceWithChoices(select, defaultId);
    } else {
      // fallback native options (later when components loaded)
      select.disabled = !isComponentsLoaded;
      if (isComponentsLoaded) {
        components.forEach(c => {
          const opt = document.createElement('option');
          opt.value = String(c.id);
          opt.textContent = c.name;
          select.appendChild(opt);
        });
        if (defaultId) select.value = String(defaultId);
      }
    }

    if (window.feather) feather.replace();
    select.addEventListener('change', () => {
      const url = urlById.get(String(select.value));
      if (url) {
        linkEl.href = url;
        linkEl.style.display = 'inline-flex';
      } else {
        linkEl.removeAttribute('href');
        linkEl.style.display = 'none';
      }
    });
  }

  async function saveProducts() {
    if (!rowsContainer) return false;
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
      toast({ type: 'error', title: 'No products', message: 'Please choose at least one product and quantity.' });
      return false;
    }
    await postJSON('/api/order-draft/products', { products: payload });
    return true;
  }

  // ====== REVIEW ======
  function escapeHTML(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c]));
  }

  async function renderReview() {
    try {
      const [draft, comps] = await Promise.all([
        getJSON('/api/order-draft'),
        getJSON('/api/components')
      ]);
      // Reason
      if (reviewReason) reviewReason.textContent = draft?.reason || '-';
      // Total
      const count = Array.isArray(draft?.products) ? draft.products.length : 0;
      if (reviewTotal) reviewTotal.textContent = String(count);
      // List
      if (reviewList) {
        reviewList.innerHTML = '';
        const byId = new Map(Array.isArray(comps) ? comps.map(c => [String(c.id), c]) : []);
        (draft?.products || []).forEach(p => {
          const comp = byId.get(String(p.id));
          const name = comp?.name || 'Unknown product';
          const li = document.createElement('div');
          li.className = 'product-card';
          li.innerHTML = `
            <span class="badge badge--name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
            <span class="badge badge--qty">Qty: ${Number(p.quantity) || 0}</span>
          `;
          reviewList.appendChild(li);
        });
      }
    } catch (e) {
      if (reviewList) {
        reviewList.innerHTML = '<div class="card" style="border:1px solid #FCA5A5; background:#FEE2E2; color:#B91C1C; padding:1rem; border-radius:8px;">Error loading order details.</div>';
      }
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  async function submitOrder() {
    if (submitBtn) {
      const orig = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      submitBtn.setAttribute('aria-busy', 'true');
      try {
        const data = await postJSON('/api/submit-order', {});
        toast({ type: 'success', title: 'Order Submitted!', message: 'Your order has been created successfully.' });
        setTimeout(() => { window.location.href = '/orders'; }, 1000);
      } catch (err) {
        toast({ type: 'error', title: 'Submission Failed', message: err?.message || 'Please try again.' });
        submitBtn.disabled = false;
        submitBtn.textContent = orig;
        submitBtn.removeAttribute('aria-busy');
      }
    }
  }

  // ====== INIT ======
  async function init() {
    showLoading();
    try {
      // Prepare UI
      showStep(1);

      // Prefill details from any existing draft
      await prefillDetails();

      // Products: default one row
      if (rowsContainer) {
        addRow();
      }

      // Load components
      components = await loadComponents();
      isComponentsLoaded = true;
      urlById = new Map(components.map(c => [String(c.id), c.url || '']));

      // Hydrate Choices instances (or native selects)
      if (hasChoices) {
        hydratePendingChoices();
      } else if (rowsContainer) {
        // native select fallback: add options to all
        rowsContainer.querySelectorAll('select.product-select').forEach(select => {
          select.innerHTML = '<option value="" disabled selected>Select a product...</option>';
          components.forEach(c => {
            const opt = document.createElement('option');
            opt.value = String(c.id);
            opt.textContent = c.name;
            select.appendChild(opt);
          });
        });
      }
      updateAllLinks();

      // Draft hydration for products
      try {
        const draft = await getJSON('/api/order-draft');
        if (Array.isArray(draft.products) && draft.products.length && rowsContainer) {
          rowsContainer.innerHTML = '';
          for (const p of draft.products) addRow(String(p.id), Number(p.quantity) || 1);
          updateAllLinks();
        }
      } catch {}

      // Buttons
      addBtn?.addEventListener('click', () => addRow());
      prevBtn?.addEventListener('click', async () => {
        if (currentStep === 2) {
          showStep(1);
        } else if (currentStep === 3) {
          showStep(2);
        }
      });
      nextBtn?.addEventListener('click', async () => {
        if (currentStep === 1) {
          if (await saveDetails()) showStep(2);
        } else if (currentStep === 2) {
          if (await saveProducts()) {
            await renderReview();
            showStep(3);
          }
        }
      });
      submitBtn?.addEventListener('click', submitOrder);

      // Details form submit (Enter on textarea)
      detailsForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await saveDetails()) showStep(2);
      });

      if (window.feather) feather.replace();
      showContent();
    } catch (e) {
      console.error('RAC init failed:', e);
      showContent();
      toast({ type: 'error', title: 'Load failed', message: 'Could not initialize the request wizard.' });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

/* ==== END: Request Additional Components wizard (merged) ==== */

/* ==== BEGIN: New Report / Request page controller ==== */
// EmptyCanvas/public/js/new-report-request.js
// Handles tab switching and bridges some buttons to the RAC wizard logic.
(() => {
  "use strict";

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const tabs   = $$("#nrrTabs .nrr-tab");
  const panels = $$("#nrrCard .nrr-panel");

  function getTabFromURL() {
    const p = new URLSearchParams(location.search);
    const t = (p.get("tab") || "request").toLowerCase();
    return t === "report" ? "report" : "request";
  }

  function activate(tab) {
    // Tabs
    tabs.forEach(a => {
      const t = a.dataset.tab;
      const active = t === tab;
      a.classList.toggle("active", active);
      a.setAttribute("aria-selected", active ? "true" : "false");
      try {
        const u = new URL(a.getAttribute("href"), location.origin);
        u.searchParams.set("tab", t);
        a.setAttribute("href", u.pathname + "?" + u.searchParams.toString());
      } catch {}
    });

    // Panels
    panels.forEach(p => {
      p.hidden = p.dataset.panel !== tab;
    });

    // Focus the card for accessibility
    $("#nrrCard")?.focus({ preventScroll: false });
  }

  // Intercept clicks to switch without reloading
  tabs.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = a.dataset.tab || "request";
      if (!targetTab) return;
      activate(targetTab);
      const u = new URL(window.location.href);
      u.searchParams.set("tab", targetTab);
      history.replaceState({ tab: targetTab }, "", u.pathname + "?" + u.searchParams.toString());
    });
  });

  // Handle back/forward navigation
  window.addEventListener("popstate", () => activate(getTabFromURL()));

  // Bridge helper: second-step dedicated "Next: Review" button should trigger the same logic
  function wireBridges(){
    // Forward from products to review by reusing the main Next handler (in request-additional-components.js)
    $("#rac-nextBtn-products")?.addEventListener("click", function(){
      // If wizard defined a specific sequence, dispatch click on the 'Next' within step 2
      // This relies on RAC script swapping handlers when moving between steps.
      const ev = new Event("click", { bubbles:true });
      $("#rac-nextBtn")?.dispatchEvent(ev);
    });
    // Back from review to products using the main 'prev' button
    $("#rac-prevBtn-review")?.addEventListener("click", function(){
      $("#rac-prevBtn")?.click();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    activate(getTabFromURL());
    // mark sidebar link as active
    const link = document.querySelector('.sidebar a[href="/new-report-request.html"]');
    if (link) { link.classList.add('active'); link.setAttribute('aria-current','page'); }
    wireBridges();
  });
})();

/* ==== END: New Report / Request page controller ==== */
