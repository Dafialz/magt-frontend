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
import { onBuyClick } from "./buy.js";
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
  _pollTimer = setInterval(() => fetchBalance(addr), Number(CONFIG.CLAIM_POLL_INTERVAL_MS || 15000));
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

/* ===== Локальний страховий байндинг інпутів → recalc() ===== */
function wireCalcInput() {
  const tonEl = document.getElementById("tonIn");
  if (tonEl && !tonEl.__calcBound) {
    ["input","change"].forEach(ev => tonEl.addEventListener(ev, () => { try { recalc(); } catch {} }));
    tonEl.__calcBound = true;
  }
  const usdEl = document.getElementById("usdtIn"); // fallback для старого шаблону
  if (usdEl && !usdEl.__calcBound) {
    ["input","change"].forEach(ev => usdEl.addEventListener(ev, () => { try { recalc(); } catch {} }));
    usdEl.__calcBound = true;
  }
}

/* ===== Mobile nav (burger) ===== */
function initMobileNav() {
  const nav = document.querySelector('nav[data-nav]');
  if (!nav || nav.__navBound) return;

  const btn = nav.querySelector('label[for="nav-burger"], #nav-btn');
  const panel = nav.querySelector('#mobile-panel');
  const checkbox = nav.querySelector('#nav-burger');

  if (!btn || !panel) return;

  const setAria = () => btn.setAttribute('aria-expanded', panel.classList.contains('hidden') ? 'false' : 'true');
  const open  = () => { panel.classList.remove('hidden'); if (checkbox) checkbox.checked = true;  setAria(); };
  const close = () => { panel.classList.add('hidden');   if (checkbox) checkbox.checked = false; setAria(); };

  const onBtn = (e) => { e.preventDefault(); panel.classList.contains('hidden') ? open() : close(); };
  btn.addEventListener('click', onBtn);
  btn.addEventListener('touchstart', onBtn, { passive:false });

  // закриття при кліку по пункту меню
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a,button,summary')) close();
  });

  // --- >>> Антизакриття під час TonConnect / будь-яких діалогів <<< ---
  const isInsideTonConnectOrDialog = (t) => !!(
    t.closest(
      [
        // TonConnect UI
        '.tc-root', '.tc-modal', '.tc-overlay', '.tc-widget', '.tc-list', '.tc-wallets-modal',
        '.tc-modal__body', '.tc-modal__backdrop',
        '[data-tc-widget]', '[class*="ton-connect"]', '[class*="tonconnect"]', '[id^="tc-"]',
        // загальні діалоги/оверлеї
        '[role="dialog"]', '[aria-modal="true"]', 'dialog', '.modal', '.overlay'
      ].join(', ')
    )
  );

  const hasAnyTonConnectOverlayOpen = () => {
    const el = document.querySelector(
      [
        '.tc-modal', '.tc-overlay', '.tc-wallets-modal', '.tc-root [role="dialog"]',
        '[aria-modal="true"]'
      ].join(', ')
    );
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  // якщо відкрита TC-модалка — не закриваємо меню взагалі
  const guardedClose = () => { if (!hasAnyTonConnectOverlayOpen()) close(); };

  // обробники поза панеллю: не чіпаємо кліки всередині TC / діалогів
  const onDocTap = (e) => {
    const t = e.target;
    if (nav.contains(t)) return;
    if (isInsideTonConnectOrDialog(t)) return;
    guardedClose();
  };

  // capture=true, щоб реагувати раніше за «булькаючі» хендлери
  document.addEventListener('click', onDocTap, true);
  document.addEventListener('mousedown', onDocTap, true);
  document.addEventListener('touchstart', onDocTap, { passive: true, capture: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (hasAnyTonConnectOverlayOpen()) return; // Esc належить модалці — ігноруємо
      guardedClose();
    }
  });
  window.addEventListener('hashchange', () => guardedClose());
  window.addEventListener('resize', () => { if (window.innerWidth >= 768) guardedClose(); });

  setAria();
  nav.__navBound = true;
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

/* ===== антидубль прив’язки подій після інʼєкції partials ===== */
const getUserUsdtBalance = async () => 0;

function bindRuntimeEventsOnce() {
  if (window.__magtEventsBound) return;
  bindEvents({
    onBuyClick,
    onClaimClick: () => import("./claim.js").then((m) => m.onClaimClick?.()),
    getUserUsdtBalance,
  });
  wireCalcInput();
  window.__magtEventsBound = true;
}

/* ================= Re-init after partials ================= */
async function reinitAfterPartials() {
  try {
    refreshUiRefs();
    initStaticUI();

    await mountTonButtons().catch(()=>{});
    window.__magtEventsBound = false;
    bindRuntimeEventsOnce();

    initMobileNav();

    wireCalcInput();
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

window.addEventListener("popstate", () => {
  refreshReferralUi();
  recalc();
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
    const level = ev?.detail?.level ?? (ui.level?.textContent || "—");
    const tokens = Number(ev?.detail?.tokens ?? 0);

    const tonAmount  = Number(ev?.detail?.ton ?? 0);
    const priceTon   = Number(ev?.detail?.priceTon ?? window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);

    if (tokens > 0 && priceTon > 0 && tonAmount >= 0) {
      toast(`Купівля: ${Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(tokens)} MAGT по ${priceTon.toFixed(6)} TON (рівень ${level})`);
      return;
    }

    const pUsd = Number((ev?.detail?.price) ?? CONFIG.PRICE_USD);
    const usd = Number((ev?.detail?.usd) ?? (ui.usdtIn?.value || 0));
    const tokensUsd = pUsd > 0 ? usd / pUsd : 0;
    if (tokensUsd > 0 && isFinite(tokensUsd) && pUsd > 0) {
      toast(`Купівля: ${Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(tokensUsd)} MAGT по $${pUsd.toFixed(6)} (рівень ${level})`);
    }
  } catch {}
});

/* ================= Boot ================= */
async function bootOnce() {
  refreshUiRefs();
  initStaticUI();

  bindRuntimeEventsOnce();
  wireCalcInput();

  initMobileNav();

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
  buyNow: onBuyClick,
});
try { if (!window.recalc) window.recalc = recalc; } catch {}
