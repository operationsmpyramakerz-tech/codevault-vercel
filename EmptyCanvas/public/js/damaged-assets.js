// public/js/damaged-assets.js  (FULL FILE - drop-in replacement)
// --------------------------------------------------------------

(() => {
  // ---------- Helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(message, type = "info") {
    if (window.UI && typeof UI.toast === "function") {
      UI.toast({ type, message });
    } else {
      console[(type === "error" ? "error" : "log")](message);
      // fallback quick alert for critical only
      if (type === "error") alert(message);
    }
  }

  const ENDPOINTS = [
    // primary for this page
    "/api/damaged-assets/options",
    // fallbacks (copy of what غالباً مستخدم في صفحة المنتجات)
    "/api/options/products",
    "/api/products/options",
    "/api/products/list",
    "/api/catalog/products",
  ];

  // Normalize any backend shape into [{id, name}]
  function normalizeOptions(payload) {
    let arr = [];
    if (!payload) return arr;

    if (Array.isArray(payload)) {
      arr = payload;
    } else if (Array.isArray(payload.options)) {
      arr = payload.options;
    } else if (Array.isArray(payload.items)) {
      arr = payload.items;
    } else if (payload.data && Array.isArray(payload.data.options)) {
      arr = payload.data.options;
    }

    const out = [];
    const seen = new Set();
    for (const o of arr) {
      const id =
        o.id || o.pageId || o.value || o.notionId || o._id || o.key || "";
      const name =
        o.name ||
        o.title ||
        o.label ||
        o.displayName ||
        o.text ||
        o.productName ||
        "";
      if (!id || !name) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name });
    }
    return out;
  }

  async function tryFetch(urls) {
    for (const u of urls) {
      try {
        const res = await fetch(u, { credentials: "same-origin" });
        if (!res.ok) continue;
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("json")) continue;
        const data = await res.json();
        const norm = normalizeOptions(data);
        if (norm.length) return norm;
      } catch (_) {
        // try next
      }
    }
    return [];
  }

  let CACHE = { base: [], byQuery: new Map() };
  let optionsReady = false;

  async function fetchBaseOptions() {
    if (CACHE.base.length) return CACHE.base;
    // try endpoints without query first
    const urls = ENDPOINTS.map((e) => e);
    CACHE.base = await tryFetch(urls);
    return CACHE.base;
  }

  async function fetchQueryOptions(q) {
    const key = (q || "").trim().toLowerCase();
    if (!key) return fetchBaseOptions();

    if (CACHE.byQuery.has(key)) return CACHE.byQuery.get(key);

    // try ?q= and ?search= styles for each endpoint
    const urls = ENDPOINTS
      .map((e) => [`${e}?q=${encodeURIComponent(key)}`, `${e}?search=${encodeURIComponent(key)}`])
      .flat();

    const data = await tryFetch(urls);
    // fallback to client filter from base
    const result =
      data.length
        ? data
        : (await fetchBaseOptions()).filter((o) =>
            o.name.toLowerCase().includes(key)
          );

    CACHE.byQuery.set(key, result);
    return result;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[m]);
  }

  function buildOptionsHtml(arr) {
    const head = `<option value="">Select product...</option>`;
    const rows = arr
      .map(
        (o) =>
          `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`
      )
      .join("");
    return head + rows;
  }

  // --------- Components handling (kept compatible) ----------
  let compCounter = 0;

  function addComponent() {
    compCounter++;
    const id = compCounter;

    const wrap = document.createElement("div");
    wrap.className = "component-entry";
    wrap.dataset.id = id;

    wrap.innerHTML = `
      <div class="component-head">
        <h3><i data-feather="package"></i> Component ${id}</h3>
        <button type="button" class="btn btn-danger" data-remove="${id}">
          <i data-feather="trash-2"></i> Remove
        </button>
      </div>

      <div class="form-row">
        <div class="form-group product-group">
          <label for="product_${id}"><i data-feather="box"></i> Products *</label>
          <select id="product_${id}" name="items[${id}][productId]" required></select>
          <input class="product-search" type="search" placeholder="Search by name..." aria-label="Search products"/>
          <div class="product-hint" aria-live="polite" style="font-size:12px;color:#6b7280;margin-top:4px;">No results</div>
        </div>

        <div class="form-group">
          <label for="title_${id}"><i data-feather="type"></i> Description of issue (Title) *</label>
          <input id="title_${id}" name="items[${id}][title]" type="text" placeholder="Short issue summary..." required/>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1 1 100%">
          <label for="reason_${id}"><i data-feather="message-square"></i> Issue Reason</label>
          <textarea id="reason_${id}" name="items[${id}][reason]" placeholder="Extra details, when/how it happened, etc."></textarea>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1 1 100%">
          <label for="files_${id}"><i data-feather="image"></i> Files &amp; media</label>
          <input id="files_${id}" name="items[${id}][files]" type="file" multiple accept="image/*,.pdf,.heic,.jpg,.jpeg,.png"/>
          <small class="note">Upload photos/screenshots (optional)</small>
        </div>
      </div>
    `;

    $("#componentsList").appendChild(wrap);
    feather.replace();

    // populate select
    const select = $(`#product_${id}`, wrap);
    const hint   = $(`.product-hint`, wrap);
    const search = $(`.product-search`, wrap);

    // initial fill
    (async () => {
      const base = await fetchBaseOptions();
      select.innerHTML = buildOptionsHtml(base);
      hint.textContent = base.length ? `${base.length} items` : "No results";
    })();

    // live search (remote + fallback)
    let tId;
    search.addEventListener("input", () => {
      clearTimeout(tId);
      tId = setTimeout(async () => {
        const term = search.value.trim();
        const arr = await fetchQueryOptions(term);
        select.innerHTML = buildOptionsHtml(arr);
        hint.textContent = arr.length
          ? `${arr.length} result${arr.length > 1 ? "s" : ""}`
          : "No results";
      }, 220);
    });

    // remove handler
    $(`[data-remove="${id}"]`, wrap)?.addEventListener("click", () => {
      const total = $$(".component-entry").length;
      if (total <= 1) {
        toast("At least one component is required", "error");
        return;
      }
      wrap.remove();
    });
  }

  function collectPayload() {
    const items = [];
    for (const entry of $$(".component-entry")) {
      const id     = entry.dataset.id;
      const sel    = $(`#product_${id}`, entry);
      const title  = $(`#title_${id}`, entry);
      const reason = $(`#reason_${id}`, entry);
      const files  = $(`#files_${id}`, entry);

      if (!(sel && sel.value && title && title.value.trim())) continue;

      const productId   = sel.value;
      const productName = sel.options[sel.selectedIndex]?.text || "";

      const item = {
        product: { id: productId, name: productName }, // relation: Products
        title: title.value.trim(),                      // Title
        reason: (reason?.value || "").trim(),          // Text
        files: [],
      };
      if (files?.files?.length) {
        for (const f of files.files) {
          item.files.push({ name: f.name, type: f.type, size: f.size });
        }
      }
      items.push(item);
    }
    return { items };
  }

  function validate() {
    const items = collectPayload().items;
    if (!items.length) {
      toast("Please add at least one complete component", "error");
      return false;
    }
    return true;
  }

  async function submitV2(e) {
    e.preventDefault();
    if (!validate()) return;

    const btn = $("#submitBtnV2");
    const msg = $("#msgV2");
    btn.disabled = true;
    btn.innerHTML = '<i data-feather="loader"></i> Submitting...';
    feather.replace();
    msg.textContent = "Submitting...";
    msg.className = "note";

    try {
      const payload = collectPayload();

      const res = await fetch("/api/damaged-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("json")
        ? await res.json()
        : { success: false, error: "Non-JSON response" };

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to submit damage report");
      }

      msg.textContent = data.message || "Damage report submitted successfully!";
      msg.className = "note ok";

      // reset
      $("#damagedFormV2").reset();
      $("#componentsList").innerHTML = "";
      compCounter = 0;
      addComponent();
    } catch (err) {
      console.error(err);
      msg.textContent = "Error: " + (err.message || "Failed to submit");
      msg.className = "note err";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-feather="save"></i> Submit Report';
      feather.replace();
    }
  }

  async function init() {
    // prefetch once
    await fetchBaseOptions();
    optionsReady = true;

    $("#addComponentBtn")?.addEventListener("click", addComponent);
    $("#damagedFormV2")?.addEventListener("submit", submitV2);
    $("#clearV2")?.addEventListener("click", () => {
      $("#componentsList").innerHTML = "";
      compCounter = 0;
      addComponent();
      $("#msgV2").textContent = "";
    });

    // first component by default
    addComponent();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
