// CodeVault/api/orders/current.js
// Route: /api/orders/current
const {
  getNotionClient,
  getDbId,
  mapBasic,
  safeQueryDatabase,
} = require("../_lib/notion.js");

module.exports = async (req, res) => {
  // Handle preflight on Vercel quickly
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { client, token } = getNotionClient();
  if (!token || !client) {
    res.status(200).json({ ok: false, error: "NO_NOTION_TOKEN" });
    return;
  }

  const dbId = getDbId("orders");
  if (!dbId) {
    res.status(200).json({ ok: false, error: "MISSING_DB_ID", db: "orders" });
    return;
  }

  // Keep it generic (no filter) to match any schema
  const q = await safeQueryDatabase(client, dbId, {
    page_size: 25,
  });

  if (!q.ok) {
    res.status(200).json({ ok: false, error: q.error, db: "orders" });
    return;
  }

  const items = q.results.map(mapBasic);
  res.status(200).json({ ok: true, count: items.length, items });
};