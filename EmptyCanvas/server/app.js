const express = require("express");
const path = require("path");
const { Client } = require("@notionhq/client");
const PDFDocument = require("pdfkit"); // PDF

const app = express();
// IMPORTANT for Vercel reverse proxy so secure cookies are honored
app.set("trust proxy", 1);
// Initialize Notion Client using Env Vars
const notion = new Client({ auth: process.env.Notion_API_Key });
const componentsDatabaseId = process.env.Products_Database;
const ordersDatabaseId = process.env.Products_list;
const teamMembersDatabaseId = process.env.Team_Members;
const stocktakingDatabaseId = process.env.School_Stocktaking_DB_ID;
const fundsDatabaseId = process.env.Funds;
// ----- Hardbind: Received Quantity property name (Number) -----
const REC_PROP_HARDBIND = "Quantity received by operations";

// Map internal type codes to Notion Select labels
const TYPE_NAME_MAP = {
  request: "Request Additional Components",
  damage:  "Report Damage Components",
};



// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));


// --- Health FIRST (before session) so it works even if env is missing ---
app.get("/health", (req, res) => {
  res.json({ ok: true, region: process.env.VERCEL_REGION || "unknown" });
});

// Sessions (Redis/Upstash) — added after /health
const { sessionMiddleware } = require("./session-redis");
app.use(sessionMiddleware);
// Small trace to debug redirect loop
app.use((req, res, next) => {
  if (["/login", "/dashboard", "/api/login", "/api/account"].includes(req.path)) {
    console.log(
      "[trace]",
      req.method,
      req.path,
      "sid=" + (req.sessionID || "-"),
      "auth=" + (!!req.session?.authenticated)
    );
  }
  next();
});

// Helpers: Allowed pages control
const ALL_PAGES = [
  "Current Orders",
  "Requested Orders",
  "Assigned Schools Requested Orders",
  "Create New Order",
  "Stocktaking",
  "Funds",
  "Logistics",
  "S.V schools orders",
];

const norm = (s) => String(s || "").trim().toLowerCase();
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/gi, "");

// توحيد الأسماء القادمة من Notion
function normalizePages(names = []) {
  const set = new Set(names.map((n) => String(n || "").trim().toLowerCase()));
  const out = [];
  if (set.has("current orders")) out.push("Current Orders");
  if (set.has("requested orders") || set.has("schools requested orders")) {
    out.push("Requested Orders");
  }
  if (
    set.has("assigned schools requested orders") ||
    set.has("assigned requested orders") ||
    set.has("assigned orders") ||
    set.has("my assigned orders") ||
    set.has("storage") // alias: Storage
  ) {
    out.push("Assigned Schools Requested Orders");
  }
  if (set.has("create new order")) out.push("Create New Order");
  if (set.has("stocktaking")) out.push("Stocktaking");
  if (set.has("funds")) out.push("Funds");
  if (set.has("logistics")) out.push("Logistics");  if (set.has("s.v schools orders") || set.has("sv schools orders")) out.push("S.V schools orders");

  return out;
}

// توسيع الأسماء للواجهة حتى لا يحصل تضارب aliases
function expandAllowedForUI(list = []) {
  const set = new Set((list || []).map((s) => String(s)));
  if (set.has("Requested Orders") || set.has("Schools Requested Orders")) {
    set.add("Requested Orders");
    set.add("Schools Requested Orders");
  }
  if (set.has("Assigned Schools Requested Orders")) {
    set.add("Assigned Schools Requested Orders");
    set.add("Storage"); // الواجهة تعرض Storage
  }
  if (set.has("Funds")) {
    set.add("Funds");
  }
  if (set.has("Logistics")) {
    set.add("Logistics");
  }
  return Array.from(set);
}

function extractAllowedPages(props = {}) {
  // Try known property names first (case-sensitive)
  let candidates =
    props.Pages?.multi_select ||
    props["Allowed Pages"]?.multi_select ||
    props["Allowed pages"]?.multi_select ||
    props["Pages Allowed"]?.multi_select ||
    props["Access Pages"]?.multi_select ||
    [];

  // If still empty, look for any multi_select prop whose name matches /allowed.*pages|pages.*allowed/i
  if (!Array.isArray(candidates) || candidates.length === 0) {
    for (const [key, val] of Object.entries(props || {})) {
      if (val && val.type === "multi_select" && /allowed.*pages|pages.*allowed/i.test(String(key))) {
        candidates = val.multi_select || [];
        break;
      }
    }
  }

  const names = Array.isArray(candidates)
    ? candidates.map((x) => x?.name).filter(Boolean)
    : [];
  const allowed = normalizePages(names);
  return allowed;
}

function firstAllowedPath(allowed = []) {
  if (allowed.includes("Current Orders")) return "/orders";
  if (allowed.includes("Requested Orders")) return "/orders/requested";
  if (allowed.includes("Assigned Schools Requested Orders")) return "/orders/assigned";
  if (allowed.includes("Create New Order")) return "/orders/new";
  if (allowed.includes("Stocktaking")) return "/stocktaking";
  if (allowed.includes("Funds")) return "/funds";
  return "/login";
}

// Helpers — Notion
async function getCurrentUserPageId(username) {
  const userQuery = await notion.databases.query({
    database_id: teamMembersDatabaseId,
    filter: { property: "Name", title: { equals: username } },
  });
  if (userQuery.results.length === 0) return null;
  return userQuery.results[0].id;
}

async function getOrdersDBProps() {
  const db = await notion.databases.retrieve({ database_id: ordersDatabaseId });
  return db.properties || {};
}

function pickPropName(propsObj, aliases = []) {
  const keys = Object.keys(propsObj || {});
  for (const k of keys) {
    if (aliases.some((a) => normKey(a) === normKey(k))) return k;
  }
  return null;
}

// نلقى اسم خاصية Assigned To من الـ DB Properties
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

// خاصية الكمية المتاحة في المخزن
async function detectAvailableQtyPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Available Quantity",
      "Available Qty",
      "In Stock Qty",
      "Qty Available",
      "Stock Available",
    ]) || null
  );
}

// خاصية Status (select) — لاستخدام زر Mark prepared

// "Type" (Select) detector on Orders DB
async function detectTypePropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Type",
      "Request Type",
      "Order Type",
      "نوع الطلب",
      "type"
    ]) || "Type"
  );
}

async function detectStatusPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Status",
      "Order Status",
      "Preparation Status",
      "Prepared Status",
      "state",
    ]) || "Status"
  );
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect("/login");
}

// Page-Access middleware
function requirePage(pageName) {
  return (req, res, next) => {
    const allowed = req.session?.allowedPages || ALL_PAGES;
    if (allowed.includes(pageName)) return next();
    return res.redirect(firstAllowedPath(allowed));
  };
}

// --- Page Serving Routes ---
app.get("/login", (req, res) => {
  if (req.session?.authenticated)
    return res.redirect(firstAllowedPath(req.session.allowedPages || ALL_PAGES));
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/", (req, res) => {
  if (req.session?.authenticated)
    return res.redirect(firstAllowedPath(req.session.allowedPages || ALL_PAGES));
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.redirect(firstAllowedPath(req.session.allowedPages || ALL_PAGES));
});

app.get("/orders", requireAuth, requirePage("Current Orders"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get(
  "/orders/requested",
  requireAuth,
  requirePage("Requested Orders"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "requested-orders.html"));
  },
);

// صفحة جديدة: الطلبات المُسندة للمستخدم الحالي فقط
app.get(
  "/orders/assigned",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "assigned-orders.html"));
  },
);

// 3-step order pages
app.get(
  "/orders/new",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "create-order-details.html"));
  },
);
app.get(
  "/orders/new/products",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    if (!req.session.orderDraft || !req.session.orderDraft.reason) {
      return res.redirect("/orders/new");
    }
    res.sendFile(path.join(__dirname, "..", "public", "create-order-products.html"));
  },
);
app.get(
  "/orders/new/review",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    const d = req.session.orderDraft || {};
    if (!d.reason) return res.redirect("/orders/new");
    if (!Array.isArray(d.products) || d.products.length === 0) {
      return res.redirect("/orders/new/products");
    }
    res.sendFile(path.join(__dirname, "..", "public", "create-order-review.html"));
  },
);

app.get("/stocktaking", requireAuth, requirePage("Stocktaking"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "stocktaking.html"));
});

// Account page
app.get("/account", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "account.html"));
});

// Funds page
app.get("/funds", requireAuth, requirePage("Funds"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "funds.html"));
});
// Logistics page
app.get("/logistics", requireAuth, requirePage("Logistics"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "logistics.html"));
});

// --- API Routes ---

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }
  try {
    const response = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: username } },
    });
    if (response.results.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const user = response.results[0];
    const storedPassword = user.properties.Password?.number;

    if (storedPassword && storedPassword.toString() === password) {
      const allowedNormalized = extractAllowedPages(user.properties);
      req.session.authenticated = true;
      req.session.username = username;
      req.session.allowedPages = allowedNormalized;

      const allowedUI = expandAllowedForUI(allowedNormalized);

      req.session.save((err) => {
        if (err)
          return res.status(500).json({ error: "Session could not be saved." });
        res.json({
          success: true,
          message: "Login successful",
          allowedPages: allowedUI,
        });
      });
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});
// === Helper: Received Quantity (number) — used to keep Rec visible on Logistics ===
async function detectReceivedQtyPropName() {
  const envName = (process.env.NOTION_REC_PROP || "").trim();
  const props = await getOrdersDBProps();
  if (envName && props[envName] && props[envName].type === "number") return envName;

  const candidate = pickPropName(props, [
    "Quantity received by operations",
    "Received Qty",
    "Rec",
  ]);
  if (candidate && props[candidate] && props[candidate].type === "number") return candidate;
  return null;
}

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "Could not log out." });
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// Account info (returns fresh allowedPages)
app.get("/api/account", requireAuth, async (req, res) => {
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }
  try {
    const response = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } },
    });

    if (response.results.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = response.results[0];
    const p = user.properties;

    const freshAllowed = extractAllowedPages(p);
    req.session.allowedPages = freshAllowed;
    const allowedUI = expandAllowedForUI(freshAllowed);

    const data = {
      name: p?.Name?.title?.[0]?.plain_text || "",
      username: req.session.username || "",
      department: p?.Department?.select?.name || "",
      position: p?.Position?.select?.name || "",
      phone: p?.Phone?.phone_number || "",
      email: p?.Email?.email || "",
      employeeCode: p?.["Employee Code"]?.number ?? null,
      password: p?.Password?.number ?? null,
      allowedPages: allowedUI,
    };

    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (error) {
    console.error("Error fetching account from Notion:", error.body || error);
    res.status(500).json({ error: "Failed to fetch account info." });
  }
});

// Order Draft APIs — require Create New Order
app.get(
  "/api/order-draft",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    res.json(req.session.orderDraft || {});
  },
);
app.post(
  "/api/order-draft/details",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Reason is required." });
    }
    req.session.orderDraft = req.session.orderDraft || {};
    req.session.orderDraft.reason = reason.trim();
    return res.json({ ok: true });
  },
);
app.post(
  "/api/order-draft/products",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "No products provided." });
    }
    const clean = products
      .map((p) => ({
        id: String(p.id),
        quantity: Number(p.quantity) || 0,
      }))
      .filter((p) => p.id && p.quantity > 0);

    if (clean.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid products after sanitization." });
    }
    req.session.orderDraft = req.session.orderDraft || {};
    req.session.orderDraft.products = clean;
    return res.json({ ok: true, count: clean.length });
  },
);
app.delete(
  "/api/order-draft",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    delete req.session.orderDraft;
    return res.json({ ok: true });
  },
);


// Save draft TYPE (Step 1)
app.post(
  "/api/order-draft/type",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    const { type } = req.body || {};
    if (!type || !String(type).trim()) {
      return res.status(400).json({ error: "Type is required." });
    }
    req.session.orderDraft = req.session.orderDraft || {};
    const __code = String(type).trim();
    const __label = (req.body && req.body.label && String(req.body.label).trim())
      || (typeof TYPE_NAME_MAP !== 'undefined' && TYPE_NAME_MAP[__code.toLowerCase()])
      || __code;
    req.session.orderDraft.type = __code;
    req.session.orderDraft.typeLabel = __label;
    return res.json({ ok: true, type: __code, label: __label });
  },
);
// Orders listing (Current Orders)
app.get(
  "/api/orders",
  requireAuth,
  requirePage("Current Orders"),
  async (req, res) => {
    if (!ordersDatabaseId || !teamMembersDatabaseId) {
      return res
        .status(500)
        .json({ error: "Database IDs are not configured." });
    }

    res.set("Cache-Control", "no-store");

    try {
      const userQuery = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userQuery.results.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      const userId = userQuery.results[0].id;

      const allOrders = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const response = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: startCursor,
          filter: { property: "Teams Members", relation: { contains: userId } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });

        for (const page of response.results) {
          const productRelation = page.properties.Product?.relation;
          let productName = "Unknown Product";
          if (productRelation && productRelation.length > 0) {
            try {
              const productPage = await notion.pages.retrieve({
                page_id: productRelation[0].id,
              });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text ||
                "Unknown Product";
            } catch (e) {
              console.error(
                "Could not retrieve related product page:",
                e.body || e.message,
              );
            }
          }

          allOrders.push({
            id: page.id,
            reason:
              page.properties?.Reason?.title?.[0]?.plain_text || "No Reason",
            productName,
            quantity: page.properties?.["Quantity Requested"]?.number || 0,
            status:
              page.properties?.["Status"]?.select?.name || "Pending",
            createdTime: page.created_time,
          });
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      const TTL_MS = 10 * 60 * 1000;
      let recent = Array.isArray(req.session.recentOrders)
        ? req.session.recentOrders
        : [];
      recent = recent.filter(
        (r) => Date.now() - new Date(r.createdTime).getTime() < TTL_MS,
      );

      const ids = new Set(allOrders.map((o) => o.id));
      const extras = recent.filter((r) => !ids.has(r.id));
      const merged = allOrders
        .concat(extras)
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

      req.session.recentOrders = recent;

      res.json(merged);
    } catch (error) {
      console.error("Error fetching orders from Notion:", error.body || error);
      res.status(500).json({ error: "Failed to fetch orders from Notion." });
    }
  },
);

// Team members (for assignment) — requires Requested Orders
app.get(
  "/api/team-members",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    try {
      const result = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        sorts: [{ property: "Name", direction: "ascending" }],
      });
      const items = result.results.map((p) => ({
        id: p.id,
        name: p.properties?.Name?.title?.[0]?.plain_text || "Unnamed",
      }));
      res.json(items);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load team members" });
    }
  },
);

// Requested orders for all users — requires Requested Orders
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

          // Created by (Teams Members relation)
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
  },
);

// Assign member to multiple order items — requires Requested Orders
app.post(
  "/api/orders/assign",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    try {
      let { orderIds, memberIds, memberId } = req.body || {};
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds required" });
      }
      if ((!Array.isArray(memberIds) || memberIds.length === 0) && !memberId)
        return res.status(400).json({ error: "memberIds or memberId required" });
      if (!Array.isArray(memberIds) || memberIds.length === 0) memberIds = memberId ? [memberId] : [];

      // Detect property name "Assigned To"
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
            properties: { [assignedProp]: { relation: (memberIds || []).map(id => ({ id })) } },
          }),
        ),
      );

      res.json({ success: true });
    } catch (e) {
      console.error("Assign error:", e.body || e);
      res.status(500).json({ error: "Failed to assign member" });
    }
  },
);

// ========== Assigned: APIs ==========
// 1) جلب الطلبات المسندة للمستخدم الحالي — مع reason + status
app.get(
  "/api/orders/assigned",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName(); // قد يكون null
      const statusProp   = await detectStatusPropName();        // غالبًا "Status"
      // Received Quantity property (Number)
      const receivedProp = (await (async()=>{
        const props = await getOrdersDBProps();
        if (props[REC_PROP_HARDBIND] && props[REC_PROP_HARDBIND].type === "number") return REC_PROP_HARDBIND;
        return await detectReceivedQtyPropName();
      })());

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
          const status = statusProp ? (props[statusProp]?.select?.name || "") : "";
          const recVal = receivedProp ? Number(props[receivedProp]?.number || 0) : 0;

          items.push({
            id: page.id,
            productName,
            requested,
            available,
            remaining,
            quantityReceivedByOperations: recVal,
            rec: recVal,
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
  },
);

// 2) تعليم عنصر أنه "متوفر بالكامل" (تجعل المتاح = المطلوب)
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
        return res.status(400).json({
          error:
            'Please add a Number property "Available Quantity" (or alias) to the Orders database.',
        });
      }

      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(page.properties?.["Quantity Requested"]?.number || 0);
      const newAvailable = requested;

      const statusProp = await detectStatusPropName();
      const updates = { [availableProp]: { number: newAvailable } };
      if (statusProp) {
        const t = page.properties?.[statusProp]?.type || 'select';
        if (t === 'status') updates[statusProp] = { status: { name: 'Prepared' } };
        else updates[statusProp] = { select: { name: 'Prepared' } };
      }

      await notion.pages.update({
        page_id: orderPageId,
        properties: updates,
      });

      res.json({
        success: true,
        available: newAvailable,
        remaining: 0,
      });
    } catch (e) {
      console.error(e.body || e);
      res.status(500).json({ error: "Failed to update availability" });
    }
  },
);

// 3) إدخال كمية متاحة جزئيًا
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
        return res.status(400).json({
          error:
            'Please add a Number property "Available Quantity" (or alias) to the Orders database.',
        });
      }

      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(page.properties?.["Quantity Requested"]?.number || 0);
      const newAvailable = Math.min(requested, Math.max(0, Math.floor(availNum)));
      const remaining = Math.max(0, requested - newAvailable);

      const statusProp = await detectStatusPropName();
      const updates = { [availableProp]: { number: newAvailable } };
      if (statusProp && newAvailable === requested) {
        const t = page.properties?.[statusProp]?.type || 'select';
        if (t === 'status') updates[statusProp] = { status: { name: 'Prepared' } };
        else updates[statusProp] = { select: { name: 'Prepared' } };
      }

      await notion.pages.update({
        page_id: orderPageId,
        properties: updates,
      });

      res.json({ success: true, available: newAvailable, remaining });
    } catch (e) {
      console.error(e.body || e);
      res.status(500).json({ error: "Failed to update available quantity" });
    }
  },
);

// 3-b) تحويل حالة مجموعة عناصر طلب إلى Prepared (زر في الكارت)
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
        return res.status(400).json({ error: 'Please add a Select property "Status" to the Orders database.' });
      }

      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: { [statusProp]: { select: { name: "Prepared" } } },
          }),
        ),
      );

      res.json({ success: true, updated: orderIds.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to mark as Prepared" });
    }
  },
);
// --- Logistics: mark-received (Status + Quantity received by operations) ---
app.post('/api/logistics/mark-received', requireAuth, async (req, res) => {
  try {
    const { itemIds = [], statusById = {}, recMap = {} } = req.body || {};
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No itemIds' });
    }

    const STATUS_PROP_ENV = (process.env.NOTION_STATUS_PROP || '').trim(); // e.g. "Status"
    const REQ_PROP_ENV    = (process.env.NOTION_REQ_PROP    || '').trim(); // e.g. "Quantity Requested"
    const REC_PROP_ENV    = (process.env.NOTION_REC_PROP    || '').trim(); // "Quantity received by operations"
    const AVAIL_PROP_ENV  = (process.env.NOTION_AVAIL_PROP  || '').trim(); // e.g. "Available"

    // Prefer your exact column name if present in the file's scope
    const REC_HARDBIND = (typeof REC_PROP_HARDBIND !== 'undefined' && REC_PROP_HARDBIND)
      ? REC_PROP_HARDBIND
      : (REC_PROP_ENV || 'Quantity received by operations');

    const pickProp = (props, preferredName, typeWanted, aliases = [], regexHint = null) => {
      if (preferredName && props[preferredName] && (!typeWanted || props[preferredName].type === typeWanted)) {
        return preferredName;
      }
      for (const n of aliases) {
        if (n && props[n] && (!typeWanted || props[n].type === typeWanted)) return n;
      }
      if (regexHint) {
        const rx = new RegExp(regexHint, 'i');
        for (const k of Object.keys(props || {})) {
          if ((!typeWanted || props[k]?.type === typeWanted) && rx.test(k)) return k;
        }
      }
      if (typeWanted) {
        const any = Object.keys(props || {}).find(k => props[k]?.type === typeWanted);
        if (any) return any;
      }
      return null;
    };

    const results = [];

    for (const pageId of itemIds) {
      // Get fresh properties
      const page  = await notion.pages.retrieve({ page_id: pageId });
      const props = page?.properties || {};

      const statusPropName = pickProp(
        props,
        STATUS_PROP_ENV,
        null,
        ['Status', 'Order Status', 'Operations Status']
      );
      const requestedPropName = pickProp(
        props,
        REQ_PROP_ENV,
        'number',
        ['Quantity Requested', 'Requested Qty', 'Req', 'Request Qty'],
        '(request|req)'
      );
      const availablePropName = pickProp(
        props,
        AVAIL_PROP_ENV,
        'number',
        ['Available', 'Quantity Available', 'Avail'],
        '(avail|available)'
      );
      let recPropName = pickProp(
        props,
        REC_HARDBIND,
        'number',
        ['Quantity received by operations', 'Received Qty', 'Received Quantity', 'Quantity Received', 'Rec', 'REC'],
        '(received|rec\b)'
      );

      const reqNow   = Number(props?.[requestedPropName]?.number ?? NaN);
      const availNow = Number(props?.[availablePropName]?.number ?? NaN);

      // Rec mirrors the latest Available. If no available column, fall back to recMap
      let recValue = Number(recMap[pageId]);
      if (Number.isFinite(availNow)) recValue = availNow;

      const missing = (Number.isFinite(reqNow) && Number.isFinite(availNow))
        ? Math.max(0, reqNow - availNow)
        : NaN;

      // Rule: req = avail AND rec < req AND missing = 0 => move to Prepared
      const forceFullyPrepared =
        Number.isFinite(reqNow) && Number.isFinite(availNow) &&
        reqNow === availNow && Number.isFinite(recValue) && recValue < reqNow && missing === 0;

      const updateProps = {};

      // Write Rec
      if (Number.isFinite(recValue)) {
        if (recPropName && props[recPropName]?.type === 'number') {
          updateProps[recPropName] = { number: recValue };
        } else if (props['Quantity received by operations']?.type === 'number') {
          updateProps['Quantity received by operations'] = { number: recValue };
        }
      }

      // Write Status
      const nextStatusName = forceFullyPrepared ? 'Prepared' : String(statusById[pageId] || '').trim();
      if (nextStatusName && statusPropName && props[statusPropName]) {
        const t = props[statusPropName].type; // "select" or "status"
        if (t === 'select') {
          updateProps[statusPropName] = { select: { name: nextStatusName } };
        } else if (t === 'status') {
          updateProps[statusPropName] = { status: { name: nextStatusName } };
        }
      }

      if (Object.keys(updateProps).length === 0) {
        results.push({ pageId, skipped: true, reason: 'No matching properties on page' });
        continue;
      }

      await notion.pages.update({ page_id: pageId, properties: updateProps });
      results.push({ pageId, ok: true, forcedFullyPrepared: !!forceFullyPrepared });
    }

    return res.json({ ok: true, updated: results });
  } catch (e) {
    console.error('logistics/mark-received error:', e?.body || e);
    return res.status(500).json({ ok: false, error: 'Failed to mark received' });
  }
});
app.get(
  "/api/orders/assigned/pdf",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    // 4-b) PDF استلام المكونات (Receipt) لمجموعة عناصر طلب (ids)
// يستخدم ids=pageId1,pageId2,...
app.get(
  "/api/orders/assigned/receipt",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp  = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();
      const statusProp    = await detectStatusPropName();

      const ids = String(req.query.ids || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (!ids.length) {
        return res.status(400).json({ error: "ids query is required" });
      }

      // اجمع العناصر المطلوبة فقط (ولازم تكون مُسندة للمستخدم)
      const items = [];
      let reasonTitle = "";
      let createdAt = null;

      for (const id of ids) {
        try {
          const page = await notion.pages.retrieve({ page_id: id });
          const props = page.properties || {};

          // تأكد أنها مُسندة للمستخدم الحالي
          const rel = props[assignedProp]?.relation || [];
          const isMine = Array.isArray(rel) && rel.some(r => r.id === userId);
          if (!isMine) continue;

          // الاسم + الأرقام
          let productName = "Unknown Product";
          const relP = props.Product?.relation;
          if (Array.isArray(relP) && relP.length) {
            try {
              const productPage = await notion.pages.retrieve({ page_id: relP[0].id });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text || productName;
            } catch {}
          }

          const requested = Number(props["Quantity Requested"]?.number || 0);
          const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
          const status    = statusProp ? (props[statusProp]?.select?.name || "") : "";

          items.push({
            productName,
            requested,
            available,
            status
          });

          // استخدم أول عنصر لمعلومات عامة للغلاف (السبب + التاريخ)
          if (!reasonTitle) {
            reasonTitle = props.Reason?.title?.[0]?.plain_text || "";
            createdAt = page.created_time || null;
          }
        } catch {}
      }

      if (!items.length) {
        return res.status(404).json({ error: "No items found for this receipt." });
      }

      // === PDF ===
      const fname = `Receipt-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      // Header
      doc.font("Helvetica-Bold").fontSize(18).text("Components Receipt", { align: "left" });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).fillColor("#555")
        .text(`Generated: ${new Date().toLocaleString()}`, { continued: true })
        .text(`   •   User: ${req.session.username || "-"}`);

      if (reasonTitle) {
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(11).fillColor("#111")
          .text(`Reason: ${reasonTitle}`);
      }
      if (createdAt) {
        doc.font("Helvetica").fontSize(10).fillColor("#777")
          .text(`Order created: ${new Date(createdAt).toLocaleString()}`);
      }

      doc.moveDown(0.8);
      const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Table columns
      const colNameW = Math.floor(pageInnerWidth * 0.60);
      const colReqW  = Math.floor(pageInnerWidth * 0.18);
      const colAvailW= pageInnerWidth - colNameW - colReqW;

      const drawHead = () => {
        const y = doc.y, h = 22;
        doc.save();
        doc.roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6)
          .fillColor("#F3F4F6").strokeColor("#E5E7EB").lineWidth(1).fillAndStroke();
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 10, y + 6, { width: colNameW });
        doc.text("Quantity",  doc.page.margins.left + 10 + colNameW, y + 6, {
          width: colReqW - 10, align: "right",
        });
        doc.text("Available", doc.page.margins.left + colNameW + colReqW, y + 6, {
          width: colAvailW - 10, align: "right",
        });
        doc.restore();
        doc.moveDown(1.2);
      };

      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + need > bottom) { doc.addPage(); drawHead(); }
      };

      drawHead();
      doc.font("Helvetica").fontSize(11).fillColor("#111");

      items.forEach((it) => {
        ensureSpace(24);
        const y = doc.y, h = 18;
        doc.text(it.productName || "-", doc.page.margins.left + 2, y, { width: colNameW });
        doc.text(String(it.requested || 0), doc.page.margins.left + colNameW, y, {
          width: colReqW - 10, align: "right",
        });
        doc.text(String(it.available ?? ""), doc.page.margins.left + colNameW + colReqW, y, {
          width: colAvailW - 10, align: "right",
        });
        doc.moveTo(doc.page.margins.left, y + h + 4)
          .lineTo(doc.page.margins.left + pageInnerWidth, y + h + 4)
          .strokeColor("#EEE").lineWidth(1).stroke();
        doc.y = y + h + 6;
      });

      doc.moveDown(1.2);
      doc.font("Helvetica").fontSize(10).fillColor("#555")
        .text("Signature:", { continued: true })
        .text(" _________________________________", { align: "left" });

      doc.end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to generate receipt PDF" });
    }
  },
);
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp  = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();

      const idsStr = String(req.query.ids || "").trim();
      const items = [];

      if (idsStr) {
        const ids = idsStr.split(",").map((s) => s.trim()).filter(Boolean);
        for (const id of ids) {
          try {
            const page = await notion.pages.retrieve({ page_id: id });
            const props = page.properties || {};

            const rel = props[assignedProp]?.relation || [];
            const isMine = Array.isArray(rel) && rel.some((r) => r.id === userId);
            if (!isMine) continue;

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
          } catch {}
        }
      } else {
        let hasMore = true, startCursor;
        while (hasMore) {
          const resp = await notion.databases.query({
            database_id: ordersDatabaseId,
            start_cursor: startCursor,
            filter: { property: assignedProp, relation: { contains: userId } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          });

          for (const page of resp.results) {
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

          hasMore = resp.has_more;
          startCursor = resp.next_cursor;
        }
      }

      // PDF
      const fname = `Assigned-Shortage-${new Date().toISOString().slice(0, 10)}.pdf`;
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
        const y = doc.y;
        const h = 20;
        doc.save();
        doc.rect(doc.page.margins.left, y, pageInnerWidth, h).fill("#F3F4F6");
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 6, y + 5, { width: colNameW });
        doc.text("Requested", doc.page.margins.left + 6 + colNameW, y + 5, { width: colReqW, align: "right" });
        doc.text("Available", doc.page.margins.left + 6 + colNameW + colReqW, y + 5, { width: colAvailW, align: "right" });
        doc.text("Missing", doc.page.margins.left + 6 + colNameW + colReqW + colAvailW, y + 5, { width: colRemW, align: "right" });
        doc.restore();
        doc.moveDown(1);
      };
      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + need > bottom) { doc.addPage(); drawHead(); }
      };
      drawHead();

      doc.font("Helvetica").fontSize(11).fillColor("#111");
      items.forEach((it) => {
        ensureSpace(22);
        const y = doc.y;
        const h = 18;
        doc.text(it.productName || "-", doc.page.margins.left + 2, y, { width: colNameW });
        doc.text(String(it.requested || 0), doc.page.margins.left + colNameW, y, { width: colReqW, align: "right" });
        doc.text(String(it.available || 0), doc.page.margins.left + colNameW + colReqW, y, { width: colAvailW, align: "right" });
        doc.text(String(it.remaining || 0), doc.page.margins.left + colNameW + colReqW + colAvailW, y, { width: colRemW, align: "right" });
        doc.moveTo(doc.page.margins.left, y + h).lineTo(doc.page.margins.left + pageInnerWidth, y + h).strokeColor("#EEE").lineWidth(1).stroke();
        doc.y = y + h + 2;
      });

      doc.end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

// Components list — requires Create New Order
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
        const componentsFromPage = response.results
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
        allComponents.push(...componentsFromPage);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }
      res.json(allComponents);
    } catch (error) {
      console.error("Error fetching from Notion:", error.body || error);
      res.status(500).json({ error: "Failed to fetch data from Notion API." });
    }
  },
);

// Submit Order — requires Create New Order
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

    let { reason, products, type, label } = req.body || {};

    if (!reason || !Array.isArray(products) || products.length === 0) {
      const d = req.session.orderDraft;
      if (d && d.reason && Array.isArray(d.products) && d.products.length > 0) {
        reason = d.reason;
        products = d.products;
      }

    // Get type from draft if not in body
    if (!type && req.session.orderDraft && req.session.orderDraft.type) {
      type = req.session.orderDraft.type;
    }
    // Normalize 'type' to the human label for Notion
    let typeLabel = '';
    if (label && String(label).trim()) {
      typeLabel = String(label).trim();
    } else if (req.session.orderDraft && req.session.orderDraft.typeLabel) {
      typeLabel = String(req.session.orderDraft.typeLabel);
    } else if (type) {
      typeLabel = (typeof TYPE_NAME_MAP !== 'undefined' && TYPE_NAME_MAP[String(type).toLowerCase()]) || String(type);
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

      
      // Resolve "Type" property name if exists
      let typeProp = null;
      try { typeProp = await detectTypePropName(); } catch {}

      const creations = await Promise.all(
        products.map(async (product) => {
          const created = await notion.pages.create({
            parent: { database_id: ordersDatabaseId },
            properties: {
              Reason: { title: [{ text: { content: reason || "" } }] },
              "Quantity Requested": { number: Number(product.quantity) },
              Product: { relation: [{ id: product.id }] },
              "Status": { select: { name: "Pending" } },
              "Teams Members": { relation: [{ id: userId }] },
              ...(typeLabel && typeProp ? { [typeProp]: { select: { name: String(typeLabel) } } } : {}),
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
        }),
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
        recentOrders,
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
  },
);

// Update Status — requires Current Orders
app.post(
  "/api/update-received",
  requireAuth,
  requirePage("Current Orders"),
  async (req, res) => {
    const { orderPageId } = req.body;
    if (!orderPageId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing orderPageId" });
    }
    try {
      await notion.pages.update({
        page_id: orderPageId,
        properties: { "Status": { select: { name: "Received" } } },
      });
      res.json({ success: true });
    } catch (error) {
      console.error(
        "Error updating status:",
        error.body || error.message,
      );
      res
        .status(500)
        .json({ success: false, error: "Failed to update status" });
    }
  },
);

// ===== Stocktaking data (JSON) — requires Stocktaking =====
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

        const stockFromPage = stockResponse.results
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
              props["OneKitQuantity"],
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
  },
);

// ===== Stocktaking PDF download — requires Stocktaking =====
app.get(
  "/api/stock/pdf",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
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

        const stockFromPage = stockResponse.results
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
              props["OneKitQuantity"],
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

      // Grouping + PDF layout (كما هو)
      const groupsMap = new Map();
      (allStock || []).forEach((it) => {
        const name = it?.tag?.name || "Untagged";
        const color = it?.tag?.color || "default";
        const key = `${String(name).toLowerCase()}|${color}`;
        if (!groupsMap.has(key)) groupsMap.set(key, { name, color, items: [] });
        groupsMap.get(key).items.push(it);
      });
      let groups = Array.from(groupsMap.values()).sort((a, b) =>
        String(a.name).localeCompare(String(b.name)),
      );
      const untagged = groups.filter(
        (g) => String(g.name).toLowerCase() === "untagged" || g.name === "-",
      );
      groups = groups
        .filter(
          (g) =>
            !(String(g.name).toLowerCase() === "untagged" || g.name === "-"),
        )
        .concat(untagged);

      const fname = `Stocktaking-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      const palette = {
        default: { fill: "#F3F4F6", border: "#E5E7EB", text: "#111827" },
        gray: { fill: "#F3F4F6", border: "#E5E7EB", text: "#374151" },
        brown: { fill: "#EFEBE9", border: "#D7CCC8", text: "#4E342E" },
        orange: { fill: "#FFF7ED", border: "#FED7AA", text: "#9A3412" },
        yellow: { fill: "#FEFCE8", border: "#FDE68A", text: "#854D0E" },
        green: { fill: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
        blue: { fill: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
        purple: { fill: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6" },
        pink: { fill: "#FDF2F8", border: "#FBCFE8", text: "#9D174D" },
        red: { fill: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
      };
      const getPal = (c = "default") => palette[c] || palette.default;

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111827")
        .text("Stocktaking", { align: "left" });
      doc.moveDown(0.2);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#6B7280")
        .text(`School: ${schoolName}`, { continued: true })
        .text(`   •   Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(0.6);

      const pageInnerWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const gap = 10;
      const colKitW = 120;
      const colQtyW = 90;
      const colNameW = pageInnerWidth - colKitW - colQtyW - gap * 2;

      const drawGroupHeader = (gName, pal, count, cont = false) => {
        const y = doc.y + 2;
        const h = 22;
        doc.save();
        doc
          .roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc
          .fillColor("#6B7280")
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("Tag", doc.page.margins.left + 10, y + 6);
        const pillText = cont ? `${gName} (cont.)` : gName;
        const pillPadX = 10,
          pillH = 16;
        const pillW = Math.max(
          40,
          doc.widthOfString(pillText, { font: "Helvetica-Bold", size: 10 }) +
            pillPadX * 2,
        );
        const pillX = doc.page.margins.left + 38;
        const pillY = y + (h - pillH) / 2;
        doc
          .roundedRect(pillX, pillY, pillW, pillH, 8)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc
          .fillColor(pal.text)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(pillText, pillX + pillPadX, pillY + 3);
        const countTxt = `${count} items`;
        doc
          .fillColor("#111827")
          .font("Helvetica-Bold")
          .text(countTxt, doc.page.margins.left, y + 5, {
            width: pageInnerWidth - 10,
            align: "right",
          });
        doc.restore();
        doc.moveDown(1.4);
      };

      const drawTableHead = (pal) => {
        const y = doc.y;
        const h = 20;
        doc.save();
        doc
          .roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc.fillColor(pal.text).font("Helvetica-Bold").fontSize(10);

        doc.text("Component", doc.page.margins.left + 10, y + 5, {
          width: colNameW,
        });
        doc.text(
          "One Kit Quantity",
          doc.page.margins.left + 10 + colNameW + gap,
          y + 5,
          { width: colKitW - 10, align: "right" },
        );
        const lastX = doc.page.margins.left + colNameW + gap + colKitW + gap;
        doc.text("In Stock", lastX, y + 5, {
          width: colQtyW - 10,
          align: "right",
        });

        doc.restore();
        doc.moveDown(1.2);
      };

      const ensureSpace = (needH, onNewPage) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + needH > bottom) {
          doc.addPage();
          onNewPage?.();
        }
      };

      const drawRow = (item, pal) => {
        const y = doc.y;
        const nameHeight = doc.heightOfString(item.name || "-", {
          width: colNameW,
        });
        const rowH = Math.max(18, nameHeight);
        ensureSpace(rowH + 8);

        doc.font("Helvetica").fontSize(11).fillColor("#111827");
        doc.text(item.name || "-", doc.page.margins.left + 2, doc.y, {
          width: colNameW,
        });

        const text = String(Number(item.oneKitQuantity ?? 0));
        const pillPadX = 8,
          pillH = 16;
        const pillW = Math.max(
          32,
          doc.widthOfString(text, { font: "Helvetica-Bold", size: 10 }) +
            pillPadX * 2,
        );
        const pillX =
          doc.page.margins.left + colNameW + gap + (colKitW - pillW - 10);
        const pillY = y + (rowH - pillH) / 2;
        doc
          .roundedRect(pillX, pillY, pillW, pillH, 8)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc
          .fillColor(pal.text)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(text, pillX + pillPadX, pillY + 3);

        const lastX = doc.page.margins.left + colNameW + gap + colKitW + gap;
        doc
          .fillColor("#111827")
          .font("Helvetica")
          .fontSize(11)
          .text(String(Number(item.quantity ?? 0)), lastX, y, {
            width: colQtyW - 10,
            align: "right",
          });

        doc
          .moveTo(doc.page.margins.left, y + rowH + 4)
          .lineTo(doc.page.margins.left + pageInnerWidth, y + rowH + 4)
          .strokeColor("#F3F4F6")
          .lineWidth(1)
          .stroke();

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
          ensureSpace(40, () => {
            drawGroupHeader(g.name, pal, g.items.length, true);
            drawTableHead(pal);
          });
          drawRow(item, pal);
        }
      }

      doc.end();
    } catch (e) {
      console.error("PDF generation error:", e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

// Update account info (PATCH) — اختيارى
app.patch("/api/account", requireAuth, async (req, res) => {
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }
  try {
    const { name, phone, email, password } = req.body;
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

// بعد pickPropName() والدوال المشابهة
async function detectOrderIdPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Order ID",
      "Order Code",
      "Order Group",
      "Batch ID",
      "OrderId",
      "Order_Code"
    ]) || null
  );
}


// ===== Logistics listing — requires Logistics =====
app.get("/api/logistics", requireAuth, requirePage("Logistics"), async (req, res) => {
  try {
    const statusFilter = String(req.query.status || "Prepared");
    const statusProp = await detectStatusPropName();
    const availableProp = await detectAvailableQtyPropName();
    const receivedProp = await (async()=>{
      const props = await getOrdersDBProps();
      if (props[REC_PROP_HARDBIND] && props[REC_PROP_HARDBIND].type === 'number') return REC_PROP_HARDBIND;
      return await detectReceivedQtyPropName();
    })();
    const items = [];
    let hasMore = true, cursor;

    while (hasMore) {
      const q = await notion.databases.query({
        database_id: ordersDatabaseId,
        start_cursor: cursor,
        filter: { property: statusProp, select: { equals: statusFilter } },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      });

      for (const page of q.results) {
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
        // For Prepared tab we only show fully available
        if (statusFilter === "Prepared" && requested > 0 && available < requested) continue;

        const recVal = receivedProp ? Number(props[receivedProp]?.number || 0) : (props[REC_PROP_HARDBIND]?.type === 'number' ? Number(props[REC_PROP_HARDBIND]?.number || 0) : 0);
        items.push({
          id: page.id,
          reason: props.Reason?.title?.[0]?.plain_text || "No Reason",
          productName,
          requested,
          available,
          quantityReceivedByOperations: recVal,
          status: props[statusProp]?.select?.name || statusFilter,
        });
      }
      hasMore = q.has_more;
      cursor = q.next_cursor;
    }
    res.set("Cache-Control", "no-store");
    res.json(items);
  } catch (e) {
    console.error("Logistics list error:", e.body || e);
    res.status(500).json({ error: "Failed to fetch logistics list" });
  }
});


// === Helper: upload base64 image to Vercel Blob (SDK v2) and return a public URL ===
async function uploadToBlobFromBase64(dataUrl, filenameHint = "receipt.jpg") {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_TOKEN_MISSING");
  const m = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("INVALID_DATA_URL");
  const contentType = m[1];
  const b64 = m[2];
  const buffer = Buffer.from(b64, "base64");
  const { put } = await import("@vercel/blob");
  const res = await put(filenameHint, buffer, {
    access: "public",
    token,
    contentType,
  });
  if (!res || !res.url) throw new Error("BLOB_PUT_FAILED");
  return res.url;
}

// Export Express app for Vercel

// ====== S.V schools orders: helpers ======
async function detectSVSchoolsPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, ["S.V Schools","SV Schools","S V Schools","S.V schools"]) ||
    "S.V Schools"
  );
}
async function detectSVApprovalPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, ["S.V Approval","SV Approval"]) ||
    "S.V Approval"
  );
}
async function detectRequestedQtyPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, ["Quantity Requested","Requested Qty","Req"]) ||
    "Quantity Requested"
  );
}

// Detect the "Teams Members" relation column on the Orders DB
async function detectOrderTeamsMembersPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Teams Members",
      "Team Members",
      "Teams_Members",
      "Teams members",
      "Members",
      "Created by",
      "User",
      "Owner"
    ]) || "Teams Members"
  );
}


// ====== Page route: S.V schools orders ======
app.get("/orders/sv-orders", requireAuth, requirePage("S.V schools orders"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "sv-orders.html"));
});

// ====== API: list S.V orders for current user ======
app.get("/api/sv-orders", requireAuth, requirePage("S.V schools orders"), async (req, res) => {
try {
  // Identify the current Team Member page
  const userQuery = await notion.databases.query({
    database_id: teamMembersDatabaseId,
    filter: { property: 'Name', title: { equals: req.session.username } },
  });
  if (!userQuery.results.length) return res.status(404).json({ error: 'User not found' });
  const userId = userQuery.results[0].id;

  // Resolve property names on Orders DB (Products_list)
  const reqQtyProp    = await detectRequestedQtyPropName();
  const approvalProp  = await detectSVApprovalPropName();
  const teamsProp     = await detectOrderTeamsMembersPropName();
  let   svRelProp     = await detectSVSchoolsPropName();

  // Verify S.V relation actually exists & is a relation; otherwise null it
  const ordersProps = await getOrdersDBProps();
  if (!ordersProps[svRelProp] || ordersProps[svRelProp].type !== 'relation') {
    svRelProp = null;
  }

  const items = [];
  let hasMore = true, startCursor;

  // Primary filter: Teams Members contains current user (this exists per your DB)
  while (hasMore) {
    const resp = await notion.databases.query({
      database_id: ordersDatabaseId,
      start_cursor: startCursor,
      filter: { property: teamsProp, relation: { contains: userId } },
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });

    for (const page of resp.results) {
      const props = page.properties || {};

      // If S.V Schools relation exists, enforce it in code too
      if (svRelProp) {
        const svArr = props[svRelProp]?.relation;
        const svHasUser = Array.isArray(svArr) && svArr.some(r => r && r.id === userId);
        if (!svHasUser) continue;
      }

      // Product name (from Product relation if present)
      let productName = 'Item';
      const productRel = props.Product?.relation;
      if (Array.isArray(productRel) && productRel.length) {
        try {
          const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
          productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
        } catch {}
      } else {
        productName = props.Name?.title?.[0]?.plain_text || productName;
      }

      items.push({
        id: page.id,
        reason: props.Reason?.title?.[0]?.plain_text || '',
        productName,
        quantity: Number(props[reqQtyProp]?.number || 0),
        approval: props[approvalProp]?.select?.name || props[approvalProp]?.status?.name || '',
        createdTime: page.created_time,
      });
    }

    hasMore = resp.has_more;
    startCursor = resp.next_cursor;
  }

  res.set('Cache-Control', 'no-store');
  return res.json(items);
} catch (e) {
  console.error('GET /api/sv-orders error:', e?.body || e);
  return res.status(500).json({ error: 'Failed to load S.V orders' });
}
});
    // ====== API: update quantity (number only) ======
app.post("/api/sv-orders/:id/quantity", requireAuth, requirePage("S.V schools orders"), async (req, res) => {
  try {
    const pageId = req.params.id;
    const value = Number((req.body?.value ?? "").toString().trim());
    if (!pageId) return res.status(400).json({ error: "Missing id" });
    if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: "Invalid quantity" });

    const reqQtyProp = await detectRequestedQtyPropName();
    await notion.pages.update({ page_id: pageId, properties: { [reqQtyProp]: { number: Math.floor(value) } } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/sv-orders/:id/quantity error:", e?.body || e);
    return res.status(500).json({ error: "Failed to update quantity" });
  }
});

// ====== API: list S.V orders with tabs (Not Started / Approved / Rejected) ======
app.get("/api/sv-orders", requireAuth, requirePage("S.V schools orders"), async (req, res) => {
  try {
    // Map ?tab to S.V Approval label
    const tab = String(req.query.tab || "").toLowerCase();
    let label = "Not Started";
    if (tab === "approved") label = "Approved";
    else if (tab === "rejected") label = "Rejected";

    // Identify current Team Member (by session username)
    const userQuery = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } },
    });
    if (!userQuery.results.length) return res.status(404).json({ error: "User not found" });
    const userId = userQuery.results[0].id;

    // Resolve property names on Orders DB
    const reqQtyProp    = await detectRequestedQtyPropName();
    const approvalProp  = await detectSVApprovalPropName();
    const teamsProp     = await detectOrderTeamsMembersPropName();
    let   svRelProp     = await detectSVSchoolsPropName();

    const ordersProps   = await getOrdersDBProps();
    const approvalType  = ordersProps[approvalProp]?.type || "select";
    if (!ordersProps[svRelProp] || ordersProps[svRelProp].type !== "relation") {
      svRelProp = null; // if relation missing in schema, ignore
    }

    // Build Notion filter
    const andFilter = [
      { property: teamsProp, relation: { contains: userId } },
    ];
    if (svRelProp) {
      andFilter.push({ property: svRelProp, relation: { contains: userId } });
    }
    if (label) {
      if (approvalType === "status") {
        andFilter.push({ property: approvalProp, status: { equals: label } });
      } else {
        andFilter.push({ property: approvalProp, select: { equals: label } });
      }
    }

    const items = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const resp = await notion.databases.query({
        database_id: ordersDatabaseId,
        start_cursor: startCursor,
        filter: { and: andFilter },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      });

      for (const page of resp.results) {
        const props = page.properties || {};

        // Product name from relation if present
        let productName = "Item";
        const productRel = props.Product?.relation;
        if (Array.isArray(productRel) && productRel.length) {
          try {
            const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
            productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
          } catch {}
        } else {
          productName = props.Name?.title?.[0]?.plain_text || productName;
        }

        items.push({
          id: page.id,
          reason: props.Reason?.title?.[0]?.plain_text || "",
          productName,
          quantity: Number(props[reqQtyProp]?.number || 0),
          approval: props[approvalProp]?.select?.name || props[approvalProp]?.status?.name || "",
          createdTime: page.created_time,
        });
      }

      hasMore = resp.has_more;
      startCursor = resp.next_cursor;
    }

    res.set("Cache-Control", "no-store");
    return res.json(items);
  } catch (e) {
    console.error("GET /api/sv-orders error:", e?.body || e);
    return res.status(500).json({ error: "Failed to load S.V orders" });
  }
});


// --- S.V schools orders: Approve/Reject (updates Notion "S.V Approval") ---
app.post(
  ["/api/sv-orders/:id/approval", "/sv-orders/:id/approval"],
  requireAuth,
  requirePage("S.V schools orders"),
  async (req, res) => {
    try {
      const pageId = req.params.id;
      const raw = String(req.body?.decision || "").toLowerCase();
      const decision =
        raw === "approved" ? "Approved" :
        raw === "rejected" ? "Rejected" :
        raw === "not started" ? "Not Started" : null;

      if (!pageId || !decision) {
        return res.status(400).json({ ok:false, error: "Invalid id or decision" });
      }

      const approvalProp = await detectSVApprovalPropName();
      const ordersProps  = await getOrdersDBProps();
      const type         = ordersProps[approvalProp]?.type || "select";

      const properties = type === "status"
        ? { [approvalProp]: { status: { name: decision } } }
        : { [approvalProp]: { select: { name: decision } } };

      await notion.pages.update({ page_id: pageId, properties });

      return res.json({ ok:true, id: pageId, decision });
    } catch (e) {
      console.error("POST /api/sv-orders/:id/approval error:", e?.body || e);
      return res.status(500).json({ ok:false, error: "Failed to update S.V Approval", details: e?.body || String(e) });
    }
  }
);
module.exports = app;
