// /js/ui.js
import { CONFIG } from "./config.js";
import { ui, state, refreshUiRefs } from "./state.js";
import { fmt as utilFmt, clamp, setBtnLoading } from "./utils.js";
import { getPresaleStats } from "./ton.js";

/* ===== ЛЕГКИЙ SHIELD для TonConnect (bubbling only) ===== */
(function setupTonConnectBubblingShieldOnce() {
  if (window.__magtTcBubblingShieldInstalled) return;
  window.__magtTcBubblingShieldInstalled = true;

  const SEL_TC = [
    ".tc-root", ".tc-modal", ".tc-overlay", ".tc-wallets-modal", ".tc-modal__body", ".tc-modal__backdrop",
    "[data-tc-widget]", '[class*="ton-connect"]', '[class*="tonconnect"]', '[id^="tc-"]',
    "tonconnect-ui", "ton-connect-ui", "tonconnect-ui-modal", "ton-connect-ui-modal",
    "[role='dialog']", "[aria-modal='true']", "dialog", ".modal", ".overlay"
  ].join(", ");

  function eventPathHasSelector(e, selector) {
    try {
      const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
      for (const n of path) {
        if (!n || n.nodeType !== 1) continue;
        const el = /** @type {Element} */(n);
        if (el.matches?.(selector)) return true;
        const host = (el.shadowRoot && el.shadowRoot.host) ? el.shadowRoot.host : null;
        if (host && host.matches?.(selector)) return true;
      }
    } catch {}
    return false;
  }
  const isInsideTonConnect = (e) => eventPathHasSelector(e, SEL_TC);

  const absorb = (e) => {
    if (window.__tc_open || isInsideTonConnect(e)) {
      // даємо TonConnect обробити подію, але не пускаємо вище
      e.stopPropagation();
    }
  };
  // тільки bubbling — не ламаємо взаємодію всередині TonConnect
  document.addEventListener("click", absorb, false);
  document.addEventListener("pointerdown", absorb, { capture: false, passive: true });
  document.addEventListener("touchstart", absorb, { capture: false, passive: true });

  // Esc: блокуємо «втечу» назовні, але не заважаємо самій модалці
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    try {
      const el = document.querySelector(".tc-modal, .tc-overlay, .tc-wallets-modal, [aria-modal='true'], [role='dialog']");
      if (!el) return;
      const st = getComputedStyle(el);
      const open = st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
      if (open) {
        e.stopPropagation();
      }
    } catch {}
  };
  document.addEventListener("keydown", onKey, true);
})();

/* ===== БАЗА ДЛЯ API ===== */
const IS_LOCAL = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
const API_BASE =
  (CONFIG && CONFIG.API_BASE != null) ? CONFIG.API_BASE :
  (IS_LOCAL ? "http://127.0.0.1:8787" : "");

/* опційне вимкнення my-stats, щоб не спамити 404 */
const DISABLE_MY_STATS = !!(window.CONFIG_OVERRIDE && window.CONFIG_OVERRIDE.DISABLE_MY_STATS);

/* ===== МЕТА-ПЛАН У TON ===== */
const GOAL_TON = Number(CONFIG.GOAL_TON ?? 6_500_000);

/* ===================== helpers ===================== */

// формат із крапками: 6500000 -> "6.500.000"
function intDots(n) {
  const s = String(Math.floor(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const fmt = {
  tokens(n) { return nf0.format(Number(n) || 0); },
  ton(n, fd = 0) {
    const x = Number(n) || 0;
    if (fd === 0) return intDots(x);
    const [i, f = ""] = x.toFixed(fd).split(".");
    return `${intDots(i)}${fd ? `.${f}` : ""}`;
  },
};

export function toast(msg) {
  if (!ui.status) return;
  ui.status.textContent = msg;
  ui.status.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    ui.status.style.opacity = "0";
    setTimeout(() => { if (ui.status) ui.status.textContent = ""; }, 200);
  }, 4500);
}

/** строгий EQ/UQ */
function isTonEqUq(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (!a) return false;
  if (!(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
  return /^[A-Za-z0-9_-]{48,68}$/.test(a);
}
/** hex / 0: */
function isHexLike(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  return !!a && (a.startsWith("0:") || /^[0-9a-fA-F:]{48,90}$/.test(a));
}

/** синхронна спроба отримати EQ/UQ (лише якщо TonWeb вже є) */
function normalizeToBase64Url(addr) {
  const a = (addr || "").trim();
  if (!a) return null;
  if (isTonEqUq(a)) return a;
  try {
    if (window.TonWeb?.utils?.Address) {
      const A = window.TonWeb.utils.Address;
      return new A(a).toString(true, true, true);
    }
  } catch {}
  return null;
}

/** гарантовано отримаємо EQ/UQ: при потребі підвантажимо TonWeb і сконвертуємо */
async function ensureBase64Url(addr) {
  const a = (addr || "").trim();
  if (!a) return null;
  if (isTonEqUq(a)) return a;

  let b64 = normalizeToBase64Url(a);
  if (b64) return b64;

  if (isHexLike(a)) {
    try {
      if (!window.TonWeb) {
        await import("https://unpkg.com/tonweb@0.0.66/dist/tonweb.min.js");
      }
      const A = window.TonWeb.utils.Address;
      b64 = new A(a).toString(true, true, true);
      if (isTonEqUq(b64)) return b64;
    } catch {}
  }
  return null;
}

function short(addr) {
  return addr ? addr.slice(0, 4) + "… " + addr.slice(-4) : "—";
}

const REF_ON  = (CONFIG.REF_ENABLED !== false);
const REF_MIN = Number(CONFIG.REF_MIN_USDT || 0);

/* ===== DOM getters з перевіркою isConnected ===== */
function getTonInput() {
  let el = ui.tonIn;
  if (!el || !el.isConnected) {
    el = document.getElementById("tonIn") || document.querySelector("[data-ton-in]") || document.querySelector("input[name='ton']") || null;
    if (el) ui.tonIn = el;
  }
  return el;
}
function getUsdtInput() {
  let el = ui.usdtIn;
  if (!el || !el.isConnected) {
    el = document.getElementById("usdtIn") || document.querySelector("[data-usdt-in]") || document.querySelector("input[name='usdt']") || null;
    if (el) ui.usdtIn = el;
  }
  return el;
}
function getAgreeCheckbox() {
  let el = ui.agree;
  if (!el || !el.isConnected) {
    el = document.getElementById("agree") || document.querySelector("[data-agree]") || null;
    if (el) ui.agree = el;
  }
  return el;
}
function getMagOut() {
  let el = ui.magOut;
  if (!el || !el.isConnected) {
    el = document.getElementById("magOut") || document.querySelector("[data-mag-out]") || null;
    if (el) ui.magOut = el;
  }
  return el;
}
function el(id){ return document.getElementById(id); }

/* ====== керування зверненнями до бекенду рефералок ====== */
let REF_API_ON = true;
let _lastProbeWallet = "";
let _lastPostWallet  = "";

// ✅ Використовуємо абсолютний ендпоінт із config.js
const REF_ENDPOINT = (CONFIG?.ENDPOINTS?.referral || "").trim();
const REF_API_PATH = REF_ENDPOINT || (
  (API_BASE ? (API_BASE.replace(/\/+$/,"") + "/api/referral") : "/api/referral")
);

/* ====== Мої баланси (мій MAGT та від рефералів) ====== */
const MY_STATS_ENDPOINT =
  (CONFIG?.ENDPOINTS?.myBalances ||
   CONFIG?.ENDPOINTS?.balances ||
   CONFIG?.ENDPOINTS?.myStats || "").trim()
  || (API_BASE ? (API_BASE.replace(/\/+$/,"") + "/api/my-stats") : "/api/my-stats");

let _myStatsTimer = null;
async function fetchMyStats(addrB64) {
  if (DISABLE_MY_STATS) return null;
  if (!addrB64 || !MY_STATS_ENDPOINT) return null;
  try {
    const url = `${MY_STATS_ENDPOINT}?wallet=${encodeURIComponent(addrB64)}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch { return null; }
}
function renderMyStats(stats) {
  const bought = Number(stats?.bought_magt || 0);
  const refs   = Number(stats?.referrals_magt || 0);
  const eBought = document.getElementById("my-bought-magt");
  const eRef   = document.getElementById("my-ref-magt");
  const eUpd   = document.getElementById("my-stats-upd");
  if (eBought) eBought.textContent = fmt.tokens(bought);
  if (eRef)    eRef.textContent    = fmt.tokens(refs);
  if (eUpd) {
    const d = new Date();
    eUpd.textContent = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
}
async function refreshMyStats(addrB64) {
  const j = await fetchMyStats(addrB64);
  if (j) renderMyStats(j);
}
function startMyStatsPolling(addrB64) {
  clearInterval(_myStatsTimer);
  if (DISABLE_MY_STATS) return;
  if (!addrB64) return;
  refreshMyStats(addrB64);
  _myStatsTimer = setInterval(() => refreshMyStats(addrB64), 20000);
}

function hideRefUI(hide = true) {
  const method = hide ? "add" : "remove";
  ui.refDetected?.classList[method]("hidden");
  ui.refYourLink?.classList[method]("hidden");
  ui.refPayout?.classList[method]("hidden");
}

/* ==== Надійна побудова URL з рефом (лише EQ/UQ) ==== */
function buildCanonicalRefUrl(addrB64) {
  const ref = isTonEqUq(addrB64) ? addrB64.trim() : null;
  try {
    const u = new URL(window.location.href);
    u.search = ""; u.hash = "";
    if (ref) u.searchParams.set("ref", ref);
    return u.toString();
  } catch {
    const origin = location?.origin || "";
    const path   = typeof location?.pathname === "string" ? location.pathname : "/";
    const base   = origin + (path || "/");
    const q      = ref ? (`?ref=${encodeURIComponent(ref)}`) : "";
    return base + q;
  }
}

/* ===== HTTP helpers (м’які, не спамлять) ===== */
async function apiPostReferral(walletB64, refB64) {
  if (!REF_API_ON || !REF_API_PATH) return null;
  if (!isTonEqUq(walletB64) || !isTonEqUq(refB64)) return { ok:false, err:"bad-params" };
  try {
    if (_lastPostWallet === walletB64) return null; // антидубль
    const res = await fetch(REF_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletB64, ref: refB64 }),
    });
    _lastPostWallet = walletB64;
    return await res.json().catch(() => ({}));
  } catch {
    REF_API_ON = false;
    return null;
  }
}
async function apiGetReferral(walletB64) {
  if (!REF_API_ON || !REF_API_PATH) return null;
  if (!isTonEqUq(walletB64)) return { ok:false, err:"bad-params" };
  try {
    if (_lastProbeWallet === walletB64) return null; // антидубль
    const url = `${REF_API_PATH}?wallet=${encodeURIComponent(walletB64)}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    _lastProbeWallet = walletB64;
    return await res.json().catch(() => ({}));
  } catch {
    REF_API_ON = false;
    return null;
  }
}

/* ===== state helpers for referrer (лише EQ/UQ) ===== */
function setReferrerInState(addrB64) {
  const b64 = normalizeToBase64Url(addrB64);
  if (!isTonEqUq(b64 || "")) return false;
  state.referrer = b64;
  state.referrerShort = short(b64);
  try { localStorage.setItem("magt_ref", b64); } catch {}
  try { window.__referrer = b64; } catch {}
  if (REF_ON && ui.refDetected) {
    ui.refDetected.classList.remove("hidden");
    if (ui.referrerShort) ui.referrerShort.textContent = state.referrerShort;
  }
  updateRefBonus();
  return true;
}

/* ===================== inputs & buttons ===================== */
export function sanitizeUsdInput() {
  const input = getUsdtInput();
  if (!input) return 0;
  const val = String(input.value || "").replace(",", ".").trim();
  let usd = Number(val);
  if (!isFinite(usd) || usd < 0) usd = 0;
  usd = Math.round(usd * 100) / 100;
  input.value = usd ? usd : "";
  return usd;
}
function sanitizeTonInput() {
  const input = getTonInput();
  if (!input) return 0;
  const val = String(input.value || "").replace(",", ".").trim();
  let ton = Number(val);
  if (!isFinite(ton) || ton < 0) ton = 0;
  input.value = ton ? ton : "";
  return ton;
}

export function refreshButtons() {
  const agree = getAgreeCheckbox();
  const tonEl = getTonInput();
  const usdEl = getUsdtInput();

  // TON-режим має пріоритет
  if (tonEl) {
    const ton = Number(tonEl.value || 0);
    const ok = !!agree?.checked && ton >= (Number(CONFIG.MIN_BUY_TON ?? 0) || 0);
    if (ui.btnBuy) ui.btnBuy.disabled = !ok;
    if (ui.btnClaim) ui.btnClaim.disabled = true;
    return;
  }

  // USD fallback
  const usd = Number(usdEl?.value || 0);
  const ok = !!agree?.checked && usd >= (CONFIG.MIN_BUY_USDT || 1);
  if (ui.btnBuy) ui.btnBuy.disabled = !ok;
  if (ui.btnClaim) ui.btnClaim.disabled = true;
}

/* ===== допоміжне: привести видимі одиниці ціни до TON у DOM ===== */
function enforceTonUnitsInHero(priceTonShown) {
  const priceSpan = document.getElementById("ui-price");
  const container = priceSpan?.parentElement || null;
  if (container && priceSpan) {
    const p = Number(priceTonShown || 0);
    if (p > 0) {
      container.innerHTML = `<span id="ui-price">${p.toFixed(6)}</span> <span class="opacity-70">TON</span>`;
    } else {
      container.innerHTML = `<span id="ui-price">—</span> <span class="opacity-70">TON</span>`;
    }
  }
}

/* ===== патч статичного тексту «Ціль: …» у герої ===== */
function patchGoalTextStatic() {
  const needle = "$20,000,000";
  const replacement = `${fmt.ton(GOAL_TON, 0)} TON`;
  // замінимо в будь-якому елементі, що містить старе значення
  document.querySelectorAll("section,div,span,p,small").forEach((n) => {
    if (n.childElementCount === 0 && typeof n.textContent === "string" && n.textContent.includes(needle)) {
      n.textContent = n.textContent.replace(needle, replacement);
    }
  });
}

/* ===== підпис під “Отримаєш … MAGT” ===== */
function updatePriceUnder(){
  const levelTxt = ui.level?.textContent || "1";
  const p = Number(window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);

  const wrap = document.getElementById("price-under-output");
  const priceHtml = (p > 0) ? p.toFixed(6) : "—";
  if (wrap) {
    wrap.innerHTML = `Ціна зараз: <span id="price-now">${priceHtml}</span> • Рівень <span id="level-now">${levelTxt}</span>`;
    return;
  }
  const pn = document.getElementById("price-now");
  const ln = document.getElementById("level-now");
  if (pn) pn.textContent = priceHtml;
  if (ln) ln.textContent = levelTxt;
}

/* ===================== core calc ===================== */
function calcTokensFromUsd(usdRaw, priceRaw) {
  const usd = Number(usdRaw);
  const price = Number(priceRaw);
  if (!(usd > 0) || !(price > 0)) return 0;
  return Math.floor(usd / price);
}
function calcTokensFromTon(tonRaw, priceTonRaw) {
  const ton = Number(tonRaw);
  const priceTon = Number(priceTonRaw);
  if (!(ton > 0) || !(priceTon > 0)) return 0;
  return Math.floor(ton / priceTon);
}

function renderTokensOut(tokens) {
  const outEl = getMagOut();
  if (!outEl) return;
  outEl.textContent = fmt.tokens(tokens);
}

export function recalc() {
  const tonEl = getTonInput();
  if (tonEl) {
    const ton = sanitizeTonInput();
    const priceTon = Number(window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);
    const tokens = calcTokensFromTon(ton, priceTon);
    renderTokensOut(tokens);
    updateRefBonus();
    updatePriceUnder();
    refreshButtons();
    return;
  }

  // USD fallback
  const usd = sanitizeUsdInput();
  const price = Number(window.__CURRENT_PRICE_USD ?? CONFIG.PRICE_USD ?? 0);
  const tokens = calcTokensFromUsd(usd, price);
  renderTokensOut(tokens);
  updateRefBonus();
  updatePriceUnder();
  refreshButtons();
}

/* ===== Прогрес/залишок ===== */

// інфо активного рівня за soldMag (ціни рівнів інтерпретуємо як TON)
function getCurrentTierInfo(sold) {
  const tiers = Array.isArray(CONFIG.LEVELS) ? CONFIG.LEVELS : [];
  let level = 1;
  let price = Number(CONFIG.PRICE_TON || 0);
  let remainingInTier = Math.max(0, Number(CONFIG.TOTAL_SUPPLY || 0) - Number(sold || 0));

  if (!tiers.length) return { level, price, remainingInTier };

  let cum = 0;
  for (let i = 0; i < tiers.length; i++) {
    const qty = Number(tiers[i]?.qty ?? tiers[i]?.tokens ?? 0);
    const p   = Number(tiers[i]?.price ?? tiers[i]?.ton ?? tiers[i]?.priceTon ?? 0);
    const end = cum + (qty > 0 ? qty : 0);
    if (sold < end) {
      level = i + 1;
      if (p > 0) price = p;
      remainingInTier = Math.max(0, end - sold);
      return { level, price, remainingInTier };
    }
    cum = end;
  }
  const last = tiers[tiers.length - 1];
  const pLast = Number(last?.price ?? last?.ton ?? last?.priceTon ?? 0);
  if (pLast > 0) price = pLast;
  return { level: tiers.length, price, remainingInTier: 0 };
}

function rewriteRaisedLine(raisedTon) {
  // перезаписуємо " $<ui-raised> / $20,000,000 " -> " <ui-raised> / 6.500.000 TON "
  const slot = document.getElementById("ui-raised");
  const parent = slot?.parentElement;
  if (parent) {
    parent.innerHTML = `<span id="ui-raised">${fmt.ton(raisedTon, 0)}</span> / ${fmt.ton(GOAL_TON, 0)} TON`;
    try { ui.raised = document.getElementById("ui-raised"); } catch {}
  }
}

function applySaleUi({ raisedUsd, soldMag, totalMag }) {
  // приблизна оцінка зібраного в TON
  const priceTonNow = Number(window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);
  const raisedTon = (Number(soldMag || 0) * (priceTonNow > 0 ? priceTonNow : 0)) || 0;

  // % прогресу по TON-цілі
  let pct = 0;
  if (GOAL_TON > 0) pct = Math.max(0, Math.min(100, (raisedTon / GOAL_TON) * 100));

  const saleRaised  = el("sale-raised");
  const saleBar     = el("sale-bar");
  const salePercent = el("sale-percent");

  if (saleRaised)  saleRaised.textContent = `${fmt.ton(raisedTon, 0)} TON`;
  if (saleBar)     saleBar.style.width = `${pct.toFixed(2)}%`;
  if (salePercent) salePercent.textContent = `${pct.toFixed(2)}% продано`;

  const sold = Math.max(0, Number(soldMag || 0));
  const info = getCurrentTierInfo(sold);

  if (ui.price) ui.price.textContent = Number(info.price || 0).toFixed(6);
  enforceTonUnitsInHero(info.price);

  if (ui.level) ui.level.textContent = String(info.level);
  if (ui.left)  ui.left.textContent  = fmt.tokens(info.remainingInTier);

  const saleRemaining = el("sale-remaining");
  if (saleRemaining) saleRemaining.textContent = fmt.tokens(info.remainingInTier);

  try {
    window.__CURRENT_PRICE_TON = Number(info.price || 0);
  } catch {}

  // верхній рядок під прогресом у герої
  rewriteRaisedLine(raisedTon);

  if (ui.bar) ui.bar.style.width = `${pct.toFixed(2)}%`;

  updatePriceUnder();
}

/* ===== Анти-кеш фолбек на прямий /api/presale/stats ===== */
async function fetchStatsDirect() {
  const base = (CONFIG?.ENDPOINTS?.stats || "").trim()
    || (API_BASE ? API_BASE.replace(/\/+$/,"") + "/api/presale/stats" : "/api/presale/stats");
  const url = `${base}?t=${Date.now()}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j) return null;
    return {
      raisedUsd: Number(j.raisedUsd ?? j.raised_usd ?? 0),
      soldMag:   Number(j.soldMag   ?? j.sold_tokens ?? 0),
      totalMag:  Number(j.totalMag  ?? j.total_supply ?? CONFIG.TOTAL_SUPPLY ?? 0),
    };
  } catch { return null; }
}

let _saleTimer = null;
let _warmTimer = null;

async function refreshSaleStatsOnce() {
  try {
    let s = await getPresaleStats()?.catch?.(() => null);
    if (!s || (s.raisedUsd == null && s.soldMag == null)) {
      s = await fetchStatsDirect();
    }
    if (s) applySaleUi(s);
  } catch {}
}
function startSalePolling() {
  clearInterval(_saleTimer);
  clearInterval(_warmTimer);

  refreshSaleStatsOnce();

  // «теплий старт»: кожні 3с ~30с
  let left = 10;
  _warmTimer = setInterval(() => {
    refreshSaleStatsOnce();
    left -= 1;
    if (left <= 0) {
      clearInterval(_warmTimer);
      _warmTimer = null;
    }
  }, 3000);

  // звичайний полінг
  _saleTimer = setInterval(refreshSaleStatsOnce, 20000);
}

/* ===== авто-підв’язка калькулятора, якщо bindEvents() не викликано ===== */
function ensureCalcWires() {
  const ton = getTonInput();
  const usd = getUsdtInput();

  if (ton && !ton._calcWired) {
    ["input","change","blur"].forEach(ev => ton.addEventListener(ev, recalc));
    ton._calcWired = true;
  }
  if (usd && !usd._calcWired) {
    ["input","change","blur"].forEach(ev => usd.addEventListener(ev, recalc));
    usd._calcWired = true;
  }
}

/* ===================== static UI on boot ===================== */
export function initStaticUI() {
  try { refreshUiRefs(); } catch {}

  const y = document.querySelector("#year");
  if (y) y.textContent = new Date().getFullYear();

  // Початкова ціна/одиниці як TON: не показуємо "0 TON" – ставимо "—", поки не прийдуть стати
  const priceInit = Number(window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);
  if (ui.price) ui.price.textContent = (priceInit > 0) ? priceInit.toFixed(6) : "—";
  enforceTonUnitsInHero(priceInit);

  if (ui.level) ui.level.textContent = "1";

  // Патч статичного тексту "Ціль"
  patchGoalTextStatic();

  // Початковий прогрес (0 / GOAL_TON)
  rewriteRaisedLine(0);
  if (ui.bar) ui.bar.style.width = "0%";

  if (ui.claimWrap) ui.claimWrap.classList.toggle("hidden", !CONFIG.CLAIM_ENABLED);

  if (!REF_ON) hideRefUI(true);

  if (REF_ON) {
    if (ui.refLink && !ui.refLink.value) {
      ui.refLink.placeholder = "Підключи гаманець — лінк з’явиться тут";
    }
    if (ui.btnCopyRef) ui.btnCopyRef.disabled = false;
  }

  try {
    if (Number(CONFIG.PRICE_TON) > 0) {
      window.__CURRENT_PRICE_TON = Number(CONFIG.PRICE_TON);
    }
  } catch {}

  updatePriceUnder();
  startSalePolling();

  ensureCalcWires();
  recalc();

  const addr = (state.owner || window.__magtAddr || "").trim?.() || "";
  if (isTonEqUq(addr)) startMyStatsPolling(addr);
}

/* ===================== referrals ===================== */
export function detectRefInUrl() {
  const locked = localStorage.getItem("magt_ref_locked") === "1";
  const p = new URLSearchParams(location.search);
  const raw = (p.get("ref") || "").trim();
  const candidate = normalizeToBase64Url(raw);

  if (locked) {
    loadRefFromStorage();
    return;
  }

  if (candidate) {
    setReferrerInState(candidate);
    try { window.__pendingRef = candidate; } catch {}
  } else {
    try {
      const savedRaw = localStorage.getItem("magt_ref");
      const saved = normalizeToBase64Url(savedRaw);
      if (saved) setReferrerInState(saved);
    } catch {}
  }

  if (!REF_ON) { hideRefUI(true); return; }

  if (state.referrer) {
    ui.refDetected?.classList.remove("hidden");
    if (ui.referrerShort) ui.referrerShort.textContent = state.referrerShort;
  } else {
    ui.refDetected?.classList.add("hidden");
  }
}

export function loadRefFromStorage() {
  if (state.referrer) return;
  try {
    const savedRaw = localStorage.getItem("magt_ref");
    const saved = normalizeToBase64Url(savedRaw);
    if (saved) setReferrerInState(saved);
  } catch {}
}

/* ===== РЕФ-БОНУС у MAGT ===== */
export function updateRefBonus() {
  if (!ui.refPayout) return;
  if (!REF_ON) { ui.refPayout.classList.add("hidden"); return; }

  const tonEl = getTonInput();
  const usdEl = getUsdtInput();

  let bonusTokens = 0;
  let toAddrShort = state.referrerShort || short(state.referrer);

  if (tonEl) {
    const ton = Number(tonEl.value || 0);
    const pct = Number(CONFIG.REF_BONUS_PCT || 5);
    const priceTon = Number(window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);
    if (state.referrer && ton > 0 && priceTon > 0) {
      const tokens = calcTokensFromTon(ton, priceTon);
      bonusTokens = Math.floor(tokens * (pct / 100));
    }
  } else if (usdEl) {
    const usd = Number(usdEl.value || 0);
    if (!state.referrer || !usd || usd <= 0 || (REF_MIN > 0 && usd < REF_MIN)) {
      ui.refPayout.classList.add("hidden");
      return;
    }
    if (!ui.refPayout.__magTplFixed) {
      try {
        const amtId = ui.refBonusUsd?.id || "ref-bonus-usd";
        const toId  = ui.refBonusTo?.id  || "ref-bonus-to";
        const pct = Number(CONFIG.REF_BONUS_PCT || 5);
        ui.refPayout.innerHTML = `${pct}% реф-винагорода: <span id="${amtId}">0</span> MAGT → <span id="${toId}">—</span>`;
        ui.refBonusUsd = document.getElementById(amtId);
        ui.refBonusTo  = document.getElementById(toId);
        ui.refPayout.__magTplFixed = true;
      } catch {}
    }
    const pct   = Number(CONFIG.REF_BONUS_PCT || 5);
    const price = Number(window.__CURRENT_PRICE_USD ?? CONFIG.PRICE_USD ?? 0);
    if (!(price > 0)) return;
    const tokens = calcTokensFromUsd(usd, price);
    bonusTokens = Math.floor(tokens * (pct / 100));
  }

  if (!ui.refPayout.__magTplFixed) {
    try {
      const amtId = ui.refBonusUsd?.id || "ref-bonus-usd";
      const toId  = ui.refBonusTo?.id  || "ref-bonus-to";
      const pct = Number(CONFIG.REF_BONUS_PCT || 5);
      ui.refPayout.innerHTML = `${pct}% реф-винагорода: <span id="${amtId}">0</span> MAGT → <span id="${toId}">—</span>`;
      ui.refBonusUsd = document.getElementById(amtId);
      ui.refBonusTo  = document.getElementById(toId);
      ui.refPayout.__magTplFixed = true;
    } catch {}
  }

  if (ui.refBonusUsd) ui.refBonusUsd.textContent = fmt.tokens(bonusTokens);
  if (ui.refBonusTo)  ui.refBonusTo.textContent  = toAddrShort || "—";

  if (state.referrer && bonusTokens > 0) ui.refPayout.classList.remove("hidden");
  else ui.refPayout.classList.add("hidden");
}

export function initRefBonusHandlers() {
  const ton = getTonInput();
  const usd = getUsdtInput();
  const bind = (input) => {
    if (!input) return;
    ["input", "change", "blur"].forEach((ev) =>
      input.addEventListener(ev, updateRefBonus)
    );
  };
  bind(ton);
  bind(usd);
  updateRefBonus();
}

/* ====== РУЧНИЙ режим адреси (fallback) ====== */
function promptForManualAddress() {
  let raw = "";
  try { raw = prompt("Встав свою TON-адресу (формат EQ… або стандартний формат).") || ""; } catch {}
  setOwnRefLink(raw);
}
function resetManualAddress() {
  try { localStorage.removeItem("magt_owner_manual"); } catch {}
  try { window.__magtAddr = null; } catch {}
  try { window.dispatchEvent(new CustomEvent("magt:address", { detail: { address: null } })); } catch {}
  setOwnRefLink("");
}
function loadManualAddressIfAny() {
  try {
    const a = localStorage.getItem("magt_owner_manual") || "";
    if (a) setOwnRefLink(a);
  } catch {}
}

/* ====== Встановити власний реф-лінк за адресою гаманця ====== */
export async function setOwnRefLink(walletAddress) {
  const wrap0  = document.getElementById("ref-yourlink") || ui.refYourLink;
  const input0 = document.getElementById("ref-link")      || ui.refLink;
  if (!wrap0 || !input0) {
    setTimeout(() => setOwnRefLink(walletAddress), 200);
    return;
  }

  const b64 = await ensureBase64Url(walletAddress);
  const has = !!b64;

  const wrap  = document.getElementById("ref-yourlink") || ui.refYourLink;
  const input = document.getElementById("ref-link")      || ui.refLink;
  const btn   = document.getElementById("btn-copy-ref")  || ui.btnCopyRef;

  if (!REF_ON || !has) {
    if (input) input.value = "";
    if (btn) btn.disabled = false;
    if (wrap) wrap.classList.remove("hidden");
    return;
  }

  try {
    const urlStr = buildCanonicalRefUrl(b64);
    state.owner = b64;
    state.ownerShort = short(b64);
    try { localStorage.setItem("magt_owner_manual", b64); } catch {}
    try { window.__magtAddr = b64; } catch {}

    if (state.referrer && ui.refDetected) {
      ui.refDetected.classList.remove("hidden");
      if (ui.referrerShort) ui.referrerShort.textContent = state.referrerShort;
    }

    if (wrap)  wrap.classList.remove("hidden");
    if (input) { input.value = urlStr; input.placeholder = ""; }
    if (btn) btn.disabled = false;

    if (btn && !btn._copyBound) {
      btn.addEventListener("click", async () => {
        const value = (input && input.value) || "";
        if (!value.trim()) {
          try {
            const { openConnectModal } = await import("./tonconnect.js");
            await openConnectModal();
            toast("Підключи гаманець, щоб отримати реф-лінк");
          } catch {}
          return;
        }
        try { await navigator.clipboard.writeText(value.trim()); toast("Скопійовано ✅"); }
        catch { toast("Не вдалося скопіювати"); }
      });
      btn._copyBound = true;
    }

    updateRefBonus();
    startMyStatsPolling(b64);

    (async () => {
      try {
        if (!REF_API_ON || !REF_API_PATH) return;

        const existed = await apiGetReferral(b64);
        if (existed?.ok && existed.referrer) {
          setReferrerInState(existed.referrer);
          try { localStorage.setItem("magt_ref_locked", "1"); } catch {}
          return;
        }

        let pendingRef = null;
        try { pendingRef = window.__pendingRef || null; } catch {}
        const knownRef =
          (pendingRef && isTonEqUq(pendingRef) ? pendingRef : null) ||
          (state.referrer && isTonEqUq(state.referrer) ? state.referrer : null) ||
          null;

        if (knownRef) {
          const resp = await apiPostReferral(b64, knownRef);
          if (resp?.ok) {
            setReferrerInState(knownRef);
            try { localStorage.setItem("magt_ref_locked", "1"); } catch {}
          }
        }
      } catch {}
    })();

  } catch {}
}

/* ===================== bind events ===================== */
export function bindEvents({ onBuyClick, onClaimClick, getUserUsdtBalance }) {
  const ton = getTonInput();
  const usd = getUsdtInput();
  const agree = getAgreeCheckbox();

  if (ton && ton._bound !== true) {
    ton.addEventListener("input", recalc);
    ton._bound = true;
  }
  if (usd && usd._bound !== true) {
    usd.addEventListener("input", recalc);
    usd._bound = true;
  }
  if (agree && agree._bound !== true) {
    agree.addEventListener("change", refreshButtons);
    agree._bound = true;
  }

  if (ui.btnMax && ui.btnMax._bound !== true) {
    ui.btnMax.addEventListener("click", async () => {
      setBtnLoading(ui.btnMax, true, "…");
      let max = await getUserUsdtBalance();
      setBtnLoading(ui.btnMax, false);
      if (max == null || !isFinite(max)) max = 100;
      const capped = clamp(max, CONFIG.MIN_BUY_USDT || 0, 1_000_000);
      const i = getUsdtInput();
      if (i) i.value = Math.floor(capped * 100) / 100;
      recalc();
    });
    ui.btnMax._bound = true;
  }

  if (ui.btnCopyRef && ui.btnCopyRef._bound !== true) {
    ui.btnCopyRef.addEventListener("click", async () => {
      const value = ui.refLink?.value?.trim() || "";
      if (!value) {
        try {
          const { openConnectModal } = await import("./tonconnect.js");
          await openConnectModal();
          toast("Підключи гаманець, щоб отримати реф-лінк");
        } catch {
          toast("Підключи гаманець, щоб отримати реф-лінк");
        }
        return;
      }
      try { await navigator.clipboard.writeText(value); toast("Скопійовано ✅"); }
      catch { toast("Не вдалося скопіювати"); }
    });
    ui.btnCopyRef._bound = true;
  }

  if (ui.refLink && !ui.refLink._bound) {
    ui.refLink.addEventListener("click", async () => {
      const value = ui.refLink?.value?.trim() || "";
      if (!value) {
        try {
          const { openConnectModal } = await import("./tonconnect.js");
          await openConnectModal();
          toast("Підключи гаманець, щоб отримати реф-лінк");
        } catch {}
      }
    });
    ui.refLink._bound = true;
  }

  const btnEnter = document.getElementById("btn-enter-addr");
  const btnReset = document.getElementById("btn-reset-manual");
  if (btnEnter && !btnEnter._bound) {
    btnEnter.addEventListener("click", promptForManualAddress);
    btnEnter._bound = true;
  }
  if (btnReset && !btnReset._bound) {
    btnReset.addEventListener("click", () => {
      resetManualAddress();
      toast("Ручну адресу скинуто");
      if (!state.owner) setOwnRefLink("");
    });
    btnReset._bound = true;
  }
  loadManualAddressIfAny();

  if (ui.btnBuy && ui.btnBuy._bound !== true) {
    ui.btnBuy.addEventListener("click", onBuyClick);
    ui.btnBuy._bound = true;
  }
  if (ui.btnClaim && ui.btnClaim._bound !== true) {
    ui.btnClaim.addEventListener("click", onClaimClick);
    ui.btnClaim._bound = true;
  }

  ensureCalcWires();
  recalc();
}

/* ===================== glue with TonConnect singleton ===================== */
try {
  window.addEventListener("magt:address", async (ev) => {
    const raw = ev?.detail?.address ?? null;
    await setOwnRefLink(raw);
  });
} catch {}

/* ===================== REF-LINK WATCHDOG ===================== */
function startRefAutofillWatchdog() {
  try {
    if (window.__refWatchRunning) return;
    let ticks = 0;
    window.__refWatchRunning = setInterval(async () => {
      ticks++;
      const input = document.getElementById("ref-link") || ui.refLink;
      const wrap  = document.getElementById("ref-yourlink") || ui.refYourLink;

      const rawCandidate =
        (typeof window.__magtAddr === "string" && window.__magtAddr.trim()) ?
          window.__magtAddr.trim() :
        (typeof window.__rawAddr === "string" && window.__rawAddr.trim()) ?
          window.__rawAddr.trim() : "";

      if (input && wrap && rawCandidate) {
        await setOwnRefLink(rawCandidate);
        clearInterval(window.__refWatchRunning);
        window.__refWatchRunning = null;
      }
      if (ticks >= 200) {
        clearInterval(window.__refWatchRunning);
        window.__refWatchRunning = null;
      }
    }, 150);
  } catch {}
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    startRefAutofillWatchdog();
    ensureCalcWires();
    recalc();
  });
} else {
  startRefAutofillWatchdog();
  ensureCalcWires();
  recalc();
}
window.addEventListener("load", () => {
  const a = (window.__magtAddr || window.__rawAddr || "").trim?.() || "";
  if (a) setOwnRefLink(a);
  ensureCalcWires();
  recalc();
});
window.addEventListener("partials:main-ready", () => {
  startRefAutofillWatchdog();
  ensureCalcWires();
  recalc();
});

// === debug helpers ===
try { window.setOwnRefLink = setOwnRefLink; } catch {}
try {
  window.magtSetAddr = (addr) => {
    window.dispatchEvent(new CustomEvent("magt:address", { detail: { address: addr || null } }));
  };
} catch {}
