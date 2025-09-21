// CodeVault/api/[...all].js
// يـforward أي مسار /api/* على سيرفر الـ Express (server.js)

const app = require("../server.js");

// ملاحظة: بنسيب prefix /api زي ما هو عشان الـ Express routes عندنا بتبدأ بـ /api/
module.exports = (req, res) => {
  // لو جالك على /api/index/* هنشيل /api/index بس، والباقي هنسيبه
  if (req.url.startsWith("/api/index")) {
    req.url = req.url.replace(/^\/api\/index/, "") || "/";
  }
  return app(req, res);
};