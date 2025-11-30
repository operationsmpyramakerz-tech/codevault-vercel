const PDFDocument = require("pdfkit");
const path = require("path");

function generateExpensePDF({ userName, userId, items, dateFrom, dateTo }, callback) {
  // نخليها آمنة حتى لو items مش مبعوتة أو مش Array
  const rows = Array.isArray(items) ? items : [];

  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });

    // --------- تجميع الـ PDF في Buffer ---------
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => callback(null, Buffer.concat(buffers)));

    // لو حصل Error جوه PDFKit نفسه
    doc.on("error", (err) => {
      console.error("PDFKit error:", err);
      callback(err);
    });

    // ---------------- LOGO ----------------
    try {
      const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");
      doc.image(logoPath, 45, 45, { width: 95 });
    } catch (err) {
      console.error("Logo load failed (but PDF will continue):", err.message || err);
      // هنكمّل من غير لوجو
    }

    // ---------------- HEADER BOX ----------------
    doc.roundedRect(30, 30, 540, 150, 14).stroke("#CFCFCF");

    // ---------------- HEADER TITLE ----------------
    doc.font("Helvetica-Bold").fontSize(22).text("Expenses Report", 160, 50);

    // ---------------- HEADER INFO ----------------
const now = new Date();
const timestamp = now.toISOString().slice(0, 16).replace("T", " ");

// أماكن الأعمدة
const leftX  = 160;
const rightX = 380;

// أماكن السطور
const row1Y = 100;
const row2Y = 122;

doc.fontSize(12);

// سطر 1 – User Name (شمال)
doc.font("Helvetica-Bold").text("User Name ", leftX, row1Y, { continued: true });
doc.font("Helvetica").text(userName || "-");

// سطر 1 – Type (يمين)
doc.font("Helvetica-Bold").text("Type ", rightX, row1Y, { continued: true });
doc.font("Helvetica").text("All");

// سطر 2 – User ID (شمال)
doc.font("Helvetica-Bold").text("User ID ", leftX, row2Y, { continued: true });
doc.font("Helvetica").text(userId || "-");

// سطر 2 – Date (يمين)
doc.font("Helvetica-Bold").text("Date ", rightX, row2Y, { continued: true });
doc.font("Helvetica").text(timestamp);

 // ---------------- DURATION ----------------

// helper لتنسيق التاريخ
function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value); // لو جالك فورمات جاهز زي "09 Nov 25"
  return d.toISOString().slice(0, 10);          // YYYY-MM-DD
}

// لو الفلتر مش محدد (الـ front ما بعثش تاريخ من/إلى) نجيب أقدم وأحدث تاريخ من ال items
let fromVal = dateFrom;
let toVal   = dateTo;

if (!fromVal && !toVal && Array.isArray(items) && items.length > 0) {
  const validDates = items
    .map(it => it.date)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()));

  if (validDates.length > 0) {
    const minDate = new Date(Math.min(...validDates));
    const maxDate = new Date(Math.max(...validDates));
    fromVal = minDate.toISOString().slice(0, 10);
    toVal   = maxDate.toISOString().slice(0, 10);
  }
}

const fromText = formatDate(fromVal);
const toText   = formatDate(toVal);

// نكتب السطر على الشمال
doc.moveDown(3);
const durationY = doc.y + 5;

doc
  .font("Helvetica-Bold")
  .fontSize(14)
  .text("Duration:", 40, durationY, { continued: true });

doc
  .font("Helvetica")
  .text(`   From / ${fromText}   To / ${toText}`);

    // ---------------- SUMMARY BOXES ----------------
    const totalIn = rows.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = rows.reduce((s, i) => s + (i.cashOut || 0), 0);
    const balance = totalIn - totalOut;

    const boxY = doc.y + 10;

    function summaryBox(x, title, value, color) {
      doc.roundedRect(x, boxY, 160, 70, 12).stroke("#D9D9D9");

      doc.fontSize(11).font("Helvetica").fillColor("#666");
      doc.text(title, x + 10, boxY + 12);

      doc.fontSize(18).font("Helvetica-Bold").fillColor(color);
      doc.text(value, x + 10, boxY + 32);

      doc.fillColor("#000");
    }

    summaryBox(40, "Total Cash In", `${totalIn} EGP`, "#16A34A");
    summaryBox(220, "Total Cash Out", `${totalOut} EGP`, "#DC2626");
    summaryBox(400, "Final Balance", `${balance} EGP`, "#2563EB");

    doc.moveDown(7);

    // ---------------- TABLE HEADER ----------------
    doc.font("Helvetica-Bold").fontSize(13);

    const col = {
      date: 40,
      type: 110,
      reason: 190,
      from: 315,
      to: 380,
      km: 445,
      cashIn: 490,
      cashOut: 545,
    };

    doc.text("Date", col.date);
    doc.text("Type", col.type);
    doc.text("Reason", col.reason);
    doc.text("From", col.from);
    doc.text("To", col.to);
    doc.text("KM", col.km);
    doc.text("Cash in", col.cashIn);
    doc.text("Cash out", col.cashOut);

    // خط تحت الهيدر
    doc.moveTo(40, doc.y + 2).lineTo(560, doc.y + 2).stroke("#999");
    doc.moveDown(0.8);

    // ---------------- TABLE ROWS ----------------
    doc.font("Helvetica").fontSize(11);

    rows.forEach((it) => {
      // نخلي سطر ثابت
      const rowY = doc.y;

      const reason = it.reason || "-";
      const from = it.from || "-";
      const to = it.to || "-";

      doc.fillColor("#000");

      // كل عمود بنفس الـ y علشان المحاذاة تكون مظبوطة
      doc.text(it.date || "-", col.date, rowY, { width: col.type - col.date - 5 });

      doc.text(
        it.fundsType || "-",
        col.type,
        rowY,
        { width: col.reason - col.type - 5 }
      );

      // Reason (يمين علشان العربي)
      doc.text(reason, col.reason, rowY, {
        width: col.from - col.reason - 5,
        align: "right",
      });

      doc.text(from, col.from, rowY, {
        width: col.to - col.from - 5,
        align: "right",
      });

      doc.text(to, col.to, rowY, {
        width: col.km - col.to - 5,
        align: "right",
      });

      doc.text(
        it.kilometer || "-",
        col.km,
        rowY,
        { width: col.cashIn - col.km - 5, align: "right" }
      );

      // Cash In
      if (it.cashIn > 0) {
        doc.fillColor("#16A34A").text(
          it.cashIn.toString(),
          col.cashIn,
          rowY,
          { width: col.cashOut - col.cashIn - 5, align: "right" }
        );
      } else {
        doc.fillColor("#000").text(
          "-",
          col.cashIn,
          rowY,
          { width: col.cashOut - col.cashIn - 5, align: "right" }
        );
      }

      // Cash Out
      if (it.cashOut > 0) {
        doc.fillColor("#DC2626").text(
          it.cashOut.toString(),
          col.cashOut,
          rowY,
          { width: 40, align: "right" }
        );
      } else {
        doc.fillColor("#000").text(
          "-",
          col.cashOut,
          rowY,
          { width: 40, align: "right" }
        );
      }

      doc.fillColor("#000");
      // انزل سطر بعد الرو
      doc.moveDown(1);
    });

    // ---------------- FOOTER ----------------
    doc.moveDown(1.5);
    doc.fontSize(10).font("Helvetica").fillColor("#777");
    doc.text(`Generated ${timestamp}`, 40);

    doc.end();
  } catch (err) {
    console.error("generateExpensePDF error:", err);
    callback(err);
  }
}

module.exports = generateExpensePDF;
