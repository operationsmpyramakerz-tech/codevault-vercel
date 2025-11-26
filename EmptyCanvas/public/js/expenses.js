/* =============================
    EXPENSES PAGE — FRONTEND LOGIC
   ============================= */

let FUNDS_TYPES = [];

/* =============================
   LOAD FUNDS TYPES FROM SERVER
   ============================= */
async function loadFundsTypes() {
    try {
        const res = await fetch("/api/expenses/types");
        const data = await res.json();
        if (data.success) {
            FUNDS_TYPES = data.options;
        }
    } catch (err) {
        console.error("Funds Type Load Error", err);
        FUNDS_TYPES = [];
    }

    // Fill select inside Cash Out modal
    const sel = document.getElementById("co_type");
    if (sel) {
        sel.innerHTML = `<option value="">Select funds type...</option>`;
        FUNDS_TYPES.forEach(t => {
            sel.innerHTML += `<option value="${t}">${t}</option>`;
        });

        // KM logic
        sel.addEventListener("change", () => {
            const v = sel.value;
            document.getElementById("co_km_block").style.display = v === "Own car" ? "block" : "none";
            document.getElementById("co_cash_block").style.display = v !== "Own car" ? "block" : "none";
        });
    }
}

/* =============================
   OPEN / CLOSE MODALS
   ============================= */
function openCashInModal() {
    document.getElementById("ci_date").value = "";
    document.getElementById("ci_cash").value = "";
    document.getElementById("ci_from").value = "";
    document.getElementById("cashInModal").style.display = "flex";
}

function closeCashInModal() {
    document.getElementById("cashInModal").style.display = "none";
}

function openCashOutModal() {
    document.getElementById("co_date").value = "";
    document.getElementById("co_reason").value = "";
    document.getElementById("co_from").value = "";
    document.getElementById("co_to").value = "";
    document.getElementById("co_km").value = "";
    document.getElementById("co_cash").value = "";
    document.getElementById("co_type").value = "";

    // reset visibility
    document.getElementById("co_km_block").style.display = "none";
    document.getElementById("co_cash_block").style.display = "block";

    document.getElementById("cashOutModal").style.display = "flex";
}

function closeCashOutModal() {
    document.getElementById("cashOutModal").style.display = "none";
}

/* =============================
   SUBMIT CASH IN
   ============================= */
async function submitCashIn() {
    const date = document.getElementById("ci_date").value;
    const amount = document.getElementById("ci_cash").value;
    const cashInFrom = document.getElementById("ci_from").value;

    if (!date || !amount) {
        return alert("Please fill required fields.");
    }

    const res = await fetch("/api/expenses/cash-in", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ date, amount, cashInFrom })
    });

    const data = await res.json();
    if (data.success) {
        closeCashInModal();
        loadExpenses();
    } else {
        alert("Error: " + data.error);
    }
}

/* =============================
   SUBMIT CASH OUT
   ============================= */
async function submitCashOut() {
    const type = document.getElementById("co_type").value;
    const reason = document.getElementById("co_reason").value;
    const date = document.getElementById("co_date").value;
    const from = document.getElementById("co_from").value;
    const to = document.getElementById("co_to").value;

    if (!type || !reason || !date) {
        return alert("Please fill required fields.");
    }

    const body = {
        fundsType: type,
        reason,
        date,
        from,
        to
    };

    // Own car logic
    if (type === "Own car") {
        body.kilometer = document.getElementById("co_km").value || 0;
    } else {
        body.amount = document.getElementById("co_cash").value || 0;
    }

    const res = await fetch("/api/expenses/cash-out", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (data.success) {
        closeCashOutModal();
        loadExpenses();
    } else {
        alert("Error: " + data.error);
    }
}

/* =============================
   LOAD EXPENSES FROM SERVER
   ============================= */
async function loadExpenses() {
    const container = document.getElementById("expensesContent");
    const totalBox = document.getElementById("totalAmount");

    container.innerHTML = `<p style="color:#999;">Loading...</p>`;

    const res = await fetch("/api/expenses");
    const data = await res.json();

    if (!data.success) {
        container.innerHTML = "<p>Error loading data</p>";
        return;
    }

    const items = data.items;

    // Calculate total
    let total = 0;
    items.forEach(it => {
        if (it.cashIn) total += it.cashIn;
        if (it.cashOut) total -= it.cashOut;
    });
    totalBox.innerHTML = `$${total.toLocaleString()}`;

    // Group by date
    const groups = {};
    items.forEach(item => {
        const d = item.date || "Unknown";
        if (!groups[d]) groups[d] = [];
        groups[d].push(item);
    });

    // Render
    let html = "";
    for (const date of Object.keys(groups)) {
        html += `<div class="section-date">${date}</div>`;

        groups[date].forEach(it => {
            html += `
            <div class="expense-item">
                <div class="expense-icon icon-gift"></div>

                <div class="expense-details">
                    <div class="expense-title">${it.fundsType || ""}</div>
                    <div class="expense-person">${it.reason || ""}</div>
                    <div class="expense-person">${it.from || ""} → ${it.to || ""}</div>
                </div>

                <div class="expense-amount">
                    ${it.cashIn ? `+$${it.cashIn}` : ""}
                    ${it.cashOut ? `-$${it.cashOut}` : ""}
                </div>
            </div>
            `;
        });
    }

    container.innerHTML = html || "<p>No expenses yet.</p>";
}

/* =============================
   INITIALIZATION
   ============================= */
document.addEventListener("DOMContentLoaded", async () => {
    await loadFundsTypes();
    await loadExpenses();

    document.getElementById("cashInBtn").addEventListener("click", openCashInModal);
    document.getElementById("cashOutBtn").addEventListener("click", openCashOutModal);
});
