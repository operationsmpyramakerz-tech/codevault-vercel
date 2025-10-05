const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Hardened: if env is missing, export a safe no-op middleware instead of crashing
const hasSecret = !!process.env.SESSION_SECRET;
const hasUrl = !!process.env.UPSTASH_REDIS_URL;

let sessionMiddleware;

if (!hasSecret || !hasUrl) {
  console.error("[session-redis] Missing env:", {
    SESSION_SECRET: hasSecret ? "OK" : "MISSING",
    UPSTASH_REDIS_URL: hasUrl ? "OK" : "MISSING"
  });
  // No-op that lets /health and static work; protected routes will 500 with clear message
  sessionMiddleware = (req, res, next) => {
    const err = new Error("SESSION_NOT_CONFIGURED");
    err.status = 500;
    next(err);
  };
} else {
  const redisClient = createClient({
    url: process.env.UPSTASH_REDIS_URL,      // MUST start with rediss://
    socket: { tls: true, keepAlive: 30000 }
  });

  redisClient.on('error', (err) => console.error('[Redis] error', err?.message || err));
  redisClient.on('connect', () => console.log('[Redis] connecting...'));
  redisClient.on('ready', () => console.log('[Redis] ready ✓'));

  // connect lazily; don't await here to avoid blocking cold start
  redisClient.connect().catch((e) => {
    console.error('[Redis] connect failed:', e?.message || e);
  });

  sessionMiddleware = session({
    store: new RedisStore({ client: redisClient, prefix: 'op:' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    }
  });
}

module.exports = { sessionMiddleware };