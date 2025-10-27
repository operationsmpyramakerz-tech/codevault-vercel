// /js/order-details.step.tabsfix.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var form = document.getElementById('detailsForm');
    var reasonInput = document.getElementById('orderReason');
    if(!form || !reasonInput) return;

    form.addEventListener('submit', async function(e){
      e.preventDefault(); e.stopPropagation();
      var btn = document.getElementById('nextStepBtn');
      var reason = (reasonInput.value || '').trim();
      if(!reason){ alert('Please enter the order reason.'); return; }
      if(btn){ btn.disabled = true; btn.setAttribute('aria-busy','true'); }

      try{
        var res = await fetch('/api/order-draft/details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ reason: reason })
        });
        if(!res.ok){ throw new Error('Failed to save details.'); }
        // Always carry mode=request
        var url = new URL('/orders/new/products', location.origin);
        url.searchParams.set('mode','request');
        location.href = url.toString();
      }catch(err){
        alert(err && err.message ? err.message : 'Failed to save details.');
        if(btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); }
      }
    });
  });
})();
