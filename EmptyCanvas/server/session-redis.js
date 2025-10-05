const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const hasSecret = !!process.env.SESSION_SECRET;
const hasUrl = !!process.env.UPSTASH_REDIS_URL;
let sessionMiddleware;

if (!hasSecret || !hasUrl) {
  console.error("[session-redis] Missing env:", {
    SESSION_SECRET: hasSecret ? "OK" : "MISSING",
    UPSTASH_REDIS_URL: hasUrl ? "OK" : "MISSING"
  });
  sessionMiddleware = (req, res, next) => {
    const err = new Error("SESSION_NOT_CONFIGURED");
    err.status = 500;
    next(err);
  };
} else {
  const redisClient = createClient({
    url: process.env.UPSTASH_REDIS_URL,
    socket: { tls: true, keepAlive: 30000 }
  });
  redisClient.on('error', (err) => console.error('[Redis] error', err?.message || err));
  redisClient.on('connect', () => console.log('[Redis] connecting...'));
  redisClient.on('ready', () => console.log('[Redis] ready ✓'));
  redisClient.connect().catch((e) => {
    console.error('[Redis] connect failed:', e?.message || e);
  });

  // Use secure cookie options compatible with Vercel
  const domain =
    process.env.COOKIE_DOMAIN ||
    (process.env.VERCEL_URL ? `.${process.env.VERCEL_URL.replace(/^https?:\\/\\//, '')}` : undefined);

  sessionMiddleware = session({
    store: new RedisStore({ client: redisClient, prefix: 'op:' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: true, // Always true on Vercel (HTTPS)
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: '/',
      domain
    }
  });
}

module.exports = { sessionMiddleware };