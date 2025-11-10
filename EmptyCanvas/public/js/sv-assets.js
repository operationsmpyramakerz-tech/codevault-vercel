// /public/js/sv-assets.js
// S.V Schools Assets — Cards grouped by batch timestamp (similar to Current Orders)

(function () {
  const state = {
    q: "",
    loading: false,
    groups: [],
    lastFetchAt: null,
  };

  const els = {};
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

  // ---------- fetch ----------
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
      if (Array.isArray(j.groups)) {
        groups = j.groups.map(g => ({
          key: g.key || g.batchId || g.createdAt || minuteKey(g.createdAt || Date.now()),
          createdAt: g.createdAt || Date.now(),
          items: Array.isArray(g.items) ? g.items : [],
        }));
      } else if (Array.isArray(j.rows)) {
        const map = new Map();
        for (const row of j.rows) {
          const key = row.batchId || minuteKey(row.createdAt);
          if (!map.has(key)) map.set(key, { key, createdAt: row.createdAt || Date.now(), items: [] });
          map.get(key).items.push(row);
        }
        groups = Array.from(map.values());
      } else if (Array.isArray(j)) {
        const map = new Map();
        for (const row of j) {
          const key = row.batchId || minuteKey(row.createdAt);
          if (!map.has(key)) map.set(key, { key, createdAt: row.createdAt || Date.now(), items: [] });
          map.get(key).items.push(row);
        }
        groups = Array.from(map.values());
      } else throw new Error(j.error || "Unexpected response");

      const q = state.q.trim().toLowerCase();
      if (q) {
        groups = groups
          .map(g => ({
            ...g,
            items: g.items.filter(it => {
              const s = [
                it.productName || "",
                it.note || "",
                it.createdAt || "",
                it["S.V Comment"] || ""
              ].join(" ").toLowerCase();
              return s.includes(q);
            })
          }))
          .filter(g => g.items.length);
      }

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
    const count = group.items?.length || 0;
    const when = fmtDateTime(group.createdAt);

    card.innerHTML = `
      <div class="order-card__header" style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:10px;align-items:center;">
          <span class="badge badge--pill"><i data-feather="clock"></i></span>
          <div>
            <h3 style="margin:0;font-size:1.05rem;">Batch at ${when}</h3>
            <div class="muted">${count} component${count!==1?'s':''}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" data-expand><i data-feather="chevron-down"></i></button>
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
        btnExpand.innerHTML = isHidden
          ? '<i data-feather="chevron-down"></i>'
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

    // خانة S.V Comment
    const commentInputId = `sv-comment-${it.id}`;
    return `
      <tr>
        <td style="width:36px;text-align:right;">${i+1}</td>
        <td>${name}</td>
        <td style="white-space:nowrap;text-align:center;">${qty}</td>
        <td>${note}</td>
        <td style="white-space:nowrap;">${filesHtml}</td>
        <td>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="text" id="${commentInputId}" placeholder="S.V Comment"
                   style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:6px;">
            <button class="btn btn-sm btn-primary" data-send-comment data-id="${it.id}" data-input="${commentInputId}">Send</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  // الجدول مع عمود إضافي
  setTimeout(() => {
    document.querySelectorAll("[data-send-comment]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const pageId = btn.dataset.id;
        const inputId = btn.dataset.input;
        const input = document.getElementById(inputId);
        const comment = input.value.trim();
        if (!comment) return showToast("Please enter a comment before sending.", "warning");

        btn.disabled = true;
        btn.textContent = "Sending...";
        try {
          const res = await fetch(`/api/sv-assets/${pageId}/comment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment }),
          });
          const j = await res.json();
          if (!res.ok || !j.ok) throw new Error(j.error || "Failed to save comment");
          showToast("Comment saved successfully!", "success");
          input.value = "";
        } catch (e) {
          console.error(e);
          showToast("Failed to send comment", "error");
        } finally {
          btn.disabled = false;
          btn.textContent = "Send";
        }
      });
    });
  }, 100);

  return `
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr><th>#</th><th>Product</th><th>Qty</th><th>Note</th><th>Files</th><th>S.V Comment</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

  // ★ NEW: handle comment send
  async function updateSVComment(recordId, commentText) {
    if (!recordId) return;
    try {
      const res = await fetch("/api/update-sv-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId, comment: commentText }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Update failed");
      showToast("Comment updated ✅", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to update comment", "error");
    }
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

    // ★ listen to Send buttons dynamically
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("sv-comment-send")) {
        const row = e.target.closest("tr");
        const id = row?.dataset?.id;
        const input = row?.querySelector(".sv-comment-input");
        const value = input?.value?.trim() || "";
        if (!id) return showToast("Missing record ID", "error");
        updateSVComment(id, value);
      }
    });
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    els.grid = $("#assetsGrid");
    els.loader = $("#assetsLoader");
    els.empty = $("#emptyState");
    els.total = $("#totalBatches");
    els.fetchStatus = $("#fetchStatus");
    els.search = $("#assetsSearch");
    els.refresh = $("#refreshBtn");

    fetchAssets();
    wireEvents();
  });
})();
