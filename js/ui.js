// /js/ui.js
import { CONFIG } from "./config.js";
import { ui, state } from "./state.js";
import { fmt as utilFmt, clamp, setBtnLoading } from "./utils.js";
import { getPresaleStats } from "./ton.js";

/* ===== БАЗА ДЛЯ API ===== */
const IS_LOCAL = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
const API_BASE =
  (CONFIG && CONFIG.API_BASE != null) ? CONFIG.API_BASE :
  (IS_LOCAL ? "http://127.0.0.1:8787" : "");

/* ===================== helpers ===================== */

// універсальні форматери — не покладаємось на сигнатуру utils.fmt
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

const fmt = {
  tokens(n) { return nf0.format(Number(n) || 0); },
  usd(n, fd = 2) { return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: fd }); },
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
  return null; // БІЛЬШЕ НЕ ПОВЕРТАЄМО HEX!
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

/* ===== DOM getters (щоб не залежати від ui.*, коли refs ще не оновлені) ===== */
function getUsdtInput() {
  return ui.usdtIn || document.getElementById("usdtIn");
}
function getAgreeCheckbox() {
  return ui.agree || document.getElementById("agree");
}
function el(id){ return document.getElementById(id); }

/* ====== керування зверненнями до бекенду рефералок ====== */
let REF_API_ON = true;               // вимикаємо лише при фатальних мережевих збоях
let _lastProbeWallet = "";           // антидубль GET
let _lastPostWallet  = "";           // антидубль POST

// ✅ Використовуємо абсолютний ендпоінт із config.js
const REF_ENDPOINT = (CONFIG?.ENDPOINTS?.referral || "").trim();

/* safeguard: якщо хтось раптом конкатить API_BASE, зробимо запасний шлях */
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
  if (!addrB64 || !MY_STATS_ENDPOINT) return null;
  try {
    const url = `${MY_STATS_ENDPOINT}?wallet=${encodeURIComponent(addrB64)}`;
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
    const url = `${REF_API_PATH}?wallet=${encodeURIComponent(walletB64)}`;
    const res = await fetch(url);
    _lastProbeWallet = walletB64;
    // сервер повертає 200 і {ok:false} якщо ще не закріплено
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

export function refreshButtons() {
  const input = getUsdtInput();
  const agree = getAgreeCheckbox();
  const usd = Number(input?.value || 0);
  const ok = !!agree?.checked && usd >= (CONFIG.MIN_BUY_USDT || 1);
  if (ui.btnBuy) ui.btnBuy.disabled = !ok;
  if (ui.btnClaim) ui.btnClaim.disabled = true;
}

/* ===== підпис під “Отримаєш … MAGT” ===== */
function updatePriceUnder(){
  const pn = document.getElementById('price-now');
  const ln = document.getElementById('level-now');
  // динамічна ціна поточного рівня (fallback на CONFIG)
  if (pn) pn.textContent = (Number(window.__CURRENT_PRICE_USD ?? CONFIG.PRICE_USD ?? 0)).toFixed(6);
  if (ln) ln.textContent = ui.level?.textContent || "1";
}

/* ===================== core calc ===================== */
/** безпечне обчислення кількості MAGT з округленням вниз */
function calcTokensFromUsd(usdRaw, priceRaw) {
  const usd = Number(usdRaw);
  const price = Number(priceRaw);
  if (!(usd > 0) || !(price > 0)) return 0;
  // лише цілі MAGT
  return Math.floor(usd / price);
}

/** відмальовка блоку “Отримаєш … MAGT” */
function renderTokensOut(tokens) {
  // фолбек, якщо ui.magOut ще не оновився
  const outEl = ui.magOut || document.getElementById("magOut");
  if (!outEl) return;
  outEl.textContent = fmt.tokens(tokens);
}

/** головний перерахунок */
export function recalc() {
  const usd = sanitizeUsdInput();
  // ВАЖЛИВО: беремо динамічну ціну поточного рівня
  const price = Number(window.__CURRENT_PRICE_USD ?? CONFIG.PRICE_USD ?? 0.00383);

  const tokens = calcTokensFromUsd(usd, price);
  renderTokensOut(tokens);

  // реф-бонус залежить від кількості токенів (через usd/price)
  updateRefBonus();
  updatePriceUnder();
  refreshButtons();
}

/* ===== Прогрес/залишок ===== */

// допоміжне: отримати інфо активного рівня за soldMag
function getCurrentTierInfo(sold) {
  const tiers = Array.isArray(CONFIG.LEVELS) ? CONFIG.LEVELS : [];
  let level = 1;
  let price = Number(CONFIG.PRICE_USD || 0);
  let remainingInTier = Math.max(0, Number(CONFIG.TOTAL_SUPPLY || 0) - Number(sold || 0));

  if (!tiers.length) return { level, price, remainingInTier };

  let cum = 0;
  for (let i = 0; i < tiers.length; i++) {
    const qty = Number(tiers[i]?.qty ?? tiers[i]?.tokens ?? 0);
    const p   = Number(tiers[i]?.price ?? tiers[i]?.usd ?? tiers[i]?.priceUsd ?? 0);
    const end = cum + (qty > 0 ? qty : 0);
    if (sold < end) {
      level = i + 1;
      if (p > 0) price = p;
      remainingInTier = Math.max(0, end - sold);
      return { level, price, remainingInTier };
    }
    cum = end;
  }
  // усе розкуплено — показуємо останній рівень із нульовим залишком
  const last = tiers[tiers.length - 1];
  const pLast = Number(last?.price ?? last?.usd ?? last?.priceUsd ?? 0);
  if (pLast > 0) price = pLast;
  return { level: tiers.length, price, remainingInTier: 0 };
}

function applySaleUi({ raisedUsd, soldMag, totalMag }) {
  // офсет і хардкапа
  const offset = Number(CONFIG.RAISED_OFFSET_USD || 0);
  const cap    = Number(CONFIG.HARD_CAP || 0) || null;
  const raised = Math.max(0, Number(raisedUsd || 0)) + offset;

  // Процент і смуга (за USD-хардкапо́ю)
  let pct = 0;
  if (cap && cap > 0) pct = Math.max(0, Math.min(100, (raised / cap) * 100));

  // «Зібрано» + прогрес-бар у віджеті
  const saleRaised = el("sale-raised");
  const saleBar    = el("sale-bar");
  const salePercent= el("sale-percent");
  if (saleRaised)  saleRaised.textContent = `$${fmt.usd(raised, 0)}`;
  if (saleBar)     saleBar.style.width = `${pct.toFixed(2)}%`;
  if (salePercent) salePercent.textContent = `${pct.toFixed(2)}% продано`;

  // ===== ключове: рівень / ціна / залишок у поточному рівні =====
  const sold = Math.max(0, Number(soldMag || 0));
  const info = getCurrentTierInfo(sold);

  // оновлюємо картку параметрів
  if (ui.price) ui.price.textContent = Number(info.price || 0).toFixed(6);
  if (ui.level) ui.level.textContent = String(info.level);
  if (ui.left)  ui.left.textContent  = fmt.tokens(info.remainingInTier);

  // оновлюємо виджет «Залишок»
  const saleRemaining = el("sale-remaining");
  if (saleRemaining) saleRemaining.textContent = fmt.tokens(info.remainingInTier);

  // зберігаємо поточну ціну для інших модулів (калькулятор/покупка)
  try { window.__CURRENT_PRICE_USD = Number(info.price || 0); } catch {}

  // резервні поля старої верстки — без другого долара (сам $ у HTML)
  if (ui.raised) ui.raised.textContent = (raised).toLocaleString();
  if (ui.bar)    ui.bar.style.width = `${pct.toFixed(2)}%`;
}

let _saleTimer = null;
async function refreshSaleStatsOnce() {
  try {
    const s = await getPresaleStats();
    applySaleUi(s || {});
  } catch {}
}
function startSalePolling() {
  clearInterval(_saleTimer);
  refreshSaleStatsOnce();
  _saleTimer = setInterval(refreshSaleStatsOnce, 20000);
}

/* ===== авто-підв’язка калькулятора, якщо bindEvents() не викликано ===== */
function ensureCalcWires() {
  const input = getUsdtInput();
  if (input && !input._calcWired) {
    ["input","change","blur"].forEach(ev => input.addEventListener(ev, recalc));
    input._calcWired = true;
  }
}

/* ===================== static UI on boot ===================== */
export function initStaticUI() {
  const y = document.querySelector("#year");
  if (y) y.textContent = new Date().getFullYear();

  // початкові плейсхолдери; реальні значення підставить applySaleUi()
  if (ui.price) ui.price.textContent = (CONFIG.PRICE_USD || 0).toFixed(6);
  if (ui.level) ui.level.textContent = "1";

  // Ініціальні значення до першого запиту
  applySaleUi({ raisedUsd: 0, soldMag: 0, totalMag: CONFIG.TOTAL_SUPPLY });

  if (ui.claimWrap) ui.claimWrap.classList.toggle("hidden", !CONFIG.CLAIM_ENABLED);

  if (!REF_ON) hideRefUI(true);

  if (REF_ON) {
    if (ui.refLink && !ui.refLink.value) {
      ui.refLink.placeholder = "Підключи гаманець — лінк з’явиться тут";
    }
    if (ui.btnCopyRef) ui.btnCopyRef.disabled = false;
  }

  // ⛔️ БЛОК приховування «Ціль збору…» вилучено як зайвий

  updatePriceUnder();
  startSalePolling();

  // авто-підв’язка калькулятора на випадок, якщо bindEvents не викличуть
  ensureCalcWires();
  recalc();

  // Якщо адреса вже відома — стартуємо завантаження «Мої баланси»
  const addr = (state.owner || window.__magtAddr || "").trim?.() || "";
  if (isTonEqUq(addr)) startMyStatsPolling(addr);
}

/* ===================== referrals ===================== */
export function detectRefInUrl() {
  const locked = localStorage.getItem("magt_ref_locked") === "1";
  const p = new URLSearchParams(location.search);
  const raw = (p.get("ref") || "").trim();
  const candidate = normalizeToBase64Url(raw); // лише EQ/UQ (без hex)

  if (locked) { // якщо вже закріплено на бекенді — ігноруємо будь-які нові ?ref
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
  const input = getUsdtInput();
  if (!ui.refPayout || !input) return;
  if (!REF_ON) { ui.refPayout.classList.add("hidden"); return; }

  const usd = Number(input.value || 0);
  if (!state.referrer || !usd || usd <= 0 || (REF_MIN > 0 && usd < REF_MIN)) {
    ui.refPayout.classList.add("hidden");
    return;
  }

  // один раз — підмінити шаблон на статичний, щоб уникнути «залипань»
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
  // Динамічна ціна поточного рівня
  const price = Number(window.__CURRENT_PRICE_USD ?? CONFIG.PRICE_USD ?? 0.00383);
  if (!(price > 0)) return;

  const tokens = calcTokensFromUsd(usd, price);
  const bonusTokens = Math.floor(tokens * (pct / 100));

  if (ui.refBonusUsd) ui.refBonusUsd.textContent = fmt.tokens(bonusTokens);
  if (ui.refBonusTo)  ui.refBonusTo.textContent  = state.referrerShort || short(state.referrer);
  ui.refPayout.classList.remove("hidden");
}

export function initRefBonusHandlers() {
  const input = getUsdtInput();
  if (!input) return;
  ["input", "change", "blur"].forEach((ev) =>
    input.addEventListener(ev, updateRefBonus)
  );
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

  const b64 = await ensureBase64Url(walletAddress); // ТІЛЬКИ EQ/UQ
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

    // ► Стартуємо отримання «Мої баланси»
    startMyStatsPolling(b64);

    /* === РЕФЕРАЛ «НАЗАВЖДИ» === */
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
  const input = getUsdtInput();
  const agree = getAgreeCheckbox();

  if (input && input._bound !== true) {
    input.addEventListener("input", recalc);
    input._bound = true;
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

  // страховка — щоб розрахунок працював одразу
  ensureCalcWires();
  recalc();
}

/* ===================== glue with TonConnect singleton ===================== */
try {
  window.addEventListener("magt:address", async (ev) => {
    const raw = ev?.detail?.address ?? null;
    await setOwnRefLink(raw); // всередині примусово EQ/UQ або порожньо
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

      // беремо адресу з __magtAddr або резервно з __rawAddr (може бути hex/0:)
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
      // до ~30 секунд на повільні сценарії
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
// страховка: якщо адреса вже є після повного завантаження
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
