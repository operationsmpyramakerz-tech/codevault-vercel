const PDFDocument = require("pdfkit");
const path = require("path");

function generateExpensePDF({ userName, userId, items, dateFrom, dateTo }, callback) {
  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });

    // ---- STREAM ----
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => callback(null, Buffer.concat(buffers)));

    // ---- LOGO ----
    const logoPath = path.join(__dirname, "../public/images/logo.png");
    doc.image(logoPath, 40, 40, { width: 80 });

    // ---- HEADER TEXT ----
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("Expenses Report", 140, 40);

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");

    doc.fontSize(12).font("Helvetica");
    doc.text(`User Name: ${userName}`, 140, 75);
    doc.text(`User ID: ${userId}`, 140, 95);
    doc.text(`Type: All`, 140, 115);
    doc.text(`Date: ${timestamp}`, 140, 135);

    // ---- HEADER OUTLINE ----
    doc.roundedRect(30, 30, 540, 130, 12).stroke("#D9D9D9");

    // ---- DURATION ----
    doc.moveDown(3);
    doc.fontSize(14).font("Helvetica-Bold").text(`Duration:`, { continued: true });
    doc.font("Helvetica").text(
      `   From: ${dateFrom || "-"}     To: ${dateTo || "-"}`
    );

    // ---- SUMMARY DATA ----
    const totalIn = items.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = items.reduce((s, i) => s + (i.cashOut || 0), 0);
    const balance = totalIn - totalOut;

    doc.moveDown(1.5);

    // Summary boxes
    function summaryBox(x, title, value, color) {
      doc.roundedRect(x, doc.y, 160, 70, 12).stroke("#D9D9D9");

      doc.fontSize(11).font("Helvetica").fillColor("#555").text(title, x + 10, doc.y + 10);
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .fillColor(color)
        .text(value, x + 10, doc.y + 25);
      doc.fillColor("black");
    }

    const summaryStartY = doc.y;
    summaryBox(40, "Total Cash In", `${totalIn} EGP`, "#16A34A");
    summaryBox(220, "Total Cash Out", `${totalOut} EGP`, "#DC2626");
    summaryBox(400, "Final Balance", `${balance} EGP`, "#2563EB");

    doc.moveDown(5);

    // ---- TABLE HEADER ----
    doc.fontSize(13).font("Helvetica-Bold");
    doc.text("Date", 40);
    doc.text("Funds Type", 140);
    doc.text("Reason", 250);
    doc.text("Amount", 500);

    doc.moveTo(40, doc.y + 2).lineTo(550, doc.y + 2).stroke("#999");

    doc.moveDown(0.7);

    // ---- TABLE ROWS ----
    doc.font("Helvetica").fontSize(11);

    items.forEach((item) => {
      const amount = item.cashIn > 0 ? `+${item.cashIn}` : `-${item.cashOut}`;
      const amtColor = item.cashIn > 0 ? "#16A34A" : "#DC2626";

      doc.fillColor("#000");
      doc.text(item.date || "-", 40);
      doc.text(item.fundsType || "-", 140);
      doc.text(item.reason || "-", 250);

      doc.fillColor(amtColor).text(amount, 500);
      doc.fillColor("#000");

      doc.moveDown(0.3);
    });

    doc.end();
  } catch (err) {
    callback(err);
  }
}

module.exports = generateExpensePDF;
