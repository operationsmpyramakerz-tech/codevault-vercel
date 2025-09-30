// EmptyCanvas/server/session-redis.js
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Upstash Redis connection (TLS)
const redisClient = createClient({
  url: process.env.UPSTASH_REDIS_URL,
  socket: { tls: true, keepAlive: 30000 }
});

redisClient.on('error', (err) => console.error('Redis error', err));
redisClient.connect().catch(console.error);

const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient, prefix: 'op:' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // refresh cookie maxAge on every request
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
});

module.exports = { sessionMiddleware };
