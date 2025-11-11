// server/session.js  أو  server/app.js
const session = require("express-session");
const RedisStore = require("connect-redis").default;
const { Redis } = require("@upstash/redis");

// 🔹 تأكد إن القيم موجودة في Vercel
const hasSecret = !!process.env.SESSION_SECRET;
const hasUrl = !!process.env.UPSTASH_REDIS_REST_URL;
const hasToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;

let store = null;

if (hasSecret && hasUrl && hasToken) {
  try {
    // ✅ استخدم REST API بدلاً من TCP socket
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // لا يوجد connect() هنا — REST client مش socket
    store = new RedisStore({
      client: {
        get: async (key) => await redis.get(key),
        set: async (key, val, ttl) => await redis.set(key, val, { ex: ttl }),
        del: async (key) => await redis.del(key),
      },
      prefix: "op:",
    });

    console.log("[Redis] Connected to Upstash via REST ✓");
  } catch (e) {
    console.error("[session-redis] Failed to init RedisStore:", e?.message || e);
  }
} else {
  console.warn("[session-redis] Missing env; using MemoryStore TEMPORARILY for debugging.", {
    SESSION_SECRET: hasSecret ? "OK" : "MISSING",
    UPSTASH_REDIS_REST_URL: hasUrl ? "OK" : "MISSING",
    UPSTASH_REDIS_REST_TOKEN: hasToken ? "OK" : "MISSING",
  });
}

// ✅ إعداد الـ Session
const sessionMiddleware = session({
  store: store || undefined,
  secret: process.env.SESSION_SECRET || "dev-fallback-secret",
  proxy: true,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: process.env.NODE_ENV === "production" ? "__Secure-op.sid" : "op.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 يوم
  },
});

module.exports = { sessionMiddleware };
