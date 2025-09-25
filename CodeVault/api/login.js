// CodeVault/api/login.js
const { Client } = require("@notionhq/client");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("INVALID_JSON_BODY")); }
    });
    req.on("error", reject);
  });
}

function setSessionCookie(res, payload) {
  const value = encodeURIComponent(JSON.stringify(payload));
  const maxAge = 60 * 60 * 8; // 8h
  res.setHeader("Set-Cookie", `session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

module.exports = async (req, res) => {
  const guard = setTimeout(() => {
    if (!res.headersSent) {
      try { res.status(504).json({ ok: false, error: "TIMEOUT" }); } catch {}
    }
  }, 9000);

  try {
    if (req.method !== "POST") {
      clearTimeout(guard);
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const NOTION_API_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
    const TEAM_DB_ID = process.env.TEAM_DB_ID || process.env.Team_Members;

    if (!NOTION_API_KEY) { clearTimeout(guard); return res.status(500).json({ ok: false, error: "NO_NOTION_TOKEN" }); }
    if (!TEAM_DB_ID) { clearTimeout(guard); return res.status(500).json({ ok: false, error: "NO_TEAM_DB_ID" }); }

    const { username, password } = await readJsonBody(req);
    if (!username) { clearTimeout(guard); return res.status(400).json({ ok: false, error: "MISSING_USERNAME" }); }

    const notion = new Client({ auth: NOTION_API_KEY });

    let results;
    try {
      results = await notion.databases.query({
        database_id: TEAM_DB_ID,
        filter: {
          or: [
            { property: "username", rich_text: { equals: String(username) } },
            { property: "Username", rich_text: { equals: String(username) } },
            { property: "Name", title: { equals: String(username) } },
          ],
        },
        page_size: 1,
      });
    } catch (e) {
      clearTimeout(guard);
      return res.status(500).json({ ok: false, error: "NOTION_QUERY_FAILED", details: String(e.message || e) });
    }

    if (!results?.results?.length) {
      clearTimeout(guard);
      return res.status(401).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const page = results.results[0];
    const props = page.properties || {};
    const pin =
      (props.pin && props.pin.rich_text?.map((t) => t.plain_text).join("")) ||
      (props.password && props.password.rich_text?.map((t) => t.plain_text).join(""));

    if (pin && password && String(pin) != String(password)) {
      clearTimeout(guard);
      return res.status(401).json({ ok: false, error: "BAD_CREDENTIALS" });
    }

    setSessionCookie(res, { u: username, at: Date.now() });
    clearTimeout(guard);
    return res.status(200).json({ ok: true });
  } catch (err) {
    clearTimeout(guard);
    console.error("Login error:", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "LOGIN_ERROR", details: String(err.message or err) });
    }
  }
};
