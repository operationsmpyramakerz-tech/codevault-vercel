/* =============================
    EXPENSES PAGE — FRONTEND LOGIC
   ============================= */

let FUNDS_TYPES = [];

// Load Funds Type from server (Notion Select)
async function loadFundsTypes() {
    try {
        const res = await fetch("/api/expenses/types");
        const data = await res.json();
        if (data.success) FUNDS_TYPES = data.options;
    } catch (err) {
        console.error("Funds type load error", err);
        FUNDS_TYPES = []; 
    }
}

/* =============================
   Create Option List for Select
   ============================= */
function buildFundsTypeSelect(id) {
    const list = FUNDS_TYPES || [];
    let html = `<select class="modal-input" id="${id}" required>
        <option value="">Select Funds Type...</option>`;

    for (const t of list) {
        html += `<option value="${t}">${t}</option>`;
    }

    html += "</select>";
    return html;
}

/* =====================================
   OPEN CASH OUT MODAL
   ===================================== */
function openCashOutModal() {
    const modal = document.getElementById("expensesModal");
    const content = document.getElementById("modalContent");

    content.innerHTML = `
        <h2 class="modal-title">Cash Out</h2>

        <label>Funds Type</label>
        ${buildFundsTypeSelect("fundsType")}

        <label>Reason</label>
        <input type="text" id="reason" class="modal-input" placeholder="Reason" required>

        <label>Date</label>
        <input type="date" id="date" class="modal-input" required>

        <label>From</label>
        <input type="text" id="from" class="modal-input">

        <label>To</label>
        <input type="text" id="to" class="modal-input">

        <div id="kmContainer" style="display:none;">
            <label>Kilometer</label>
            <input type="number" id="kilometer" class="modal-input" placeholder="km">
        </div>

        <label>Cash Out</label>
        <input type="number" id="cashOut" class="modal-input" required>

        <button class="btn-submit" onclick="submitCashOut()">Submit</button>
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    `;

    modal.style.display = "flex";

    // Show/hide km depending on Funds Type
    document.getElementById("fundsType").addEventListener("change", () => {
        const v = document.getElementById("fundsType").value;
        document.getElementById("kmContainer").style.display = 
            v === "Own car" ? "block" : "none";
    });
}

/* =====================================
   OPEN CASH IN MODAL
   ===================================== */
function openCashInModal() {
    const modal = document.getElementById("expensesModal");
    const content = document.getElementById("modalContent");

    content.innerHTML = `
        <h2 class="modal-title">Cash In</h2>

        <label>Date</label>
        <input type="date" id="date" class="modal-input" required>

        <label>Cash In</label>
        <input type="number" id="cashIn" class="modal-input" required>

        <label>Cash In From</label>
        <input type="text" id="cashInFrom" class="modal-input" placeholder="Source">

        <button class="btn-submit" onclick="submitCashIn()">Submit</button>
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    `;

    modal.style.display = "flex";
}

/* =============================
   Submit Cash Out
   ============================= */
async function submitCashOut() {
    const fundsType = document.getElementById("fundsType").value;
    const reason    = document.getElementById("reason").value;
    const date      = document.getElementById("date").value;
    const from      = document.getElementById("from").value;
    const to        = document.getElementById("to").value;
    const amount    = document.getElementById("cashOut").value;
    const kilometer = fundsType === "Own car" 
                        ? document.getElementById("kilometer").value 
                        : null;

    if (!fundsType || !reason || !date || !amount) {
        return alert("Please fill all required fields");
    }

    const body = {
        fundsType,
        reason,
        date,
        from,
        to,
        amount,
    };

    if (kilometer) body.kilometer = kilometer;

    const res = await fetch("/api/expenses/cash-out", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (data.success) {
        alert("Cash Out added");
        closeModal();
        loadExpenses();
    } else {
        alert("Error: " + data.error);
    }
}

/* =============================
   Submit Cash In
   ============================= */
async function submitCashIn() {
    const date = document.getElementById("date").value;
    const amount = document.getElementById("cashIn").value;
    const cashInFrom = document.getElementById("cashInFrom").value;

    if (!date || !amount) return alert("Fill required fields");

    const res = await fetch("/api/expenses/cash-in", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ date, amount, cashInFrom })
    });

    const data = await res.json();

    if (data.success) {
        alert("Cash In added");
        closeModal();
        loadExpenses();
    } else {
        alert("Error: " + data.error);
    }
}

/* =============================
   Load & Display Expenses List
   ============================= */
async function loadExpenses() {
    const container = document.getElementById("expensesList");
    container.innerHTML = "<p>Loading...</p>";

    const res = await fetch("/api/expenses");
    const data = await res.json();

    if (!data.success) {
        container.innerHTML = "<p>Error loading data</p>";
        return;
    }

    const items = data.items;

    // Group by date
    const groups = {};
    items.forEach(it => {
        const d = it.date || "Unknown";
        if (!groups[d]) groups[d] = [];
        groups[d].push(it);
    });

    let html = "";

    Object.keys(groups).forEach(date => {
        html += `<div class="group-date">${date}</div>`;

        groups[date].forEach(item => {
            html += `
                <div class="expense-card">
                    <div class="exp-left">
                        <div class="exp-type">${item.fundsType}</div>
                        <div class="exp-reason">${item.reason}</div>
                        <div class="exp-loc">From: ${item.from} → ${item.to}</div>
                    </div>

                    <div class="exp-right">
                        ${item.cashIn > 0 
                            ? `<div class="cash-in">+${item.cashIn}</div>`
                            : `<div class="cash-out">-${item.cashOut}</div>`
                        }
                    </div>
                </div>
            `;
        });
    });

    container.innerHTML = html;
}

/* =============================
   Close Modal
   ============================= */
function closeModal() {
    document.getElementById("expensesModal").style.display = "none";
}

/* =============================
   INITIALIZATION
   ============================= */
document.addEventListener("DOMContentLoaded", async () => {
    await loadFundsTypes();
    loadExpenses();

    document.getElementById("btnCashIn").addEventListener("click", openCashInModal);
    document.getElementById("btnCashOut").addEventListener("click", openCashOutModal);
});
