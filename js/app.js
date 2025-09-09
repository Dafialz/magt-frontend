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

/* ================= utils ================= */
function el(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function api(path) {
  const ABS = (CONFIG && CONFIG.API_BASE_ABS) || "https://api.magtcoin.com";
  const base = (CONFIG && CONFIG.API_BASE != null) ? CONFIG.API_BASE : "";
  if (base) return base.replace(/\/+$/, "") + path;
  return ABS.replace(/\/+$/, "") + path;
}

/* ================= Partials loader ================= */
async function loadPartial(id, url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("loadPartial failed: " + url);
    const html = await r.text();
    const slot = document.getElementById(id);
    if (slot) slot.innerHTML = html;
  } catch (e) {
    console.warn("Partial load error", url, e);
  }
}

/* ================= Partials boot ================= */
async function bootPartials() {
  await Promise.all([
    loadPartial("slot-nav", "/partials/nav.html?v=17"),
    loadPartial("slot-hero", "/partials/hero.html?v=17"),
    loadPartial("slot-main", "/partials/main.html?v=17"),
    loadPartial("slot-footer", "/partials/footer.html?v=17"),
  ]);

  try { window.dispatchEvent(new CustomEvent("partials:loaded")); } catch {}
  try { window.dispatchEvent(new CustomEvent("partials:nav-ready")); } catch {}
  try { window.dispatchEvent(new CustomEvent("partials:main-ready")); } catch {}
}

/* ================= Mobile nav ================= */
// --- TonConnect shield for global handlers ---
const __TC_SEL = [
  ".tc-root", ".tc-modal", ".tc-overlay", ".tc-wallets-modal", ".tc-modal__body", ".tc-modal__backdrop",
  "[data-tc-widget]", '[class*="ton-connect"]', '[class*="tonconnect"]', '[id^="tc-"]',
  "tonconnect-ui", "ton-connect-ui", "tonconnect-ui-modal", "ton-connect-ui-modal",
  "[role='dialog'][data-tc-modal='1']"
].join(", ");

function __tcEventPathHasSelector(e){
  try {
    const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
    for (const n of path) {
      if (n && n.nodeType === 1) {
        const el = /** @type {Element} */(n);
        if (el.matches?.(__TC_SEL)) return true;
        const host = (el.shadowRoot && el.shadowRoot.host) ? el.shadowRoot.host : null;
        if (host && host.matches?.(__TC_SEL)) return true;
      }
    }
  } catch {}
  return false;
}
function __tcOverlayOpen() {
  try{
    const el = document.querySelector(".tc-modal, .tc-overlay, .tc-wallets-modal, [aria-modal='true']");
    if (!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }catch{ return false; }
}

function setupMobileNav(){
  const nav = document.getElementById("nav-panel");
  const toggles = qsa("[data-nav-toggle]");
  if (!nav || !toggles.length) return;

  const open = () => {
    nav.classList.remove("-translate-x-full");
    document.body.classList.add("nav-open");
  };
  const close = () => {
    nav.classList.add("-translate-x-full");
    document.body.classList.remove("nav-open");
  };

  toggles.forEach(btn => btn.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = !nav.classList.contains("-translate-x-full");
    isOpen ? close() : open();
  }));

  // кліки поза панеллю — закривають (але не коли клікаємо в TonConnect)
  document.addEventListener('click', (e) => {
    if (__tcEventPathHasSelector(e)) return; // ignore clicks inside TonConnect modal
    if (!nav.contains(e.target)) close();
  });

  // Esc — теж закриває, якщо НЕ відкрита модалка TonConnect
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !__tcOverlayOpen()) close(); });

  // закриваємо при навігації по якорях
  qsa("#slot-nav a[href^='#']").forEach(a => a.addEventListener("click", () => close()));
}

/* ================= Claim badge ================= */
function updateClaimBadge(amount) {
  const claimInfo = el("claim-info");
  const badge = el("claim-badge");
  const wrap = el("claim-badge-wrap");
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
    const url = api(`/api/balance?wallet=${encodeURIComponent(addr)}`
      + `&t=${Date.now()}`);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json().catch(()=>null);
    const n = Number(j?.amount || 0);
    updateClaimBadge(n);
  } catch {}
}

/* ================= Boot ================= */
async function boot() {
  await bootPartials();

  try { refreshUiRefs(); } catch {}

  initStaticUI();
  detectRefInUrl();
  initRefBonusHandlers();

  setupMobileNav();

  await mountTonButtons().catch(()=>{});

  await initTonConnect({
    onConnect: async (addr) => {
      refreshButtons();
      recalc();
      try { await fetchBalance(addr); } catch {}
      try { startClaimPolling(addr); } catch {}
    },
    onDisconnect: async () => {
      refreshButtons();
      recalc();
      try { stopClaimPolling(); } catch {}
      updateClaimBadge(0);
    }
  });

  bindEvents({
    onBuyClick,
    onClaimClick: () => { try { refreshClaimSection(); } catch {} },
    getUserUsdtBalance: async () => {
      try {
        const addr = getWalletAddress();
        if (!addr) return null;
        const url = api(`/api/usdt-balance?wallet=${encodeURIComponent(addr)}&t=${Date.now()}`);
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json().catch(()=>null);
        return Number(j?.balance || 0);
      } catch { return null; }
    }
  });
}

try {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot, { once: true });
  } else boot();
} catch (e) {
  console.warn("boot error", e);
}

/* ================= Debug ================= */
try { window.refreshUiRefs = refreshUiRefs; } catch {}
try { window.mountTonButtons = mountTonButtons; } catch {}
try { window.getTonConnect = getTonConnect; } catch {}
try { window.toast = toast; } catch {}
