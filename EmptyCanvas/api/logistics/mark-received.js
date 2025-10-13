// File: /api/logistics/mark-received.js
import { Client } from "@notionhq/client";

/**
 * Env required:
 *  - NOTION_TOKEN  -> Internal Integration token (must have access to the DB/pages)
 *
 * Body JSON:
 *  { "pageId": "<notion_page_id>" }
 *  or { "rowId": "<notion_page_id>" }
 *  or { "id": "<notion_page_id>" }
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const notion = new Client({ auth: process.env.NOTION_TOKEN });
    const body = await readJson(req);
    const pageId = body.pageId || body.rowId || body.id;
    if (!pageId) {
      return res.status(400).json({ ok: false, error: "Missing pageId/rowId" });
    }

    // اسم عمود الـ Select ثابت هنا حسب طلبك
    const statusProp = "Status";
    const targetValue = "Received by operations";

    await notion.pages.update({
      page_id: pageId,
      properties: {
        [statusProp]: { select: { name: targetValue } },
      },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("mark-received error:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "Update failed. Check NOTION_TOKEN permissions.",
      detail: err?.message || String(err),
    });
  }
}

// --- helpers ---
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}