// /js/ton.js
import { CONFIG } from "./config.js";
import { safeFetch } from "./utils.js";
// ✅ беремо адресу безпосередньо з TonConnect singleton
import { getWalletAddress } from "./tonconnect.js";

/* ============================================
 * Helpers
 * ============================================ */

export const RPC_URL =
  (CONFIG.TON_RPC && String(CONFIG.TON_RPC).trim()) ||
  "https://toncenter.com/api/v2/jsonRPC";

// проста перевірка TON-адреси (EQ/UQ, base64url)
function isTonAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (!a || !(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
  return /^[A-Za-z0-9_-]{48,68}$/.test(a);
}

// friendly нормалізація у base64url (EQ/UQ); fallback — повертаємо оригінал
function toBase64Url(addr) {
  try {
    if (!window.TonWeb?.utils?.Address) return addr;
    const A = new window.TonWeb.utils.Address(addr);
    return A.toString(true, true, true); // bounceable, urlSafe, testOnly(auto)
  } catch {
    return addr;
  }
}

function decimalToUnitsBigInt(value, decimalsRaw) {
  const decimals = Number(decimalsRaw ?? 6);
  const s = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid decimal amount");
  const [intPart, fracPartRaw = ""] = s.split(".");
  const fracPart = (fracPartRaw + "0".repeat(decimals)).slice(0, decimals);
  const full = `${intPart}${fracPart}`;
  return BigInt(full.replace(/^0+/, "") || "0");
}

function u8ToBase64(u8) {
  if (window.TonWeb?.utils?.bytesToBase64) return window.TonWeb.utils.bytesToBase64(u8);
  let binary = "";
  u8.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export const fmt = {
  usd(n) {
    return `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  },
  num(n) {
    return (Number(n) || 0).toLocaleString();
  },
  shortAddr(a) {
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—";
  },
};

/* ============================================
 * Абсолютні ендпоінти (безпечний билдер)
 * ============================================ */

function epUrl(key, qs = "") {
  const abs = CONFIG?.ENDPOINTS?.[key];
  if (abs && typeof abs === "string" && abs.startsWith("http")) {
    return abs + qs;
  }
  // фолбек: якщо з якоїсь причини ENDPOINTS немає (не повинно статись у проді)
  const base = (CONFIG.API_BASE || "").replace(/\/+$/g, "");
  if (!base) return null;
  const paths = {
    stats: "/api/presale/stats",
    feed: "/api/presale/feed",
    leaders: "/api/presale/leaders",
    purchase: "/api/presale/purchase",
    claim: "/api/presale/claim",
    order: "/api/order",
    referral: "/api/referral",
  };
  const path = paths[key];
  if (!path) return null;
  return `${base}${path}${qs}`;
}

/* ============================================
 * Внутрішній хелпер: короткий безпечний коментар
 * (щоб не ловити BitString overflow — ≤ ~120 символів ASCII)
 * ============================================ */
function buildSafeComment({ buyerB64, refB64, ts, nonce }) {
  const short = (s, L = 6, R = 6) => (s && s !== "-" ? `${s.slice(0, L)}..${s.slice(-R)}` : "-");
  // компактний варіант (як правило < 120)
  let note = `MAGT|r=${short(refB64)}|b=${short(buyerB64)}|t=${ts}|n=${nonce}`;
  if (note.length <= 120) return note;
  // ще компактніший фолбек
  note = `MAGT|b=${short(buyerB64,4,4)}|n=${nonce}`;
  if (note.length <= 120) return note;
  // мінімум-мініморум
  return `MAGT|n=${nonce}`;
}

/* ============================================
 * TonConnect: USDT transfer
 * ============================================ */

/**
 * Головний білдер переказу USDT (Jetton transfer).
 * Якщо ownerUserAddr не передано — візьме адресу з TonConnect (getWalletAddress()).
 */
export async function buildUsdtTransferTx(ownerUserAddr, usdAmount, refAddr) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  // ✅ дозволяємо не передавати адресу явно
  const resolvedOwner = (ownerUserAddr && String(ownerUserAddr).trim()) || getWalletAddress();
  if (!resolvedOwner) throw new Error("WALLET_NOT_CONNECTED");

  const numAmount = Number(usdAmount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) throw new Error("Некоректна сума");
  if (CONFIG.MIN_BUY_USDT && numAmount < CONFIG.MIN_BUY_USDT)
    throw new Error(`Мінімальна покупка: ${CONFIG.MIN_BUY_USDT} USDT`);

  const provider = new TonWeb.HttpProvider(RPC_URL);
  const tonweb = new TonWeb(provider);

  let userAddr, usdtMaster, presaleOwner;
  try {
    userAddr = new TonWeb.utils.Address(resolvedOwner);
    usdtMaster = new TonWeb.utils.Address(CONFIG.USDT_MASTER);
    presaleOwner = new TonWeb.utils.Address(CONFIG.PRESALE_OWNER_ADDRESS);
  } catch (e) {
    throw new Error("Невірний формат TON-адреси у config.js або wallet");
  }

  const JettonMinter = TonWeb.token.jetton.JettonMinter;
  const JettonWallet = TonWeb.token.jetton.JettonWallet;
  const minter = new JettonMinter(tonweb.provider, { address: usdtMaster });

  // ✅ коректний метод SDK
  const userJettonWalletAddr = await minter.getJettonWalletAddress(userAddr);
  const presaleJettonWalletAddr = await minter.getJettonWalletAddress(presaleOwner);
  const userJettonWallet = new JettonWallet(tonweb.provider, { address: userJettonWalletAddr });

  const dec = Number(CONFIG.JETTON_DECIMALS ?? 6);
  const jetAmount = decimalToUnitsBigInt(numAmount, dec);

  // --- sanitize ref ---
  let cleanRef = null;
  if (typeof refAddr === "string" && isTonAddress(refAddr)) cleanRef = refAddr.trim();

  // дублюємо self-ref бан на стороні генерації трансакції
  if (cleanRef && CONFIG.REF_SELF_BAN === true) {
    const buyerBase64 = userAddr.toString(true, true, true);
    if (buyerBase64 === cleanRef) cleanRef = null;
  }

  const buyerB64 = toBase64Url(userAddr);
  const refB64 = cleanRef ? toBase64Url(cleanRef) : "-";
  const ts = Date.now();
  const nonce = Math.floor(Math.random() * 1e9) >>> 0;

  // ✅ безпечний короткий текстовий коментар
  const note = buildSafeComment({ buyerB64, refB64, ts, nonce });
  const cell = new TonWeb.boc.Cell();
  cell.bits.writeUint(0, 32);         // opcode=0 => "text comment"
  cell.bits.writeString(note);        // гарантовано ≤ ліміту

  // ⚠️ ВАЖЛИВО: у toNano завжди передаємо РЯДОК
  const forwardTon = TonWeb.utils.toNano(String(CONFIG.FORWARD_TON ?? "0"));       // для контракту пресейлу
  const openTon    = TonWeb.utils.toNano(String(CONFIG.JETTON_WALLET_TON ?? "0.15")); // на виконання tx

  const body = await userJettonWallet.createTransferBody({
    queryId: BigInt(ts),
    amount: jetAmount,
    toAddress: presaleJettonWalletAddr,
    responseAddress: userAddr,
    forwardAmount: forwardTon,
    forwardPayload: cell,
  });

  const payloadB64 = u8ToBase64(await body.toBoc(false));
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        // надсилаємо повідомлення ВЛАСНОМУ Jetton Wallet юзера
        address: userJettonWalletAddr.toString(true, true, false),
        amount: openTon.toString(),
        payload: payloadB64,
      },
    ],
  };
}

/**
 * Зручний варіант виклику: бере адресу власника з TonConnect автоматично.
 * Використання: await buildUsdtTxUsingConnected(usdAmount, refAddr)
 */
export async function buildUsdtTxUsingConnected(usdAmount, refAddr) {
  return buildUsdtTransferTx(null, usdAmount, refAddr);
}

/* ============================================
 * CLAIM (он-чейн)
 * ============================================ */

export async function buildClaimTx(ownerUserAddr, claimContractAddr = null, opts = {}) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  // дозволяємо не передавати адресу явно
  const resolvedOwner = (ownerUserAddr && String(ownerUserAddr).trim()) || getWalletAddress();
  if (!resolvedOwner) throw new Error("WALLET_NOT_CONNECTED");

  const contract = (claimContractAddr || CONFIG.CLAIM_CONTRACT || "").trim();
  if (!contract) throw new Error("Не задано адресу контракту клейму (CONFIG.CLAIM_CONTRACT)");

  // amountTon лишаємо числом для перевірок, але в toNano передаємо РЯДОК
  const amountTon = Number(opts.amountTon ?? 0.05);
  if (!Number.isFinite(amountTon) || !(amountTon > 0)) throw new Error("Некоректна сума TON для клейму");

  const provider = new TonWeb.HttpProvider(RPC_URL);
  const tonweb = new TonWeb(provider);

  let userAddr, claimAddr;
  try {
    userAddr = new TonWeb.utils.Address(resolvedOwner);
    claimAddr = new TonWeb.utils.Address(contract);
  } catch {
    throw new Error("Невірний формат TON-адреси для клейму");
  }

  const note =
    String(opts.note ?? "").trim() ||
    `MAGT CLAIM | user=${toBase64Url(userAddr)} | ts=${Date.now()}`;

  const cell = new TonWeb.boc.Cell();
  cell.bits.writeUint(0, 32);
  cell.bits.writeString(note);

  const payloadB64 = u8ToBase64(await cell.toBoc(false));

  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: claimAddr.toString(true, true, false),
        amount: TonWeb.utils.toNano(String(amountTon)).toString(),
        payload: payloadB64,
      },
    ],
  };
}

/* ============================================
 * Віджети: дані (API або DEMO)
 * ============================================ */

// DEMO helpers
function demoFeed() {
  try { return JSON.parse(localStorage.getItem("demo.feed") || "[]"); }
  catch { return []; }
}
function demoLeadersObj() {
  try { return JSON.parse(localStorage.getItem("demo.ref.leaders") || "{}"); }
  catch { return {}; }
}
function saveDemoFeed(list) {
  try { localStorage.setItem("demo.feed", JSON.stringify(list)); } catch {}
}
function saveDemoLeaders(obj) {
  try { localStorage.setItem("demo.ref.leaders", JSON.stringify(obj)); } catch {}
}

export async function getPresaleStats() {
  const url = epUrl("stats");
  if (url) {
    try {
      const res = await safeFetch(url, { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        // підтримуємо як "плоску" відповідь, так і об’єкт з ok
        const soldMag   = Number(data.soldMag   ?? data.sold_tokens ?? 0) || 0;
        const totalMag  = Number(data.totalMag  ?? data.total_supply ?? CONFIG.TOTAL_SUPPLY) || CONFIG.TOTAL_SUPPLY;
        const raisedRaw = Number(data.raisedUsd ?? data.raised_usd ?? 0) || 0;
        // ✚ додаємо офсет, щоб прогрес стартував не з нуля
        const raisedUsd = raisedRaw + (Number(CONFIG.RAISED_OFFSET_USD) || 0);
        return { soldMag, totalMag, raisedUsd };
      }
    } catch (e) {
      console.warn("stats API fail:", e);
    }
  }
  // DEMO: обчислюємо з локального фіда
  const feed = demoFeed();
  const soldMag = feed.reduce((s, it) => s + (Number(it.magt ?? it.tokens ?? 0) || 0), 0);
  const raisedUsd = feed.reduce((s, it) => s + (Number(it.amountUsd ?? it.usd ?? 0) || 0), 0)
                    + (Number(CONFIG.RAISED_OFFSET_USD) || 0);
  return { soldMag, totalMag: CONFIG.TOTAL_SUPPLY, raisedUsd };
}

export async function getRecentPurchases(limit = 20) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const url = epUrl("feed", `?limit=${lim}`);
  if (url) {
    try {
      const res = await safeFetch(url, { cache: "no-cache" });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload?.items)) return payload.items.slice(0, lim);
        if (Array.isArray(payload)) return payload.slice(0, lim);
      }
    } catch (e) {
      console.warn("feed API fail:", e);
    }
  }
  const demo = demoFeed();
  return demo.slice(0, lim);
}

export async function getReferralLeaders(limit = 10) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 10));
  const url = epUrl("leaders", `?limit=${lim}`);
  if (url) {
    try {
      const res = await safeFetch(url, { cache: "no-cache" });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload?.items)) return payload.items.slice(0, lim);
        if (Array.isArray(payload)) return payload.slice(0, lim);
      }
    } catch (e) {
      console.warn("leaders API fail:", e);
    }
  }
  // DEMО: перетворюємо об'єкт {refAddr: usdTotal} у масив
  const obj = demoLeadersObj();
  const arr = Object.entries(obj)
    .filter(([addr]) => addr && addr !== "-")
    .map(([addr, usd]) => ({ address: addr, usd: Number(usd) || 0 }));
  return arr.slice(0, lim);
}

export async function pushPurchaseToBackend({ usd, tokens, address, ref }) {
  const url = epUrl("purchase");
  if (!url) return { ok: true, demo: true };
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usd: Number(usd) || 0,
        tokens: Number(tokens) || 0,
        address: String(address || ""),
        ref: (ref && String(ref).trim()) || null,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.warn("pushPurchaseToBackend fail:", e);
    return { ok: false, error: String(e) };
  }
}

/* ============================================
 * DEMO запис покупок (без бекенду)
 * ============================================ */

function pushDemoPurchase({ usd, tokens, address, ref }) {
  const feed = demoFeed();
  feed.unshift({
    asset: "USDT",
    amountUsd: Number(usd) || 0,
    magt: Number(tokens) || 0,
    addr: String(address || ""),
    ref: (ref && String(ref)) || null,
    ts: Date.now(),
  });
  // обрізаємо, щоб не роздувати LS
  if (feed.length > 200) feed.length = 200;
  saveDemoFeed(feed);

  if (ref) {
    const leaders = demoLeadersObj();
    leaders[ref] = (Number(leaders[ref]) || 0) + (Number(usd) || 0);
    saveDemoLeaders(leaders);
  }
}

// Слухаємо подію з /js/buy.js, щоб у DEMO режимі оновлювати фіди/лідерів
try {
  if (CONFIG.REF_DEBUG_DEMO !== false) {
    window.addEventListener("magt:purchase", (ev) => {
      const d = ev?.detail || {};
      pushDemoPurchase({
        usd: d.usd,
        tokens: d.tokens,
        address: d.address,
        ref: d.ref || null,
      });
    });
  }
} catch {}
