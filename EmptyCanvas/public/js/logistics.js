/* Logistics – Orders Grouped + Modal Full/Partial Receiving */

(function () {

  // ---------- Helpers ----------
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const N  = (v)=>Number.isFinite(+v)?+v:0;
  const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  const grid        = $("#assigned-grid");
  const searchBox   = $("#logisticsSearch");
  const tabMissing  = $("#tab-missing");
  const tabReceived = $("#tab-received");

  const modal       = $("#orderModal");
  const modalTitle  = $("#orderModalTitle");
  const modalBody   = $("#modalItems");
  const modalClose  = $("#closeModalBtn");

  let allItems = [];
  let activeTab = "missing";

  // ---------- Normalize ----------
  function normalize(it){
    const req = N(it.requested ?? it.req);
    const rec = N(it.quantityReceivedByOperations ?? it.rec ?? 0);
    return {
      id: it.id,
      pageId: it.pageId || it.page_id || it.notionPageId || it.id,
      reason: it.reason || "No Reason",
      productName: it.productName ?? "Unnamed",
      requested: req,
      rec: rec,
      remaining: Math.max(0, req - rec),
      created: it.createdTime || it.created || ""
    };
  }

  // ---------- Fetch ----------
  async function fetchAssigned(){
    const res = await fetch("/api/orders/assigned",{credentials:"same-origin"});
    if(!res.ok) throw new Error("Failed");
    const data = await res.json();
    return Array.isArray(data)?data.map(normalize):[];
  }

  // ---------- Save (Full / Partial) ----------
  async function saveReceive(itemId, quantity, fullFlag){
    const item = allItems.find(x=>x.id == itemId);
    if(!item) return;

    const backendId = item.pageId;
    const decision = fullFlag ? "Received by operations" : "Partially received by operations";

    await fetch("/api/logistics/mark-received", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemIds: [backendId],
        statusById: { [backendId]: decision },
        recMap: { [backendId]: quantity }
      })
    }).catch(()=> alert("Saving failed"));

    // update local
    item.rec = quantity;
    item.remaining = Math.max(0, item.requested - quantity);

    // re-render modal + list
    render();
    openOrderModal(item.reason);
  }

  // ---------- Group by Order ----------
  function groupOrders(list){
    const map = new Map();
    for(const it of list){
      if(!map.has(it.reason)) map.set(it.reason,[]);
      map.get(it.reason).push(it);
    }
    return [...map.entries()].map(([reason, items])=>({reason, items}));
  }

  // ---------- Render ----------
  function render(){
    if(!grid) return;
    grid.innerHTML = "";

    const q = (searchBox?.value || "").toLowerCase();

    let items = allItems.filter(it =>
      activeTab === "missing" ? it.rec === 0 : it.rec > 0
    );

    if(q){
      items = items.filter(it =>
        it.productName.toLowerCase().includes(q) ||
        it.reason.toLowerCase().includes(q)
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

      card.innerHTML = `
        <div class="order-card__head">
          <h3>${esc(g.reason)}</h3>
          <button class="btn btn-primary btn-sm order-btn" data-reason="${esc(g.reason)}">
            Received
          </button>
        </div>

        <div class="order-card__items">
          ${g.items.map(it=>`
            <div class="order-item-mini">
              ${esc(it.productName)} — Req: ${it.requested}
            </div>
          `).join("")}
        </div>
      `;

      grid.appendChild(card);
    }

    wireOrderButtons();
  }

  // ---------- Open Modal ----------
  function openOrderModal(reason){
    const items = allItems.filter(it=>it.reason === reason);

    modalTitle.textContent = reason;

    modalBody.innerHTML = items.map(it => `
      <div class="modal-item-row">
        <div class="modal-item-left">
          <strong>${esc(it.productName)}</strong><br>
          Req: ${it.requested} — Rec: ${it.rec}
        </div>

        <div class="modal-item-right">
          <button class="btn btn-success btn-xs" data-act="full" data-id="${it.id}">
            Full
          </button>

          <button class="btn btn-warning btn-xs" data-act="partial" data-id="${it.id}">
            Partial
          </button>

          <div class="partial-box" id="pbox-${it.id}" style="display:none;">
            <input type="number" class="pinput" min="0" id="pinput-${it.id}" placeholder="Qty">
            <button class="btn btn-primary btn-xxs" data-act="save" data-id="${it.id}">
              Save
            </button>
          </div>
        </div>
      </div>
    `).join("");

    modal.style.display = "flex";
    wireModalButtons();
  }

  // ---------- Button Wiring ----------
  function wireOrderButtons(){
    $$(".order-btn").forEach(btn=>{
      btn.onclick = ()=> openOrderModal(btn.dataset.reason);
    });
  }

  function wireModalButtons(){

    // Full
    $$(".btn[data-act='full']").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const item = allItems.find(x=>x.id == id);
        if(item) saveReceive(id, item.requested, true);
      };
    });

    // Partial toggle
    $$(".btn[data-act='partial']").forEach(btn=>{
      btn.onclick = ()=>{
        const box = $("#pbox-"+btn.dataset.id);
        box.style.display = box.style.display==="none"?"block":"none";
      };
    });

    // Partial Save
    $$(".btn[data-act='save']").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const val = N($("#pinput-"+id).value);
        const item = allItems.find(x=>x.id == id);
        if(!item) return;
        if(val<=0) return alert("Enter valid quantity");
        if(val > item.requested) return alert("Cannot exceed requested");
        saveReceive(id, val, false);
      };
    });

    modalClose.onclick = ()=> modal.style.display="none";
  }

  // ---------- Tabs ----------
  function setActiveTab(tab){
    activeTab = tab;
    tabMissing.classList.toggle("active", tab==="missing");
    tabReceived.classList.toggle("active", tab==="received");
    render();
  }

  // ---------- Init ----------
  async function init(){
    allItems = await fetchAssigned();
    setActiveTab("missing");
  }

  if(searchBox) searchBox.addEventListener("input", render);
  tabMissing.addEventListener("click", ()=>setActiveTab("missing"));
  tabReceived.addEventListener("click", ()=>setActiveTab("received"));

  init();

})();
