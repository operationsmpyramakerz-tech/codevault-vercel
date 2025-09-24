// CodeVault/api/notion-check.js
// Standalone serverless function to test Notion connectivity for a specific DB.
// Usage: /api/notion-check?db=orders|stock|team|funds

const { Client } = require("@notionhq/client");

function pickEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim() !== "") return { name: n, value: v };
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const dbKey = (req.query && req.query.db) ? String(req.query.db) : "orders";
  const map = {
    orders: ["NOTION_DB_ORDERS_ID", "ORDERS_DB_ID", "REQUESTED_ORDERS_DB_ID", "Products_list", "Orders_DB", "Orders"],
    stock:  ["NOTION_DB_STOCK_ID",  "STOCK_DB_ID",  "School_Stocktaking_DB_ID", "Stock_DB", "Stock"],
    team:   ["NOTION_DB_TEAM_ID",   "TEAM_DB_ID",   "Team_Members"],
    funds:  ["NOTION_DB_FUNDS_ID",  "FUNDS_DB_ID",  "Funds"],
  };

  const token = pickEnv(["NOTION_API_KEY", "NOTION_TOKEN"]);
  if (!token) {
    res.status(200).end(JSON.stringify({ ok: false, error: "NO_NOTION_TOKEN" }));
    return;
  }
  const dbVar = map[dbKey];
  if (!dbVar) {
    res.status(200).end(JSON.stringify({ ok: false, error: "UNKNOWN_DB_KEY", keys: Object.keys(map) }));
    return;
  }
  const db = pickEnv(dbVar);
  if (!db) {
    res.status(200).end(JSON.stringify({ ok: false, error: "MISSING_DB_ID", tried: dbVar }));
    return;
  }

  try {
    const notion = new Client({ auth: token.value });
    const r = await notion.databases.query({ database_id: db.value, page_size: 1 });
    res.status(200).end(JSON.stringify({
      ok: true,
      token_var: token.name,
      db_var: db.name,
      results: Array.isArray(r.results) ? r.results.length : 0
    }));
  } catch (e) {
    res.status(200).end(JSON.stringify({
      ok: false,
      error: e && e.body ? e.body : (e && e.message ? e.message : String(e)),
    }));
  }
};
