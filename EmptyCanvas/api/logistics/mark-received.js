// EmptyCanvas/api/logistics/mark-received.js
// PATCH Notion pages: set Status => "Received by operations"

export const config = { runtime: "edge" }; // يمشي على Vercel Edge

const NOTION_TOKEN = process.env.NOTION_SECRET; // لازم يكون متضبط في Vercel
const NOTION_VERSION = "2022-06-28";
const STATUS_VALUE = "Received by operations";

async function readJson(req) {
  try {
    const txt = await req.text();
    return txt ? JSON.parse(txt) : {};
  } catch (e) {
    return {};
  }
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 });
  }
  if (!NOTION_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "NOTION_SECRET is missing" }), { status: 500 });
  }

  const body = await readJson(req);
  // نقبل إما pageIds أو itemIds ونجرب نستنتج الأفضل
  let pageIds = Array.isArray(body.pageIds) ? body.pageIds : [];
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds : [];

  // fallback: لو حد بعت itemIds فقط، جرّب نستخدمها كـ pageIds
  if (!pageIds.length && itemIds.length) pageIds = itemIds;

  // تنظيف وتحويل لسلاسل
  pageIds = pageIds.map((x) => String(x || "").trim()).filter(Boolean);

  if (!pageIds.length) {
    return new Response(JSON.stringify({ ok: false, error: "No pageIds provided" }), { status: 400 });
  }

  const results = await Promise.allSettled(
    pageIds.map((pid) =>
      fetch(`https://api.notion.com/v1/pages/${encodeURIComponent(pid)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: {
            Status: {
              select: { name: STATUS_VALUE } // لازم تبقى نفس الاسم حرفيًا
            }
          }
        })
      }).then(async (r) => {
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`Notion ${r.status}: ${t}`);
        }
        return pid;
      })
    )
  );

  const updated = [];
  const failed = [];
  for (const [i, r] of results.entries()) {
    if (r.status === "fulfilled") updated.push(r.value);
    else failed.push({ pageId: pageIds[i], error: r.reason?.message || String(r.reason) });
  }

  const ok = failed.length === 0;
  const resp = { ok, updated: updated.length, failed, details: failed };
  return new Response(JSON.stringify(resp), { status: ok ? 200 : 207 });
}