// CodeVault/server.js
// Loads the Express app from ./index.js (CJS or ESM), caches it, and exposes
// an async loader for Vercel serverless. When run locally (node server.js),
// it will start listening on PORT.

let _cachedApp = null;

function extractApp(mod) {
  // Try common export styles: default export, named export "app", or the module itself
  const candidates = [mod, mod && mod.default, mod && mod.app, mod && mod.default && mod.default.app];
  for (const c of candidates) {
    if (typeof c === "function") return c; // Express app is a callable function (req, res, next)
  }
  return null;
}

async function loadFromIndex() {
  // Try CommonJS first
  try {
    const m = require("./index.js");
    const app = extractApp(m);
    if (app) return app;
  } catch (_) {
    // ignore and try ESM below
  }
  // Try ESM dynamic import
  try {
    const m = await import("./index.js");
    const app = extractApp(m);
    if (app) return app;
  } catch (err) {
    console.error("[server] Failed to import ./index.js as ESM:", err && err.message);
  }
  throw new Error("Express app was not exported from CodeVault/index.js (expected module.exports = app; أو export default app; أو export const app)");
}

async function loadApp() {
  if (_cachedApp) return _cachedApp;
  const app = await loadFromIndex();
  _cachedApp = app;
  return app;
}

// Local run: node server.js
if (require.main === module) {
  loadApp()
    .then((app) => {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`[server] Local server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("[server] Unable to start local server:", err);
      process.exit(1);
    });
}

// Vercel serverless will require('../../server.js') from api/index/[[...slug]].js
// and call this async loader to obtain the Express request handler.
module.exports = loadApp;
