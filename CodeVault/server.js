// CodeVault/server.js
// ✅ جاهز لـ Vercel: من غير app.listen() في الإنتاج،
// ويشتغل محليًا لو شغّلته يدويًا بـ `node server.js`.

const app = require("./index.js");

// تشغيل محلي فقط
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Local server running on http://localhost:${PORT}`);
  });
}

// على Vercel بنصدّر الـ app كـ handler
module.exports = app;