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
    } catch (err) {
      console.error("Logo failed:", err.message);
    }

    // ---------------- HEADER BOX & TITLE ----------------
    doc.roundedRect(30, 30, 540, 120, 14).stroke("#CFCFCF");
    doc.font("Helvetica-Bold").fontSize(22).text("Expenses Report", 160, 50);

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
    const leftX = 160, rightX = 380, row1Y = 100, row2Y = 122;

    doc.fontSize(12);
    doc.font("Helvetica-Bold").text("User Name ", leftX, row1Y, { continued: true }).font("Helvetica").text(userName || "-");
    doc.font("Helvetica-Bold").text("Type ",      rightX, row1Y, { continued: true }).font("Helvetica").text("All");
    doc.font("Helvetica-Bold").text("User ID ",   leftX, row2Y, { continued: true }).font("Helvetica").text(userId || "-");
    doc.font("Helvetica-Bold").text("Date ",      rightX, row2Y, { continued: true }).font("Helvetica").text(timestamp);

    // ---------------- DURATION ----------------
    function formatDisplayDate(dateStr) {
      if (!dateStr) return "-";
      if (/^\d{2} [A-Za-z]{3} \d{2}$/.test(dateStr)) return dateStr;
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d
        .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
        .replace(/ /g, " ");
    }

    let fromText = formatDisplayDate(dateFrom);
    let toText   = formatDisplayDate(dateTo);

    if ((!dateFrom || !dateTo) && rows.length > 0) {
      const dates = rows.map(r => r.date).filter(Boolean).sort();
      fromText = formatDisplayDate(dates[0]);
      toText   = formatDisplayDate(dates[dates.length - 1]);
    }

    const durationY = 170;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("Duration:", 40, durationY);

    doc.roundedRect(130, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.roundedRect(320, durationY - 5, 170, 30, 8).stroke("#CFCFCF");

    doc.font("Helvetica").fontSize(13).fillColor("#000").text(fromText, 140, durationY + 5);
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

    // ======================================================
    // ================   MODERN TABLE  ======================
    // ======================================================

    const tableTop    = summaryY + 120;
    const tableLeft   = 40;
    const tableWidth  = 520;
    const tableRight  = tableLeft + tableWidth;
    const headerHeight = 24;
    const rowHeight    = 20;

    // أعمدة أضيق شوية
    const col = {
      date:   tableLeft + 8,
      type:   tableLeft + 70,
      reason: tableLeft + 150,
      from:   tableLeft + 290,
      to:     tableLeft + 340,
      km:     tableLeft + 390,
      cashIn: tableLeft + 445,
      cashOut:tableLeft + 495,
    };

    let y = tableTop;

    // --- Header background ---
    doc.rect(tableLeft, y, tableWidth, headerHeight).fill("#F5F5F5");
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11);

    doc.text("Date",    col.date,   y + 6);
    doc.text("Type",    col.type,   y + 6);
    doc.text("Reason",  col.reason, y + 6);
    doc.text("From",    col.from,   y + 6);
    doc.text("To",      col.to,     y + 6);
    doc.text("KM",      col.km,     y + 6);
    doc.text("Cash in", col.cashIn, y + 6, { width: 40, align: "right" });
    doc.text("Cash out",col.cashOut,y + 6, { width: 40, align: "right" });

    // خط تحت الهيدر
    doc.moveTo(tableLeft, y + headerHeight)
       .lineTo(tableRight, y + headerHeight)
       .lineWidth(0.8)
       .stroke("#E5E7EB");

    y += headerHeight;

    // --- Rows ---
    doc.font("Helvetica").fontSize(10);

    rows.forEach((item, index) => {
      const rowY = y + 4;

      // تاريخ بشكل مختصر
      const displayDate = formatDisplayDate(item.date);

      // تاريخ
      doc.fillColor("#111827").text(displayDate || "-", col.date, rowY, { width: 60 });

      // Type
      const typeText = item.fundsType || "-";
      doc.text(typeText, col.type, rowY, { width: 70 });

      // Reason
      doc.text(item.reason || "-", col.reason, rowY, { width: 130 });

      // From / To / KM
      doc.text(item.from || "-", col.from, rowY, {
        width: 40,
        align: "center",
      });
      doc.text(item.to || "-", col.to, rowY, {
        width: 40,
        align: "center",
      });
      doc.text(
        item.kilometer != null ? item.kilometer.toString() : "-",
        col.km,
        rowY,
        { width: 40, align: "center" }
      );

      // Cash In (green)
      if (item.cashIn > 0) {
        doc.fillColor("#16A34A").font("Helvetica-Bold").text(
          item.cashIn.toLocaleString(),
          col.cashIn,
          rowY,
          { width: 45, align: "right" }
        );
      } else {
        doc.fillColor("#9CA3AF").font("Helvetica").text(
          "-",
          col.cashIn,
          rowY,
          { width: 45, align: "right" }
        );
      }

      // Cash Out (red)
      if (item.cashOut > 0) {
        doc.fillColor("#DC2626").font("Helvetica-Bold").text(
          item.cashOut.toLocaleString(),
          col.cashOut,
          rowY,
          { width: 45, align: "right" }
        );
      } else {
        doc.fillColor("#9CA3AF").font("Helvetica").text(
          "-",
          col.cashOut,
          rowY,
          { width: 45, align: "right" }
        );
      }

      // خط فاصل خفيف تحت كل صف
      y += rowHeight;
      if (index < rows.length - 1) {
        doc.moveTo(tableLeft, y)
           .lineTo(tableRight, y)
           .lineWidth(0.5)
           .stroke("#F1F5F9");
      }
    });

    // ---------------- FOOTER ----------------
    const footerY = y + 30;
    doc.fontSize(10).font("Helvetica").fillColor("#777777")
       .text(`Generated ${timestamp}`, 40, footerY);

    doc.end();
  } catch (err) {
    console.error("generateExpensePDF error:", err);
    callback(err);
  }
}

module.exports = generateExpensePDF;
