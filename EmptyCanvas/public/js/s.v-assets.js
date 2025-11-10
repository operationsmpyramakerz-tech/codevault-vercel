// /public/js/sv-assets.js
// S.V Schools Assets — Cards grouped by batch timestamp (similar to Current Orders)

(function () {
  const state = {
    q: "",
    loading: false,
    groups: [],  // [{ key, createdAt, items: [...] }]
    lastFetchAt: null,
  };

  const els = {};

  // ---------- utils ----------
  function $(sel) { return document.querySelector(sel); }
  function show(el) { if (el) el.style.display = ""; }
  function hide(el) { if (el) el.style.display = "none"; }

  function showToast(message, type = "info") {
    if (typeof UI !== "undefined" && UI.toast) UI.toast({ type, message });
    else alert(message);
  }

  function fmtDateTime(d) {
    try {
      const date = (d instanceof Date) ? d : new Date(d);
      const dd = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
      const tt = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return `${dd} • ${tt}`;
    } catch { return String(d || ""); }
  }

  // round to minute (fallback key if no batchId comes from server)
  function minuteKey(iso) {
    const d = new Date(iso || Date.now());
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}Z`;
  }

  function featherSafeReplace() { try { feather.replace(); } catch {} }

  // ---------- fetch & adapt ----------
  async function fetchAssets() {
    state.loading = true;
    updateFetchStatus();
    show(els.loader);
    hide(els.empty);
    els.grid.innerHTML = "";

    try {
      const url = new URL("/api/sv-assets", location.origin);
      if (state.q) url.searchParams.set("search", state.q.trim());
      const r = await fetch(url.toString(), { credentials: "same-origin" });
      if (!r.ok) throw new Error("Failed to load assets");
      const j = await r.json();

      let groups = [];

      // (A) Already grouped from server: { ok:true, groups:[{ key/batchId/createdAt, items:[] }] }
      if (Array.isArray(j.groups)) {
        groups = j.groups.map(g => ({
          key: g.key || g.batchId || g.createdAt || minuteKey(g.createdAt || Date.now()),
          createdAt: g.createdAt || g.key || g.batchId || Date.now(),
          items: Array.isArray(g.items) ? g.items : [],
        }));
      }
      // (B) Flat rows: { ok:true, rows:[{ id, productName, qty, note, createdAt, batchId, files:[] }] }
      else if (Array.isArray(j.rows)) {
        const map = new Map();
        for (const row of j.rows) {
          const key = row.batchId || minuteKey(row.createdAt);
          if (!map.has(key)) map.set(key, { key, createdAt: row.createdAt || Date.now(), items: [] });
          map.get(key).items.push(row);
        }
        groups = Array.from(map.values());
      }
      // (C) Plain array
      else if (Array.isArray(j)) {
        const map = new Map();
        for (const row of j) {
          const key = row.batchId || minuteKey(row.createdAt);
          if (!map.has(key)) map.set(key, { key, createdAt: row.createdAt || Date.now(), items: [] });
          map.get(key).items.push(row);
        }
        groups = Array.from(map.values());
      } else {
        throw new Error(j.error || "Unexpected response");
      }

      // client-side search filter
      const q = state.q.trim().toLowerCase();
      if (q) {
        groups = groups
          .map(g => ({
            ...g,
            items: g.items.filter(it => {
              const s = [
                it.productName || it.product?.name || "",
                it.note || it.reason || "",
                it.createdAt || ""
              ].join(" ").toLowerCase();
              return s.includes(q);
            })
          }))
          .filter(g => g.items.length);
      }

      // newest first
      groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      state.groups = groups;
      state.lastFetchAt = new Date();
      render();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load assets", "error");
      state.groups = [];
      render();
    } finally {
      state.loading = false;
      updateFetchStatus();
      hide(els.loader);
    }
  }

  // ---------- render ----------
  function render() {
    els.grid.innerHTML = "";
    if (!state.groups.length) {
      show(els.empty);
      els.total.textContent = "";
      featherSafeReplace();
      return;
    }
    hide(els.empty);
    els.total.textContent = `${state.groups.length} batch${state.groups.length>1?'es':''}`;

    for (const g of state.groups) els.grid.appendChild(renderBatchCard(g));
    featherSafeReplace();
  }

  function renderBatchCard(group) {
    const card = document.createElement("article");
    card.className = "order-card";
    card.style.borderRadius = "16px";
    card.style.boxShadow = "0 8px 20px rgba(0,0,0,.06)";

    const count = group.items?.length || 0;
    const when = fmtDateTime(group.createdAt);

    card.innerHTML = `
      <div class="order-card__header" style="display:flex;gap:10px;align-items:center;justify-content:space-between;">
        <div style="display:flex;gap:10px;align-items:center;">
          <span class="badge badge--pill"><i data-feather="clock"></i></span>
          <div>
            <h3 style="margin:0;font-size:1.05rem;">Batch at ${when}</h3>
            <div class="muted">${count} component${count!==1?'s':''}</div>
          </div>
        </div>
        <div>
          <button class="btn btn-ghost btn-sm" data-expand><i data-feather="chevron-down"></i></button>
        </div>
      </div>
      <div class="order-card__body" data-body style="display:block;margin-top:10px;">
        ${renderItemsTable(group.items)}
      </div>
    `;

    const body = card.querySelector("[data-body]");
    const btnExpand = card.querySelector("[data-expand]");
    if (btnExpand && body) {
      btnExpand.addEventListener("click", () => {
        const isHidden = body.style.display === "none";
        body.style.display = isHidden ? "block" : "none";
        btnExpand.innerHTML = isHidden ? '<i data-feather="chevron-down"></i>'
                                       : '<i data-feather="chevron-right"></i>';
        featherSafeReplace();
      });
    }

    return card;
  }

  function renderItemsTable(items) {
    if (!items || !items.length) return `<div class="muted">No components in this batch.</div>`;
    const rows = items.map((it, i) => {
      const name = it.productName || it.product?.name || it.product?.title || "—";
      const qty  = it.qty ?? it.quantity ?? 1;
      const note = it.note || it.reason || "";
      const files = Array.isArray(it.files) ? it.files : [];
      const filesHtml = files.length
        ? files.map(f => `<span class="chip" title="${f.name || 'file'}"><i data-feather="paperclip"></i> ${f.name || 'file'}</span>`).join(" ")
        : "";
      return `
        <tr>
          <td style="width:36px;text-align:right;">${i+1}</td>
          <td>${name}</td>
          <td style="white-space:nowrap;text-align:center;">${qty}</td>
          <td>${note}</td>
          <td style="white-space:nowrap;">${filesHtml}</td>
        </tr>`;
    }).join("");

    return `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>#</th><th>Product</th><th>Qty</th><th>Note</th><th>Files</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function updateFetchStatus() {
    if (!els.fetchStatus) return;
    if (state.loading) els.fetchStatus.textContent = "Loading…";
    else if (state.lastFetchAt) els.fetchStatus.textContent = "Updated " + fmtDateTime(state.lastFetchAt);
    else els.fetchStatus.textContent = "";
  }

  // ---------- events ----------
  function wireEvents() {
    if (els.search) {
      let t = null;
      els.search.addEventListener("input", () => {
        state.q = els.search.value;
        clearTimeout(t);
        t = setTimeout(fetchAssets, 250);
      });
    }

    if (els.refresh) els.refresh.addEventListener("click", fetchAssets);

    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", async () => {
      try { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); } catch {}
      location.href = "/login";
    });
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    els.grid = document.querySelector("#assetsGrid");
    els.loader = document.querySelector("#assetsLoader");
    els.empty = document.querySelector("#emptyState");
    els.total = document.querySelector("#totalBatches");
    els.fetchStatus = document.querySelector("#fetchStatus");
    els.search = document.querySelector("#assetsSearch");
    els.refresh = document.querySelector("#refreshBtn");

    fetchAssets();
    wireEvents();
  });
})();
