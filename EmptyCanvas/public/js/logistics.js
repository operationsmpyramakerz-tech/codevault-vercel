/* Logistics – Orders Grouped + Modal Full/Partial Receiving + Submit inside modal */

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

  const receiverSelect = $("#receiverUser");
  const receiverPass   = $("#receiverPass");
  const submitBtn      = $("#submitOrderBtn");

  let allItems = [];
  let activeTab = "missing";
  let currentOrderReason = null;
  let receiversCache = null;

  // ---------- Small helper: POST JSON ----------
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      const msg = data.error || data.message || res.statusText || "Request failed";
      throw new Error(msg);
    }
    return data;
  }

  // ---------- Load Receivers (once) ----------
  async function ensureReceiversLoaded() {
    if (receiversCache !== null) return receiversCache;
    try {
      const res = await fetch("/api/logistics/receivers", { credentials: "same-origin" });
      const data = await res.json();
      const users = Array.isArray(data.users) ? data.users : [];
      receiversCache = users;
    } catch (e) {
      console.error("Failed to load receivers:", e);
      receiversCache = [];
    }
    return receiversCache;
  }

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

  // ---------- Local Save (Full / Partial) ----------
  // مابقاش يكلّم الباك إند مباشرة، بيعدّل الـ state بس
  function setLocalReceive(itemId, quantity){
    const item = allItems.find(x=>x.id == itemId);
    if(!item) return;
    item.rec = quantity;
    item.remaining = Math.max(0, item.requested - quantity);

    // نعيد فتح نفس المودال علشان تحديث عرض Req / Rec
    if (currentOrderReason) openOrderModal(currentOrderReason);
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
    currentOrderReason = reason;
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

    // حمّل قائمة الـ receivers جوه نفس المودال
    ensureReceiversLoaded().then(users=>{
      if (!receiverSelect) return;
      receiverSelect.innerHTML = users.map(u =>
        `<option value="${u.id}">${esc(u.name)}</option>`
      ).join("");
    });
  }

  // ---------- Submit Current Order (inside modal) ----------
  async function submitCurrentOrder(){
    if (!currentOrderReason) return;

    const userId   = receiverSelect?.value || "";
    const password = (receiverPass?.value || "").trim();

    if (!userId) {
      alert("اختر اسم المستلم من القائمة.");
      return;
    }
    if (!password) {
      alert("من فضلك أدخل كلمة السر.");
      return;
    }

    try {
      // 1) Verify user password
      const verify = await postJSON("/api/logistics/verify-user", { userId, password });
      if (!verify.ok) {
        alert(verify.error || "Incorrect password");
        return;
      }

      // 2) جهّز الـ itemIds و الـ recMap و statusById للطلب الحالي
      const items = allItems.filter(it => it.reason === currentOrderReason);

      const itemIds    = [];
      const statusById = {};
      const recMap     = {};

      for (const it of items) {
        const rec = N(it.rec);
        if (rec > 0) {
          const id = it.pageId;
          itemIds.push(id);
          recMap[id] = rec;
          statusById[id] = (rec >= it.requested)
            ? "Received by operations"
            : "Partially received by operations";
        }
      }

      if (!itemIds.length) {
        alert("لا يوجد أي عنصر تم إدخال كمية استلام له في هذا الطلب.");
        return;
      }

      // 3) إرسال مرة واحدة للباك إند
      await postJSON("/api/logistics/mark-received", {
        itemIds,
        statusById,
        recMap
      });

      alert("تم حفظ استلام الطلب بنجاح.");
      modal.style.display = "none";
      render();
    } catch (e) {
      console.error("Submit order error:", e);
      alert(e.message || "فشل حفظ البيانات، حاول مرة أخرى.");
    }
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
        if(item) setLocalReceive(id, item.requested);
      };
    });

    // Partial toggle
    $$(".btn[data-act='partial']").forEach(btn=>{
      btn.onclick = ()=>{
        const box = $("#pbox-"+btn.dataset.id);
        if (!box) return;
        box.style.display = box.style.display==="none"?"block":"none";
      };
    });

    // Partial Save
    $$(".btn[data-act='save']").forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.dataset.id;
        const val = N($("#pinput-"+id)?.value);
        const item = allItems.find(x=>x.id == id);
        if(!item) return;
        if(val<=0)        return alert("Enter valid quantity");
        if(val > item.requested) return alert("Cannot exceed requested");
        setLocalReceive(id, val);
      };
    });

    // Submit inside modal
    if (submitBtn) {
      submitBtn.onclick = submitCurrentOrder;
    }

    // Close
    if (modalClose) {
      modalClose.onclick = ()=> modal.style.display="none";
    }
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
    try {
      allItems = await fetchAssigned();
      setActiveTab("missing");
    } catch (e) {
      console.error("init logistics error:", e);
      if (grid) grid.innerHTML = `<p class="empty">Failed to load items.</p>`;
    }
  }

  if(searchBox) searchBox.addEventListener("input", render);
  tabMissing.addEventListener("click", ()=>setActiveTab("missing"));
  tabReceived.addEventListener("click", ()=>setActiveTab("received"));

  init();

})();
