// CodeVault/api/notion-check.js
// Minimal live connectivity test against Notion for a given DB (orders/stock/team/funds)
const { Client } = require("@notionhq/client");

function pickEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return { name: n, value: String(v) };
  }
  return { name: null, value: null };
}
function mask(val) {
  if (!val) return null;
  const s = String(val);
  if (s.length <= 5) return s[0] + "***";
  return s.slice(0, 3) + "***" + s.slice(-2);
}

const TOKEN_CANDIDATES = ["Notion_API_Key", "NOTION_API_KEY", "NOTION_TOKEN", "Notion_Token"];
const DB_CANDIDATES = {
  orders: ["ORDERS_DB_ID", "Products_list", "Products_Database"],
  stock:  ["STOCK_DB_ID", "School_Stocktaking_DB_ID"],
  team:   ["TEAM_DB_ID", "Team_Members"],
  funds:  ["FUNDS_DB_ID", "Funds"],
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const dbName = (req.query && (req.query.db || req.query.type)) ? String(req.query.db || req.query.type).toLowerCase() : "orders";
    if (!Object.keys(DB_CANDIDATES).includes(dbName)) {
      return res.status(400).json({ ok: false, error: "INVALID_DB", allowed: Object.keys(DB_CANDIDATES) });
    }

    const token = pickEnv(TOKEN_CANDIDATES);
    if (!token.value) {
      return res.status(200).json({ ok: false, error: "NO_NOTION_TOKEN" });
    }

    const dbPicked = pickEnv(DB_CANDIDATES[dbName]);
    if (!dbPicked.value) {
      return res.status(200).json({ ok: false, error: "MISSING_DB_ID", db: dbName, vars_tried: DB_CANDIDATES[dbName] });
    }

    const notion = new Client({ auth: token.value });

    // Try a quick metadata fetch first (cheaper)
    let meta = null;
    try {
      meta = await notion.databases.retrieve({ database_id: dbPicked.value });
    } catch (e) {
      // ignore, will be covered by query call below
    }

    // Then a single-page query to assert permissions/connectivity
    const q = await notion.databases.query({
      database_id: dbPicked.value,
      page_size: 1,
    });

    const title =
      (meta && meta.title && Array.isArray(meta.title) && meta.title[0] && (meta.title[0].plain_text || meta.title[0].text?.content)) ||
      null;

    return res.status(200).json({
      ok: true,
      db: dbName,
      used_var: dbPicked.name,
      db_id_masked: mask(dbPicked.value),
      token_var: token.name,
      result: q && q.results ? q.results.length : 0,
      title,
    });
  } catch (e) {
    const body = e && e.body ? e.body : null;
    return res.status(200).json({
      ok: false,
      error: body && body.message ? body.message : (e.message || String(e)),
      code: body && body.code ? body.code : undefined,
      status: e.status,
    });
  }
};