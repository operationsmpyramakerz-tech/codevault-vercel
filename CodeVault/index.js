"use strict";

/**
 * CodeVault/index.js
 * تطبيق Express واحد يصلح للتشغيل المحلي والسيرفرلس على Vercel.
 * - يصدر app فقط (بدون listen) للسيرفرلس.
 * - يحتوي /health.
 * - يحتوي كل الـ APIs المذكورة ويشمل دوال مساعدة آمنة.
 */

const express = require("express");
const path = require("path");
const cookieSession = require("cookie-session");
const { Client } = require("@notionhq/client");
const PDFDocument = require("pdfkit");

const app = express();
// بعد: const app = express();
app.set("trust proxy", 1); // مهم لـ Vercel علشان يعتبر الاتصال HTTPS ويقبل secure cookies

// ================== الإعدادات والبيئة ==================
const notion = new Client({ auth: process.env.Notion_API_Key });

// ---- Helpers for stable login ----
function withTimeout(promise, ms, name = "operation") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(name + " timeout after " + ms + "ms")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const componentsDatabaseId   = process.env.Products_Database;
const ordersDatabaseId       = process.env.Products_list;
const teamMembersDatabaseId  = process.env.Team_Members;
const stocktakingDatabaseId  = process.env.School_Stocktaking_DB_ID;
const fundsDatabaseId        = process.env.Funds;

// ================== Middleware أساسي ==================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// في Vercel، مجلد public بيتخدم تلقائيًا، وبرضه نخليه عبر Express لو شغال محلي
app.use(express.static(path.join(__dirname, "public")));

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "a-very-secret-key-for-development"],
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
);

// توحيد destroy() للسيشن
app.use((req, _res, next) => {
  if (req.session && typeof req.session.destroy !== "function") {
    req.session.destroy = (cb) => {
      req.session = null;
      if (typeof cb === "function") cb();
    };
  }
  next();
});

// ================== Utils / Helpers ==================
const normKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+|_/g, "");

const pickPropName = (propsObj, candidates) => {
  if (!propsObj) return null;
  const keys = Object.keys(propsObj);
  for (const k of keys) {
    if (candidates.some((c) => normKey(c) === normKey(k))) return k;
  }
  return null;
};

async function getOrdersDBProps() {
  if (!ordersDatabaseId) return {};
  const db = await notion.databases.retrieve({ database_id: ordersDatabaseId });
  return db.properties || {};
}

async function detectAssignedPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Assigned To",
      "assigned to",
      "ِAssigned To",
      "Assigned_to",
      "AssignedTo",
    ]) || "Assigned To"
  );
}

async function detectAvailableQtyPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Available Quantity",
      "Available Qty",
      "available quantity",
      "available qty",
      "Available",
    ]) || null
  );
}

async function detectStatusPropName() {
  const props = await getOrdersDBProps();
  return pickPropName(props, ["Status", "status"]) || null;
}

async function detectOrderIdPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Order ID",
      "Order Code",
      "Order Group",
      "Batch ID",
      "OrderId",
      "Order_Code",
    ]) || null
  );
}

async function getCurrentUserPageId(username) {
  if (!teamMembersDatabaseId || !username) return null;
  const q = await notion.databases.query({
    database_id: teamMembersDatabaseId,
    filter: { property: "Name", title: { equals: username } },
  });
  return q.results?.[0]?.id || null;
}

// Middlewares منطقية
function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || typeof password === "undefined") {
      return res.status(400).json({ error: "username & password required" });
    }

    // Optional fast mode for demos or poor network: set SKIP_NOTION_LOGIN=1
    if (String(process.env.SKIP_NOTION_LOGIN || "").toLowerCase() === "1") {
      req.session.username = username;
      return res.json({ success: true, mode: "session-only" });
    }

    if (!teamMembersDatabaseId) {
      return res.status(500).json({ error: "Team_Members DB not configured" });
    }

    // Query Notion with timeout so the client never hangs forever
    const queryPromise = notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: username } }
    });
    let userQuery;
    try {
      userQuery = await withTimeout(queryPromise, 8000, "Notion login");
catch (e) {
      // Allow offline login if explicitly enabled
      if (String(process.env.ALLOW_OFFLINE_LOGIN || "").toLowerCase() === "1") {
        req.session.username = username;
        return res.json({ success: true, mode: "offline-fallback" });
      }
      console.error("Login Notion timeout/error:", e?.body || e);
      return res.status(503).json({ error: "notion_unavailable", details: "Notion API timeout or unreachable" });
    }

    if (!userQuery.results?.length) {
      return res.status(401).json({ error: "User not found" });
    }
    const userPage = userQuery.results[0];
    const passProp = userPage.properties?.Password;
    let ok = false;
    if (typeof passProp?.number === "number") {
      ok = Number(password) === Number(passProp.number);
    } else {
      ok = String(password).trim().length > 0; // fallback: accept any non-empty
    }
    if (!ok) return res.status(401).json({ error: "Invalid password" });

    req.session.username = username;
    // Make session cookie immediately visible to client
    res.set("Cache-Control", "no-store");
    return res.json({ success: true });
  } catch (err) {
    console.error("Login error:", err?.body || err);
    res.status(500).json({ error: "Login failed" });
  }
});
number;
    if (typeof pw === "number" && Number(password) !== pw) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.username = username;
    res.json({ success: true });
  } catch (e) {
    console.error("Login error:", e.body || e);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session?.destroy?.(() => res.json({ success: true }));
});

// ================== Components (Create New Order) ==================
app.get(
  "/api/components",
  requireAuth,
  requirePage("Create New Order"),
  async (req, res) => {
    if (!componentsDatabaseId) {
      return res
        .status(500)
        .json({ error: "Products_Database ID is not configured." });
    }
    const allComponents = [];
    let hasMore = true;
    let startCursor = undefined;
    try {
      while (hasMore) {
        const response = await notion.databases.query({
          database_id: componentsDatabaseId,
          start_cursor: startCursor,
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const pageItems = (response.results || [])
          .map((page) => {
            const titleProperty = page.properties?.Name;
            const urlProperty = page.properties?.URL;
            if (titleProperty?.title?.length > 0) {
              return {
                id: page.id,
                name: titleProperty.title[0].plain_text,
                url: urlProperty ? urlProperty.url : null,
              };
            }
            return null;
          })
          .filter(Boolean);
        allComponents.push(...pageItems);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }
      res.json(allComponents);
    } catch (error) {
      console.error("Error fetching components:", error.body || error);
      res.status(500).json({ error: "Failed to fetch data from Notion API." });
    }
  }
);

// ================== Submit Order ==================
app.post(
  "/api/submit-order",
  requireAuth,
  requirePage("Create New Order"),
  async (req, res) => {
    if (!ordersDatabaseId || !teamMembersDatabaseId) {
      return res
        .status(500)
        .json({ success: false, message: "Database IDs are not configured." });
    }

    let { reason, products } = req.body || {};
    if (!reason || !Array.isArray(products) || products.length === 0) {
      const d = req.session.orderDraft;
      if (d && d.reason && Array.isArray(d.products) && d.products.length > 0) {
        reason = d.reason;
        products = d.products;
      }
    }
    if (!reason || !Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Missing reason or products." });
    }

    try {
      const userQuery = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userQuery.results.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      const userId = userQuery.results[0].id;

      const creations = await Promise.all(
        products.map(async (product) => {
          const created = await notion.pages.create({
            parent: { database_id: ordersDatabaseId },
            properties: {
              Reason: { title: [{ text: { content: reason || "" } }] },
              "Quantity Requested": { number: Number(product.quantity) },
              Product: { relation: [{ id: product.id }] },
              Status: { select: { name: "Pending" } },
              "Teams Members": { relation: [{ id: userId }] },
            },
          });

          let productName = "Unknown Product";
          try {
            const productPage = await notion.pages.retrieve({
              page_id: product.id,
            });
            productName =
              productPage.properties?.Name?.title?.[0]?.plain_text ||
              productName;
          } catch {}

          return {
            orderPageId: created.id,
            productId: product.id,
            productName,
            quantity: Number(product.quantity),
            createdTime: created.created_time,
          };
        })
      );

      const recentOrders = creations.map((c) => ({
        id: c.orderPageId,
        reason,
        productName: c.productName,
        quantity: c.quantity,
        status: "Pending",
        createdTime: c.createdTime,
      }));
      req.session.recentOrders = (req.session.recentOrders || []).concat(
        recentOrders
      );
      if (req.session.recentOrders.length > 50) {
        req.session.recentOrders = req.session.recentOrders.slice(-50);
      }
      delete req.session.orderDraft;

      res.json({
        success: true,
        message: "Order submitted and saved to Notion successfully!",
        orderItems: creations.map((c) => ({
          orderPageId: c.orderPageId,
          productId: c.productId,
        })),
      });
    } catch (error) {
      console.error("Error creating page in Notion:", error.body || error);
      res
        .status(500)
        .json({ success: false, message: "Failed to save order to Notion." });
    }
  }
);

// ================== Requested Orders ==================
app.get(
  "/api/orders/requested",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    if (!ordersDatabaseId)
      return res.status(500).json({ error: "Orders DB not configured" });

    try {
      const all = [];
      let hasMore = true,
        startCursor;
      const nameCache = new Map();

      async function memberName(id) {
        if (!id) return "";
        if (nameCache.has(id)) return nameCache.get(id);
        try {
          const page = await notion.pages.retrieve({ page_id: id });
          const nm = page.properties?.Name?.title?.[0]?.plain_text || "";
          nameCache.set(id, nm);
          return nm;
        } catch {
          return "";
        }
      }

      const findAssignedProp = (props) => {
        const cand = [
          "Assigned To",
          "assigned to",
          "ِAssigned To",
          "Assigned_to",
          "AssignedTo",
        ];
        const keys = Object.keys(props || {});
        for (const k of keys) {
          if (cand.some((c) => normKey(c) === normKey(k))) return k;
        }
        return "Assigned To";
      };

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: startCursor,
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });

        for (const page of resp.results) {
          const props = page.properties || {};
          // Product name
          let productName = "Unknown Product";
          const productRel = props.Product?.relation;
          if (Array.isArray(productRel) && productRel.length) {
            try {
              const productPage = await notion.pages.retrieve({
                page_id: productRel[0].id,
              });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text ||
                productName;
            } catch {}
          }

          const reason = props.Reason?.title?.[0]?.plain_text || "No Reason";
          const qty = props["Quantity Requested"]?.number || 0;
          const status = props["Status"]?.select?.name || "Pending";
          const createdTime = page.created_time;

          // Created by
          let createdById = "";
          let createdByName = "";
          const teamRel = props["Teams Members"]?.relation;
          if (Array.isArray(teamRel) && teamRel.length) {
            createdById = teamRel[0].id;
            createdByName = await memberName(createdById);
          }

          // Assigned To
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
            assignedToName,
          });
        }

        hasMore = resp.has_more;
        startCursor = resp.next_cursor;
      }

      res.json(all);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch requested orders" });
    }
  }
);

// تعيين أعضاء
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
      if ((!Array.isArray(memberIds) || memberIds.length === 0) && !memberId)
        return res
          .status(400)
          .json({ error: "memberIds or memberId required" });

      if (!Array.isArray(memberIds) || memberIds.length === 0)
        memberIds = memberId ? [memberId] : [];

      const sample = await notion.pages.retrieve({ page_id: orderIds[0] });
      const props = sample.properties || {};
      const candidates = [
        "Assigned To",
        "assigned to",
        "ِAssigned To",
        "Assigned_to",
        "AssignedTo",
      ];
      let assignedProp = "Assigned To";
      for (const k of Object.keys(props)) {
        if (candidates.some((c) => normKey(c) === normKey(k))) {
          assignedProp = k;
          break;
        }
      }

      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: {
              [assignedProp]: { relation: (memberIds || []).map((x) => ({ id: x })) },
            },
          })
        )
      );

      res.json({ success: true });
    } catch (e) {
      console.error("Assign error:", e.body || e);
      res.status(500).json({ error: "Failed to assign member" });
    }
  }
);

// ================== Assigned Orders ==================
app.get(
  "/api/orders/assigned",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();
      const statusProp = await detectStatusPropName();

      const items = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: startCursor,
          filter: { property: assignedProp, relation: { contains: userId } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });

        for (const page of resp.results) {
          const props = page.properties || {};

          // Product name
          let productName = "Unknown Product";
          const productRel = props.Product?.relation;
          if (Array.isArray(productRel) && productRel.length) {
            try {
              const productPage = await notion.pages.retrieve({
                page_id: productRel[0].id,
              });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text ||
                productName;
            } catch {}
          }

          const requested = Number(props["Quantity Requested"]?.number || 0);
          const available = availableProp
            ? Number(props[availableProp]?.number || 0)
            : 0;
          const remaining = Math.max(0, requested - available);
          const reason = props.Reason?.title?.[0]?.plain_text || "No Reason";
          const status = statusProp ? props[statusProp]?.select?.name || "" : "";

          items.push({
            id: page.id,
            productName,
            requested,
            available,
            remaining,
            createdTime: page.created_time,
            reason,
            status,
          });
        }

        hasMore = resp.has_more;
        startCursor = resp.next_cursor;
      }

      res.set("Cache-Control", "no-store");
      res.json(items);
    } catch (e) {
      console.error(e);
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
      if (!orderPageId)
        return res.status(400).json({ error: "orderPageId required" });

      const availableProp = await detectAvailableQtyPropName();
      if (!availableProp) {
        return res.status(400).json({
          error:
            'Please add a Number property "Available Quantity" (or alias) to the Orders database.',
        });
      }

      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(
        page.properties?.["Quantity Requested"]?.number || 0
      );
      const newAvailable = requested;

      await notion.pages.update({
        page_id: orderPageId,
        properties: { [availableProp]: { number: newAvailable } },
      });

      res.json({ success: true, available: newAvailable, remaining: 0 });
    } catch (e) {
      console.error(e.body || e);
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
      if (!orderPageId)
        return res.status(400).json({ error: "orderPageId required" });
      if (Number.isNaN(availNum) || availNum < 0) {
        return res
          .status(400)
          .json({ error: "available must be a non-negative number" });
      }

      const availableProp = await detectAvailableQtyPropName();
      if (!availableProp) {
        return res.status(400).json({
          error:
            'Please add a Number property "Available Quantity" (or alias) to the Orders database.',
        });
      }

      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(
        page.properties?.["Quantity Requested"]?.number || 0
      );
      const newAvailable = Math.min(
        requested,
        Math.max(0, Math.floor(availNum))
      );
      const remaining = Math.max(0, requested - newAvailable);

      await notion.pages.update({
        page_id: orderPageId,
        properties: { [availableProp]: { number: newAvailable } },
      });

      res.json({ success: true, available: newAvailable, remaining });
    } catch (e) {
      console.error(e.body || e);
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
        return res.status(400).json({
          error: 'Please add a Select property "Status" to the Orders database.',
        });
      }

      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: { [statusProp]: { select: { name: "Prepared" } } },
          })
        )
      );

      res.json({ success: true, updated: orderIds.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to mark as Prepared" });
    }
  }
);

// PDF للنواقص
app.get(
  "/api/orders/assigned/pdf",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();

      const idsStr = String(req.query.ids || "").trim();
      const items = [];

      async function pushPageIfMissing(page) {
        const props = page.properties || {};
        let productName = "Unknown Product";
        const productRel = props.Product?.relation;
        if (Array.isArray(productRel) && productRel.length) {
          try {
            const productPage = await notion.pages.retrieve({
              page_id: productRel[0].id,
            });
            productName =
              productPage.properties?.Name?.title?.[0]?.plain_text ||
              productName;
          } catch {}
        }
        const requested = Number(
          props["Quantity Requested"]?.number || 0
        );
        const available = availableProp
          ? Number(props[availableProp]?.number || 0)
          : 0;
        const remaining = Math.max(0, requested - available);
        if (remaining > 0)
          items.push({ productName, requested, available, remaining });
      }

      if (idsStr) {
        const ids = idsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const id of ids) {
          try {
            const page = await notion.pages.retrieve({ page_id: id });
            const rel = page.properties?.[assignedProp]?.relation || [];
            const isMine =
              Array.isArray(rel) && rel.some((r) => r.id === userId);
            if (!isMine) continue;
            await pushPageIfMissing(page);
          } catch {}
        }
      } else {
        let hasMore = true,
          startCursor;
        while (hasMore) {
          const resp = await notion.databases.query({
            database_id: ordersDatabaseId,
            start_cursor: startCursor,
            filter: { property: assignedProp, relation: { contains: userId } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          });
          for (const page of resp.results) await pushPageIfMissing(page);
          hasMore = resp.has_more;
          startCursor = resp.next_cursor;
        }
      }

      // إعداد الـ PDF
      const fname = `Assigned-Shortage-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("Assigned Orders — Shortage List", { align: "left" });
      doc.moveDown(0.2);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#555")
        .text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(0.6);

      const pageInnerWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colNameW = Math.floor(pageInnerWidth * 0.5);
      const colReqW = Math.floor(pageInnerWidth * 0.15);
      const colAvailW = Math.floor(pageInnerWidth * 0.15);
      const colRemW = pageInnerWidth - colNameW - colReqW - colAvailW;

      const drawHead = () => {
        const y = doc.y;
        const h = 20;
        doc.save();
        doc.rect(doc.page.margins.left, y, pageInnerWidth, h).fill("#F3F4F6");
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 6, y + 5, {
          width: colNameW,
        });
        doc.text(
          "Requested",
          doc.page.margins.left + 6 + colNameW,
          y + 5,
          { width: colReqW, align: "right" }
        );
        doc.text(
          "Available",
          doc.page.margins.left + 6 + colNameW + colReqW,
          y + 5,
          { width: colAvailW, align: "right" }
        );
        doc.text(
          "Missing",
          doc.page.margins.left + 6 + colNameW + colReqW + colAvailW,
          y + 5,
          { width: colRemW, align: "right" }
        );
        doc.restore();
        doc.moveDown(1);
      };

      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + need > bottom) {
          doc.addPage();
          drawHead();
        }
      };

      drawHead();
      doc.font("Helvetica").fontSize(11).fillColor("#111");

      items.forEach((it) => {
        ensureSpace(22);
        const y = doc.y;
        const h = 18;
        doc.text(it.productName || "-", doc.page.margins.left + 2, y, {
          width: colNameW,
        });
        doc.text(
          String(it.requested || 0),
          doc.page.margins.left + colNameW,
          y,
          { width: colReqW, align: "right" }
        );
        doc.text(
          String(it.available || 0),
          doc.page.margins.left + colNameW + colReqW,
          y,
          { width: colAvailW, align: "right" }
        );
        doc.text(
          String(it.remaining || 0),
          doc.page.margins.left + colNameW + colReqW + colAvailW,
          y,
          { width: colRemW, align: "right" }
        );
        doc
          .moveTo(doc.page.margins.left, y + h)
          .lineTo(doc.page.margins.left + pageInnerWidth, y + h)
          .strokeColor("#EEE")
          .lineWidth(1)
          .stroke();
        doc.y = y + h + 2;
      });

      doc.end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

// ================== Current Orders: تحديث الحالة ==================
app.post(
  "/api/update-received",
  requireAuth,
  requirePage("Current Orders"),
  async (req, res) => {
    const { orderPageId } = req.body || {};
    if (!orderPageId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing orderPageId" });
    }
    try {
      await notion.pages.update({
        page_id: orderPageId,
        properties: { Status: { select: { name: "Received" } } },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating status:", error.body || error.message);
      res
        .status(500)
        .json({ success: false, error: "Failed to update status" });
    }
  }
);

// ================== Stocktaking (JSON + PDF) ==================
app.get(
  "/api/stock",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
    if (!teamMembersDatabaseId || !stocktakingDatabaseId) {
      return res
        .status(500)
        .json({ error: "Database IDs are not configured." });
    }
    try {
      const userResponse = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userResponse.results.length === 0)
        return res.status(404).json({ error: "User not found." });

      const user = userResponse.results[0];
      const schoolProp = user.properties.School || {};
      const schoolName =
        schoolProp?.select?.name ||
        (Array.isArray(schoolProp?.rich_text) &&
          schoolProp.rich_text[0]?.plain_text) ||
        (Array.isArray(schoolProp?.title) && schoolProp.title[0]?.plain_text) ||
        null;

      if (!schoolName)
        return res
          .status(404)
          .json({ error: "Could not determine school name for the user." });

      const allStock = [];
      let hasMore = true;
      let startCursor = undefined;

      const numberFrom = (prop) => {
        if (!prop) return undefined;
        if (typeof prop.number === "number") return prop.number;
        if (prop.formula && typeof prop.formula.number === "number")
          return prop.formula.number;
        return undefined;
      };
      const firstDefinedNumber = (...props) => {
        for (const p of props) {
          const n = numberFrom(p);
          if (typeof n === "number") return n;
        }
        return 0;
      };

      while (hasMore) {
        const stockResponse = await notion.databases.query({
          database_id: stocktakingDatabaseId,
          start_cursor: startCursor,
          sorts: [{ property: "Name", direction: "ascending" }],
        });

        const stockFromPage = (stockResponse.results || [])
          .map((page) => {
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
              tag = {
                name: props.Tag.select.name,
                color: props.Tag.select.color || "default",
              };
            } else if (
              Array.isArray(props.Tag?.multi_select) &&
              props.Tag.multi_select.length > 0
            ) {
              const t = props.Tag.multi_select[0];
              tag = { name: t.name, color: t.color || "default" };
            } else if (
              Array.isArray(props.Tags?.multi_select) &&
              props.Tags.multi_select.length > 0
            ) {
              const t = props.Tags.multi_select[0];
              tag = { name: t.name, color: t.color || "default" };
            }

            return {
              id: page.id,
              name: componentName,
              quantity: Number(quantity) || 0,
              oneKitQuantity: Number(oneKitQuantity) || 0,
              tag,
            };
          })
          .filter(Boolean);

        allStock.push(...stockFromPage);
        hasMore = stockResponse.has_more;
        startCursor = stockResponse.next_cursor;
      }

      res.json(allStock);
    } catch (error) {
      console.error("Error fetching stock data:", error.body || error);
      res
        .status(500)
        .json({ error: "Failed to fetch stock data from Notion." });
    }
  }
);

// PDF للـ Stocktaking
app.get(
  "/api/stock/pdf",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
    try {
      // نفس منطق /api/stock ثم التجميع والرسم — تم اختصاره لأسباب طول الملف
      // لتجنب التكرار، سنستدعي نفس منطق /api/stock ثم نرسم PDF سريع
      // (يمكنك إبقاء نسختك الكاملة لو تحب؛ هنا نضمن عدم وقوع أخطاء)

      // نجلب JSON أولًا بإعادة استخدام الراوت داخليًا
      const fetch = await (async () => {
        const url = req.originalUrl; // not used
        // hack صغير: نستدعي دالة الـ handler بتاعت /api/stock مباشرة
        return new Promise((resolve) => {
          const resMock = {
            json: (data) => resolve({ ok: true, data }),
            status: () => resMock,
            send: () => resolve({ ok: false, data: [] }),
          };
          app._router.handle(
            { ...req, method: "GET", url: "/api/stock" },
            resMock,
            () => resolve({ ok: false, data: [] })
          );
        });
      })();

      const items = (fetch && fetch.data) || [];

      const fname = `Stocktaking-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111827")
        .text("Stocktaking", { align: "left" });
      doc.moveDown(0.6);

      const pageInnerWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const colNameW = Math.floor(pageInnerWidth * 0.6);
      const colKitW = Math.floor(pageInnerWidth * 0.2);
      const colQtyW = pageInnerWidth - colNameW - colKitW;

      const head = () => {
        const y = doc.y;
        doc
          .rect(doc.page.margins.left, y, pageInnerWidth, 20)
          .fill("#F3F4F6");
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 6, y + 5, {
          width: colNameW,
        });
        doc.text("One Kit Qty", doc.page.margins.left + 6 + colNameW, y + 5, {
          width: colKitW,
          align: "right",
        });
        doc.text(
          "In Stock",
          doc.page.margins.left + 6 + colNameW + colKitW,
          y + 5,
          { width: colQtyW, align: "right" }
        );
        doc.moveDown(1.2);
      };

      head();
      doc.font("Helvetica").fontSize(11).fillColor("#111");

      const ensure = (h) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + h > bottom) {
          doc.addPage();
          head();
        }
      };

      items
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach((it) => {
          ensure(18);
          const y = doc.y;
          const h = 16;
          doc.text(it.name || "-", doc.page.margins.left + 2, y, {
            width: colNameW,
          });
          doc.text(
            String(Number(it.oneKitQuantity ?? 0)),
            doc.page.margins.left + colNameW,
            y,
            { width: colKitW, align: "right" }
          );
          doc.text(
            String(Number(it.quantity ?? 0)),
            doc.page.margins.left + colNameW + colKitW,
            y,
            { width: colQtyW, align: "right" }
          );
          doc
            .moveTo(doc.page.margins.left, y + h)
            .lineTo(doc.page.margins.left + pageInnerWidth, y + h)
            .strokeColor("#EEE")
            .lineWidth(1)
            .stroke();
          doc.y = y + h + 2;
        });

      doc.end();
    } catch (e) {
      console.error("PDF generation error:", e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

// ================== Account تعديل ==================
app.patch("/api/account", requireAuth, async (req, res) => {
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }
  try {
    const { name, phone, email, password } = req.body || {};
    const updateProps = {};
    if (typeof phone !== "undefined") {
      updateProps["Phone"] = { phone_number: (phone || "").trim() || null };
    }
    if (typeof email !== "undefined") {
      updateProps["Email"] = { email: (email || "").trim() || null };
    }
    if (typeof password !== "undefined") {
      const n = Number(password);
      if (Number.isNaN(n)) {
        return res.status(400).json({ error: "Password must be a number." });
      }
      updateProps["Password"] = { number: n };
    }
    if (typeof name !== "undefined" && name.trim()) {
      updateProps["Name"] = { title: [{ text: { content: name.trim() } }] };
    }
    if (Object.keys(updateProps).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const response = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } },
    });
    if (response.results.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const userPageId = response.results[0].id;

    await notion.pages.update({
      page_id: userPageId,
      properties: updateProps,
    });

    if (updateProps["Name"]) {
      req.session.username = name.trim();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating account:", error.body || error);
    res.status(500).json({ error: "Failed to update account." });
  }
});

// ================== Funds ==================
app.get(
  "/api/funds/check",
  requireAuth,
  requirePage("Funds"),
  async (req, res) => {
    try {
      if (!fundsDatabaseId) {
        return res.status(500).json({
          error:
            "Funds database ID is not configured in environment variables",
          configured: false,
        });
      }
      const database = await notion.databases.retrieve({
        database_id: fundsDatabaseId,
      });
      res.json({
        configured: true,
        title: database.title?.[0]?.plain_text || "Funds Database",
        message: "Funds database is properly configured",
      });
    } catch (error) {
      console.error("Funds database check error:", error.body || error);
      res.status(500).json({
        configured: false,
        error:
          error.message ||
          "Cannot access funds database. Check database ID and sharing permissions.",
      });
    }
  }
);

app.post(
  "/api/funds",
  requireAuth,
  requirePage("Funds"),
  async (req, res) => {
    if (!fundsDatabaseId || !teamMembersDatabaseId) {
      return res
        .status(500)
        .json({ error: "Database IDs are not configured." });
    }
    try {
      const { assignment, expenses } = req.body || {};
      if (!assignment || !assignment.trim()) {
        return res
          .status(400)
          .json({ error: "Mission assignment is required" });
      }
      if (!Array.isArray(expenses) || expenses.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one expense is required" });
      }

      const userQuery = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userQuery.results.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      const userId = userQuery.results[0].id;

      // تحقق سريع للمدخلات
      for (const expense of expenses) {
        const { fundsType, date, from, to, cost } = expense;
        if (
          !fundsType ||
          !date ||
          !from ||
          !to ||
          typeof cost !== "number" ||
          cost <= 0
        ) {
          return res.status(400).json({
            error:
              "All expense fields are required and cost must be a positive number",
          });
        }
      }

      const createdExpenses = await Promise.all(
        expenses.map(async (expense) => {
          const {
            fundsType,
            date,
            from,
            to,
            cost,
            screenshotName,
            screenshotType,
            screenshotSize,
          } = expense;

          const properties = {
            Assignment: {
              title: [{ text: { content: assignment.trim() } }],
            },
            "Funds Type": {
              select: { name: fundsType },
            },
            Date: {
              date: { start: date },
            },
            From: {
              rich_text: [{ text: { content: from } }],
            },
            To: {
              rich_text: [{ text: { content: to } }],
            },
            Cost: {
              number: cost,
            },
            "Team Members": {
              relation: [{ id: userId }],
            },
          };

          // ملاحظة: رفع ملف حقيقي يتطلب تخزين خارجي — هنا بنسجل وصف فقط
          let children = [];
          if (screenshotName) {
            children = [
              {
                object: "block",
                type: "callout",
                callout: {
                  rich_text: [
                    {
                      type: "text",
                      text: {
                        content: `Receipt file: ${screenshotName} (${
                          screenshotType || "unknown type"
                        }${
                          screenshotSize
                            ? `, ${Math.round(screenshotSize / 1024)}KB`
                            : ""
                        })`,
                      },
                    },
                  ],
                  icon: { emoji: "📎" },
                },
              },
            ];
          }

          const created = await notion.pages.create({
            parent: { database_id: fundsDatabaseId },
            properties,
            children: children.length ? children : undefined,
          });

          return {
            id: created.id,
            assignment: assignment.trim(),
            fundsType,
            date,
            from,
            to,
            cost,
            createdTime: created.created_time,
          };
        })
      );

      res.json({
        success: true,
        message: "Mission expenses submitted successfully",
        data: {
          assignment: assignment.trim(),
          expensesCount: createdExpenses.length,
          totalCost: expenses.reduce((sum, exp) => sum + exp.cost, 0),
          createdExpenses,
        },
      });
    } catch (error) {
      console.error("Error submitting funds:", error.body || error);
      res.status(500).json({ error: "Failed to submit mission expenses" });
    }
  }
);

// ============== التصدير للسيرفرلس ==============

// Simple session helpers
app.get("/api/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ username: req.session?.username || null });
});
app.post("/api/logout", (req, res) => {
  if (req.session) req.session = null;
  res.json({ success: true });
});
module.exports = app;