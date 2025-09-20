// CodeVault/api/index.js
// يربط Vercel Serverless Function بتطبيق Express ويشيل بادئة /api/index من المسار
const app = require("../server.js");

module.exports = (req, res) => {
  // خلي Express يشوف /health بدل /api/index/health
  req.url = req.url.replace(/^\/api\/index/, "") || "/";
  return app(req, res);
};