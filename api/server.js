// server.js
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
// ⬇️ підключаємо файловий кеш покупок
import purchasesRouter from "./purchases.js";

/* ---------- конфіг ---------- */
const PORT = process.env.PORT || 8787;
// Загальний обсяг токенів (для віджета прогресу)
const TOTAL_SUPPLY = Number(process.env.TOTAL_SUPPLY || 5_000_000_000);

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

// Факти покупок (цим живляться stats/feed/leaders)
db.exec(`
CREATE TABLE IF NOT EXISTS purchases (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,          -- msec timestamp
  address   TEXT,                      -- TON buyer
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

// purchases helpers
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

// Безпечний trust proxy (прибирає ERR_ERL_PERMISSIVE_TRUST_PROXY)
app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

/* ---------- CORS whitelist ---------- */
/**
 * ENV (Render → Environment):
 *   ALLOWED_ORIGINS="https://magtcoin.com,https://www.magtcoin.com"
 */
const ENV_ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
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
      methods: ["GET","POST","OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 86400,
    });
  }
  return cb(new Error("CORS_NOT_ALLOWED"));
};

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  cors(corsOptionsDelegate)(req, res, (err) => {
    if (!err) return next();
    if (err.message === "CORS_NOT_ALLOWED") {
      return res.status(403).json({ ok: false, err: "cors-origin-not-allowed" });
    }
    next(err);
  });
});
app.options("*", cors(corsOptionsDelegate));

app.use(express.json({ limit: "256kb" }));

// лагідний rate-limit (із trustProxy)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
}));

/* ---------- health & root ---------- */
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.type("text/plain").send("Magt API is up. See /api/referral and /api/presale/*"));

/* ---------- файловий кеш покупок (паралельно до SQLite) ---------- */
// POST/GET /api/purchase
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

// GET /api/referral?wallet=EQ... — хто реферер
app.get("/api/referral", (req, res) => {
  const wallet = String(req.query.wallet || "").trim();
  if (!isAddr(wallet)) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  upsertUser.run(wallet);
  const r = getRef.get(wallet);
  if (!r || !r.referrer) return res.json({ ok: false }); // 200 без 404
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
  const address = String(req.body?.address || "").trim() || null;
  const refRaw = String(req.body?.ref || "").trim();

  if (!(usd > 0) || !(tokens > 0)) {
    return res.status(400).json({ ok: false, err: "bad-params" });
  }
  let ref = null;
  if (address && isAddr(address)) {
    upsertUser.run(address);
    const locked = getRef.get(address)?.referrer || null;
    ref = locked || (isAddr(refRaw) && refRaw !== address ? refRaw : null);
  } else {
    // адреса не обов'язкова (але якщо є — валідуємо)
    if (address) return res.status(400).json({ ok: false, err: "bad-address" });
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
  const soldMag   = Number(row.soldMag)   || 0;
  const raisedUsd = Number(row.raisedUsd) || 0;
  const buyers    = Number(row.buyers)    || 0;

  res.json({
    ok: true,
    soldMag,
    totalMag: Number(TOTAL_SUPPLY) || 0,
    raisedUsd,
    buyers,

    // alias-и для сумісності з будь-яким фронтом
    soldTokens: soldMag,
    sold_tokens: soldMag,
    total_supply: Number(TOTAL_SUPPLY) || 0,
    raised_usd: raisedUsd,
  });
});

// GET /api/presale/feed?limit=20
// формат елементів під фронт: {asset:"USDT", amountUsd, magt, addr, ts}
app.get("/api/presale/feed", (req, res) => {
  const lim = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const rows = selectFeed.all(lim);
  const items = rows.map(r => ({
    asset: "USDT",
    amountUsd: Number(r.amountUsd) || 0,
    magt: Number(r.magt) || 0,
    addr: r.addr || "",
    ts: Number(r.ts) || Date.now(),   // мілісекунди
    ts_s: Math.floor((Number(r.ts) || Date.now()) / 1000) // додатково секунди (якщо знадобиться)
  }));
  res.json({ ok: true, items, count: items.length });
});

// GET /api/presale/leaders?limit=10
// формат елементів: {address, usd}
app.get("/api/presale/leaders", (req, res) => {
  const lim = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
  const items = selectLeaders.all(lim).map(r => ({
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
});
