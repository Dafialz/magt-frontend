// server.js (PostgreSQL)
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import purchasesRouter from "./purchases.js"; // історичний файловий кеш (можна прибрати)
import pkg from "pg";
const { Pool } = pkg;

/* ---------- ENV / конфіг ---------- */
const PORT = process.env.PORT || 8787;

// Показуємо капу пресейлу у віджеті
const TOTAL_SUPPLY = Number(process.env.TOTAL_SUPPLY || 500_000_000);

// Окремо віддаємо розмір реферального пулу (для UI, якщо треба показувати)
const REF_POOL_TOKENS = Number(process.env.REF_POOL_TOKENS || 25_000_000);

// межі суми покупки (додаткова валідація)
const MIN_USD = Number(process.env.MIN_USD || 1);
const MAX_USD = Number(process.env.MAX_USD || 10000);

// Відсоток реферального бонусу (для розрахунку referrals_magt)
const REF_BONUS_PCT = Math.max(0, Math.min(100, Number(process.env.REF_BONUS_PCT ?? 5)));

// Toncenter RPC (ключ більше НЕ у фронті)
const TONCENTER_API_KEY = (process.env.TONCENTER_API_KEY || "").trim();
const TON_RPC_BASE =
  (process.env.TON_RPC_BASE && process.env.TON_RPC_BASE.trim()) ||
  "https://toncenter.com/api/v2/jsonRPC";

/* ---------- Postgres ---------- */
const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is empty — please set a Postgres connection string.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  ssl:
    DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
});

async function q(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      wallet     TEXT PRIMARY KEY,
      referrer   TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS purchases (
      id        BIGSERIAL PRIMARY KEY,
      ts        BIGINT NOT NULL,           -- msec timestamp
      address   TEXT,                      -- TON buyer (EQ../UQ..)
      usd       DOUBLE PRECISION NOT NULL, -- сума в USD
      tokens    DOUBLE PRECISION NOT NULL, -- кількість MAGT
      ref       TEXT                       -- зафіксований реферер (base64url)
    );
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_purchases_ts   ON purchases (ts DESC);`);
  await q(`CREATE INDEX IF NOT EXISTS idx_purchases_ref  ON purchases (ref);`);
  await q(`CREATE INDEX IF NOT EXISTS idx_purchases_addr ON purchases (address);`);

  console.log("✅ Postgres schema ready");
}
await initDb();

/* ---------- утиліти ---------- */
// Валідна TON-адреса у base64url (EQ.../UQ..., 48–68 символів)
const isAddr = (a) =>
  typeof a === "string" && /^[EU]Q[A-Za-z0-9_-]{46,66}$/.test(a.trim());

/* ---------- сервер ---------- */
const app = express();

// Безпечний trust proxy
app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

/* ---------- Security headers ---------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY"); // анти-clickjacking

  // HSTS лише для https / за проксі
  const isHttps = req.secure || (req.headers["x-forwarded-proto"] === "https");
  if (isHttps) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // CSP для API (мінімальна, не ламає фронт; фронт-хостингу краще дублювати)
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "connect-src 'self'",
      "img-src 'none'",
      "script-src 'none'",
      "style-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join("; ")
  );

  // Відрубити потужні браузерні API
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );

  next();
});

/* ---------- CORS whitelist ---------- */
/**
 * ENV:
 *   ALLOWED_ORIGINS="https://magtcoin.com,https://www.magtcoin.com"
 */
const ENV_ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEFAULT_ALLOWED = [
  "https://magtcoin.com",
  "https://www.magtcoin.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];

const ALLOWED_ORIGINS = ENV_ALLOWED.length ? ENV_ALLOWED : DEFAULT_ALLOWED;

const corsOptionsDelegate = (req, cb) => {
  const origin = req.header("Origin");
  if (!origin) return cb(null, { origin: true, credentials: false }); // curl/health
  if (ALLOWED_ORIGINS.includes(origin)) {
    return cb(null, {
      origin: true,
      credentials: false,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 86400,
    });
  }
  return cb(new Error("CORS_NOT_ALLOWED"));
};

app.use((req, res, next) => {
  cors(corsOptionsDelegate)(req, res, (err) => {
    if (!err) return next();
    if (err.message === "CORS_NOT_ALLOWED") {
      return res
        .status(403)
        .json({ ok: false, err: "cors-origin-not-allowed" });
    }
    next(err);
  });
});
app.options("*", cors(corsOptionsDelegate));

app.use(express.json({ limit: "256kb" }));

/* ---------- Rate limit ---------- */
// загальний
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
  })
);
// окремий жорсткіший для RPC-проксі
const rpcLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 120 запитів/хв з IP
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
});

/* ---------- health & root ---------- */
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) =>
  res
    .type("text/plain")
    .send("Magt API is up. See /api/referral, /api/presale/*, /api/my-stats and /api/rpc")
);

/* ---------- RPC-проксі до Toncenter ---------- */
const RPC_WHITELIST = new Set([
  // загальні
  "getMasterchainInfo",
  "getAddressInformation",
  "getWalletInformation",
  "getTransactions",
  "getAddressBalance",
  "getConfigParam",
  "estimateFee",
  "sendBoc",
  "sendBocReturnHash",
  "runGetMethod",
  // тонвеб іноді викликає:
  "getBlockHeader",
  "getBlock",
  "getShardInfo",
]);

app.post("/api/rpc", rpcLimiter, async (req, res) => {
  try {
    const { method, params } = req.body || {};
    if (typeof method !== "string" || !RPC_WHITELIST.has(method)) {
      return res.status(400).json({ ok: false, err: "method-not-allowed" });
    }

    // формуємо URL з api_key
    const url =
      TON_RPC_BASE +
      (TONCENTER_API_KEY ? `?api_key=${encodeURIComponent(TONCENTER_API_KEY)}` : "");

    // таймаут на запит
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);

    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: params ?? [],
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(t);

    const data = await r.json().catch(() => ({}));
    // повертаємо прозоро як Toncenter (але без будь-яких секретів)
    return res.status(r.status).json(data);
  } catch (e) {
    const aborted = String(e?.name || "").toLowerCase().includes("abort");
    return res
      .status(aborted ? 504 : 500)
      .json({ ok: false, err: aborted ? "rpc-timeout" : "rpc-failed" });
  }
});

/* ---------- історичний файловий кеш покупок ---------- */
app.use("/api/purchase", purchasesRouter);

/* ---------- РЕФЕРАЛКА ---------- */
// POST /api/referral — прив’язати реферера (одноразово)
app.post("/api/referral", async (req, res) => {
  const { wallet, ref } = req.body || {};
  if (!isAddr(wallet) || !isAddr(ref) || wallet.trim() === ref.trim()) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  const W = wallet.trim();
  const R = ref.trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO users (wallet) VALUES ($1) ON CONFLICT DO NOTHING`, [W]);
    await client.query(`INSERT INTO users (wallet) VALUES ($1) ON CONFLICT DO NOTHING`, [R]);
    await client.query(
      `UPDATE users SET referrer = COALESCE(referrer, $1)
       WHERE wallet = $2 AND referrer IS NULL`,
      [R, W]
    );
    const after = await client.query(`SELECT referrer FROM users WHERE wallet=$1`, [W]);
    await client.query("COMMIT");
    res.json({ ok: true, locked: !!after.rows?.[0]?.referrer });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, err: "db-failed" });
  } finally {
    client.release();
  }
});

// GET /api/referral?wallet=EQ...
app.get("/api/referral", async (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  if (!isAddr(wallet)) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  await q(`INSERT INTO users (wallet) VALUES ($1) ON CONFLICT DO NOTHING`, [wallet]);
  const r = await q(`SELECT referrer FROM users WHERE wallet=$1`, [wallet]);
  const ref = r.rows?.[0]?.referrer || null;
  if (!ref) return res.json({ ok: false });
  res.json({ ok: true, referrer: ref, locked: true });
});

/* ---------- ПРЕСЕЙЛ (для віджетів) ---------- */
/**
 * Фронт шле факт покупки сюди.
 * body: { usd:number, tokens:number, address?:string, ref?:string }
 * ref пріоритезуємо з users.referrer, якщо є.
 */
app.post("/api/presale/purchase", async (req, res) => {
  const usd = Number(req.body?.usd ?? 0);
  const tokens = Number(req.body?.tokens ?? 0);
  const addressRaw = String(req.body?.address || "").trim();
  const address = addressRaw || null;
  const refRaw = String(req.body?.ref || "").trim();

  // суворіша валідація
  if (!(usd > 0) || !(tokens > 0)) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  if (usd < MIN_USD || usd > MAX_USD) {
    return res.status(400).json({ ok: false, err: "usd-out-of-range" });
  }
  if (address && !isAddr(address)) {
    return res.status(400).json({ ok: false, err: "bad-address" });
  }

  let ref = null;
  if (address && isAddr(address)) {
    await q(`INSERT INTO users (wallet) VALUES ($1) ON CONFLICT DO NOTHING`, [address]);
    const locked = await q(`SELECT referrer FROM users WHERE wallet=$1`, [address]);
    const lockedRef = locked.rows?.[0]?.referrer || null;
    ref = lockedRef || (isAddr(refRaw) && refRaw !== address ? refRaw : null);
  } else {
    ref = isAddr(refRaw) ? refRaw : null;
  }

  await q(
    `INSERT INTO purchases (ts, address, usd, tokens, ref)
     VALUES ($1,$2,$3,$4,$5)`,
    [Date.now(), address || null, usd, tokens, ref || null]
  );

  res.json({ ok: true });
});

// GET /api/presale/stats -> { ok, soldMag, totalMag, raisedUsd, buyers, ...aliases }
app.get("/api/presale/stats", async (req, res) => {
  const r = await q(
    `SELECT
       COALESCE(SUM(tokens),0)::float8  AS "soldMag",
       COALESCE(SUM(usd),0)::float8     AS "raisedUsd",
       COUNT(DISTINCT address)          AS "buyers"
     FROM purchases`
  );
  const row = r.rows?.[0] || { soldMag: 0, raisedUsd: 0, buyers: 0 };
  const soldMag = Number(row.soldMag) || 0;
  const raisedUsd = Number(row.raisedUsd) || 0;
  const buyers = Number(row.buyers) || 0;

  res.json({
    ok: true,
    soldMag,
    totalMag: Number(TOTAL_SUPPLY) || 0,
    referralPool: Number(REF_POOL_TOKENS) || 0,
    raisedUsd,
    buyers,

    // aliases
    soldTokens: soldMag,
    sold_tokens: soldMag,
    total_supply: Number(TOTAL_SUPPLY) || 0,
    raised_usd: raisedUsd,
  });
});

// GET /api/presale/feed?limit=20
app.get("/api/presale/feed", async (req, res) => {
  const lim = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const r = await q(
    `SELECT ts, address AS addr, usd AS "amountUsd", tokens AS magt
     FROM purchases
     ORDER BY ts DESC
     LIMIT $1`,
    [lim]
  );
  const items = (r.rows || []).map((row) => ({
    asset: "USDT",
    amountUsd: Number(row.amountUsd) || 0,
    magt: Number(row.magt) || 0,
    addr: row.addr || "",
    ts: Number(row.ts) || Date.now(),
    ts_s: Math.floor((Number(row.ts) || Date.now()) / 1000),
  }));
  res.json({ ok: true, items, count: items.length });
});

// GET /api/presale/leaders?limit=10
app.get("/api/presale/leaders", async (req, res) => {
  const lim = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
  const r = await q(
    `SELECT ref AS address, COALESCE(SUM(usd),0)::float8 AS usd
     FROM purchases
     WHERE ref IS NOT NULL AND ref <> '-'
     GROUP BY ref
     ORDER BY usd DESC
     LIMIT $1`,
    [lim]
  );
  res.json({ ok: true, items: r.rows || [], count: (r.rows || []).length });
});

/* ---------- МОЇ БАЛАНСИ (для фронта) ---------- */
// GET /api/my-stats?wallet=EQ...
// -> { ok:true, bought_magt: number, referrals_magt: number }
app.get("/api/my-stats", async (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  if (!isAddr(wallet)) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }

  // куплено самим користувачем
  const bought = await q(
    `SELECT COALESCE(SUM(tokens),0)::float8 AS mag
     FROM purchases WHERE address = $1`,
    [wallet]
  );
  const boughtTokens = Math.floor(Number(bought.rows?.[0]?.mag || 0));

  // сума токенів, які купили реферали цього користувача
  const refs = await q(
    `SELECT COALESCE(SUM(tokens),0)::float8 AS mag
     FROM purchases WHERE ref = $1`,
    [wallet]
  );
  const refsTokens = Math.floor(Number(refs.rows?.[0]?.mag || 0));

  // реферальний бонус у MAGT
  const referralBonus = Math.floor(refsTokens * (REF_BONUS_PCT / 100));

  res.json({
    ok: true,
    bought_magt: boughtTokens,
    referrals_magt: referralBonus,
  });
});

/* ---------- 404 ---------- */
app.use((req, res) => res.status(404).json({ ok: false, err: "not-found" }));

/* ---------- запуск ---------- */
app.listen(PORT, () => {
  console.log("Magt API listening on :" + PORT);
  console.log("CORS allowed origins:", ALLOWED_ORIGINS.join(", ") || "(none)");
  console.log(
    "TON RPC via proxy:",
    TON_RPC_BASE,
    TONCENTER_API_KEY ? "(key loaded)" : "(no key)"
  );
  console.log("Postgres:", DATABASE_URL ? "configured" : "NOT SET");
  console.log("REF_BONUS_PCT:", REF_BONUS_PCT + "%");
});
