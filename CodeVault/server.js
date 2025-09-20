// CodeVault/server.js
// ✅ جاهز لـ Vercel: من غير app.listen()، ويشتغل محليًا لو شغّلته يدويًا.

const app = require("./index.js");

// لو بتشغّله محليًا: node server.js
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Local server running on http://localhost:${PORT}`);
  });
}

// على Vercel: نُصدّر الـ app كـ handler بلا استماع على بورت
module.exports = app;