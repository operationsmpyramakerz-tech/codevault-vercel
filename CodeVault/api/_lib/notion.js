
const { Client } = require("@notionhq/client");

function pickEnv(...names) {
  for (const n of names) {
    if (process.env[n] && String(process.env[n]).trim() !== "") return process.env[n];
  }
  return null;
}

function pickEnvName(...names) {
  for (const n of names) {
    if (process.env[n] && String(process.env[n]).trim() !== "") return n;
  }
  return null;
}

function getEnvIds() {
  return {
    notionToken: pickEnv("NOTION_API_KEY", "Notion_API_Key", "NOTION_TOKEN"),
    ordersDB: pickEnv("ORDERS_DB_ID", "Products_list", "Products_Database"),
    stockDB:  pickEnv("STOCK_DB_ID", "School_Stocktaking_DB_ID", "SCHOOL_STOCKTAKING_DB_ID"),
    teamDB:   pickEnv("TEAM_DB_ID", "Team_Members"),
    fundsDB:  pickEnv("FUNDS_DB_ID", "Funds"),
  };
}

async function fetchDatabase(dbId, { pageSize = 50 } = {}) {
  const token = getEnvIds().notionToken;
  if (!token) {
    const e = new Error("NO_NOTION_TOKEN");
    e.code = "NO_NOTION_TOKEN";
    throw e;
  }
  const client = new Client({ auth: token });
  const resp = await client.databases.query({
    database_id: dbId,
    page_size: pageSize,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  const items = (resp.results || []).map((r) => ({
    id: r.id,
    created_time: r.created_time,
    last_edited_time: r.last_edited_time,
    title: extractTitle(r),
    url: r.url,
  }));
  return items;
}

function extractTitle(page) {
  const props = page.properties || {"Name": null};
  const candidates = ["Name", "Title", "Reason", "Item", "Product"];
  for (const key of candidates) {
    const prop = props[key];
    if (prop && Array.isArray(prop.title)) {
      const txt = prop.title.map((t) => t.plain_text).join("").trim();
      if (txt) return txt;
    }
    if (prop && Array.isArray(prop.rich_text)) {
      const txt = prop.rich_text.map((t) => t.plain_text).join("").trim();
      if (txt) return txt;
    }
    if (prop && typeof prop.name === "string" && prop.name.trim()) return prop.name.trim();
  }
  return page.id.slice(-6);
}

module.exports = {
  pickEnv,
  pickEnvName,
  getEnvIds,
  fetchDatabase,
};
