/* Logistics with Orders Grouping + One "Received" Button per Order + Submit With User Selection */

(function () {
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const N  = (v)=>Number.isFinite(+v)?+v:0;
  const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  const grid = $("#assigned-grid");
  const searchBox = $("#logisticsSearch");
  const tabMissing = $("#tab-missing");
  const tabReceived = $("#tab-received");

  /* ========= State ========= */
  let allItems = [];
  let activeTab = "missing";
  let currentGrouped = [];   // لحفظ الـ orders grouped
  let currentOrderItems = []; // items الخاصة بالأوردر المفتوح

  /* ========= Normalize ========= */
  function normalize(it){
    const req = N(it.requested ?? it.req);
    const rec = N(it.quantityReceivedByOperations ?? it.rec ?? 0);
    return {
      id: it.id,
      pageId: it.pageId || it.page_id || it.id,
      reason: it.reason || "No Reason",
      productName: it.productName ?? "Unnamed",
      requested: req,
      rec,
      remaining: Math.max(0, req - rec),
      created: it.createdTime || it.created || ""
    };
  }

  async function fetchAssigned(){
    const res = await fetch("/api/orders/assigned",{credentials:"same-origin"});
    return (await res.json()).map(normalize);
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method:"POST",
      credentials:"same-origin",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(body||{})
    });
    if(!res.ok) throw new Error(await res.text());
    return res.json().catch(()=>({}));
  }

  /* ========= Group by Reason ========= */
  function groupOrders(list){
    const map = new Map();
    for(const it of list){
      if(!map.has(it.reason)) map.set(it.reason, []);
      map.get(it.reason).push(it);
    }
    return [...map.entries()].map(([reason, items]) => ({ reason, items }));
  }

  /* ========= Render ========= */
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
    currentGrouped = groups;

    if(!groups.length){
      grid.innerHTML = `<p class="empty">No items.</p>`;
      return;
    }

    for(const g of groups){
      const card = document.createElement("div");
      card.className = "order-card grouped";

      card.innerHTML = `
        <div class="order-head">
          <h3>${esc(g.reason)}</h3>
          <small>${g.items.length} items</small>
        </div>

        <div class="order-items">
          ${g.items.map(it => `
            <div class="order-item">
              <div>${esc(it.productName)} — Req: ${it.requested} — Rec: ${it.rec}</div>
            </div>
          `).join("")}
        </div>

        <div class="order-actions" style="margin-top:10px;">
          <button class="btn btn-primary order-open-btn"
                  data-reason="${esc(g.reason)}">
            Received
          </button>

          <button class="btn btn-success order-submit-btn"
                  data-reason="${esc(g.reason)}"
                  style="margin-left:8px;">
            Submit
          </button>
        </div>
      `;

      grid.appendChild(card);
    }

    wireOrderButtons();
  }

  /* ========= FULL/PARTIAL Saving ========= */
  async function markReceived(itemId, value) {
    const item = allItems.find(x => x.id == itemId);
    if (!item) return;

    const decision = (value >= item.requested) 
        ? "Received by operations" 
        : "Partially received by operations";

    await postJSON("/api/logistics/mark-received", {
      itemIds:[item.pageId],
      statusById:{ [item.pageId]: decision },
      recMap:{ [item.pageId]: value }
    });

    item.rec = value;
    item.remaining = Math.max(0, item.requested - value);

    render();
  }

  /* ========= Wire Order Buttons ========= */
  function wireOrderButtons(){

    /* ---- 1) زرار Received (فتح القائمة) ---- */
    $$(".order-open-btn").forEach(btn=>{
      btn.onclick = ()=>{
        const reason = btn.dataset.reason;
        currentOrderItems = allItems.filter(x => x.reason === reason);

        const box = $("#order-modal-items");
        const title = $("#order-modal-title");

        title.textContent = `Order: ${reason}`;

        box.innerHTML = currentOrderItems.map(it => `
          <div class="modal-item-row">
            <div class="modal-item-name">${esc(it.productName)}</div>

            <button class="btn btn-success btn-xs"
                    data-act="full-item"
                    data-id="${it.id}">
              Full
            </button>

            <button class="btn btn-warning btn-xs"
                    data-act="partial-item"
                    data-id="${it.id}">
              Partial
            </button>

            <div id="pbox-${it.id}" class="partial-box" style="display:none;">
              <input type="number" min="0" id="pinput-${it.id}" class="pinput" placeholder="Qty">
              <button class="btn btn-primary btn-xxs"
                      data-act="save-partial-item"
                      data-id="${it.id}">
                Save
              </button>
            </div>
          </div>
        `).join("");

        $("#order-modal").style.display = "block";

        wireItemButtons();
      };
    });

    /* ---- 2) زرار Submit ---- */
    $$(".order-submit-btn").forEach(btn=>{
      btn.onclick = async ()=>{
        const reason = btn.dataset.reason;
        currentOrderItems = allItems.filter(x => x.reason === reason);

        // افتح مودال السابميت
        $("#submit-modal").style.display = "block";

        // تحميل أسماء المستخدمين للـ dropdown
        const list = await fetch("/api/logistics/receivers").then(r=>r.json());
        const sel = $("#submit-user");
        sel.innerHTML = list.map(u=>`
          <option value="${u.id}">${esc(u.name)}</option>
        `).join("");
      };
    });

    $("#order-modal-close").onclick = ()=>{
      $("#order-modal").style.display = "none";
    };
  }

  /* ========= Wire Full/Partial Buttons Inside Modal ========= */
  function wireItemButtons(){
    // FULL
    $$(".btn[data-act='full-item']").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const it = allItems.find(x=>x.id==id);
        if(it) markReceived(id, it.requested);
      };
    });

    // Toggle partial input
    $$(".btn[data-act='partial-item']").forEach(btn=>{
      btn.onclick = ()=>{
        const box = $("#pbox-"+btn.dataset.id);
        box.style.display = box.style.display === "none" ? "block" : "none";
      };
    });

    // Save partial
    $$(".btn[data-act='save-partial-item']").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const val = N($("#pinput-"+id).value);
        const it = allItems.find(x=>x.id==id);
        if(val<=0) return alert("Enter valid quantity");
        if(val > it.requested) return alert("Cannot exceed requested");
        markReceived(id, val);
      };
    });
  }

  /* ========= Submit Logic ========= */
  $("#submit-modal-confirm").onclick = async ()=>{
    const userId = $("#submit-user").value;
    const pass = $("#submit-pass").value;

    if(!userId) return alert("Select a user");
    if(!pass) return alert("Enter password");

    // تحقق من الباسورد
    const ok = await postJSON("/api/logistics/verify-user",{
      userId, password: pass
    });

    if(!ok.ok) return alert("Incorrect password");

    // لو صح → نسجّل rec لكل item
    for(const it of currentOrderItems){
      await markReceived(it.id, it.rec);
    }

    alert("Order Submitted Successfully.");
    $("#submit-modal").style.display="none";
  };

  $("#submit-modal-close").onclick = ()=>{
    $("#submit-modal").style.display="none";
  };

  /* ========= Tabs ========= */
  function setActiveTab(tab){
    activeTab = tab;
    tabMissing.classList.toggle("active",tab==="missing");
    tabReceived.classList.toggle("active",tab==="received");
    render();
  }

  /* ========= Init ========= */
  async function init(){
    allItems = await fetchAssigned();
    setActiveTab("missing");
  }

  if(searchBox) searchBox.addEventListener("input",render);
  tabMissing.addEventListener("click",()=>setActiveTab("missing"));
  tabReceived.addEventListener("click",()=>setActiveTab("received"));

  init();
})();
