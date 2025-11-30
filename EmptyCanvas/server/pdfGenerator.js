const PDFDocument = require("pdfkit");
const path = require("path");

function generateExpensePDF({ userName, userId, items, dateFrom, dateTo }, callback) {
  const rows = Array.isArray(items) ? items : [];

  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => callback(null, Buffer.concat(buffers)));
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
    }

    // ---------------- HEADER BOX ----------------
    doc.roundedRect(30, 30, 540, 120, 14).stroke("#CFCFCF");

    // ---------------- HEADER TITLE ----------------
    doc.font("Helvetica-Bold").fontSize(22).text("Expenses Report", 160, 50);

    // ---------------- HEADER INFO ----------------
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");

    const leftX = 160;
    const rightX = 380;
    const row1Y = 100;
    const row2Y = 122;

    doc.fontSize(12);
    doc.font("Helvetica-Bold").text("User Name ", leftX, row1Y, { continued: true });
    doc.font("Helvetica").text(userName || "-");

    doc.font("Helvetica-Bold").text("Type ", rightX, row1Y, { continued: true });
    doc.font("Helvetica").text("All");

    doc.font("Helvetica-Bold").text("User ID ", leftX, row2Y, { continued: true });
    doc.font("Helvetica").text(userId || "-");

    doc.font("Helvetica-Bold").text("Date ", rightX, row2Y, { continued: true });
    doc.font("Helvetica").text(timestamp);

    // ---------------- DURATION (نفس الشكل في الصورة) ----------------
    function formatDisplayDate(dateStr) {
      if (!dateStr) return "-";
      // إذا كان الشكل بالفعل زي "09 Nov 25" نرجعه كما هو
      if (/^\d{2} [A-Za-z]{3} \d{2}$/.test(dateStr)) return dateStr;
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, " ");
    }

    let fromText = formatDisplayDate(dateFrom);
    let toText = formatDisplayDate(dateTo);

    if ((!dateFrom || !dateTo) && rows.length > 0) {
      const dates = rows.map(r => r.date).filter(Boolean);
      if (dates.length > 0) {
        const sorted = dates.sort((a, b) => new Date(a) - new Date(b));
        fromText = formatDisplayDate(sorted[0]);
        toText = formatDisplayDate(sorted[sorted.length - 1]);
      }
    }

    const durationY = 170;
    doc.font("Helvetica-Bold").fontSize(14).text("Duration:", 40, durationY);

    doc.roundedRect(130, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.roundedRect(320, durationY - 5, 170, 30, 8).stroke("#CFCFCF");

    doc.font("Helvetica").fontSize(13);
    doc.text(fromText, 140, durationY + 5);
    doc.text(toText, 330, durationY + 5);

    // ---------------- SUMMARY BOXES (نفس الشكل والألوان في الصورة) ----------------
    const totalIn = rows.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = rows.reduce((s, i) => s + (i.cashOut || 0), 0);
    const balance = totalIn - totalOut;

    const summaryY = durationY + 50;

    // Total Cash in
    doc.roundedRect(40, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash in", 50, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#16A34A").text(`${totalIn.toLocaleString()} EGP`, 50, summaryY + 38);

    // Total Cash out
    doc.roundedRect(210, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash out", 220, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#DC2626").text(`${totalOut.toLocaleString()} EGP`, 220, summaryY + 38);

    // Final Balance
    doc.roundedRect(380, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Final Balance", 390, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#2563EB").text(`${balance.toLocaleString()} EGP`, 390, summaryY + 38);

    // ---------------- Total No. of entries ----------------
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000").text(`Total No. of entries: ${rows.length}`, 40, summaryY + 90);

    // ---------------- TABLE (بالضبط زي الصورة) ----------------
    const tableTop = summaryY + 130;
    const rowHeight = 35;
    let y = tableTop;

    // Header خلفية رمادية فاتحة
    doc.rect(40, y, 520, rowHeight).fill("#F5F5F5");
    doc.fillColor("#000");

    // عناوين الأعمدة
    doc.font("Helvetica-Bold").fontSize(12);

    const cols = {
      date: 50,
      type: 120,
      reason: 200,
      from: 300,
      to: 370,
      km: 430,
      cashIn: 480,
      cashOut: 530
    };

    doc.text("Date", cols.date, y + 12);
    doc.text("Type", cols.type, y + 12);
    doc.text("Reason", cols.reason, y + 12);
    doc.text("From", cols.from, y + 12, { align: "center" });
    doc.text("To", cols.to, y + 12, { align: "center" });
    doc.text("KM", cols.km, y + 12, { align: "center" });
    doc.text("Cash in", cols.cashIn, y + 12, { align: "right" });
    doc.text("Cash out", cols.cashOut, y + 12, { align: "right" });

    y += rowHeight;

    // خط تحت الهيدر
    doc.moveTo(40, y).lineTo(560, y).lineWidth(1).stroke("#DDDDDD");
    y += 8;

    // الصفوف
    doc.font("Helvetica").fontSize(11);

    rows.forEach((item, i) => {
      const rowY = y;

      // تاريخ بنفس الفورمات الموجود في الصورة
      const displayDate = formatDisplayDate(item.date);

      doc.fillColor("#000");
      doc.text(displayDate, cols.date, rowY + 8, { width: 60 });

      doc.text(item.fundsType || "-", cols.type, rowY + 8, { width: 70 });

      // Reason يمين
      doc.text(item.reason || "-", cols.reason, rowY + 8, { width: 90, align: "right" });

      // From و To في المنتصف
      doc.text(item.from || "", cols.from, rowY + 8, { width: 60, align: "center" });
      doc.text(item.to || "", cols.to, rowY + 8, { width: 50, align: "center" });

      // KM
      doc.text(item.kilometer != null ? item.kilometer.toString() : "-", cols.km, rowY + 8, { width: 40, align: "center" });

      // Cash In أخضر
      if (item.cashIn > 0) {
        doc.fillColor("#16A34A").font("Helvetica-Bold")
           .text(item.cashIn.toLocaleString(), cols.cashIn, rowY + 8, { width: 70, align: "right" });
      } else {
        doc.fillColor("#000").text("-", cols.cashIn, rowY + 8, { width: 70, align: "right" });
      }

      // Cash Out أحمر
      if (item.cashOut > 0) {
        doc.fillColor("#DC2626").font("Helvetica-Bold")
           .text(item.cashOut.toLocaleString(), cols.cashOut, rowY + 8, { width: 50, align: "right" });
      } else {
        doc.fillColor("#000").text("-", cols.cashOut, rowY + 8, { width: 50, align: "right" });
      }

      // خط فاصل بين الصفوف (خفيف)
      y += rowHeight;
      if (i < rows.length - 1) {
        doc.moveTo(40, y).lineTo(560, y).lineWidth(0.5).stroke("#EEEEEE");
      }
    });

    // ---------------- FOOTER ----------------
    const finalY = y + 40;
    doc.fontSize(10).fillColor("#777777")
       .text(`Generated ${timestamp}`, 40, finalY);

    doc.end();
  } catch (err) {
    console.error("generateExpensePDF error:", err);
    callback(err);
  }
}

module.exports = generateExpensePDF;
