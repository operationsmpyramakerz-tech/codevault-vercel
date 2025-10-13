// /api/logistics/mark-received.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_SECRET });

// CORS helpers (آمن لو احتجت تستدعيه من صفحات متعددة)
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // تأكيد توافر مفاتيح Notion
  if (!process.env.NOTION_SECRET) {
    return res.status(500).json({ ok: false, error: "Missing NOTION_SECRET" });
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  // نتوقع مصفوفة من pageIds (IDs لصفحات/صفوف Notion)
  const pageIds = Array.isArray(body?.pageIds) ? body.pageIds.filter(Boolean) : [];
  if (!pageIds.length) {
    return res.status(400).json({ ok: false, error: "pageIds[] is required" });
  }

  const STATUS_VALUE = "Received by operations"; // اسم القيمة داخل حقل Status (select)

  try {
    const results = [];
    for (const pid of pageIds) {
      const updated = await notion.pages.update({
        page_id: pid,
        properties: {
          // اسم العمود بالضبط كما ذكرت: Status (من نوع Select)
          Status: { select: { name: STATUS_VALUE } },
        },
      });
      results.push({ id: updated.id });
    }
    return res.status(200).json({ ok: true, updated: results.length, items: results });
  } catch (e) {
    // هيساعدك لو عاوز تشوف الخطأ في لوجز Vercel
    console.error("mark-received error:", e?.body || e?.message || e);
    return res.status(500).json({
      ok: false,
      error: "Notion update failed",
      details: e?.body || e?.message || String(e),
    });
  }
}

// ------- helpers -------
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw);
}