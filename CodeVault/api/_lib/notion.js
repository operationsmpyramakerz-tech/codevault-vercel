// CodeVault/api/_lib/notion.js
// Small helper to unify env var names & Notion client usage on Vercel

const { Client } = require("@notionhq/client");

function firstNonEmpty(keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function getNotionToken() {
  // Accept several possible names to avoid mismatch
  return firstNonEmpty([
    "NOTION_API_KEY",
    "Notion_API_Key",
    "NOTION_TOKEN",
    "Notion_Token",
  ]);
}

function getDbId(kind) {
  const maps = {
    orders: ["ORDERS_DB_ID", "Products_list", "Products_Database"],
    stock: ["STOCK_DB_ID", "School_Stocktaking_DB_ID", "SCHOOL_STOCKTAKING_DB_ID"],
    team: ["TEAM_DB_ID", "Team_Members"],
    funds: ["FUNDS_DB_ID", "Funds"],
  };
  const keys = maps[kind] || [];
  return firstNonEmpty(keys);
}

function getNotionClient() {
  const token = getNotionToken();
  if (!token) return { client: null, token: null };
  return { client: new Client({ auth: token }), token };
}

function extractTitleFromProperties(properties) {
  // Try to find the first title property; fallback to any rich_text/plain_text
  for (const [name, prop] of Object.entries(properties || {})) {
    if (prop && prop.type === "title" && Array.isArray(prop.title)) {
      return prop.title.map(t => t.plain_text || "").join("").trim() || name;
    }
  }
  // fallback: first rich_text
  for (const [name, prop] of Object.entries(properties || {})) {
    if (prop && prop.type === "rich_text" && Array.isArray(prop.rich_text)) {
      return prop.rich_text.map(t => t.plain_text || "").join("").trim() || name;
    }
  }
  return "Untitled";
}

function mapBasic(page) {
  const title = extractTitleFromProperties(page.properties);
  return {
    id: page.id,
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    title,
    url: page.url,
  };
}

async function safeQueryDatabase(client, database_id, options = {}) {
  // Don't throw on Notion errors; return { ok:false, error }
  try {
    const res = await client.databases.query({
      database_id,
      page_size: options.page_size || 25,
      sorts: options.sorts,
      filter: options.filter,
    });
    return { ok: true, results: res.results || [] };
  } catch (err) {
    return {
      ok: false,
      error: err && err.body ? err.body : (err && err.message) || String(err),
    };
  }
}

module.exports = {
  firstNonEmpty,
  getNotionToken,
  getDbId,
  getNotionClient,
  extractTitleFromProperties,
  mapBasic,
  safeQueryDatabase,
};