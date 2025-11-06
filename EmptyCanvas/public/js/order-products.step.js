// /js/order-products.step.damage.js
// This is a tiny wrapper that relies on your existing order-products.step.js logic,
// but ensures the Next button goes to the review page with ?mode=damage.
// If your original file already binds #nextReviewBtn, this script should run AFTER it
// and adjust the navigation to include the mode.

(function(){
  function hook(){
    const next = document.getElementById('nextReviewBtn');
    if(!next) return;
    if(next.dataset.damageHook==='1') return;
    next.dataset.damageHook='1';
    next.addEventListener('click', function(){
      // let your original handler post the products first, then we force the URL
      setTimeout(function(){
        try{
          const u = new URL('/orders/new/review', location.origin);
          u.searchParams.set('mode','damage');
          if (location.pathname.startsWith('/orders/new/review')) return;
          location.href = u.toString();
        }catch(e){}
      }, 50);
    }, {capture:false});
  }
  document.addEventListener('DOMContentLoaded', hook);
})();
