// CodeVault/api/stock/list.js
// Route: /api/stock/list
const {
  getNotionClient,
  getDbId,
  mapBasic,
  safeQueryDatabase,
} = require("../_lib/notion.js");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { client, token } = getNotionClient();
  if (!token || !client) {
    res.status(200).json({ ok: false, error: "NO_NOTION_TOKEN" });
    return;
  }

  const dbId = getDbId("stock");
  if (!dbId) {
    res.status(200).json({ ok: false, error: "MISSING_DB_ID", db: "stock" });
    return;
  }

  const q = await safeQueryDatabase(client, dbId, { page_size: 50 });
  if (!q.ok) {
    res.status(200).json({ ok: false, error: q.error, db: "stock" });
    return;
  }

  const items = q.results.map(mapBasic);
  res.status(200).json({ ok: true, count: items.length, items });
};