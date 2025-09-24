// CodeVault/api/env.js
// Diagnostics endpoint to report which ENV vars are present (masked)
// Works on Vercel serverless (CommonJS)
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
  try {
    const token = pickEnv(TOKEN_CANDIDATES);

    const using = {};
    for (const key of Object.keys(DB_CANDIDATES)) {
      const picked = pickEnv(DB_CANDIDATES[key]);
      using[key] = { var: picked.name, value: mask(picked.value) };
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      token_present: !!token.value,
      token_var: token.name,
      token_value: mask(token.value),
      using,
      node: process.version,
      now: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && (e.message || e.toString()) });
  }
};