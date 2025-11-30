// expenses-users.js
let CURRENT_USER_ITEMS = [];

async function loadExpenseUsers() {
  const tabsEl = document.getElementById("userTabs");
  const infoEl = document.getElementById("usersInfo");

  if (!tabsEl || !infoEl) return;

  infoEl.textContent = "Loading users with expenses...";

  try {
    const res = await fetch("/api/expenses/users");
    const data = await res.json();

    if (!data.success) {
      infoEl.textContent = "Error loading expense users.";
      return;
    }

    const users = data.users || [];
    tabsEl.innerHTML = "";

    if (users.length === 0) {
      infoEl.textContent = "No expenses found for any user.";
      return;
    }

    infoEl.textContent = `${users.length} user(s) have expenses. Click on a tab to view details.`;

    users.forEach((u) => {
      const btn = document.createElement("button");
      btn.className = "user-tab";
      btn.dataset.userId = u.id;
      btn.dataset.userName = u.name;

      const totalStr = (u.total || 0).toLocaleString();

      btn.innerHTML = `
        <span>${u.name}</span>
        <span class="user-total">£${totalStr}</span>
        <span class="user-count">(${u.count} items)</span>
      `;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".user-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        openUserExpensesModal(u.id, u.name);
      });

      tabsEl.appendChild(btn);
    });
  } catch (err) {
    console.error("loadExpenseUsers error:", err);
    infoEl.textContent = "Error loading expense users.";
  }
}

// ---- OPEN MODAL ----
async function openUserExpensesModal(userId, userName) {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");
  const titleEl = document.getElementById("userExpensesTitle");
  const totalEl = document.getElementById("userExpensesTotal");
  const listEl = document.getElementById("userExpensesList");

  titleEl.textContent = `Expenses — ${userName}`;
  totalEl.textContent = "Total: £0";
  listEl.innerHTML = "Loading...";

  modal.style.display = "flex";
  setTimeout(() => sheet.style.transform = "translateY(0)", 10);

  try {
    const res = await fetch(`/api/expenses/user/${encodeURIComponent(userId)}`);
    const data = await res.json();

    if (!data.success) {
      listEl.innerHTML = "<p style='color:#ef4444;'>Error loading expenses.</p>";
      return;
    }

    // SAVE FULL LIST
    CURRENT_USER_ITEMS = data.items || [];

    // INITIAL RENDER
    renderUserExpenses(CURRENT_USER_ITEMS, totalEl, listEl);

    // ---- APPLY FILTER BTN ----
    document.getElementById("applyDateFilterBtn").onclick = () => {
      const from = document.getElementById("dateFrom").value;
      const to = document.getElementById("dateTo").value;

      let filtered = CURRENT_USER_ITEMS.filter((it) => {
        const d = new Date(it.date);
        const f = from ? new Date(from) : null;
        const t = to ? new Date(to) : null;

        if (f && d < f) return false;
        if (t && d > t) return false;
        return true;
      });

      renderUserExpenses(filtered, totalEl, listEl);
    };

    // ---- RESET FILTER ----
    document.getElementById("resetDateFilterBtn").onclick = () => {
      document.getElementById("dateFrom").value = "";
      document.getElementById("dateTo").value = "";
      renderUserExpenses(CURRENT_USER_ITEMS, totalEl, listEl);
    };

  } catch (err) {
    console.error("openUserExpensesModal error:", err);
    listEl.innerHTML = "<p style='color:#ef4444;'>Error loading expenses.</p>";
  }
}

// ---- RENDER LIST ----
function renderUserExpenses(items, totalEl, listEl) {
  if (!items || items.length === 0) {
    listEl.innerHTML = "<p style='color:#9ca3af;'>No expenses for this user.</p>";
    totalEl.textContent = "Total: £0";
    return;
  }

  let total = 0;
  listEl.innerHTML = "";

  items.forEach((it) => {
    const cashIn = Number(it.cashIn || 0);
    const cashOut = Number(it.cashOut || 0);
    total += cashIn - cashOut;

    const arrow = cashIn > 0
      ? `<span class="arrow-icon arrow-in">↙</span>`
      : `<span class="arrow-icon arrow-out">↗</span>`;

    const div = document.createElement("div");
    div.className = "expense-item";

    div.innerHTML = `
      <div class="expense-icon">${arrow}</div>
      <div class="expense-details">
        <div class="expense-title">${it.fundsType} <span style="color:#9ca3af;">${it.date}</span></div>
        <div class="expense-person">${it.reason}</div>
        <div class="expense-person">${it.from || ""} ${it.to ? "→ " + it.to : ""}</div>
      </div>
      <div class="expense-amount">
        ${cashIn ? `<span style="color:#16a34a;">+£${cashIn}</span>` : ""}
        ${cashOut ? `<span style="color:#dc2626;">-£${cashOut}</span>` : ""}
      </div>
    `;

    listEl.appendChild(div);
  });

  totalEl.textContent = `Total: £${total}`;
}

// ---- CLOSE MODAL ----
function closeUserExpensesModal() {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");

  sheet.style.transform = "translateY(100%)";
  setTimeout(() => modal.style.display = "none", 300);
}

// close when clicking outside
document.addEventListener("click", (e) => {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");

  if (modal.style.display !== "flex") return;
  if (e.target.closest(".user-tab")) return;

  if (!sheet.contains(e.target)) {
    closeUserExpensesModal();
  }
});

document.addEventListener("DOMContentLoaded", loadExpenseUsers);
