const PDFDocument = require("pdfkit");
const path = require("path");

function generateExpensePDF({ userName, userId, items, dateFrom, dateTo }, callback) {
  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });

    // Collect PDF buffer
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => callback(null, Buffer.concat(buffers)));

    // ---------------- LOGO ----------------
    const logoPath = path.join(__dirname, "../public/images/logo.png");
    doc.image(logoPath, 45, 45, { width: 95 });

    // ---------------- HEADER BOX ----------------
    doc.roundedRect(30, 30, 540, 150, 14).stroke("#CFCFCF");

    // ---------------- HEADER TITLE ----------------
    doc.font("Helvetica-Bold").fontSize(22).text("Expenses Report", 160, 50);

    // ---------------- HEADER INFO ----------------
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");

    doc.font("Helvetica").fontSize(12);
    doc.text(`User Name: ${userName}`, 160, 88);
    doc.text(`User ID: ${userId}`, 160, 108);
    doc.text(`Type: All`, 160, 128);
    doc.text(`Date: ${timestamp}`, 160, 148);

    // ---------------- DURATION ----------------
    doc.moveDown(4);
    doc.font("Helvetica-Bold").fontSize(14).text("Duration:", { continued: true });
    doc.font("Helvetica").text(`   From / ${dateFrom || "-"}   To / ${dateTo || "-"}`);

    // ---------------- SUMMARY BOXES ----------------
    const totalIn = items.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = items.reduce((s, i) => s + (i.cashOut || 0), 0);
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

    doc.moveTo(40, doc.y + 2).lineTo(560, doc.y + 2).stroke("#999");

    doc.moveDown(0.8);

    // ---------------- TABLE ROWS ----------------
    doc.font("Helvetica").fontSize(11);

    items.forEach((it) => {
      // **Arabic text right-aligned**
      const reason = it.reason || "-";
      const from = it.from || "-";
      const to = it.to || "-";

      // Text columns
      doc.fillColor("#000");
      doc.text(it.date || "-", col.date);
      doc.text(it.fundsType || "-", col.type);

      // Reason RIGHT aligned
      doc.text(reason, col.reason, { width: 110, align: "right" });

      // From / To
      doc.text(from, col.from, { width: 60, align: "right" });
      doc.text(to, col.to, { width: 60, align: "right" });

      // KM
      doc.text(it.kilometer || "-", col.km, { width: 40, align: "right" });

      // Cash In color
      if (it.cashIn > 0) {
        doc.fillColor("#16A34A").text(it.cashIn.toString(), col.cashIn, { width: 40, align: "right" });
      } else {
        doc.fillColor("#000").text("-", col.cashIn, { width: 40, align: "right" });
      }

      // Cash Out color
      if (it.cashOut > 0) {
        doc.fillColor("#DC2626").text(it.cashOut.toString(), col.cashOut, { width: 40, align: "right" });
      } else {
        doc.fillColor("#000").text("-", col.cashOut, { width: 40, align: "right" });
      }

      doc.fillColor("#000");
      doc.moveDown(0.6);
    });

    // ---------------- FOOTER ----------------
    doc.moveDown(1.5);
    doc.fontSize(10).font("Helvetica").fillColor("#777");
    doc.text(`Generated ${timestamp}`, 40);

    doc.end();
  } catch (err) {
    callback(err);
  }
}

module.exports = generateExpensePDF;
