// CodeVault/api/env.js
// Standalone serverless function (does NOT forward to Express)
// Shows which env vars are present (masked) and which names your code will use.

function pickEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim() !== "") return { name: n, value: v };
  }
  return null;
}

function mask(v) {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 6) return "*****";
  return s.slice(0, 3) + "****" + s.slice(-2);
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const token = pickEnv(["NOTION_API_KEY", "NOTION_TOKEN"]);

  const groups = {
    orders: ["NOTION_DB_ORDERS_ID", "ORDERS_DB_ID", "REQUESTED_ORDERS_DB_ID", "Products_list", "Orders_DB", "Orders"],
    stock:  ["NOTION_DB_STOCK_ID",  "STOCK_DB_ID",  "School_Stocktaking_DB_ID", "Stock_DB", "Stock"],
    team:   ["NOTION_DB_TEAM_ID",   "TEAM_DB_ID",   "Team_Members"],
    funds:  ["NOTION_DB_FUNDS_ID",  "FUNDS_DB_ID",  "Funds"]
  };

  const using = {};
  for (const [key, list] of Object.entries(groups)) {
    const found = pickEnv(list);
    if (found) using[key] = { var: found.name, value: mask(found.value) };
    else using[key] = { var: null, value: null };
  }

  res.status(200).end(JSON.stringify({
    ok: true,
    token_present: !!token,
    token_var: token ? token.name : null,
    token_value: token ? mask(token.value) : null,
    using,
    node: process.version,
    now: new Date().toISOString()
  }));
};
