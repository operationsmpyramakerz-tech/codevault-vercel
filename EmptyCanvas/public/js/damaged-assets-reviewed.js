(async function () {
  const els = {
    loader: document.getElementById("assetsLoader"),
    empty: document.getElementById("emptyState"),
    grid: document.getElementById("assetsGrid"),
    refresh: document.getElementById("refreshBtn"),
  };

  function show(el) { if (el) el.style.display = ""; }
  function hide(el) { if (el) el.style.display = "none"; }
  function featherSafeReplace() { try { feather.replace(); } catch {} }

  function fmtDateTime(d) {
    const date = new Date(d);
    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  }

  async function fetchReviewed() {
    hide(els.empty);
    show(els.loader);
    els.grid.innerHTML = "";

    try {
      const res = await fetch("/api/damaged-assets/reviewed");
      const j = await res.json();
      hide(els.loader);

      if (!j.ok || !Array.isArray(j.rows) || !j.rows.length) {
        show(els.empty);
        return;
      }

      j.rows.forEach((it) => els.grid.appendChild(renderCard(it)));
      featherSafeReplace();
    } catch (e) {
      hide(els.loader);
      console.error(e);
      show(els.empty);
    }
  }

  function renderCard(item) {
    const card = document.createElement("article");
    card.className = "order-card";
    const when = fmtDateTime(item.createdTime);
    const files = (item.files || []).map(f => `<img src="${f}" style="max-width:100px;border-radius:8px;">`).join(" ");

    card.innerHTML = `
      <div class="order-card__header">
        <div>
          <h3>${item.title}</h3>
          <div class="muted">${when}</div>
        </div>
      </div>
      <div class="order-card__body">
        <p><strong>Comment:</strong> ${item.comment || "(No comment)"}</p>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">${files}</div>
      </div>
    `;
    return card;
  }

  els.refresh.addEventListener("click", fetchReviewed);
  document.addEventListener("DOMContentLoaded", fetchReviewed);
  fetchReviewed();
})();
