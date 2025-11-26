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
            const kmBlock   = document.getElementById("co_km_block");
            const cashBlock = document.getElementById("co_cash_block");
            if (kmBlock && cashBlock) {
                kmBlock.style.display  = v === "Own car" ? "block" : "none";
                cashBlock.style.display = v === "Own car" ? "none"  : "block";
            }
        });
    }
}

/* =============================
   OPEN / CLOSE MODALS
   ============================= */
function openCashInModal() {
    const d = document.getElementById("ci_date");
    const c = document.getElementById("ci_cash");
    const f = document.getElementById("ci_from");
    if (d) d.value = "";
    if (c) c.value = "";
    if (f) f.value = "";
    const modal = document.getElementById("cashInModal");
    if (modal) modal.style.display = "flex";
}

function closeCashInModal() {
    const modal = document.getElementById("cashInModal");
    if (modal) modal.style.display = "none";
}

function openCashOutModal() {
    const d   = document.getElementById("co_date");
    const r   = document.getElementById("co_reason");
    const f   = document.getElementById("co_from");
    const t   = document.getElementById("co_to");
    const km  = document.getElementById("co_km");
    const ca  = document.getElementById("co_cash");
    const typ = document.getElementById("co_type");

    if (d)  d.value  = "";
    if (r)  r.value  = "";
    if (f)  f.value  = "";
    if (t)  t.value  = "";
    if (km) km.value = "";
    if (ca) ca.value = "";
    if (typ) typ.value = "";

    const kmBlock   = document.getElementById("co_km_block");
    const cashBlock = document.getElementById("co_cash_block");
    if (kmBlock)   kmBlock.style.display   = "none";
    if (cashBlock) cashBlock.style.display = "block";

    const modal = document.getElementById("cashOutModal");
    if (modal) modal.style.display = "flex";
}

function closeCashOutModal() {
    const modal = document.getElementById("cashOutModal");
    if (modal) modal.style.display = "none";
}

/* =============================
   SUBMIT CASH IN
   ============================= */
async function submitCashIn() {
    const dateInput = document.getElementById("ci_date");
    const amountInput = document.getElementById("ci_cash");
    const fromInput = document.getElementById("ci_from");

    const date = dateInput ? dateInput.value : "";
    const amount = amountInput ? amountInput.value : "";
    const cashInFrom = fromInput ? fromInput.value : "";

    if (!date || !amount) {
        alert("Please fill required fields.");
        return;
    }

    try {
        const res = await fetch("/api/expenses/cash-in", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, amount, cashInFrom }),
        });

        const data = await res.json();
        if (data.success) {
            closeCashInModal();
            await loadExpenses();
        } else {
            alert("Error: " + (data.error || "Unknown error"));
        }
    } catch (err) {
        console.error("Cash-in submit error:", err);
        alert("Failed to submit cash in.");
    }
}

/* =============================
   SUBMIT CASH OUT
   ============================= */
async function submitCashOut() {
    const typeEl   = document.getElementById("co_type");
    const reasonEl = document.getElementById("co_reason");
    const dateEl   = document.getElementById("co_date");
    const fromEl   = document.getElementById("co_from");
    const toEl     = document.getElementById("co_to");

    const type   = typeEl   ? typeEl.value   : "";
    const reason = reasonEl ? reasonEl.value : "";
    const date   = dateEl   ? dateEl.value   : "";
    const from   = fromEl   ? fromEl.value   : "";
    const to     = toEl     ? toEl.value     : "";

    if (!type || !reason || !date) {
        alert("Please fill required fields.");
        return;
    }

    const body = {
        fundsType: type,
        reason,
        date,
        from,
        to,
    };

    // Own car logic
    if (type === "Own car") {
        const kmEl = document.getElementById("co_km");
        body.kilometer = kmEl ? (kmEl.value || 0) : 0;
    } else {
        const cashEl = document.getElementById("co_cash");
        body.amount = cashEl ? (cashEl.value || 0) : 0;
    }

    try {
        const res = await fetch("/api/expenses/cash-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (data.success) {
            closeCashOutModal();
            await loadExpenses();
        } else {
            alert("Error: " + (data.error || "Unknown error"));
        }
    } catch (err) {
        console.error("Cash-out submit error:", err);
        alert("Failed to submit cash out.");
    }
}

/* =============================
   LOAD EXPENSES FROM SERVER
   ============================= */
async function loadExpenses() {
    const container = document.getElementById("expensesContent");
    const totalBox = document.getElementById("totalAmount");

    container.innerHTML = `<p style="color:#999;">Loading...</p>`;

    try {

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
        totalBox.innerHTML = `£${total.toLocaleString()}`;

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

                const isIn = it.cashIn && it.cashIn > 0;
                const isOut = it.cashOut && it.cashOut > 0;

                const arrow = isIn 
                    ? `<span class="arrow-icon arrow-in">↙</span>`
                    : `<span class="arrow-icon arrow-out">↗</span>`;

                html += `
                <div class="expense-item">

                    <div class="expense-icon">
                        ${arrow}
                    </div>

                    <div class="expense-details">
                        <div class="expense-title">${it.fundsType || ""}</div>
                        <div class="expense-person">${it.reason || ""}</div>
                        <div class="expense-person">${it.from || ""} → ${it.to || ""}</div>
                    </div>

                    <div class="expense-amount">
                        ${it.cashIn ? `+£${it.cashIn}` : ""}
                        ${it.cashOut ? `-£${it.cashOut}` : ""}
                    </div>

                </div>
                `;
            });
        }

        container.innerHTML = html || "<p>No expenses yet.</p>";

    } catch (err) {
        console.error("Load expenses error:", err);
        container.innerHTML = "<p>Error loading data</p>";
    }
}
/* =============================
   INITIALIZATION
   ============================= */
document.addEventListener("DOMContentLoaded", async () => {
    await loadFundsTypes();
    await loadExpenses();

    const cashInBtn  = document.getElementById("cashInBtn");
    const cashOutBtn = document.getElementById("cashOutBtn");
    if (cashInBtn)  cashInBtn.addEventListener("click", openCashInModal);
    if (cashOutBtn) cashOutBtn.addEventListener("click", openCashOutModal);

    // زرار الـ Submit جوه مودال الكاش إن
    const ciSubmit = document.getElementById("ci_submit");
    if (ciSubmit) {
        ciSubmit.addEventListener("click", (e) => {
            e.preventDefault();
            submitCashIn();
        });
    }

    // زرار الـ Submit جوه مودال الكاش آوت
    const coSubmit = document.getElementById("co_submit");
    if (coSubmit) {
        coSubmit.addEventListener("click", (e) => {
            e.preventDefault();
            submitCashOut();
        });
    }
});
