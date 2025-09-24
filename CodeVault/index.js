
// CodeVault/index.js (cleaned and validated)
// Express app for Vercel/Node and local use via server.js
const express = require("express");
const path = require("path");
const cookieSession = require("cookie-session");
const PDFDocument = require("pdfkit");
const { Client } = require("@notionhq/client");

/* -------------------- Setup -------------------- */
const app = express();

// JSON / forms / static
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Sessions
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "dev-secret-key"],
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
);
// add req.session.destroy(cb) for compatibility
app.use((req, _res, next) => {
  if (req.session && typeof req.session.destroy !== "function") {
    req.session.destroy = (cb) => {
      req.session = null;
      if (typeof cb === "function") cb();
    };
  }
  next();
});

// Notion
const notion = new Client({ auth: process.env.Notion_API_Key });
const componentsDatabaseId   = process.env.Products_Database;
const ordersDatabaseId       = process.env.Products_list;
const teamMembersDatabaseId  = process.env.Team_Members;
const stocktakingDatabaseId  = process.env.School_Stocktaking_DB_ID;
const fundsDatabaseId        = process.env.Funds;

/* -------------------- Helpers -------------------- */
const normKey = (s='') => String(s).toLowerCase().replace(/[\s_]+/g, '');

async function getOrdersDBProps() {
  if (!ordersDatabaseId) return {};
  const db = await notion.databases.retrieve({ database_id: ordersDatabaseId });
  return db?.properties || {};
}
function pickPropName(props, candidates) {
  const keys = Object.keys(props || {});
  for (const cand of candidates) {
    const nk = normKey(cand);
    const hit = keys.find(k => normKey(k) === nk);
    if (hit) return hit;
  }
  return null;
}
async function detectAssignedPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Assigned To","assigned to","Assigned_to","AssignedTo","ِAssigned To"
    ]) || "Assigned To"
  );
}
async function detectAvailableQtyPropName() {
  const props = await getOrdersDBProps();
  return pickPropName(props, [
    "Available Quantity","available quantity","Available_Quantity","Available"
  ]);
}
async function detectStatusPropName() {
  const props = await getOrdersDBProps();
  return pickPropName(props, ["Status","status"]);
}
async function detectOrderIdPropName() {
  const props = await getOrdersDBProps();
  return pickPropName(props, [
    "Order ID","Order Code","Order Group","Batch ID","OrderId","Order_Code"
  ]);
}
async function getCurrentUserPageId(username) {
  if (!username || !teamMembersDatabaseId) return null;
  const resp = await notion.databases.query({
    database_id: teamMembersDatabaseId,
    filter: { property: "Name", title: { equals: username } }
  });
  if (!resp.results || resp.results.length === 0) return null;
  return resp.results[0].id;
}

// permissions middlewares (lightweight: just pass if logged in)
function requireAuth(req, res, next) {
  if (req.session && req.session.username) return next();
  res.status(401).json({ error: "Unauthorized" });
}
function requirePage(_pageName) {
  return (_req, _res, next) => next();
}

/* -------------------- Health & Session -------------------- */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, route: "/api/health" });
});

app.get("/api/whoami", (req, res) => {
  res.json({
    loggedIn: Boolean(req.session?.username),
    username: req.session?.username || null
  });
});

/* -------------------- Login / Logout -------------------- */
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Missing username or password" });
    }
    if (!teamMembersDatabaseId) {
      return res.status(500).json({ error: "Team_Members DB not configured" });
    }

    const resp = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: String(username) } }
    });
    if (!resp.results || resp.results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = resp.results[0];
    const passProp = user.properties?.Password;
    const passVal = typeof passProp?.number === "number" ? passProp.number : null;
    const ok = String(passVal) === String(password);

    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // login ok
    req.session.username = String(username);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true });
  } catch (err) {
    console.error("Login error:", err.body || err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy?.(() => res.json({ success: true }));
});

/* -------------------- Components (Create New Order) -------------------- */
app.get(
  "/api/components",
  requireAuth,
  requirePage("Create New Order"),
  async (_req, res) => {
    try {
      if (!componentsDatabaseId) {
        return res.status(500).json({ error: "Products_Database not configured" });
      }
      const all = [];
      let start = undefined;
      let hasMore = true;
      while (hasMore) {
        const r = await notion.databases.query({
          database_id: componentsDatabaseId,
          start_cursor: start,
          sorts: [{ property: "Name", direction: "ascending" }]
        });
        for (const page of r.results) {
          const name = page.properties?.Name?.title?.[0]?.plain_text;
          const url  = page.properties?.URL?.url || null;
          if (name) all.push({ id: page.id, name, url });
        }
        hasMore = r.has_more;
        start = r.next_cursor;
      }
      res.json(all);
    } catch (e) {
      console.error("components:", e.body || e);
      res.status(500).json({ error: "Failed to fetch components" });
    }
  }
);

/* -------------------- Submit Order -------------------- */
app.post(
  "/api/submit-order",
  requireAuth,
  requirePage("Create New Order"),
  async (req, res) => {
    try {
      if (!ordersDatabaseId || !teamMembersDatabaseId) {
        return res.status(500).json({ success: false, message: "DB IDs not configured" });
      }
      let { reason, products } = req.body || {};
      if (!reason || !Array.isArray(products) || products.length === 0) {
        const d = req.session.orderDraft;
        if (d && d.reason && Array.isArray(d.products) && d.products.length) {
          reason = d.reason; products = d.products;
        }
      }
      if (!reason || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ success: false, message: "Missing reason or products" });
      }

      const userQ = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } }
      });
      if (!userQ.results.length) return res.status(404).json({ error: "User not found" });
      const userId = userQ.results[0].id;

      const creations = await Promise.all(
        products.map(async (p) => {
          const created = await notion.pages.create({
            parent: { database_id: ordersDatabaseId },
            properties: {
              Reason: { title: [{ text: { content: String(reason) } }] },
              "Quantity Requested": { number: Number(p.quantity || 0) },
              Product: { relation: [{ id: p.id }] },
              Status: { select: { name: "Pending" } },
              "Teams Members": { relation: [{ id: userId }] }
            }
          });
          // fetch product name (optional)
          let productName = "Unknown Product";
          try {
            const productPage = await notion.pages.retrieve({ page_id: p.id });
            productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
          } catch {}
          return {
            orderPageId: created.id,
            productId: p.id,
            productName,
            quantity: Number(p.quantity || 0),
            createdTime: created.created_time
          };
        })
      );

      req.session.recentOrders = (req.session.recentOrders || []).concat(
        creations.map(c => ({
          id: c.orderPageId,
          reason,
          productName: c.productName,
          quantity: c.quantity,
          status: "Pending",
          createdTime: c.createdTime
        }))
      ).slice(-50);

      delete req.session.orderDraft;
      res.json({
        success: true,
        message: "Order submitted and saved to Notion successfully!",
        orderItems: creations.map(c => ({ orderPageId: c.orderPageId, productId: c.productId }))
      });
    } catch (e) {
      console.error("submit-order:", e.body || e);
      res.status(500).json({ success: false, message: "Failed to save order to Notion." });
    }
  }
);

/* -------------------- Requested Orders -------------------- */
app.get(
  "/api/orders/requested",
  requireAuth,
  requirePage("Requested Orders"),
  async (_req, res) => {
    try {
      if (!ordersDatabaseId) return res.status(500).json({ error: "Orders DB not configured" });
      const all = [];
      let start = undefined, hasMore = true;
      const nameCache = new Map();

      async function memberName(id) {
        if (!id) return "";
        if (nameCache.has(id)) return nameCache.get(id);
        try {
          const page = await notion.pages.retrieve({ page_id: id });
          const nm = page.properties?.Name?.title?.[0]?.plain_text || "";
          nameCache.set(id, nm);
          return nm;
        } catch { return ""; }
      }
      const findAssignedProp = (props) => {
        const cand = ["Assigned To","assigned to","ِAssigned To","Assigned_to","AssignedTo"];
        const keys = Object.keys(props || {});
        for (const k of keys) {
          if (cand.some(c => normKey(c) === normKey(k))) return k;
        }
        return "Assigned To";
      };

      while (hasMore) {
        const r = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: start,
          sorts: [{ timestamp: "created_time", direction: "descending" }]
        });
        for (const page of r.results) {
          const props = page.properties || {};
          let productName = "Unknown Product";
          const productRel = props.Product?.relation;
          if (Array.isArray(productRel) && productRel.length) {
            try {
              const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
              productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
            } catch {}
          }
          const reason = props.Reason?.title?.[0]?.plain_text || "No Reason";
          const qty    = props["Quantity Requested"]?.number || 0;
          const status = props.Status?.select?.name || "Pending";
          const createdTime = page.created_time;

          let createdById = "";
          let createdByName = "";
          const teamRel = props["Teams Members"]?.relation;
          if (Array.isArray(teamRel) && teamRel.length) {
            createdById = teamRel[0].id;
            createdByName = await memberName(createdById);
          }
          const assignedKey = findAssignedProp(props);
          let assignedToId = "";
          let assignedToName = "";
          const assignedRel = props[assignedKey]?.relation;
          if (Array.isArray(assignedRel) && assignedRel.length) {
            assignedToId = assignedRel[0].id;
            assignedToName = await memberName(assignedToId);
          }
          all.push({
            id: page.id,
            reason,
            productName,
            quantity: qty,
            status,
            createdTime,
            createdById,
            createdByName,
            assignedToId,
            assignedToName
          });
        }
        hasMore = r.has_more;
        start = r.next_cursor;
      }
      res.json(all);
    } catch (e) {
      console.error("requested:", e.body || e);
      res.status(500).json({ error: "Failed to fetch requested orders" });
    }
  }
);

/* -------------------- Assign orders -------------------- */
app.post(
  "/api/orders/assign",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    try {
      let { orderIds, memberIds, memberId } = req.body || {};
      if (!Array.isArray(orderIds) || !orderIds.length) {
        return res.status(400).json({ error: "orderIds required" });
      }
      if ((!Array.isArray(memberIds) || memberIds.length === 0) && !memberId) {
        return res.status(400).json({ error: "memberIds or memberId required" });
      }
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        memberIds = memberId ? [memberId] : [];
      }
      const sample = await notion.pages.retrieve({ page_id: orderIds[0] });
      const props = sample.properties || {};
      const candidates = ["Assigned To","assigned to","ِAssigned To","Assigned_to","AssignedTo"];
      let assignedProp = "Assigned To";
      for (const k of Object.keys(props)) {
        if (candidates.some(c => normKey(c) === normKey(k))) { assignedProp = k; break; }
      }
      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: { [assignedProp]: { relation: memberIds.map(x => ({ id: x })) } }
          })
        )
      );
      res.json({ success: true });
    } catch (e) {
      console.error("assign:", e.body || e);
      res.status(500).json({ error: "Failed to assign member" });
    }
  }
);

/* -------------------- Assigned (list + actions) -------------------- */
app.get(
  "/api/orders/assigned",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found" });
      const assignedProp = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();
      const statusProp = await detectStatusPropName();

      const items = [];
      let start = undefined, hasMore = true;
      while (hasMore) {
        const r = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: start,
          filter: { property: assignedProp, relation: { contains: userId } },
          sorts: [{ timestamp: "created_time", direction: "descending" }]
        });
        for (const page of r.results) {
          const props = page.properties || {};
          let productName = "Unknown Product";
          const productRel = props.Product?.relation;
          if (Array.isArray(productRel) && productRel.length) {
            try {
              const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
              productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
            } catch {}
          }
          const requested = Number(props["Quantity Requested"]?.number || 0);
          const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
          const remaining = Math.max(0, requested - available);
          const reason = props.Reason?.title?.[0]?.plain_text || "No Reason";
          const status = statusProp ? (props[statusProp]?.select?.name || "") : "";
          items.push({
            id: page.id,
            productName,
            requested,
            available,
            remaining,
            createdTime: page.created_time,
            reason,
            status
          });
        }
        hasMore = r.has_more;
        start = r.next_cursor;
      }
      res.set("Cache-Control", "no-store");
      res.json(items);
    } catch (e) {
      console.error("assigned:", e.body || e);
      res.status(500).json({ error: "Failed to fetch assigned orders" });
    }
  }
);

app.post(
  "/api/orders/assigned/mark-in-stock",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const { orderPageId } = req.body || {};
      if (!orderPageId) return res.status(400).json({ error: "orderPageId required" });
      const availableProp = await detectAvailableQtyPropName();
      if (!availableProp) {
        return res.status(400).json({ error: 'Please add a Number property "Available Quantity" to Orders DB.' });
      }
      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(page.properties?.["Quantity Requested"]?.number || 0);
      const newAvailable = requested;
      await notion.pages.update({
        page_id: orderPageId,
        properties: { [availableProp]: { number: newAvailable } }
      });
      res.json({ success: true, available: newAvailable, remaining: 0 });
    } catch (e) {
      console.error("mark-in-stock:", e.body || e);
      res.status(500).json({ error: "Failed to update availability" });
    }
  }
);

app.post(
  "/api/orders/assigned/available",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const { orderPageId, available } = req.body || {};
      const availNum = Number(available);
      if (!orderPageId) return res.status(400).json({ error: "orderPageId required" });
      if (Number.isNaN(availNum) || availNum < 0) {
        return res.status(400).json({ error: "available must be a non-negative number" });
      }
      const availableProp = await detectAvailableQtyPropName();
      if (!availableProp) {
        return res.status(400).json({ error: 'Please add a Number property "Available Quantity" to Orders DB.' });
      }
      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(page.properties?.["Quantity Requested"]?.number || 0);
      const newAvailable = Math.min(requested, Math.max(0, Math.floor(availNum)));
      const remaining = Math.max(0, requested - newAvailable);
      await notion.pages.update({
        page_id: orderPageId,
        properties: { [availableProp]: { number: newAvailable } }
      });
      res.json({ success: true, available: newAvailable, remaining });
    } catch (e) {
      console.error("available:", e.body || e);
      res.status(500).json({ error: "Failed to update available quantity" });
    }
  }
);

app.post(
  "/api/orders/assigned/mark-prepared",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const { orderIds } = req.body || {};
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds required" });
      }
      const statusProp = await detectStatusPropName();
      if (!statusProp) {
        return res.status(400).json({ error: 'Please add a Select property "Status" to Orders DB.' });
      }
      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: { [statusProp]: { select: { name: "Prepared" } } }
          })
        )
      );
      res.json({ success: true, updated: orderIds.length });
    } catch (e) {
      console.error("mark-prepared:", e.body || e);
      res.status(500).json({ error: "Failed to mark as Prepared" });
    }
  }
);

/* -------------------- Assigned Shortage PDF -------------------- */
app.get(
  "/api/orders/assigned/pdf",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found" });
      const assignedProp  = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();

      const idsStr = String(req.query.ids || "").trim();
      const items = [];

      async function pushIfRemaining(page) {
        const props = page.properties || {};
        let productName = "Unknown Product";
        const productRel = props.Product?.relation;
        if (Array.isArray(productRel) && productRel.length) {
          try {
            const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
            productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
          } catch {}
        }
        const requested = Number(props["Quantity Requested"]?.number || 0);
        const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
        const remaining = Math.max(0, requested - available);
        if (remaining > 0) items.push({ productName, requested, available, remaining });
      }

      if (idsStr) {
        const ids = idsStr.split(",").map(s => s.trim()).filter(Boolean);
        for (const id of ids) {
          try {
            const page = await notion.pages.retrieve({ page_id: id });
            const rel = page.properties?.[assignedProp]?.relation || [];
            const isMine = Array.isArray(rel) && rel.some(r => r.id === userId);
            if (isMine) await pushIfRemaining(page);
          } catch {}
        }
      } else {
        let start = undefined, hasMore = true;
        while (hasMore) {
          const r = await notion.databases.query({
            database_id: ordersDatabaseId,
            start_cursor: start,
            filter: { property: assignedProp, relation: { contains: userId } },
            sorts: [{ timestamp: "created_time", direction: "descending" }]
          });
          for (const page of r.results) await pushIfRemaining(page);
          hasMore = r.has_more; start = r.next_cursor;
        }
      }

      const fname = `Assigned-Shortage-${new Date().toISOString().slice(0,10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);
      doc.font("Helvetica-Bold").fontSize(16).text("Assigned Orders — Shortage List", { align: "left" });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#555").text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(0.6);

      const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colNameW = Math.floor(pageInnerWidth * 0.5);
      const colReqW  = Math.floor(pageInnerWidth * 0.15);
      const colAvailW= Math.floor(pageInnerWidth * 0.15);
      const colRemW  = pageInnerWidth - colNameW - colReqW - colAvailW;

      const drawHead = () => {
        const y = doc.y; const h = 20;
        doc.save();
        doc.rect(doc.page.margins.left, y, pageInnerWidth, h).fill("#F3F4F6");
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 6, y + 5, { width: colNameW });
        doc.text("Requested", doc.page.margins.left + 6 + colNameW, y + 5, { width: colReqW, align: "right" });
        doc.text("Available", doc.page.margins.left + 6 + colNameW + colReqW, y + 5, { width: colAvailW, align: "right" });
        doc.text("Missing",   doc.page.margins.left + 6 + colNameW + colReqW + colAvailW, y + 5, { width: colRemW, align: "right" });
        doc.restore(); doc.moveDown(1);
      };
      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + need > bottom) { doc.addPage(); drawHead(); }
      };
      drawHead();
      doc.font("Helvetica").fontSize(11).fillColor("#111");
      items.forEach((it) => {
        ensureSpace(22);
        const y = doc.y, h = 18;
        doc.text(it.productName || "-", doc.page.margins.left + 2, y, { width: colNameW });
        doc.text(String(it.requested || 0), doc.page.margins.left + colNameW, y, { width: colReqW, align: "right" });
        doc.text(String(it.available || 0), doc.page.margins.left + colNameW + colReqW, y, { width: colAvailW, align: "right" });
        doc.text(String(it.remaining || 0), doc.page.margins.left + colNameW + colReqW + colAvailW, y, { width: colRemW, align: "right" });
        doc.moveTo(doc.page.margins.left, y + h).lineTo(doc.page.margins.left + pageInnerWidth, y + h).strokeColor("#EEE").lineWidth(1).stroke();
        doc.y = y + h + 2;
      });
      doc.end();
    } catch (e) {
      console.error("assigned/pdf:", e.body || e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

/* -------------------- Stock JSON -------------------- */
app.get(
  "/api/stock",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
    try {
      if (!teamMembersDatabaseId || !stocktakingDatabaseId) {
        return res.status(500).json({ error: "Database IDs are not configured." });
      }
      const me = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } }
      });
      if (!me.results.length) return res.status(404).json({ error: "User not found." });
      const user = me.results[0];
      const schoolProp = user.properties.School || {};
      const schoolName =
        schoolProp?.select?.name ||
        (Array.isArray(schoolProp?.rich_text) && schoolProp.rich_text[0]?.plain_text) ||
        (Array.isArray(schoolProp?.title) && schoolProp.title[0]?.plain_text) ||
        null;
      if (!schoolName) return res.status(404).json({ error: "Could not determine school name." });

      const numberFrom = (prop) => {
        if (!prop) return undefined;
        if (typeof prop.number === "number") return prop.number;
        if (prop.formula && typeof prop.formula.number === "number") return prop.formula.number;
        return undefined;
      };
      const firstDefinedNumber = (...props) => {
        for (const p of props) {
          const n = numberFrom(p);
          if (typeof n === "number") return n;
        }
        return 0;
      };

      const all = [];
      let start = undefined, hasMore = true;
      while (hasMore) {
        const r = await notion.databases.query({
          database_id: stocktakingDatabaseId,
          start_cursor: start,
          sorts: [{ property: "Name", direction: "ascending" }]
        });
        for (const page of r.results) {
          const props = page.properties || {};
          const componentName =
            props.Name?.title?.[0]?.plain_text ||
            props.Component?.title?.[0]?.plain_text ||
            "Untitled";
          const quantity = firstDefinedNumber(props[schoolName]);
          const oneKitQuantity = firstDefinedNumber(
            props["One Kit Quantity"],
            props["One Kit Qty"],
            props["One kit qty"],
            props["Kit Qty"],
            props["OneKitQuantity"]
          );
          let tag = null;
          if (props.Tag?.select) {
            tag = { name: props.Tag.select.name, color: props.Tag.select.color || "default" };
          } else if (Array.isArray(props.Tag?.multi_select) && props.Tag.multi_select.length > 0) {
            const t = props.Tag.multi_select[0];
            tag = { name: t.name, color: t.color || "default" };
          } else if (Array.isArray(props.Tags?.multi_select) && props.Tags.multi_select.length > 0) {
            const t = props.Tags.multi_select[0];
            tag = { name: t.name, color: t.color || "default" };
          }
          all.push({
            id: page.id,
            name: componentName,
            quantity: Number(quantity) || 0,
            oneKitQuantity: Number(oneKitQuantity) || 0,
            tag
          });
        }
        hasMore = r.has_more; start = r.next_cursor;
      }
      res.json(all);
    } catch (e) {
      console.error("stock:", e.body || e);
      res.status(500).json({ error: "Failed to fetch stock data." });
    }
  }
);

/* -------------------- Stock PDF -------------------- */
app.get(
  "/api/stock/pdf",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
    try {
      const me = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } }
      });
      if (!me.results.length) return res.status(404).json({ error: "User not found." });
      const user = me.results[0];
      const schoolProp = user.properties.School || {};
      const schoolName =
        schoolProp?.select?.name ||
        (Array.isArray(schoolProp?.rich_text) && schoolProp.rich_text[0]?.plain_text) ||
        (Array.isArray(schoolProp?.title) && schoolProp.title[0]?.plain_text) ||
        null;
      if (!schoolName) return res.status(404).json({ error: "Could not determine school name." });

      const numberFrom = (prop) => {
        if (!prop) return undefined;
        if (typeof prop.number === "number") return prop.number;
        if (prop.formula && typeof prop.formula.number === "number") return prop.formula.number;
        return undefined;
      };
      const firstDefinedNumber = (...props) => {
        for (const p of props) {
          const n = numberFrom(p);
          if (typeof n === "number") return n;
        }
        return 0;
      };

      const all = [];
      let start = undefined, hasMore = true;
      while (hasMore) {
        const r = await notion.databases.query({
          database_id: stocktakingDatabaseId,
          start_cursor: start,
          sorts: [{ property: "Name", direction: "ascending" }]
        });
        for (const page of r.results) {
          const props = page.properties || {};
          const componentName =
            props.Name?.title?.[0]?.plain_text ||
            props.Component?.title?.[0]?.plain_text ||
            "Untitled";
          const quantity = firstDefinedNumber(props[schoolName]);
          const oneKitQuantity = firstDefinedNumber(
            props["One Kit Quantity"],
            props["One Kit Qty"],
            props["One kit qty"],
            props["Kit Qty"],
            props["OneKitQuantity"]
          );
          let tag = null;
          if (props.Tag?.select) {
            tag = { name: props.Tag.select.name, color: props.Tag.select.color || "default" };
          } else if (Array.isArray(props.Tag?.multi_select) && props.Tag.multi_select.length > 0) {
            const t = props.Tag.multi_select[0];
            tag = { name: t.name, color: t.color || "default" };
          } else if (Array.isArray(props.Tags?.multi_select) && props.Tags.multi_select.length > 0) {
            const t = props.Tags.multi_select[0];
            tag = { name: t.name, color: t.color || "default" };
          }
          all.push({
            id: page.id,
            name: componentName,
            quantity: Number(quantity) || 0,
            oneKitQuantity: Number(oneKitQuantity) || 0,
            tag
          });
        }
        hasMore = r.has_more; start = r.next_cursor;
      }

      // group by tag then draw PDF (compact)
      const groupsMap = new Map();
      (all || []).forEach((it) => {
        const name = it?.tag?.name || "Untagged";
        const color = it?.tag?.color || "default";
        const key = `${String(name).toLowerCase()}|${color}`;
        if (!groupsMap.has(key)) groupsMap.set(key, { name, color, items: [] });
        groupsMap.get(key).items.push(it);
      });
      let groups = Array.from(groupsMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const untagged = groups.filter(g => String(g.name).toLowerCase() === "untagged" || g.name === "-");
      groups = groups.filter(g => !(String(g.name).toLowerCase() === "untagged" || g.name === "-")).concat(untagged);

      const palette = {
        default: { fill: "#F3F4F6", border: "#E5E7EB", text: "#111827" },
        gray:    { fill: "#F3F4F6", border: "#E5E7EB", text: "#374151" },
        brown:   { fill: "#EFEBE9", border: "#D7CCC8", text: "#4E342E" },
        orange:  { fill: "#FFF7ED", border: "#FED7AA", text: "#9A3412" },
        yellow:  { fill: "#FEFCE8", border: "#FDE68A", text: "#854D0E" },
        green:   { fill: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
        blue:    { fill: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
        purple:  { fill: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6" },
        pink:    { fill: "#FDF2F8", border: "#FBCFE8", text: "#9D174D" },
        red:     { fill: "#FEF2F2", border: "#FECACA", text: "#991B1B" }
      };
      const getPal = (c="default") => palette[c] || palette.default;

      const fname = `Stocktaking-${new Date().toISOString().slice(0,10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Stocktaking", { align: "left" });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#6B7280")
        .text(`School: ${schoolName}`, { continued: true })
        .text(`   •   Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(0.6);

      const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const gap = 10, colKitW = 120, colQtyW = 90, colNameW = pageInnerWidth - colKitW - colQtyW - gap * 2;

      const drawGroupHeader = (gName, pal, count, cont=false) => {
        const y = doc.y + 2, h = 22;
        doc.save();
        doc.roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6).fillColor(pal.fill).strokeColor(pal.border).lineWidth(1).fillAndStroke();
        doc.fillColor("#6B7280").font("Helvetica-Bold").fontSize(10).text("Tag", doc.page.margins.left + 10, y + 6);
        const pillText = cont ? `${gName} (cont.)` : gName;
        const pillPadX = 10, pillH = 16;
        const pillW = Math.max(40, doc.widthOfString(pillText, { font: "Helvetica-Bold", size: 10 }) + pillPadX * 2);
        const pillX = doc.page.margins.left + 38, pillY = y + (h - pillH) / 2;
        doc.roundedRect(pillX, pillY, pillW, pillH, 8).fillColor(pal.fill).strokeColor(pal.border).lineWidth(1).fillAndStroke();
        doc.fillColor(pal.text).font("Helvetica-Bold").fontSize(10).text(pillText, pillX + pillPadX, pillY + 3);
        const countTxt = `${count} items`;
        doc.fillColor("#111827").font("Helvetica-Bold").text(countTxt, doc.page.margins.left, y + 5, { width: pageInnerWidth - 10, align: "right" });
        doc.restore();
        doc.moveDown(1.4);
      };

      const drawTableHead = (pal) => {
        const y = doc.y, h = 20;
        doc.save();
        doc.roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6).fillColor(pal.fill).strokeColor(pal.border).lineWidth(1).fillAndStroke();
        doc.fillColor(pal.text).font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 10, y + 5, { width: colNameW });
        doc.text("One Kit Quantity", doc.page.margins.left + 10 + colNameW + gap, y + 5, { width: colKitW - 10, align: "right" });
        const lastX = doc.page.margins.left + colNameW + gap + colKitW + gap;
        doc.text("In Stock", lastX, y + 5, { width: colQtyW - 10, align: "right" });
        doc.restore();
        doc.moveDown(1.2);
      };

      const ensureSpace = (needH, onNewPage) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + needH > bottom) { doc.addPage(); onNewPage?.(); }
      };

      const drawRow = (item, pal) => {
        const y = doc.y;
        const nameHeight = doc.heightOfString(item.name || "-", { width: colNameW });
        const rowH = Math.max(18, nameHeight);
        ensureSpace(rowH + 8);
        doc.font("Helvetica").fontSize(11).fillColor("#111827");
        doc.text(item.name || "-", doc.page.margins.left + 2, doc.y, { width: colNameW });
        const text = String(Number(item.oneKitQuantity ?? 0));
        const pillPadX = 8, pillH = 16;
        const pillW = Math.max(32, doc.widthOfString(text, { font: "Helvetica-Bold", size: 10 }) + pillPadX * 2);
        const pillX = doc.page.margins.left + colNameW + gap + (colKitW - pillW - 10);
        const pillY = y + (rowH - pillH) / 2;
        doc.roundedRect(pillX, pillY, pillW, pillH, 8).fillColor(pal.fill).strokeColor(pal.border).lineWidth(1).fillAndStroke();
        doc.fillColor(pal.text).font("Helvetica-Bold").fontSize(10).text(text, pillX + pillPadX, pillY + 3);
        const lastX = doc.page.margins.left + colNameW + gap + colKitW + gap;
        doc.fillColor("#111827").font("Helvetica").fontSize(11).text(String(Number(item.quantity ?? 0)), lastX, y, { width: colQtyW - 10, align: "right" });
        doc.moveTo(doc.page.margins.left, y + rowH + 4).lineTo(doc.page.margins.left + pageInnerWidth, y + rowH + 4).strokeColor("#F3F4F6").lineWidth(1).stroke();
        doc.y = y + rowH + 6;
      };

      const ensureGroupStartSpace = () => ensureSpace(22 + 20 + 18);

      for (const g of groups) {
        const pal = getPal(g.color);
        ensureGroupStartSpace();
        drawGroupHeader(g.name, pal, g.items.length, false);
        drawTableHead(pal);
        g.items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        for (const item of g.items) {
          ensureSpace(40, () => { drawGroupHeader(g.name, pal, g.items.length, true); drawTableHead(pal); });
          drawRow(item, pal);
        }
      }
      doc.end();
    } catch (e) {
      console.error("stock/pdf:", e.body || e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

/* -------------------- Account -------------------- */
app.patch("/api/account", requireAuth, async (req, res) => {
  try {
    if (!teamMembersDatabaseId) {
      return res.status(500).json({ error: "Team_Members DB not configured" });
    }
    const { name, phone, email, password } = req.body || {};
    const updateProps = {};
    if (typeof phone !== "undefined") updateProps["Phone"] = { phone_number: (phone || "").trim() || null };
    if (typeof email !== "undefined") updateProps["Email"] = { email: (email || "").trim() || null };
    if (typeof password !== "undefined") {
      const n = Number(password);
      if (Number.isNaN(n)) return res.status(400).json({ error: "Password must be a number." });
      updateProps["Password"] = { number: n };
    }
    if (typeof name !== "undefined" && String(name).trim()) {
      updateProps["Name"] = { title: [{ text: { content: String(name).trim() } }] };
    }
    if (Object.keys(updateProps).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }
    const resp = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } }
    });
    if (!resp.results.length) return res.status(404).json({ error: "User not found." });
    const userPageId = resp.results[0].id;
    await notion.pages.update({ page_id: userPageId, properties: updateProps });
    if (updateProps["Name"]) req.session.username = String(name).trim();
    res.json({ success: true });
  } catch (e) {
    console.error("account:", e.body || e);
    res.status(500).json({ error: "Failed to update account." });
  }
});

/* -------------------- Funds -------------------- */
app.get("/api/funds/check", requireAuth, requirePage("Funds"), async (_req, res) => {
  try {
    if (!fundsDatabaseId) {
      return res.status(500).json({ configured: false, error: "Funds DB ID not configured" });
    }
    const db = await notion.databases.retrieve({ database_id: fundsDatabaseId });
    res.json({
      configured: true,
      title: db.title?.[0]?.plain_text || "Funds Database",
      message: "Funds database is properly configured"
    });
  } catch (e) {
    console.error("funds/check:", e.body || e);
    res.status(500).json({ configured: false, error: e.message || "Cannot access funds database" });
  }
});

app.post("/api/funds", requireAuth, requirePage("Funds"), async (req, res) => {
  try {
    if (!fundsDatabaseId || !teamMembersDatabaseId) {
      return res.status(500).json({ error: "Database IDs are not configured." });
    }
    const { assignment, expenses } = req.body || {};
    if (!assignment || !assignment.trim()) return res.status(400).json({ error: "Mission assignment is required" });
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ error: "At least one expense is required" });
    }
    for (const exp of expenses) {
      const { fundsType, date, from, to, cost } = exp || {};
      if (!fundsType || !date || !from || !to || typeof cost !== "number" || cost <= 0) {
        return res.status(400).json({ error: "All expense fields are required and cost must be positive" });
      }
    }
    const userQ = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } }
    });
    if (!userQ.results.length) return res.status(404).json({ error: "User not found." });
    const userId = userQ.results[0].id;

    const createdExpenses = await Promise.all(
      expenses.map(async (exp) => {
        const { fundsType, date, from, to, cost, screenshotName, screenshotType, screenshotSize } = exp;
        const props = {
          Assignment: { title: [{ text: { content: assignment.trim() } }] },
          "Funds Type": { select: { name: fundsType } },
          Date: { date: { start: date } },
          From: { rich_text: [{ text: { content: from } }] },
          To:   { rich_text: [{ text: { content: to } }] },
          Cost: { number: cost },
          "Team Members": { relation: [{ id: userId }] }
        };
        let children = [];
        if (screenshotName) {
          children = [{
            object: "block",
            type: "callout",
            callout: {
              rich_text: [{
                type: "text",
                text: { content: `Receipt: ${screenshotName} (${screenshotType || "type?"}${screenshotSize ? ", " + Math.round(screenshotSize/1024) + "KB" : ""})` }
              }],
              icon: { emoji: "📎" }
            }
          }];
        }
        const created = await notion.pages.create({
          parent: { database_id: fundsDatabaseId },
          properties: props,
          children: children.length ? children : undefined
        });
        return {
          id: created.id,
          assignment: assignment.trim(),
          fundsType, date, from, to, cost,
          createdTime: created.created_time
        };
      })
    );
    res.json({
      success: true,
      message: "Mission expenses submitted successfully",
      data: {
        assignment: assignment.trim(),
        expensesCount: createdExpenses.length,
        totalCost: expenses.reduce((s, e) => s + e.cost, 0),
        createdExpenses
      }
    });
  } catch (e) {
    console.error("funds:", e.body || e);
    res.status(500).json({ error: "Failed to submit mission expenses" });
  }
});

/* -------------------- Export app -------------------- */
module.exports = app;
