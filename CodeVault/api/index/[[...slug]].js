// CodeVault/api/index/[[...slug]].js
const loadApp = require("../../server.js");

module.exports = async (req, res) => {
  const original = req.url || "/";

  // ردّ صحّة سريع (لو عايز تتأكد بدون دخول التطبيق)
  if (req.method === "GET" && /\/api\/index\/health\/?$/.test(original)) {
    return res.status(200).json({ ok: true, via: "api/index/[[...slug]].js" });
  }

  // خلي Express يشوف /health بدل /api/index/health
  req.url = original.replace(/^\/api\/index/, "") || "/";

  try {
    const app = await loadApp();   // يدعم CJS/ESM
    return app(req, res);
  } catch (err) {
    console.error("Failed to load Express app:", err);
    return res.status(500).json({ ok: false, error: "APP_LOAD_FAILED" });
  }
};