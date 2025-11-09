// public/js/damaged-assets.js  — FULL DROP-IN
(() => {
  // ---------- Short helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function toast(message, type = "info") {
    if (window.UI?.toast) UI.toast({ type, message });
    else if (type === "error") alert(message);
    else console.log(message);
  }

  // ---------- Products options (with fallbacks + search) ----------
  const ENDPOINTS = [
    "/api/damaged-assets/options",
    "/api/options/products",
    "/api/products/options",
    "/api/products/list",
    "/api/catalog/products",
  ];

  function normalizeOptions(payload) {
    let arr = [];
    if (!payload) return [];
    if (Array.isArray(payload)) arr = payload;
    else if (Array.isArray(payload.options)) arr = payload.options;
    else if (Array.isArray(payload.items)) arr = payload.items;
    else if (payload.data?.options) arr = payload.data.options;

    const seen = new Set();
    const out = [];
    for (const o of arr) {
      const id =
        o.id || o.pageId || o.value || o.notionId || o._id || o.key || "";
      const name =
        o.name || o.title || o.label || o.displayName || o.text || o.productName || "";
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name });
    }
    return out;
  }

  async function tryFetch(urls) {
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: "same-origin" });
        if (!r.ok) continue;
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) continue;
        const data = await r.json();
        const norm = normalizeOptions(data);
        if (norm.length) return norm;
      } catch (_) {}
    }
    return [];
  }

  const CACHE = { base: [], byQuery: new Map() };

  async function fetchBaseOptions() {
    if (CACHE.base.length) return CACHE.base;
    CACHE.base = await tryFetch(ENDPOINTS);
    return CACHE.base;
  }

  async function fetchQueryOptions(q) {
    const key = (q || "").trim().toLowerCase();
    if (!key) return fetchBaseOptions();
    if (CACHE.byQuery.has(key)) return CACHE.byQuery.get(key);

    const urls = ENDPOINTS
      .map((e) => [`${e}?q=${encodeURIComponent(key)}`, `${e}?search=${encodeURIComponent(key)}`])
      .flat();

    const server = await tryFetch(urls);
    const result = server.length
      ? server
      : (await fetchBaseOptions()).filter((o) => o.name.toLowerCase().includes(key));

    CACHE.byQuery.set(key, result);
    return result;
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const optionsHtml = (arr) =>
    `<option value="">Select product...</option>` +
    arr.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("");

  // ---------- Components block ----------
  let compCounter = 0;

  async function populateSelect(container) {
    const sel   = container.querySelector("select[data-role='product']");
    const hint  = container.querySelector("[data-role='hint']");
    const term  = container.querySelector("input[data-role='search']")?.value?.trim() || "";

    const list = term ? await fetchQueryOptions(term) : await fetchBaseOptions();
    sel.innerHTML = optionsHtml(list);
    if (hint) hint.textContent = list.length ? `${list.length} item${list.length > 1 ? "s" : ""}` : "No results";
  }

  function componentTemplate(id) {
    return `
      <div class="component-entry" data-id="${id}">
        <div class="component-head">
          <h3><i data-feather="package"></i> Component ${id}</h3>
          <button type="button" class="btn btn-danger" data-remove="${id}">
            <i data-feather="trash-2"></i> Remove
          </button>
        </div>

        <div class="form-row">
          <div class="form-group product-group">
            <label><i data-feather="box"></i> Products *</label>
            <select data-role="product" name="items[${id}][productId]" required></select>
            <input class="product-search" data-role="search" type="search" placeholder="Search by name..." aria-label="Search products"/>
            <div class="product-hint" data-role="hint" aria-live="polite" style="font-size:12px;color:#6b7280;margin-top:4px;">No results</div>
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
      </div>
    `;
  }

  async function addComponent(root) {
    compCounter++;
    const id = compCounter;

    const entry = document.createElement("div");
    entry.innerHTML = componentTemplate(id);
    const node = entry.firstElementChild;
    root.appendChild(node);

    // icons
    try { feather.replace(); } catch (_) {}

    // populate select (initial)
    await populateSelect(node);

    // live search
    const search = node.querySelector("input[data-role='search']");
    let t;
    on(search, "input", () => {
      clearTimeout(t);
      t = setTimeout(() => populateSelect(node), 220);
    });

    // remove
    const removeBtn = node.querySelector(`[data-remove="${id}"]`);
    on(removeBtn, "click", () => {
      if ($$(".component-entry", root).length <= 1) return toast("At least one component is required", "error");
      node.remove();
    });
  }

  function collectPayload(root) {
    const items = [];
    for (const entry of $$(".component-entry", root)) {
      const sel    = entry.querySelector("select[data-role='product']");
      const title  = entry.querySelector("input[name*='[title]']");
      const reason = entry.querySelector("textarea[name*='[reason]']");
      const files  = entry.querySelector("input[type='file']");

      if (!(sel && sel.value && title && title.value.trim())) continue;

      const productId   = sel.value;
      const productName = sel.options[sel.selectedIndex]?.text || "";

      const item = {
        product: { id: productId, name: productName },
        title: title.value.trim(),
        reason: (reason?.value || "").trim(),
        files: [],
      };
      if (files?.files?.length) {
        for (const f of files.files) item.files.push({ name: f.name, type: f.type, size: f.size });
      }
      items.push(item);
    }
    return { items };
  }

  async function handleSubmit(e, root) {
    e.preventDefault();
    const items = collectPayload(root).items;
    if (!items.length) return toast("Please add at least one complete component", "error");

    const btn = $("#submitBtnV2");
    const msg = $("#msgV2");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-feather="loader"></i> Submitting...'; try { feather.replace(); } catch(_){} }
    if (msg) { msg.textContent = "Submitting..."; msg.className = "note"; }

    try {
      const res = await fetch("/api/damaged-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items }),
      });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("json") ? await res.json() : { success:false, error:"Non-JSON response" };
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to submit damage report");

      if (msg) { msg.textContent = data.message || "Damage report submitted successfully!"; msg.className = "note ok"; }
      // reset
      root.innerHTML = "";
      compCounter = 0;
      await addComponent(root);
    } catch (err) {
      console.error(err);
      if (msg) { msg.textContent = "Error: " + (err.message || "Failed to submit"); msg.className = "note err"; }
      toast(err.message || "Submit failed", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-feather="save"></i> Submit Report'; try { feather.replace(); } catch(_){} }
    }
  }

  // ---------- Robust init (works with SPA/SSR) ----------
  async function mount() {
    const form  = $("#damagedFormV2");
    const list  = $("#componentsList");
    const addBt = $("#addComponentBtn");
    const clrBt = $("#clearV2");

    if (!form || !list || !addBt) return false;

    // prefetch options (don’t block UI)
    fetchBaseOptions().catch(() => {});

    on(addBt, "click", () => addComponent(list));
    on(form, "submit", (e) => handleSubmit(e, list));
    on(clrBt, "click", () => { list.innerHTML = ""; compCounter = 0; addComponent(list); $("#msgV2")?.textContent = ""; });

    // render first component
    await addComponent(list);

    return true;
  }

  // try immediate
  function init() {
    mount().then((ok) => {
      if (ok) return;
      // wait for nodes if SPA injects later
      const obs = new MutationObserver(async () => {
        const ok2 = await mount();
        if (ok2) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  // run on ready + export for routers
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
  window.initDamagedAssets = init; // in case your router wants to call it explicitly
})();
