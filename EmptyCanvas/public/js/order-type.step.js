// public/js/order-type.step.js
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('typeForm');
  const selectEl = document.getElementById('requestType');

  // Prefill from draft if exists
  try {
    const d = await fetch('/api/order-draft', { credentials: 'same-origin' }).then(r => r.json());
    if (d && d.type) {
      const v = String(d.type);
      const opt = [...selectEl.options].find(o => String(o.value) === v);
      if (opt) selectEl.value = v;
    }
  } catch {}

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const typeVal = (selectEl.value || '').trim();
    if (!typeVal) {
      alert('Please choose the request type.');
      return;
    }

    try {
      // Save the chosen type to the draft
      const res = await fetch('/api/order-draft/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ type: typeVal })
      });
      if (!res.ok) throw new Error('Failed to save request type.');

      // Go to Step 2: Order Details
      const __t = String(typeVal).toLowerCase(); window.location.href = (__t==='damage'||__t.includes('report damage'))?'/orders/new/products':'/orders/new/details';
    } catch (err) {
      alert(err.message || 'Failed to save.');
    }
  });

  if (window.feather) feather.replace();
});
