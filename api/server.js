// server.js
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import purchasesRouter from "./purchases.js"; // файловий кеш (fallback)

/* ---------- ENV / конфіг ---------- */
const PORT = process.env.PORT || 8787;

// Показуємо капу пресейлу у віджеті
const TOTAL_SUPPLY = Number(process.env.TOTAL_SUPPLY || 1_500_000_000);
// Окремо віддаємо розмір реферального пулу (для UI, якщо треба показувати)
const REF_POOL_TOKENS = Number(process.env.REF_POOL_TOKENS || 75_000_000);

// межі суми покупки (додаткова валідація)
const MIN_USD = Number(process.env.MIN_USD || 1);
const MAX_USD = Number(process.env.MAX_USD || 10000);

// Toncenter RPC (ключ більше НЕ у фронті)
const TONCENTER_API_KEY = (process.env.TONCENTER_API_KEY || "").trim();
const TON_RPC_BASE =
  (process.env.TON_RPC_BASE && process.env.TON_RPC_BASE.trim()) ||
  "https://toncenter.com/api/v2/jsonRPC";

/* ---------- БД ---------- */
const db = new Database("magt.db");
db.pragma("journal_mode = WAL");

// Користувачі + рефералка
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  wallet     TEXT PRIMARY KEY,
  referrer   TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);

// Факти покупок (для stats/feed/leaders)
db.exec(`
CREATE TABLE IF NOT EXISTS purchases (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,          -- msec timestamp
  address   TEXT,                      -- TON buyer (EQ../UQ..)
  usd       REAL NOT NULL,             -- сума в USD
  tokens    REAL NOT NULL,             -- кількість MAGT
  ref       TEXT                       -- зафіксований реферер (base64url)
);
CREATE INDEX IF NOT EXISTS idx_purchases_ts   ON purchases (ts DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_ref  ON purchases (ref);
`);

const upsertUser = db.prepare(`
  INSERT INTO users (wallet) VALUES (?)
  ON CONFLICT(wallet) DO NOTHING
`);
const setReferrerOnce = db.prepare(`
  UPDATE users
  SET referrer = COALESCE(referrer, ?)
  WHERE wallet = ? AND (referrer IS NULL)
`);
const getRef = db.prepare(`SELECT referrer FROM users WHERE wallet = ?`);

const insertPurchase = db.prepare(`
  INSERT INTO purchases (ts, address, usd, tokens, ref)
  VALUES (:ts, :address, :usd, :tokens, :ref)
`);
const sumStats = db.prepare(`
  SELECT
    COALESCE(SUM(tokens),0)  AS soldMag,
    COALESCE(SUM(usd),0)     AS raisedUsd,
    COUNT(DISTINCT address)  AS buyers
  FROM purchases
`);
const selectFeed = db.prepare(`
  SELECT ts, address AS addr, usd AS amountUsd, tokens AS magt
  FROM purchases
  ORDER BY ts DESC
  LIMIT ?
`);
const selectLeaders = db.prepare(`
  SELECT ref AS address, COALESCE(SUM(usd),0) AS usd
  FROM purchases
  WHERE ref IS NOT NULL AND ref <> '-'
  GROUP BY ref
  ORDER BY usd DESC
  LIMIT ?
`);

/* ---------- утиліти ---------- */
// Валідна TON-адреса у base64url (EQ.../UQ..., 48–68 символів)
const isAddr = (a) =>
  typeof a === "string" &&
  /^[EU]Q[A-Za-z0-9_-]{46,66}$/.test(a.trim());

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
    .send("Magt API is up. See /api/referral, /api/presale/* and /api/rpc")
);

/* ---------- RPC-проксі до Toncenter ---------- */
/**
 * POST /api/rpc
 * body: { method: string, params?: any[] | object }
 * Білий список методів (для TonWeb/тонких викликів). Відправляємо як JSON-RPC 2.0.
 * Ключ береться з ENV TONCENTER_API_KEY (НЕ з фронта).
 */
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

/* ---------- файловий кеш покупок (fallback) ---------- */
// POST/GET /api/purchase (історичний; можна прибрати пізніше)
app.use("/api/purchase", purchasesRouter);

/* ---------- РЕФЕРАЛКА ---------- */
// POST /api/referral — прив’язати реферера (одноразово)
app.post("/api/referral", (req, res) => {
  const { wallet, ref } = req.body || {};
  if (!isAddr(wallet) || !isAddr(ref) || wallet.trim() === ref.trim()) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  const W = wallet.trim();
  const R = ref.trim();

  const tx = db.transaction(() => {
    upsertUser.run(W);
    upsertUser.run(R);
    const before = getRef.get(W)?.referrer || null;
    setReferrerOnce.run(R, W);
    const after = getRef.get(W)?.referrer || null;
    return { locked: !!after, changed: before !== after };
  });

  const out = tx();
  res.json({ ok: true, locked: out.locked });
});

// GET /api/referral?wallet=EQ...
app.get("/api/referral", (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  if (!isAddr(wallet)) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  upsertUser.run(wallet);
  const r = getRef.get(wallet);
  if (!r || !r.referrer) return res.json({ ok: false });
  res.json({ ok: true, referrer: r.referrer, locked: true });
});

/* ---------- ПРЕСЕЙЛ (для віджетів) ---------- */
/**
 * Фронт шле факт покупки сюди.
 * body: { usd:number, tokens:number, address?:string, ref?:string }
 * ref пріоритезуємо з users.referrer, якщо є.
 */
app.post("/api/presale/purchase", (req, res) => {
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
    upsertUser.run(address);
    const locked = getRef.get(address)?.referrer || null;
    ref = locked || (isAddr(refRaw) && refRaw !== address ? refRaw : null);
  } else {
    ref = isAddr(refRaw) ? refRaw : null;
  }

  insertPurchase.run({
    ts: Date.now(),
    address: address || null,
    usd,
    tokens,
    ref: ref || null,
  });

  res.json({ ok: true });
});

// GET /api/presale/stats -> { ok, soldMag, totalMag, raisedUsd, buyers, ...aliases }
app.get("/api/presale/stats", (req, res) => {
  const row = sumStats.get() || { soldMag: 0, raisedUsd: 0, buyers: 0 };
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
app.get("/api/presale/feed", (req, res) => {
  const lim = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const rows = selectFeed.all(lim);
  const items = rows.map((r) => ({
    asset: "USDT",
    amountUsd: Number(r.amountUsd) || 0,
    magt: Number(r.magt) || 0,
    addr: r.addr || "",
    ts: Number(r.ts) || Date.now(),
    ts_s: Math.floor((Number(r.ts) || Date.now()) / 1000),
  }));
  res.json({ ok: true, items, count: items.length });
});

// GET /api/presale/leaders?limit=10
app.get("/api/presale/leaders", (req, res) => {
  const lim = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
  const items = selectLeaders.all(lim).map((r) => ({
    address: r.address || "",
    usd: Number(r.usd) || 0,
  }));
  res.json({ ok: true, items, count: items.length });
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
});
