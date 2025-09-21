// CodeVault/api/index/[[...slug]].js
// يمسك كل المسارات تحت /api/index/* ويحوّلها لتطبيق Express.
// وكمان يرد مباشرة على /api/index/health لو تطبيقك مش مٌعرّف /health.

const app = require("../../server.js");

module.exports = (req, res) => {
  const original = req.url || "/";

  // ردّ صحّة سريع بدون دخول Express (احتياطيًا)
  if (req.method === "GET" && /\/api\/index\/health\/?$/.test(original)) {
    return res.status(200).json({ ok: true, via: "api/index/[[...slug]].js" });
  }

  // اشطب بادئة /api/index عشان Express يشوف /health
  req.url = original.replace(/^\/api\/index/, "") || "/";

  return app(req, res);
};