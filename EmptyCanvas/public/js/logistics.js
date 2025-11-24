/* Logistics with 2 Tabs (Missing / Received)
   - Missing tab: items that have NOT been received yet  (rec == 0)
   - Received tab: items that have been received (fully or partially) (rec > 0)
   - Buttons per item:
        * Received → rec = requested, status = "Received by operations"
        * Partial  → user enters quantity, status = "Partially received by operations"
*/

(function () {
  // ---------- Helpers ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const N  = (v) => Number.isFinite(+v) ? +v : 0;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error(await res.text().catch(()=>''));
    return res.json().catch(() => ({}));
  }

  // ---------- DOM ----------
  const grid        = $("#logistics-grid") || $("#assigned-grid") || $("main");
  const searchBox   = $("#logisticsSearch") || $("#search");
  const tabMissing  = $("#tab-missing");
  const tabReceived = $("#tab-received");

  // ---------- State ----------
  let allItems   = [];
  let activeTab  = "missing"; // "missing" | "received"

  // ---------- Normalize ----------
  function normalize(it) {
    const req   = N(it.requested ?? it.req);
    const avail = N(it.available ?? it.avail);
    const rec   = N(it.quantityReceivedByOperations ?? it.rec ?? 0);

    return {
      id: it.id,
      pageId: it.pageId || it.page_id || it.notionPageId || it.id, // مهم للـ backend
      reason: it.reason || "",
      created: it.createdTime || it.created || "",
      productName: it.productName ?? it.product_name ?? "Unnamed",
      requested: req,
      available: avail,
      rec,
      remaining: Math.max(0, req - rec),
      status: (it.operationsStatus || it.status || "").toLowerCase(),
    };
  }

  // ---------- Fetch ----------
  async function fetchAssigned() {
    const res = await fetch("/api/orders/assigned", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to load assigned items");
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalize) : [];
  }

  // ---------- Actions ----------
  async function markReceived(itemId, value, isFull) {
    const item = allItems.find((x) => x.id == itemId);
    if (!item) return;

    const backendId = item.pageId || item.id;   // نستخدم pageId لو موجود
    const decision = isFull
      ? "Received by operations"
      : "Partially received by operations";

    try {
      await postJSON("/api/logistics/mark-received", {
        itemIds: [backendId],
        statusById: { [backendId]: decision },
        recMap: { [backendId]: value },
      });
    } catch (e) {
      console.error(e);
      alert("Failed to save. Please try again.");
      return;
    }

    // update local state instantly
    item.rec = value;
    item.status = decision.toLowerCase();
    item.remaining = Math.max(0, item.requested - value);

    render();
  }

  // ---------- Render ----------
  function render() {
    if (!grid) return;
    grid.innerHTML = "";

    const q = (searchBox?.value || "").toLowerCase().trim();

    // Filter by tab
    let view = allItems.filter((it) =>
      activeTab === "missing" ? it.rec <= 0 : it.rec > 0
    );

    // Filter by search
    if (q) {
      view = view.filter(
        (it) =>
          it.productName.toLowerCase().includes(q) ||
          it.reason.toLowerCase().includes(q)
      );
    }

    if (!view.length) {
      grid.innerHTML = `<p class="empty">No items.</p>`;
      return;
    }

    for (const it of view) {
      const row = document.createElement("div");
      row.className = "order-card single-row";

      const statusColor =
        it.rec > 0 && it.remaining === 0
          ? "pill--success"
          : it.rec > 0 && it.remaining > 0
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

    wireRowButtons();
  }

  // ---------- Row buttons events ----------
  function wireRowButtons() {
    $$(".btn[data-act='full']").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const item = allItems.find((x) => x.id == id);
        if (item) markReceived(item.id, item.requested, true);
      };
    });

    $$(".btn[data-act='partial']").forEach((btn) => {
      btn.onclick = () => {
        const box = $("#ibox-" + btn.dataset.id);
        if (box) {
          box.style.display = box.style.display === "none" ? "block" : "none";
        }
      };
    });

    $$(".btn[data-act='save-partial']").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const input = $("#input-" + id);
        const val = N(input.value);
        if (val <= 0) return alert("Enter valid quantity");
        const item = allItems.find((x) => x.id == id);
        if (!item) return;
        if (val > item.requested) {
          return alert("Quantity cannot be more than requested.");
        }
        markReceived(id, val, false);
      };
    });
  }

  // ---------- Tabs ----------
  function setActiveTab(tab) {
    activeTab = tab;

    if (tabMissing) {
      tabMissing.classList.toggle("active", tab === "missing");
      tabMissing.setAttribute("aria-pressed", tab === "missing" ? "true" : "false");
    }

    if (tabReceived) {
      tabReceived.classList.toggle("active", tab === "received");
      tabReceived.setAttribute("aria-pressed", tab === "received" ? "true" : "false");
    }

    render();
  }

  // ---------- Init ----------
  async function init() {
    try {
      allItems = await fetchAssigned();
    } catch (e) {
      console.error(e);
      if (grid) grid.innerHTML = '<p class="error">Failed to load items.</p>';
      return;
    }
    setActiveTab("missing"); // default tab
  }

  if (searchBox) {
    searchBox.addEventListener("input", render);
  }

  if (tabMissing) {
    tabMissing.addEventListener("click", () => setActiveTab("missing"));
  }
  if (tabReceived) {
    tabReceived.addEventListener("click", () => setActiveTab("received"));
  }

  init();
})();
