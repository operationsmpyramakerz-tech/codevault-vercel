/* Logistics (Final Version by Request)
   - No tabs
   - Show ALL assigned items for the current user
   - Each item has:
        * Received → rec = requested, status = Received by operations
        * Partial → small inline input → rec = user input, status = Partially received by operations
*/

(function () {

  // ---------- Helpers ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const N  = (v) => Number.isFinite(+v) ? +v : 0;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => 
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json().catch(() => ({}));
  }

  // ---------- DOM ----------
  const grid      = $("#logistics-grid") || $("#assigned-grid") || $("main");
  const searchBox = $("#logisticsSearch") || $("#search");

  // ---------- State ----------
  let allItems = [];

  // ---------- Normalize ----------
  function normalize(it) {
    const req = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    return {
      id: it.id,
      pageId: it.pageId || it.page_id || it.notionPageId || it.id,
      reason: it.reason || "",
      created: it.createdTime || it.created || "",
      productName: it.productName ?? it.product_name ?? "Unnamed",
      requested: req,
      available: avail,
      remaining: Math.max(0, req - avail),
      rec: N(it.quantityReceivedByOperations ?? it.rec ?? 0),
      status: (it.operationsStatus || it.status || "").toLowerCase()
    };
  }

  // ---------- Fetch ----------
  async function fetchAssigned() {
    const res = await fetch("/api/orders/assigned", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!res.ok) throw new Error("Failed to load assigned items");
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalize) : [];
  }

  // ---------- Actions ----------
  async function markReceived(itemId, value, isFull) {
    const decision = isFull
      ? "Received by operations"
      : "Partially received by operations";

    await postJSON("/api/logistics/mark-received", {
      itemIds: [itemId],
      statusById: { [itemId]: decision },
      recMap: { [itemId]: value }
    });

    // update local state instantly
    const it = allItems.find(x => x.id === itemId);
    if (it) {
      it.rec = value;
      it.status = decision.toLowerCase();
      it.remaining = Math.max(0, it.requested - value);
    }

    render();
  }

  // ---------- Render ----------
  function render() {
    if (!grid) return;
    grid.innerHTML = "";

    const q = (searchBox?.value || "").toLowerCase().trim();

    const view = allItems.filter(it =>
      it.productName.toLowerCase().includes(q) ||
      it.reason.toLowerCase().includes(q)
    );

    if (!view.length) {
      grid.innerHTML = `<p class="empty">No assigned items.</p>`;
      return;
    }

    for (const it of view) {
      const row = document.createElement("div");
      row.className = "order-card single-row";

      const statusColor =
        it.status.includes("received")
          ? "pill--success"
          : it.status.includes("partial")
          ? "pill--warning"
          : it.remaining > 0
          ? "pill--danger"
          : "pill--neutral";

      row.innerHTML = `
        <div class="order-row">
          <div class="left">
            <div class="item-name">${esc(it.productName)}</div>
            <div class="small muted">${esc(it.reason)}</div>
          </div>

          <div class="mid">
            <div>Req: <strong>${it.requested}</strong></div>
            <div>Avail: <strong>${it.available}</strong></div>
            <div>Rec: <strong>${it.rec}</strong></div>
            <div>
              Rem: <span class="pill ${statusColor}">${it.remaining}</span>
            </div>
          </div>

          <div class="right">
            <button class="btn btn-success btn-xs" data-act="full" data-id="${it.id}">
              Received
            </button>

            <button class="btn btn-warning btn-xs" data-act="partial" data-id="${it.id}">
              Partial
            </button>

            <div class="partial-box" id="ibox-${it.id}" style="display:none;margin-top:4px;">
              <input type="number" min="0" class="partial-input" placeholder="Qty" id="input-${it.id}">
              <button class="btn btn-primary btn-xxs" data-act="save-partial" data-id="${it.id}">
                Save
              </button>
            </div>
          </div>
        </div>
      `;

      grid.appendChild(row);
    }

    wire();
  }

  // ---------- Events ----------
  function wire() {
    $$(".btn[data-act='full']").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const item = allItems.find(x => x.id == id);
        if (item) markReceived(item.id, item.requested, true);
      };
    });

    $$(".btn[data-act='partial']").forEach(btn => {
      btn.onclick = () => {
        const box = $("#ibox-" + btn.dataset.id);
        box.style.display = box.style.display === "none" ? "block" : "none";
      };
    });

    $$(".btn[data-act='save-partial']").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const input = $("#input-" + id);
        const val = N(input.value);
        if (val <= 0) return alert("Enter valid quantity");
        markReceived(id, val, false);
      };
    });
  }

  // ---------- Init ----------
  async function init() {
    allItems = await fetchAssigned();
    render();
  }

  if (searchBox) {
    searchBox.addEventListener("input", render);
  }

  init();

})();
