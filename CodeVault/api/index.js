// CodeVault/api/index.js
// يربط سيرفرلس Vercel بتطبيق Express، ويشيل البادئة (/api/index أو /index)
// وكمان بيردّ على /health مباشرة لو التطبيق ماعرّفهاش.

const app = require("../server.js");

module.exports = (req, res) => {
  const original = req.url || "/";

  // لو بتطلب صحّة السيرفر، ردّ مباشرة بدون ما نعدّي على Express
  if (
    req.method === "GET" &&
    (original === "/health" ||
     original === "/index/health" ||
     original === "/api/index/health")
  ) {
    return res.status(200).json({ ok: true, via: "api/index.js" });
  }

  // شيل البادئة اللي Vercel بيحطّها جوّا الـ Function
  // بحيث Express يشوف /health بدل /api/index/health أو /index/health
  req.url = original.replace(/^\/(?:api\/)?index/, "") || "/";

  // مرِّر الطلب لتطبيق Express
  return app(req, res);
};
// تأكد من وجود راوت صحّة
app.get("/health", (req, res) => res.json({ ok: true }));

// في آخر الملف لازم يكون فيه:
module.exports = app;   // (لو مشروعك CommonJS)