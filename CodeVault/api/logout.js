// CodeVault/api/logout.js
// Forward /api/logout to the Express app (load on demand)
const loadApp = require("../server.js");

module.exports = async (req, res) => {
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (err) {
    console.error("API logout handler failed to load app:", err);
    res.status(500).json({ ok: false, error: "APP_LOAD_FAILED" });
  }
};
