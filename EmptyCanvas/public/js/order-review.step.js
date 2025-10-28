
// public/js/order-review.step.js  — FIXED (4-steps + renders content)
document.addEventListener('DOMContentLoaded', async () => {
  // --- tiny toast utility (no deps) ---
  const toast = ((doc) => {
    const ensure = () => {
      let el = doc.getElementById('toast-stack');
      if (!el) {
        el = doc.createElement('div');
        el.id = 'toast-stack';
        el.style.position = 'fixed';
        el.style.right = '16px';
        el.style.top = '16px';
        el.style.display = 'grid';
        el.style.gap = '10px';
        el.style.zIndex = '9999';
        doc.body.appendChild(el);
      }
      return el;
    };
    return ({ type='info', message='', duration=2500 }={}) => {
      const stack = ensure();
      const n = doc.createElement('div');
      n.textContent = String(message || '');
      n.style.font = '14px/1.4 system-ui, sans-serif';
      n.style.padding = '10px 12px';
      n.style.borderRadius = '8px';
      n.style.color = (type === 'error') ? '#7f1d1d' : '#065f46';
      n.style.background = (type === 'error') ? '#fee2e2' : '#d1fae5';
      n.style.border = '1px solid ' + (type === 'error' ? '#fecaca' : '#a7f3d0');
      stack.appendChild(n);
      setTimeout(() => n.remove(), duration);
    };
  })(document);

  // --- DOM ---
  const loadingEl = document.getElementById('loading-indicator');
  const contentEl = document.getElementById('order-details');
  const reasonEl = document.getElementById('summary-reason-value') || document.querySelector('[data-review-reason]');
  const totalEl  = document.getElementById('summary-total-value') || document.querySelector('[data-review-total-items]');
  const listEl   = document.getElementById('summary-products-list') || document.querySelector('[data-review-products-list]');
  const submitBtn = document.getElementById('submitOrderBtn');

  const showLoading = () => {
    if (loadingEl) loadingEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';
  };
  const showContent = () => {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
  };

  const esc = (s) => String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  try {
    showLoading();

    const [draftRes, compsRes] = await Promise.all([
      fetch('/api/order-draft', { credentials: 'same-origin' }),
      fetch('/api/components', { credentials: 'same-origin' })
    ]);

    const draft = await draftRes.json().catch(() => ({}));
    const comps = await compsRes.json().catch(() => []);

    // Guard flow
    if (!draft || !draft.reason) {
      window.location.replace('/orders/new');
      return;
    }
    if (!Array.isArray(draft.products) || draft.products.length === 0) {
      window.location.replace('/orders/new/products');
      return;
    }

    // Fill summary
    if (reasonEl) reasonEl.textContent = draft.reason || '-';
    if (totalEl) totalEl.textContent  = String(draft.products.length);

    // Index components by id for names
    const byId = new Map(Array.isArray(comps) ? comps.map(c => [String(c.id), c]) : []);

    if (listEl) {
      listEl.innerHTML = '';
      for (const p of draft.products) {
        const comp = byId.get(String(p.id));
        const name = comp?.name || 'Unknown product';
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
          <span class="badge badge--name" title="${esc(name)}">${esc(name)}</span>
          <span class="badge badge--qty">Qty: ${Number(p.quantity)||0}</span>
        `;
        listEl.appendChild(card);
      }
    }

    showContent();

    // Submit
    if (submitBtn) {
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (submitBtn.disabled) return;
        const prev = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        submitBtn.setAttribute('aria-busy', 'true');
        try {
          const res = await fetch('/api/submit-order', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({})
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) throw new Error(data?.message || 'Failed to submit');
          toast({ type:'success', message:'Order created successfully.' });
          setTimeout(() => window.location.replace('/orders'), 1000);
        } catch (err) {
          toast({ type:'error', message: err?.message || 'Submit failed' });
          submitBtn.disabled = false;
          submitBtn.textContent = prev;
          submitBtn.removeAttribute('aria-busy');
        }
      });
    }
  } catch (err) {
    console.error('Review init failed:', err);
    if (contentEl) contentEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '<div class="card" style="border:1px solid #fecaca;background:#fee2e2;color:#7f1d1d;padding:1rem;border-radius:8px;">Error loading order details.</div>';
  }

  if (window.feather) try { feather.replace(); } catch {}
});
