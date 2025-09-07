// /js/ton.js
import { CONFIG } from "./config.js";
import { safeFetch } from "./utils.js";
import { getWalletAddress } from "./tonconnect.js";

/* ============================================
 * RPC: тільки через наш бекенд-проксі (з м’яким фолбеком)
 * ============================================ */
const _rpcFromConfig =
  (CONFIG.TON_RPC && String(CONFIG.TON_RPC).trim()) ||
  "https://toncenter.com/api/v2/jsonRPC";

// Якщо в конфігу все ще залишили toncenter — у проді форсуємо наш бек-ендпоінт
export const RPC_URL = /toncenter\.com/i.test(_rpcFromConfig)
  ? (CONFIG.ENDPOINTS?.rpc || "https://api.magtcoin.com/api/rpc")
  : _rpcFromConfig;

// Дозволяємо fallback лише якщо це toncenter (CSP friendly)
const RPC_FALLBACK = (CONFIG.TON_RPC_FALLBACK || "").trim();
const ALLOW_FALLBACK = !!RPC_FALLBACK && /toncenter\.com/i.test(RPC_FALLBACK);

/* Послідовність провайдерів: основний → (опц.) toncenter */
function* providerSeq(TonWeb) {
  const list = [RPC_URL, ALLOW_FALLBACK ? RPC_FALLBACK : null].filter(Boolean);
  const seen = new Set();
  for (const url of list) {
    if (seen.has(url)) continue;
    seen.add(url);
    yield new TonWeb.HttpProvider(url);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ============================================
 * Кандидати майстрів USDT
 * ============================================ */
const USDT_MASTERS = Array.from(
  new Set(
    (Array.isArray(CONFIG.USDT_MASTERS) && CONFIG.USDT_MASTERS.length
      ? CONFIG.USDT_MASTERS
      : [CONFIG.USDT_MASTER]
    )
      .map((s) => (s || "").trim())
      .filter(Boolean)
  )
);

/* ============================================
 * Helpers
 * ============================================ */
function isTonAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (!a || !(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
  return /^[A-Za-z0-9_-]{48,68}$/.test(a);
}

function toBase64Url(addr) {
  try {
    const A = window.TonWeb?.utils?.Address;
    if (!A) return typeof addr === "string" ? addr : String(addr);
    const inst =
      addr && typeof addr === "object" && typeof addr.toString === "function"
        ? addr
        : new A(addr);
    return inst.toString(true, true, true); // bounceable, urlSafe, auto test flag
  } catch {
    return typeof addr === "string" ? addr : String(addr);
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
    return `$${(Number(n) || 0).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}`;
  },
  num(n) {
    return (Number(n) || 0).toLocaleString();
  },
  shortAddr(a) {
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—";
  },
};

/* ============================================
 * Абсолютні ендпоінти
 * ============================================ */
function epUrl(key, qs = "") {
  const abs = CONFIG?.ENDPOINTS?.[key];
  if (abs && typeof abs === "string" && abs.startsWith("http")) {
    return abs + qs;
  }
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
    rpc: "/api/rpc",
  };
  const path = paths[key];
  if (!path) return null;
  return `${base}${path}${qs}`;
}

/* ============================================
 * Безпечний короткий коментар
 * ============================================ */
function buildSafeComment({ buyerB64, refB64, ts, nonce }) {
  const short = (s, L = 6, R = 6) =>
    s && s !== "-" ? `${s.slice(0, L)}..${s.slice(-R)}` : "-";
  let note = `MAGT|r=${short(refB64)}|b=${short(buyerB64)}|t=${ts}|n=${nonce}`;
  if (note.length <= 120) return note;
  note = `MAGT|b=${short(buyerB64, 4, 4)}|n=${nonce}`;
  if (note.length <= 120) return note;
  return `MAGT|n=${nonce}`;
}

/* ============================================
 * Читання балансу джеттон-гаманця (units) з ретраями
 * ============================================ */
async function readJettonBalanceUnits(TonWeb, provider, jettonMasterB64, userAddr) {
  const JettonMinter = TonWeb.token.jetton.JettonMinter;
  const JettonWallet = TonWeb.token.jetton.JettonWallet;

  const minter = new JettonMinter(provider, {
    address: new TonWeb.utils.Address(jettonMasterB64),
  });
  const jwAddr = await minter.getJettonWalletAddress(userAddr);
  const jw = new JettonWallet(provider, { address: jwAddr });

  for (let i = 0; i < 3; i++) {
    try {
      const data = await jw.getData(); // { balance, ... }
      const units = BigInt(String(data?.balance ?? "0"));
      return { units, jwAddr, jw };
    } catch (e) {
      if (i === 2) throw e;
      await sleep(200 + i * 250);
    }
  }
  return { units: 0n, jwAddr, jw };
}

/* ============================================
 * Підбір правильного майстра USDT
 * ============================================ */
async function pickUsdtMasterForAmount(usdAmount) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const userAddress = getWalletAddress();
  const userAddr = new TonWeb.utils.Address(userAddress);

  const dec = Number(CONFIG.JETTON_DECIMALS ?? 6);
  const needUnits = decimalToUnitsBigInt(usdAmount, dec);

  let best = null; // {master, units, jwAddr, jw}
  for (const master of USDT_MASTERS) {
    let info = null;
    for (const prov of providerSeq(TonWeb)) {
      try {
        info = await readJettonBalanceUnits(TonWeb, prov, master, userAddr);
        break;
      } catch (e) {
        console.warn("[USDT master] read failed on provider:", master, e?.message || e);
      }
    }
    if (!info) continue;

    try {
      console.log(
        "[USDT master] balance",
        new TonWeb.utils.Address(master).toString(true, true, true),
        "→",
        Number(info.units) / 10 ** dec
      );
    } catch {}

    if (!best || info.units > best.units) best = { master, ...info };
    if (info.units >= needUnits) {
      console.log(
        "[USDT master] picked:",
        new TonWeb.utils.Address(master).toString(true, true, true),
        "balanceUnits:",
        info.units.toString()
      );
      return { master, ...info };
    }
  }

  if (best) {
    console.warn(
      "[USDT master] none has enough, using max balance:",
      new window.TonWeb.utils.Address(best.master).toString(true, true, true),
      "balanceUnits:",
      best.units.toString()
    );
    return best;
  }

  // Якщо всі RPC упали — беремо перший майстер без префлайту
  const fallbackMaster = USDT_MASTERS[0];
  console.warn("[USDT master] RPC failed for all, fallback to first master:", fallbackMaster);
  const prov = new TonWeb.HttpProvider(RPC_URL);
  const JettonMinter = TonWeb.token.jetton.JettonMinter;
  const JettonWallet = TonWeb.token.jetton.JettonWallet;
  const minter = new JettonMinter(prov, {
    address: new TonWeb.utils.Address(fallbackMaster),
  });
  const jwAddr = await minter.getJettonWalletAddress(userAddr);
  const jw = new JettonWallet(prov, { address: jwAddr });
  return { master: fallbackMaster, units: 0n, jwAddr, jw };
}

/* ============================================
 * USDT transfer (TonConnect)
 * ============================================ */
export async function buildUsdtTransferTx(ownerUserAddr, usdAmount, refAddr) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const resolvedOwner =
    (ownerUserAddr && String(ownerUserAddr).trim()) || getWalletAddress();
  if (!resolvedOwner) throw new Error("WALLET_NOT_CONNECTED");

  const numAmount = Number(usdAmount);
  if (!Number.isFinite(numAmount) || numAmount <= 0)
    throw new Error("Некоректна сума");
  if (CONFIG.MIN_BUY_USDT && numAmount < CONFIG.MIN_BUY_USDT)
    throw new Error(`Мінімальна покупка: ${CONFIG.MIN_BUY_USDT} USDT`);

  // 🔎 Обираємо майстер із балансом
  const {
    master: usdtMasterB64,
    units: balanceUnits,
    jwAddr: userJettonWalletAddr,
    jw: userJettonWallet,
  } = await pickUsdtMasterForAmount(numAmount);

  // адреса отримувача (пресейл)
  let presaleOwner;
  try {
    presaleOwner = new TonWeb.utils.Address(CONFIG.PRESALE_OWNER_ADDRESS);
  } catch {
    throw new Error("Невірний PRESALE_OWNER_ADDRESS у config.js");
  }

  // сума у units
  const dec = Number(CONFIG.JETTON_DECIMALS ?? 6);
  const jetAmountBig = decimalToUnitsBigInt(numAmount, dec);
  const amountBN = new TonWeb.utils.BN(jetAmountBig.toString());

  if (balanceUnits !== null && balanceUnits < jetAmountBig) {
    const human = Number(balanceUnits) / 10 ** dec;
    throw new Error(
      `Недостатньо USDT: на обраному майстрі ${human.toFixed(6)} USDT, потрібно ${numAmount}.`
    );
  }

  // реферал
  let cleanRef = null;
  if (typeof refAddr === "string" && isTonAddress(refAddr)) cleanRef = refAddr.trim();
  if (cleanRef && CONFIG.REF_SELF_BAN === true) {
    const buyerBase64 = new TonWeb.utils.Address(resolvedOwner).toString(true, true, true);
    if (buyerBase64 === cleanRef) cleanRef = null;
  }

  // коментар (forward payload)
  const buyerB64 = toBase64Url(resolvedOwner);
  const refB64 = cleanRef ? toBase64Url(cleanRef) : "-";
  const ts = Date.now();
  const nonce = (Math.floor(Math.random() * 1e9) >>> 0);

  const note = buildSafeComment({ buyerB64, refB64, ts, nonce });
  const cell = new TonWeb.boc.Cell();
  cell.bits.writeUint(0, 32);
  cell.bits.writeString(note);

  // суми TON — підвищені для стабільного виконання на мобільних
  const forwardTon = TonWeb.utils.toNano("0.10");
  const openTon    = TonWeb.utils.toNano("0.20");

  // Отримуємо адресу jetton-гаманця пресейлу через робочий провайдер
  let presaleJettonWalletAddr = null;
  for (const prov of providerSeq(TonWeb)) {
    try {
      const JettonMinter = TonWeb.token.jetton.JettonMinter;
      const minter = new JettonMinter(prov, {
        address: new TonWeb.utils.Address(usdtMasterB64),
      });
      presaleJettonWalletAddr = await minter.getJettonWalletAddress(presaleOwner);
      break;
    } catch {}
  }
  if (!presaleJettonWalletAddr) {
    throw new Error("Не вдалося отримати адресу JettonWallet пресейлу (усі RPC недоступні)");
  }

  // body transfer (компат: і amount, і jettonAmount)
  const body = await userJettonWallet.createTransferBody({
    queryId: new TonWeb.utils.BN(ts),
    jettonAmount: amountBN,                 // новіші версії
    amount:       amountBN,                 // сумісність зі старими
    toAddress: presaleJettonWalletAddr,
    responseAddress: new TonWeb.utils.Address(resolvedOwner),
    forwardAmount: forwardTon,
    forwardPayload: cell,
  });

  // stateInit — форсимо, якщо метод доступний (Tonkeeper іноді вимагає)
  let stateInitB64 = null;
  try {
    if (typeof userJettonWallet.createStateInit === "function") {
      const stateInitCell = await userJettonWallet.createStateInit();
      stateInitB64 = u8ToBase64(await stateInitCell.toBoc(false));
    }
  } catch {}

  const payloadB64 = u8ToBase64(await body.toBoc(false));

  // Логи
  try {
    console.log(
      "[MAGT TX] picked USDT master:",
      new TonWeb.utils.Address(usdtMasterB64).toString(true, true, true)
    );
    console.log(
      "[MAGT TX] userJettonWallet:",
      userJettonWalletAddr.toString(true, true, true)
    );
    console.log(
      "[MAGT TX] presaleJettonWallet:",
      presaleJettonWalletAddr.toString(true, true, true)
    );
    console.log("[MAGT TX] jetAmount (USDT units):", jetAmountBig.toString());
    console.log("[MAGT TX] openTon:", openTon.toString(), "forwardTon:", forwardTon.toString());
    console.log("[MAGT TX] note:", note);
  } catch {}

  // ВАЖЛИВО: адреса одержувача → EQ (bounceable)
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: userJettonWalletAddr.toString(true, true, true),
        amount: openTon.toString(),
        payload: payloadB64,
        ...(stateInitB64 ? { stateInit: stateInitB64 } : {}),
      },
    ],
  };
}

/* Зручний варіант */
export async function buildUsdtTxUsingConnected(usdAmount, refAddr) {
  return buildUsdtTransferTx(null, usdAmount, refAddr);
}

/* ==========================================================
 * MAGT transfer (TonConnect) — burn або довільний одержувач
 * Використовує window.MAGT_API.{JETTON_MINTER, BURN, DECIMALS}
 * ========================================================== */
async function getJettonWalletAddressForOwner(TonWeb, provider, minterB64, ownerB64) {
  const JettonMinter = TonWeb.token.jetton.JettonMinter;
  const minter = new JettonMinter(provider, {
    address: new TonWeb.utils.Address(minterB64),
  });
  return await minter.getJettonWalletAddress(new TonWeb.utils.Address(ownerB64));
}

export async function buildMagtTransferTx(opts = {}) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const {
    minter = window.MAGT_API?.JETTON_MINTER,
    toOwner = window.MAGT_API?.BURN,
    amount = "1",
    decimals = window.MAGT_API?.DECIMALS ?? 9,
    openTon = "0.30",
    forwardTon = "0.05",
    comment = "Send MAGT",
  } = opts;

  const owner = getWalletAddress();
  if (!owner) throw new Error("WALLET_NOT_CONNECTED");

  if (!isTonAddress(minter)) throw new Error("Invalid MAGT minter address");
  if (!isTonAddress(toOwner)) throw new Error("Invalid recipient (toOwner) address");

  // 1) підключаємось до робочого провайдера
  let prov = null;
  for (const p of providerSeq(TonWeb)) {
    try {
      // невеликий "пінг": просто створення Address/контракту — не кидає запит
      prov = p;
      break;
    } catch {}
  }
  if (!prov) throw new Error("RPC providers are unavailable");

  // 2) Обчислюємо адреси JettonWallet: користувача (FROM) та одержувача (TO)
  const fromJW = await getJettonWalletAddressForOwner(TonWeb, prov, minter, owner);
  const toJW   = await getJettonWalletAddressForOwner(TonWeb, prov, minter, toOwner);

  // 3) Створюємо body transfer
  const JettonWallet = TonWeb.token.jetton.JettonWallet;
  const jw = new JettonWallet(prov, { address: fromJW });

  const jetUnits = decimalToUnitsBigInt(amount, Number(decimals));
  const amountBN = new TonWeb.utils.BN(jetUnits.toString());
  const fwd = TonWeb.utils.toNano(String(forwardTon));
  const open = TonWeb.utils.toNano(String(openTon));

  const noteCell = new TonWeb.boc.Cell();
  noteCell.bits.writeUint(0, 32);
  noteCell.bits.writeString(String(comment || "Send MAGT"));

  const body = await jw.createTransferBody({
    queryId: new TonWeb.utils.BN(Date.now()),
    jettonAmount: amountBN,
    amount:       amountBN, // сумісність
    toAddress: toJW,
    responseAddress: new TonWeb.utils.Address(owner),
    forwardAmount: fwd,
    forwardPayload: noteCell,
  });

  // 4) stateInit: якщо гаманець ще «спить», багатьом апкам так надійніше
  let stateInitB64 = null;
  try {
    if (typeof jw.createStateInit === "function") {
      const st = await jw.createStateInit();
      stateInitB64 = u8ToBase64(await st.toBoc(false));
    }
  } catch {}

  const payloadB64 = u8ToBase64(await body.toBoc(false));

  // повертаємо tx для TonConnect
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{
      address: fromJW.toString(true, true, true), // саме JW користувача
      amount: open.toString(),
      payload: payloadB64,
      ...(stateInitB64 ? { stateInit: stateInitB64 } : {})
    }]
  };
}

export async function buildMagtTxUsingConnected(amount = "1", toOwner = (window.MAGT_API?.BURN || "")) {
  return buildMagtTransferTx({ amount, toOwner });
}

/* ============================================
 * CLAIM (он-чейн)
 * ============================================ */
export async function buildClaimTx(ownerUserAddr, claimContractAddr = null, opts = {}) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const resolvedOwner =
    (ownerUserAddr && String(ownerUserAddr).trim()) || getWalletAddress();
  if (!resolvedOwner) throw new Error("WALLET_NOT_CONNECTED");

  const contract = (claimContractAddr || CONFIG.CLAIM_CONTRACT || "").trim();
  if (!contract)
    throw new Error("Не задано адресу контракту клейму (CONFIG.CLAIM_CONTRACT)");

  const amountTon = Number(opts.amountTon ?? 0.05);
  if (!Number.isFinite(amountTon) || !(amountTon > 0))
    throw new Error("Некоректна сума TON для клейму");

  let claimAddr;
  try {
    claimAddr = new TonWeb.utils.Address(contract);
  } catch {
    throw new Error("Невірний формат TON-адреси для клейму");
  }

  const note =
    String(opts.note ?? "").trim() ||
    `MAGT CLAIM | user=${toBase64Url(resolvedOwner)} | ts=${Date.now()}`;

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
 * RPC helper через бекенд (/api/rpc): runGetMethod
 * ============================================ */
export async function rpcRunGetMethod({ address, method, stack = [] }) {
  const url = CONFIG.ENDPOINTS?.rpc || epUrl("rpc");
  if (!url) throw new Error("RPC endpoint is not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify({ method: "runGetMethod", params: { address, method, stack } }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  if (json?.error) throw new Error(String(json.error));
  return json?.result || json;
}

/* ============================================
 * Віджити: дані (API або DEMO)
 * ============================================ */
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
  const urlBase = epUrl("stats");
  if (urlBase) {
    // Анти-кеш: додаємо t=timestamp і no-store
    const url = `${urlBase}${urlBase.includes("?") ? "&" : "?"}t=${Date.now()}`;
    try {
      const res = await safeFetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();

        // нормалізація полів
        const soldMag = Number(
          data.soldMag ?? data.sold_tokens ?? data.sold ?? 0
        ) || 0;

        const totalMag = Number(
          data.totalMag ?? data.total_supply ?? CONFIG.TOTAL_SUPPLY
        ) || CONFIG.TOTAL_SUPPLY;

        const raisedRaw = Number(
          data.raisedUsd ?? data.raised_usd ?? data.raised ?? 0
        ) || 0;

        // якщо бекенд віддає ціну в TON — прокидаємо в глобал
        const priceTon =
          Number(data.priceTon ?? data.price_ton ?? data.current_price_ton ?? 0) || 0;
        if (priceTon > 0) {
          try { window.__CURRENT_PRICE_TON = priceTon; } catch {}
        }

        // так само ціна в USD (на випадок, якщо бек віддає її динамічно)
        const priceUsd =
          Number(data.priceUsd ?? data.price_usd ?? data.current_price_usd ?? 0) || 0;
        if (priceUsd > 0) {
          try { window.__CURRENT_PRICE_USD = priceUsd; } catch {}
        }

        const raisedUsd = raisedRaw + (Number(CONFIG.RAISED_OFFSET_USD) || 0);
        return { soldMag, totalMag, raisedUsd };
      }
    } catch (e) {
      console.warn("stats API fail:", e);
    }
  }

  // DEMO fallback
  const feed = demoFeed();
  const soldMag = feed.reduce((s, it) => s + (Number(it.magt ?? it.tokens ?? 0) || 0), 0);
  const raisedUsd =
    feed.reduce((s, it) => s + (Number(it.amountUsd ?? it.usd ?? 0) || 0), 0) +
    (Number(CONFIG.RAISED_OFFSET_USD) || 0);
  return { soldMag, totalMag: CONFIG.TOTAL_SUPPLY, raisedUsd };
}

export async function getRecentPurchases(limit = 20) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const urlBase = epUrl("feed", `?limit=${lim}`);
  if (urlBase) {
    const url = `${urlBase}${urlBase.includes("?") ? "&" : "?"}t=${Date.now()}`;
    try {
      const res = await safeFetch(url, { cache: "no-store" });
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
  const urlBase = epUrl("leaders", `?limit=${lim}`);
  if (urlBase) {
    const url = `${urlBase}${urlBase.includes("?") ? "&" : "?"}t=${Date.now()}`;
    try {
      const res = await safeFetch(url, { cache: "no-store" });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload?.items)) return payload.items.slice(0, lim);
        if (Array.isArray(payload)) return payload.slice(0, lim);
      }
    } catch (e) {
      console.warn("leaders API fail:", e);
    }
  }
  const obj = demoLeadersObj();
  const arr = Object.entries(obj)
    .filter(([addr]) => addr && addr !== "-")
    .map(([addr, usd]) => ({ address: addr, usd: Number(usd) || 0 }));
  return arr.slice(0, lim);
}

export async function pushPurchaseToBackend({ usd, tokens, address, ref }) {
  const urlBase = epUrl("purchase");
  if (!urlBase) return { ok: true, demo: true };
  // анти-кеш лише для GET, POST і так не кешується, але явно відрубаємо
  try {
    const res = await safeFetch(urlBase, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
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
 * DEMO запис покупок
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
  if (feed.length > 200) feed.length = 200;
  saveDemoFeed(feed);

  if (ref) {
    const leaders = demoLeadersObj();
    leaders[ref] = (Number(leaders[ref]) || 0) + (Number(usd) || 0);
    saveDemoLeaders(leaders);
  }
}

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
