// /js/ton.js
import { CONFIG } from "./config.js";
import { safeFetch, api as apiUrl } from "./utils.js";

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
 * TonConnect: USDT transfer
 * ============================================ */

export async function buildUsdtTransferTx(ownerUserAddr, usdAmount, refAddr) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const numAmount = Number(usdAmount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) throw new Error("Некоректна сума");
  if (CONFIG.MIN_BUY_USDT && numAmount < CONFIG.MIN_BUY_USDT)
    throw new Error(`Мінімальна покупка: ${CONFIG.MIN_BUY_USDT} USDT`);

  const provider = new TonWeb.HttpProvider(RPC_URL);
  const tonweb = new TonWeb(provider);

  let userAddr, usdtMaster, presaleOwner;
  try {
    userAddr = new TonWeb.utils.Address(ownerUserAddr);
    usdtMaster = new TonWeb.utils.Address(CONFIG.USDT_MASTER);
    presaleOwner = new TonWeb.utils.Address(CONFIG.PRESALE_OWNER_ADDRESS);
  } catch (e) {
    throw new Error("Невірний формат TON-адреси у config.js або wallet");
  }

  const JettonMinter = TonWeb.token.jetton.JettonMinter;
  const JettonWallet = TonWeb.token.jetton.JettonWallet;
  const minter = new JettonMinter(tonweb.provider, { address: usdtMaster });

  const userJettonWalletAddr = await minter.getWalletAddress(userAddr);
  const presaleJettonWalletAddr = await minter.getWalletAddress(presaleOwner);
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

  // зріз для коментаря (не обов'язково, але щоб payload був компактний)
  const buyerB64 = toBase64Url(userAddr);
  const refB64 = cleanRef ? toBase64Url(cleanRef) : "-";
  const ts = Date.now();
  const nonce = Math.floor(Math.random() * 1e9) >>> 0;

  // текстовий коментар у forward_payload (Jetton transfer)
  const note = `MAGT|ref=${refB64}|buyer=${buyerB64}|ts=${ts}|nonce=${nonce}`;
  const cell = new TonWeb.boc.Cell();
  cell.bits.writeUint(0, 32); // opcode=0 => "text comment" convention
  cell.bits.writeString(note);

  const forwardTon = TonWeb.utils.toNano(Number(CONFIG.FORWARD_TON || 0));          // скільки переслати пресейлу
  const openTon    = TonWeb.utils.toNano(Number(CONFIG.JETTON_WALLET_TON || 0.15)); // на відкриття/виконання

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

/* ============================================
 * CLAIM (он-чейн)
 * ============================================ */

export async function buildClaimTx(ownerUserAddr, claimContractAddr = null, opts = {}) {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const contract = (claimContractAddr || CONFIG.CLAIM_CONTRACT || "").trim();
  if (!contract) throw new Error("Не задано адресу контракту клейму (CONFIG.CLAIM_CONTRACT)");

  const amountTon = Number(opts.amountTon ?? 0.05);
  if (!Number.isFinite(amountTon) || !(amountTon > 0)) throw new Error("Некоректна сума TON для клейму");

  const provider = new TonWeb.HttpProvider(RPC_URL);
  const tonweb = new TonWeb(provider);

  let userAddr, claimAddr;
  try {
    userAddr = new TonWeb.utils.Address(ownerUserAddr);
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
        amount: TonWeb.utils.toNano(amountTon).toString(),
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

// утиліта для побудови абсолютного API-URL (з урахуванням override/CONFIG)
// повертає null, якщо API недоступний (демо-режим)
function endpoint(path) {
  return apiUrl(path); // використовуємо /js/utils.js::api
}

export async function getPresaleStats() {
  const ep = CONFIG.ENDPOINTS?.stats;
  const url = ep && endpoint(ep);
  if (url) {
    try {
      const res = await safeFetch(url, { cache: "no-cache" });
      if (res.ok) {
        const { soldMag, totalMag, raisedUsd } = await res.json();
        return {
          soldMag: Number(soldMag) || 0,
          totalMag: Number(totalMag) || CONFIG.TOTAL_SUPPLY,
          raisedUsd: Number(raisedUsd) || 0,
        };
      }
    } catch (e) {
      console.warn("stats API fail:", e);
    }
  }
  // DEMO: обчислюємо з локального фіда
  const feed = demoFeed();
  const soldMag = feed.reduce((s, it) => s + (Number(it.magt ?? it.tokens ?? 0) || 0), 0);
  const raisedUsd = feed.reduce((s, it) => s + (Number(it.amountUsd ?? it.usd ?? 0) || 0), 0);
  return { soldMag, totalMag: CONFIG.TOTAL_SUPPLY, raisedUsd };
}

export async function getRecentPurchases(limit = 20) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const ep = CONFIG.ENDPOINTS?.feed;
  const url = ep && endpoint(`${ep}?limit=${lim}`);
  if (url) {
    try {
      const res = await safeFetch(url, { cache: "no-cache" });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) return list.slice(0, lim);
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
  const ep = CONFIG.ENDPOINTS?.leaders;
  const url = ep && endpoint(`${ep}?limit=${lim}`);
  if (url) {
    try {
      const res = await safeFetch(url, { cache: "no-cache" });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) return list.slice(0, lim);
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
  const ep = CONFIG.ENDPOINTS?.purchase;
  const url = ep && endpoint(ep);
  if (!url) return { ok: true, demo: true }; // демо-режим
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
