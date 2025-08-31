// /js/app.js
import { CONFIG } from "./config.js";
import { ui, refreshUiRefs } from "./state.js";
import {
  initStaticUI,
  bindEvents,
  detectRefInUrl,
  recalc,
  refreshButtons,
  setOwnRefLink,
  initRefBonusHandlers,
  toast,
} from "./ui.js";
import { initTonConnect, getWalletAddress, getTonConnect, mountTonButtons } from "./tonconnect.js";
import { onBuyClick, getUserUsdtBalance, showDebugJettonInfo } from "./buy.js";
import { refreshClaimSection, startClaimPolling, stopClaimPolling } from "./claim.js";
import { api } from "./utils.js";

/* ================= Balance fallback (якщо claim.js недоступний) ================= */
const $ = (s) => document.querySelector(s);

function renderBalance(amount) {
  const claimInfo = $("#claim-info");
  const badge = $("#claim-badge");
  const wrap = $("#claim-wrap");
  if (!claimInfo || !badge || !wrap) return;

  const n = Number(amount || 0);
  badge.textContent = Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

  const has = n > 0;
  claimInfo.classList.toggle("hidden", !has);
  wrap.classList.toggle("hidden", !has);
}

async function fetchBalance(addr) {
  if (!addr) return;
  try {
    const url = api(`/api/balance?wallet=${encodeURIComponent(addr)}`);
    if (!url) return;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!data || data.ok === false) return;
    const amount = data.magt ?? data.claimable ?? 0;
    renderBalance(amount);
  } catch {}
}

let _pollTimer = null;
function startBalancePolling(addr) {
  stopBalancePolling();
  renderBalance(0);
  fetchBalance(addr);
  _pollTimer = setInterval(() => fetchBalance(addr), 15000);
}
function stopBalancePolling() {
  if (_pollTimer) clearInterval(_pollTimer), (_pollTimer = null);
  renderBalance(0);
}

/* ================== Referral bootstrap ================== */
function refreshReferralUi() {
  try {
    detectRefInUrl();
    initRefBonusHandlers();
    recalc();
  } catch {}
}

/* ===== РЕЗЕРВНИЙ ПОЛІНГ адреси з TonConnectUI (якщо події не прийшли) ===== */
let _addrPoll = null;
function tryExtractAddrFromUi(uiObj) {
  const u = uiObj || getTonConnect?.() || window.__tcui || null;
  if (!u) return null;
  const cand =
    u?.account?.address ||
    u?.wallet?.account?.address ||
    u?.state?.account?.address ||
    u?.state?.wallet?.account?.address ||
    u?.connector?.wallet?.account?.address ||
    u?.connector?.account?.address ||
    u?.tonConnect?.account?.address ||
    u?._wallet?.account?.address ||
    null;
  return typeof cand === "string" && cand.trim() ? cand.trim() : null;
}
function startAddrPolling() {
  if (_addrPoll) return;
  let ticks = 0;
  _addrPoll = setInterval(() => {
    ticks++;
    const a = getWalletAddress?.() || tryExtractAddrFromUi();
    if (a) {
      try { setOwnRefLink(a); } catch {}
      stopAddrPolling();
    }
    if (ticks > 50) stopAddrPolling(); // ~60 сек максимум
  }, 1200);
}
function stopAddrPolling() {
  if (_addrPoll) clearInterval(_addrPoll), (_addrPoll = null);
}

/* ===== Невеликий гарантований ретрай після ініціалізації ===== */
function scheduleRefLinkRetries() {
  const attempts = [1000, 2000, 4000];
  attempts.forEach((ms) => {
    setTimeout(() => {
      const a = getWalletAddress?.() || tryExtractAddrFromUi();
      if (a) { try { setOwnRefLink(a); } catch {} }
    }, ms);
  });
}

/* ================= Handlers ================= */
function afterConnected(base64Addr) {
  try { setOwnRefLink(base64Addr); } catch {}
  refreshReferralUi();
  refreshButtons();

  let usedClaimModule = false;
  try {
    if (typeof refreshClaimSection === "function") {
      refreshClaimSection().catch(() => {});
      usedClaimModule = true;
    }
    if (typeof startClaimPolling === "function") {
      startClaimPolling();
      usedClaimModule = true;
    }
  } catch {}
  if (!usedClaimModule) startBalancePolling(base64Addr);
}

function afterDisconnected() {
  ui.refYourLink?.classList.add("hidden");
  refreshButtons();
  let usedClaimModule = false;
  try {
    if (typeof stopClaimPolling === "function") {
      stopClaimPolling();
      usedClaimModule = true;
    }
  } catch {}
  if (!usedClaimModule) stopBalancePolling();
}

/* ================= Re-init after partials ================= */
async function reinitAfterPartials() {
  try {
    refreshUiRefs();
    await mountTonButtons().catch(()=>{});
    // 🔧 ГОЛОВНЕ: перев’язуємо обробники після інʼєкції HTML
    bindEvents({
      onBuyClick,
      onClaimClick: () => import("./claim.js").then((m) => m.onClaimClick?.()),
      getUserUsdtBalance,
    });

    refreshReferralUi();
    recalc();
    refreshButtons();

    const a = getWalletAddress?.() || tryExtractAddrFromUi();
    if (a) setOwnRefLink(a);
    else startAddrPolling();
  } catch (e) {
    console.warn("[reinitAfterPartials] fail:", e);
  }
}
window.addEventListener("partials:loaded", reinitAfterPartials);
window.addEventListener("partials:main-ready", reinitAfterPartials);

// Якщо змінився URL (наприклад, ref у query)
window.addEventListener("popstate", () => {
  refreshReferralUi();
});

/* ======= Головний хук: глобальна подія з tonconnect.js ======= */
if (!window.__magtAddrHooked) {
  window.addEventListener("magt:address", (ev) => {
    const a = ev?.detail?.address || null;
    if (a && typeof a === "string") {
      try { setOwnRefLink(a); } catch {}
      const usedClaim = typeof startClaimPolling === "function";
      if (!usedClaim) fetchBalance(a);
      stopAddrPolling();
    } else {
      afterDisconnected();
      startAddrPolling();
    }
  });
  window.__magtAddrHooked = true;
}

/* ===== оновлюємо баланс після покупки + тост із деталями ===== */
window.addEventListener("magt:purchase", (ev) => {
  const a = getWalletAddress?.() || tryExtractAddrFromUi();
  if (a) {
    fetchBalance(a);
    try { refreshClaimSection?.(); } catch {}
  }
  try {
    const p = Number((ev?.detail?.price) ?? CONFIG.PRICE_USD);
    const usd = Number((ev?.detail?.usd) ?? (ui.usdtIn?.value || 0));
    const tokens = Number((ev?.detail?.tokens) ?? (p > 0 ? usd / p : 0));
    const level = ev?.detail?.level ?? (ui.level?.textContent || "—");
    if (tokens > 0 && isFinite(tokens) && p > 0) {
      toast(`Купівля: ${Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(tokens)} MAGT по $${p.toFixed(6)} (рівень ${level})`);
    }
  } catch {}
});

/* ================= Boot ================= */
async function bootOnce() {
  refreshUiRefs();
  initStaticUI();

  bindEvents({
    onBuyClick,
    onClaimClick: () => import("./claim.js").then((m) => m.onClaimClick?.()),
    getUserUsdtBalance,
  });

  refreshReferralUi();
  recalc();
  refreshButtons();

  await initTonConnect({
    onConnect: (addr) => afterConnected(addr),
    onDisconnect: () => afterDisconnected(),
  });

  const a = getWalletAddress?.() || tryExtractAddrFromUi();
  if (a) {
    try { setOwnRefLink(a); } catch {}
    let usedClaim = false;
    try {
      if (typeof startClaimPolling === "function") { startClaimPolling(); usedClaim = true; }
      if (typeof refreshClaimSection === "function") { refreshClaimSection(); usedClaim = true; }
    } catch {}
    if (!usedClaim) startBalancePolling(a);
  } else {
    startAddrPolling();
  }

  // гарантійний ретрай
  scheduleRefLinkRetries();
}

/* ================= Autostart ================= */
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    bootOnce().catch((e) => console.warn("[boot] failed:", e));
  });
} else {
  bootOnce().catch((e) => console.warn("[boot] failed:", e));
}

/* ================= Debug ================= */
window.magt = Object.assign(window.magt || {}, {
  showDebugJettonInfo,
  buyNow: onBuyClick,
});
