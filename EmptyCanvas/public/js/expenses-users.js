// public/expenses-users.js

document.addEventListener("DOMContentLoaded", () => {
  // لو عندك toast جاهز في app.js استخدمه، لو مش موجود هيستعمل console/alert
  const toast =
    window.showToast ||
    ((msg, type = "info") => {
      console[type === "error" ? "error" : "log"]("[ExpensesUsers]", msg);
      if (type === "error") alert(msg);
    });

  // ----- عناصر الصفحة الأساسية -----
  // جرّب أكثر من احتمال للـ id عشان ما نلبسش لو الاسم مختلف
  const tabsContainer =
    document.getElementById("expenses-users-tabs") ||
    document.getElementById("usersTabs") ||
    document.querySelector("[data-role='expenses-users-tabs']");

  const infoText =
    document.getElementById("expenses-users-info") ||
    document.querySelector("[data-role='expenses-users-info']");

  if (!tabsContainer) {
    console.warn(
      "[ExpensesUsers] Tabs container not found. " +
        "Add id='expenses-users-tabs' to the div that holds the user tabs."
    );
    return;
  }

  // ----- إنشاء الـ overlay (النافذة) ديناميكياً -----
  const overlay = document.createElement("div");
  overlay.id = "user-expenses-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(15,23,42,0.55)",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "9999",
    backdropFilter: "blur(4px)",
  });

  overlay.innerHTML = `
    <div class="user-expenses-modal" style="
      background:#020617;
      color:#e5e7eb;
      border-radius:16px;
      box-shadow:0 24px 60px rgba(15,23,42,0.7);
      width: min(980px, 96vw);
      max-height: 90vh;
      display:flex;
      flex-direction:column;
      overflow:hidden;
      border:1px solid rgba(148,163,184,0.35);
    ">
      <div style="
        padding:14px 20px;
        border-bottom:1px solid rgba(51,65,85,0.9);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        background: radial-gradient(circle at top left,#1e293b,#020617);
      ">
        <div>
          <div id="ue-modal-title" style="font-size:16px;font-weight:600;"></div>
          <div id="ue-modal-sub" style="font-size:12px;color:#9ca3af;margin-top:2px;"></div>
        </div>
        <button id="ue-modal-close" style="
          border:none;
          outline:none;
          width:32px;
          height:32px;
          border-radius:999px;
          background:rgba(15,23,42,0.85);
          color:#e5e7eb;
          display:flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          font-size:18px;
        " aria-label="Close">
          ×
        </button>
      </div>
      <div id="ue-modal-body" style="
        padding:12px 18px 16px 18px;
        overflow:auto;
        background:radial-gradient(circle at top,#0b1120 0,#020617 45%,#000 100%);
      ">
        <div id="ue-loading" style="padding:16px;font-size:13px;color:#9ca3af;">
          Loading user expenses...
        </div>
        <table id="ue-table" style="width:100%;border-collapse:collapse;display:none;font-size:12px;">
          <thead>
            <tr style="text-align:left;color:#9ca3af;border-bottom:1px solid rgba(51,65,85,0.9);">
              <th style="padding:6px 4px;">Date</th>
              <th style="padding:6px 4px;">Reason</th>
              <th style="padding:6px 4px;">Type</th>
              <th style="padding:6px 4px;">From → To</th>
              <th style="padding:6px 4px;text-align:right;">Km</th>
              <th style="padding:6px 4px;text-align:right;">Cash in</th>
              <th style="padding:6px 4px;text-align:right;">Cash out</th>
              <th style="padding:6px 4px;text-align:right;">Δ (in - out)</th>
            </tr>
          </thead>
          <tbody id="ue-tbody"></tbody>
          <tfoot>
            <tr style="border-top:1px solid rgba(51,65,85,0.9);font-weight:600;">
              <td colspan="5" style="padding:8px 4px;text-align:right;">Total:</td>
              <td id="ue-sum-in" style="padding:8px 4px;text-align:right;">£0</td>
              <td id="ue-sum-out" style="padding:8px 4px;text-align:right;">£0</td>
              <td id="ue-sum-net" style="padding:8px 4px;text-align:right;">£0</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const modal        = overlay.querySelector(".user-expenses-modal");
  const closeBtn     = overlay.querySelector("#ue-modal-close");
  const titleEl      = overlay.querySelector("#ue-modal-title");
  const subEl        = overlay.querySelector("#ue-modal-sub");
  const loadingEl    = overlay.querySelector("#ue-loading");
  const tableEl      = overlay.querySelector("#ue-table");
  const tbodyEl      = overlay.querySelector("#ue-tbody");
  const sumInEl      = overlay.querySelector("#ue-sum-in");
  const sumOutEl     = overlay.querySelector("#ue-sum-out");
  const sumNetEl     = overlay.querySelector("#ue-sum-net");

  // ----- فتح / قفل الـ overlay -----
  function openOverlay() {
    overlay.style.display = "flex";
  }
  function closeOverlay() {
    overlay.style.display = "none";
  }

  // ⛔ مهم: ما نقفلش غير لو الكليك على الخلفية نفسها
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  // ⛔ برضه مهم: الكليك جوه المودال ما يطلعش لـ overlay
  modal.addEventListener("click", (e) => e.stopPropagation());
  closeBtn.addEventListener("click", closeOverlay);

  // ----- Utilities -----
  const fmtMoney = (v) => {
    const n = Number(v) || 0;
    return (n < 0 ? "-£" + Math.abs(n) : "£" + n.toFixed(0));
  };

  const fmtDate = (d) => {
    if (!d) return "";
    // d مفروض يكون YYYY-MM-DD
    try {
      const obj = new Date(d);
      if (!isNaN(obj.getTime())) {
        return obj.toLocaleDateString("en-GB", {
          year: "numeric",
          month: "short",
          day: "2-digit",
        });
      }
      return d;
    } catch {
      return d;
    }
  };

  // ----- تحميل قائمة المستخدمين ----- 
  async function loadUsers() {
    try {
      if (infoText) {
        infoText.textContent =
          "Loading users who have expenses. Please wait...";
      }
      tabsContainer.innerHTML = "";

      const res = await fetch("/api/expenses/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();

      if (!data.success) throw new Error(data.error || "Cannot load users");
      const users = Array.isArray(data.users) ? data.users : [];

      if (!users.length) {
        if (infoText) {
          infoText.textContent = "No users have expenses yet.";
        }
        return;
      }

      if (infoText) {
        infoText.textContent =
          users.length +
          " user(s) have expenses. Click on a tab to view details.";
      }

      users.forEach((u) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "expenses-user-tab";

        // شكل ظريف للزرار
        Object.assign(btn.style, {
          border: "none",
          outline: "none",
          borderRadius: "999px",
          padding: "8px 18px",
          marginRight: "8px",
          marginBottom: "10px",
          background:
            "linear-gradient(135deg, #4f46e5, #6366f1, #8b5cf6)",
          color: "#f9fafb",
          fontSize: "13px",
          fontWeight: "600",
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(15,23,42,0.3)",
          whiteSpace: "nowrap",
        });

        const nameSpan = document.createElement("span");
        nameSpan.textContent = u.name || "User";

        const totalSpan = document.createElement("span");
        totalSpan.textContent = fmtMoney(u.total || 0);
        totalSpan.style.fontWeight = "700";

        const countSpan = document.createElement("span");
        countSpan.textContent = `(${u.count || 0} item${
          (u.count || 0) === 1 ? "" : "s"
        })`;
        countSpan.style.fontSize = "11px";
        countSpan.style.opacity = "0.85";

        btn.appendChild(nameSpan);
        btn.appendChild(totalSpan);
        btn.appendChild(countSpan);

        // click handler: افتح نافذة التفاصيل
        btn.addEventListener("click", () => {
          showUserExpenses(u);
        });

        tabsContainer.appendChild(btn);
      });
    } catch (err) {
      console.error("[ExpensesUsers] loadUsers:", err);
      if (infoText) {
        infoText.textContent = "Failed to load users who have expenses.";
      }
      toast("Failed to load expenses users list.", "error");
    }
  }

  // ----- عرض تفاصيل User معين في المودال -----
  async function showUserExpenses(user) {
    titleEl.textContent = user.name || "User";
    subEl.textContent = "Loading expenses...";
    loadingEl.style.display = "block";
    tableEl.style.display = "none";
    tbodyEl.innerHTML = "";
    sumInEl.textContent = "£0";
    sumOutEl.textContent = "£0";
    sumNetEl.textContent = "£0";

    openOverlay();

    try {
      const res = await fetch(`/api/expenses/user/${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error("Failed to load user expenses");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Cannot load user expenses");

      const items = Array.isArray(data.items) ? data.items : [];

      if (!items.length) {
        loadingEl.textContent = "This user has no expenses recorded.";
        subEl.textContent = `Net balance: ${fmtMoney(user.total || 0)} · 0 items`;
        return;
      }

      let sumIn = 0;
      let sumOut = 0;

      items.forEach((it) => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(31,41,55,0.85)";

        const delta = (Number(it.cashIn) || 0) - (Number(it.cashOut) || 0);
        sumIn += Number(it.cashIn) || 0;
        sumOut += Number(it.cashOut) || 0;

        const cells = [
          fmtDate(it.date),
          it.reason || "",
          it.fundsType || "",
          `${it.from || "-"} → ${it.to || "-"}`,
          it.kilometer ? String(it.kilometer) : "",
          it.cashIn ? fmtMoney(it.cashIn) : "",
          it.cashOut ? fmtMoney(it.cashOut) : "",
          delta ? fmtMoney(delta) : "",
        ];

        cells.forEach((val, idx) => {
          const td = document.createElement("td");
          td.textContent = val;
          td.style.padding = "6px 4px";
          td.style.fontSize = "12px";
          if (idx >= 4) td.style.textAlign = "right";
          tr.appendChild(td);
        });

        tbodyEl.appendChild(tr);
      });

      const net = sumIn - sumOut;
      sumInEl.textContent = fmtMoney(sumIn);
      sumOutEl.textContent = fmtMoney(sumOut);
      sumNetEl.textContent = fmtMoney(net);

      subEl.textContent = `Net balance: ${fmtMoney(
        user.total || net
      )} · ${items.length} item${items.length === 1 ? "" : "s"}`;

      loadingEl.style.display = "none";
      tableEl.style.display = "table";
    } catch (err) {
      console.error("[ExpensesUsers] showUserExpenses:", err);
      loadingEl.textContent = "Failed to load this user's expenses.";
      subEl.textContent = "Error loading data.";
      toast("Error loading user expenses.", "error");
    }
  }

  // اشغّل تحميل المستخدمين أول ما الصفحة تجهز
  loadUsers();
});
