/* Logistics with Orders Grouping + One "Received" Button per Order */

(function () {
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const N  = (v)=>Number.isFinite(+v)?+v:0;
  const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  const grid = $("#assigned-grid");
  const searchBox = $("#logisticsSearch");
  const tabMissing = $("#tab-missing");
  const tabReceived = $("#tab-received");

  let allItems = [];
  let activeTab = "missing";

  function normalize(it){
    const req = N(it.requested ?? it.req);
    const rec = N(it.quantityReceivedByOperations ?? it.rec ?? 0);
    return {
      id: it.id,
      reason: it.reason || "No Reason",
      productName: it.productName ?? "Unnamed",
      requested: req,
      rec: rec,
      remaining: Math.max(0, req - rec),
      created: it.createdTime || it.created || "",
      pageId: it.pageId || it.page_id || it.id,
    };
  }

  async function fetchAssigned(){
    const res = await fetch("/api/orders/assigned",{credentials:"same-origin"});
    const data = await res.json();
    return Array.isArray(data)?data.map(normalize):[];
  }

  /* -------- Grouping by reason -------- */
  function groupOrders(list){
    const map = new Map();
    for(const it of list){
      if(!map.has(it.reason)) map.set(it.reason,[]);
      map.get(it.reason).push(it);
    }
    return [...map.entries()].map(([reason,items])=>({
      reason,
      items
    }));
  }

  function render(){
    if(!grid) return;
    grid.innerHTML = "";

    const q = (searchBox?.value || "").toLowerCase();

    let items = allItems.filter(it =>
      activeTab==="missing" ? it.rec===0 : it.rec>0
    );

    if(q){
      items = items.filter(it =>
        it.productName.toLowerCase().includes(q)
      );
    }

    const groups = groupOrders(items);

    if(!groups.length){
      grid.innerHTML = `<p class="empty">No items.</p>`;
      return;
    }

    for(const g of groups){
      const card = document.createElement("div");
      card.className = "order-card";

      const itemsHTML = g.items.map(it => `
        <div class="order-item">
          <div class="item-left">
            <strong>${esc(it.productName)}</strong>
            <div class="muted">${esc(g.reason)}</div>
          </div>
          <div class="item-mid">
            Req: ${it.requested} <br>
            Rec: ${it.rec} <br>
            Rem: <span class="pill">${it.remaining}</span>
          </div>
        </div>
      `).join("");

      card.innerHTML = `
        <div class="order-head">
          <h3 class="order-title">${esc(g.reason)}</h3>
        </div>

        <div class="order-items">${itemsHTML}</div>

        <!-- NEW BUTTON per ORDER -->
        <div class="order-actions" style="margin-top:10px;">
          <button class="btn btn-primary" data-act="order-received" data-reason="${esc(g.reason)}">
            Received
          </button>
        </div>
      `;

      grid.appendChild(card);
    }

    wireButtons();
  }

  function wireButtons(){
  $$("button[data-act='order-received']").forEach(btn=>{
    btn.onclick = ()=> {
      const reason = btn.dataset.reason;

      // جميع العناصر التابعة لهذا الـ Order
      const orderItems = allItems.filter(it => it.reason === reason);

      // بناء HTML وإظهاره في الـ Modal
      const box = document.getElementById("modalItems");
      box.innerHTML = orderItems.map(it => `
        <div style="padding:10px; border-bottom:1px solid #ddd;">
          <strong>${esc(it.productName)}</strong><br>
          Req: ${it.requested} <br>
          Rec: ${it.rec} <br>
          Rem: ${it.remaining}
        </div>
      `).join("");

      document.getElementById("orderModal").style.display = "flex";
    };
  });

  document.getElementById("closeModalBtn").onclick = () => {
    document.getElementById("orderModal").style.display = "none";
  };
}

  function setActiveTab(tab){
    activeTab = tab;
    tabMissing.classList.toggle("active",tab==="missing");
    tabReceived.classList.toggle("active",tab==="received");
    render();
  }

  async function init(){
    allItems = await fetchAssigned();
    setActiveTab("missing");
  }

  if(searchBox) searchBox.addEventListener("input",render);
  tabMissing.addEventListener("click",()=>setActiveTab("missing"));
  tabReceived.addEventListener("click",()=>setActiveTab("received"));

  init();
})();
