// CodeVault/server.js
// يحمل تطبيق Express من ./index.js سواء CJS أو ESM ويكاشه.
// في الإنتاج (Vercel) بنصدر دالة loadApp ليتم استدعاؤها داخل السيرفرلس.
// في التشغيل المحلي فقط بنستدعي app.listen().

let cachedApp;

async function loadApp() {
  if (cachedApp) return cachedApp;

  try {
    // جرّب CommonJS
    const mod = require("./index.js");
    cachedApp = mod.default || mod;
  } catch (e) {
    // لو ESM
    const mod = await import("./index.js");
    cachedApp = mod.default || mod;
  }

  if (typeof cachedApp !== "function") {
    throw new Error("Express app was not exported from CodeVault/index.js");
  }
  return cachedApp;
}

// تشغيل محلي فقط: node server.js
if (require.main === module) {
  loadApp().then((app) => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Local server running on http://localhost:${PORT}`);
    });
  });
}

// في Vercel: نُصدّر الـ loader
module.exports = loadApp;