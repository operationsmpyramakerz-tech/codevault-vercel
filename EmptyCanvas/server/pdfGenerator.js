const PDFDocument = require("pdfkit");
const path = require("path");

function generateExpensePDF({ userName, userId, items, dateFrom, dateTo }, callback) {
  const rows = Array.isArray(items) ? items : [];

  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => callback(null, Buffer.concat(buffers)));
    doc.on("error", (err) => callback(err));

    // ---------------- LOGO ----------------
    try {
      const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");
      doc.image(logoPath, 45, 45, { width: 95 });
    } catch (err) {}

    // ---------------- HEADER BOX & TITLE ----------------
    doc.roundedRect(30, 30, 540, 120, 14).stroke("#CFCFCF");
    doc.font("Helvetica-Bold").fontSize(22).text("Expenses Report", 160, 50);

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");

    const leftX = 160, rightX = 380, row1Y = 100, row2Y = 122;
    doc.fontSize(12);
    doc.font("Helvetica-Bold").text("User Name ", leftX, row1Y, { continued: true }).font("Helvetica").text(userName || "-");
    doc.font("Helvetica-Bold").text("Type ", rightX, row1Y, { continued: true }).font("Helvetica").text("All");
    doc.font("Helvetica-Bold").text("User ID ", leftX, row2Y, { continued: true }).font("Helvetica").text(userId || "-");
    doc.font("Helvetica-Bold").text("Date ", rightX, row2Y, { continued: true }).font("Helvetica").text(timestamp);

    // ---------------- DURATION ----------------
    function formatDisplayDate(dateStr) {
      if (!dateStr) return "-";
      if (/^\d{2} [A-Za-z]{3} \d{2}$/.test(dateStr)) return dateStr;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, " ");
    }

    let fromText = formatDisplayDate(dateFrom);
    let toText = formatDisplayDate(dateTo);
    if ((!dateFrom || !dateTo) && rows.length > 0) {
      const dates = rows.map(r => r.date).filter(Boolean);
      if (dates.length > 0) {
        const sorted = dates.sort();
        fromText = formatDisplayDate(sorted[0]);
        toText = formatDisplayDate(sorted[sorted.length - 1]);
      }
    }

    const durationY = 170;
    doc.font("Helvetica-Bold").fontSize(14).text("Duration:", 40, durationY);
    doc.roundedRect(130, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.roundedRect(320, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.font("Helvetica").fontSize(13).text(fromText, 140, durationY + 5);
    doc.text(toText, 330, durationY + 5);

    // ---------------- SUMMARY BOXES (صغيرة في الأعلى زي الصورة) ----------------
    const totalIn = rows.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = rows.reduce((s, i) => s + (i.cashOut || 0), 0);
    const balance = totalIn - totalOut;

    const boxY = durationY + 50;
    const boxWidth = 140;
    const boxSpacing = 25;

    function smallBox(x, value, color) {
      doc.roundedRect(x, boxY, boxWidth, 40, 12).fillAndStroke(color + "20", color);
      doc.font("Helvetica-Bold").fontSize(18).fillColor(color).text(value, x + 10, boxY + 12);
    }

    smallBox(70, `${totalIn.toLocaleString()} EGP`, "#16A34A");
    smallBox(70 + boxWidth + boxSpacing, `${totalOut.toLocaleString()} EGP`, "#DC2626");
    smallBox(70 + 2 * (boxWidth + boxSpacing), `${balance.toLocaleString()} EGP`, "#2563EB");

    // ---------------- Total No. of entries ----------------
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000")
       .text(`Total No. of entries: ${rows.length}`, 40, boxY + 60);

    // ---------------- TABLE (مضغوط ومنسق تمامًا زي الصورة) ----------------
    const tableTop = boxY + 100;
    const rowHeight = 38;
    let y = tableTop;

    // Header
    doc.rect(40, y, 520, rowHeight).fill("#F8F9FA");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(11.5);

    const col = {
      date: 50,
      type: 115,
      reason: 195,
      from: 290,
      to: 370,
      km: 420,
      cashIn: 470,
      cashOut: 520
    };

    doc.text("Date", col.date, y + 14);
    doc.text("Type", col.type, y + 14);
    doc.text("Reason", col.reason, y + 14);
    doc.text("From", col.from, y + 14);
    doc.text("To", col.to, y + 14);
    doc.text("KM", col.km, y + 14, { width: 40, align: "center" });
    doc.text("Cash in", col.cashIn, y + 14, { align: "right" });
    doc.text("Cash out", col.cashOut, y + 14, { align: "right" });

    y += rowHeight;

    // خط تحت الهيدر
    doc.moveTo(40, y).lineTo(560, y).lineWidth(1).stroke("#DDDDDD");

    // خطوط عمودية خفيفة
    [col.type, col.reason, col.from, col.to, col.km, col.cashIn, col.cashOut].forEach(x => {
      doc.moveTo(x, tableTop).lineTo(x, tableTop + rowHeight + rows.length * rowHeight + 20)
         .lineWidth(0.5).stroke("#EEEEEE");
    });

    // صفوف البيانات
    doc.font("Helvetica").fontSize(11);

    rows.forEach((item, i) => {
      const rowY = y + 8;

      const displayDate = formatDisplayDate(item.date);

      doc.fillColor("#000");
      doc.text(displayDate, col.date, rowY, { width: 60 });

      // Type مع كسر السطر
      const typeText = (item.fundsType || "-").replace(" transportation", "\ntransportation");
      doc.text(typeText, col.type, rowY - 3, { width: 75, lineBreak: true });

      doc.text(item.reason || "-", col.reason, rowY, { width: 90 });

      doc.text(item.from || "-", col.from, rowY, { width: 75, align: "center" });
      doc.text(item.to || "-", col.to, rowY, { width: 45, align: "center" });
      doc.text(item.kilometer != null ? item.kilometer.toString() : "0", col.km, rowY, { width: 40, align: "center" });

      // Cash In
      if (item.cashIn > 0) {
        doc.fillColor("#16A34A").font("Helvetica-Bold")
           .text(item.cashIn.toLocaleString(), col.cashIn, rowY, { width: 45, align: "right" });
      } else {
        doc.text("-", col.cashIn, rowY, { width: 45, align: "right" });
      }

      // Cash Out
      if (item.cashOut > 0) {
        doc.fillColor("#DC2626").font("Helvetica-Bold")
           .text(item.cashOut.toLocaleString(), col.cashOut, rowY, { width: 50, align: "right" });
      } else {
        doc.text("-", col.cashOut, rowY, { width: 50, align: "right" });
      }

      y += rowHeight;

      if (i < rows.length - 1) {
        doc.moveTo(40, y).lineTo(560, y).lineWidth(0.5).stroke("#EEEEEE");
      }
    });

    // ---------------- FOOTER ----------------
    doc.fontSize(10).fillColor("#777777")
       .text(`Generated ${timestamp}`, 40, y + 40);

    doc.end();
  } catch (err) {
    console.error("generateExpensePDF error:", err);
    callback(err);
  }
}

module.exports = generateExpensePDF;
