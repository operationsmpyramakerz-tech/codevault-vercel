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
    } catch (err) { console.error("Logo failed:", err.message); }

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
      if (isNaN(d)) return dateStr;
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, " ");
    }

    let fromText = formatDisplayDate(dateFrom);
    let toText = formatDisplayDate(dateTo);
    if ((!dateFrom || !dateTo) && rows.length > 0) {
      const dates = rows.map(r => r.date).filter(Boolean).sort();
      fromText = formatDisplayDate(dates[0]);
      toText = formatDisplayDate(dates[dates.length - 1]);
    }

    const durationY = 170;
    doc.font("Helvetica-Bold").fontSize(14).text("Duration:", 40, durationY);
    doc.roundedRect(130, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.roundedRect(320, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.font("Helvetica").fontSize(13).text(fromText, 140, durationY + 5);
    doc.text(toText, 330, durationY + 5);

    // ---------------- SUMMARY BOXES ----------------
    const totalIn = rows.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = rows.reduce((s, i) => s + (i.cashOut || 0), 0);
    const balance = totalIn - totalOut;
    const summaryY = durationY + 50;

    doc.roundedRect(40, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash in", 50, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#16A34A").text(`${totalIn.toLocaleString()} EGP`, 50, summaryY + 38);

    doc.roundedRect(210, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash out", 220, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#DC2626").text(`${totalOut.toLocaleString()} EGP`, 220, summaryY + 38);

    doc.roundedRect(380, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Final Balance", 390, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#2563EB").text(`${balance.toLocaleString()} EGP`, 390, summaryY + 38);

    // ---------------- Total No. of entries ----------------
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000")
       .text(`Total No. of entries: ${rows.length}`, 40, summaryY + 90);

    // ---------------- TABLE START ----------------
    const tableTop = summaryY + 130;
    const rowHeight = 40;
    let currentY = tableTop;

    // Header Background
    doc.rect(40, currentY, 520, rowHeight).fill("#F5F5F5");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(12);

    // عمود جديد بدقة تامة زي الصورة
    const col = {
      date: 50,
      type: 115,
      reason: 200,
      fromToKmStart: 330,  // بداية المنطقة اللي فيها From / To / KM
      cashIn: 480,
      cashOut: 530
    };

    // Header Titles
    doc.text("Date", col.date, currentY + 14);
    doc.text("Type", col.type, currentY + 14);
    doc.text("Reason", col.reason, currentY + 14);
    doc.text("From", col.fromToKmStart, currentY + 14);
    doc.text("To", col.fromToKmStart + 85, currentY + 14);
    doc.text("KM", col.fromToKmStart + 145, currentY + 14);
    doc.text("Cash in", col.cashIn, currentY + 14, { align: "right" });
    doc.text("Cash out", col.cashOut, currentY + 14, { align: "right" });

    currentY += rowHeight;

    // خط أفقي تحت الهيدر
    doc.moveTo(40, currentY).lineTo(560, currentY).lineWidth(1).stroke("#DDDDDD");
    currentY += 10;

    // خطوط عمودية فاصلة بين الأعمدة
    const verticalLines = [col.type, col.reason, col.fromToKmStart, col.fromToKmStart + 80, col.fromToKmStart + 130, col.cashIn, col.cashOut];
    verticalLines.forEach(x => {
      doc.moveTo(x, tableTop).lineTo(x, currentY + rows.length * rowHeight + 20).lineWidth(0.5).stroke("#EEEEEE");
    });

    // الصفوف
    doc.font("Helvetica").fontSize(11);

    rows.forEach((item, i) => {
      const y = currentY + 8;

      const displayDate = formatDisplayDate(item.date);

      doc.fillColor("#000");
      doc.text(displayDate, col.date, y, { width: 60 });

      const typeText = (item.fundsType || "-").replace(" transportation", "\ntransportation");
      doc.text(typeText, col.type, y - 4, { width: 80, lineBreak: true });

      doc.text(item.reason || "-", col.reason, y, { width: 120, align: "left" });

      // From / To / KM في منطقة واحدة محاذاة لليمين والوسط
      const fromToKmText = `${item.from || "-"} ${item.to || ""} ${item.kilometer != null ? item.kilometer : ""}`;
      doc.text(item.from || "-", col.fromToKmStart, y, { width: 80, align: "center" });
      doc.text(item.to || "", col.fromToKmStart + 85, y, { width: 50, align: "center" });
      doc.text(item.kilometer != null ? item.kilometer.toString() : "0", col.fromToKmStart + 145, y, { width: 40, align: "center" });

      // Cash In (أخضر)
      if (item.cashIn > 0) {
        doc.fillColor("#16A34A").font("Helvetica-Bold")
           .text(item.cashIn.toLocaleString(), col.cashIn, y, { width: 50, align: "right" });
      } else {
        doc.fillColor("#000").text("-", col.cashIn, y, { width: 50, align: "right" });
      }

      // Cash Out (أحمر)
      if (item.cashOut > 0) {
        doc.fillColor("#DC2626").font("Helvetica-Bold")
           .text(item.cashOut.toLocaleString(), col.cashOut, y, { width: 50, align: "right" });
      } else {
        doc.fillColor("#000").text("-", col.cashOut, y, { width: 50, align: "right" });
      }

      currentY += rowHeight;

      // خط أفقي فاصل بين الصفوف
      if (i < rows.length - 1) {
        doc.moveTo(40, currentY).lineTo(560, currentY).lineWidth(0.5).stroke("#EEEEEE");
      }
    });

    // ---------------- FOOTER ----------------
    doc.fontSize(10).fillColor("#777777")
       .text(`Generated ${timestamp}`, 40, currentY + 40);

    doc.end();
  } catch (err) {
    console.error("generateExpensePDF error:", err);
    callback(err);
  }
}

module.exports = generateExpensePDF;
