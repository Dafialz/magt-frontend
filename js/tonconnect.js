// /js/tonconnect.js
// Публічне API:
//   initTonConnect({ onConnect, onDisconnect })
//   mountTonButtons()
//   getWalletAddress()
//   getTonConnect()
//   openConnectModal()
//   forceDisconnect()
//   forgetCachedWallet()

let primaryUi = null;
let cachedB64 = null;
let readyPromise = null;

const DBG = (() => { try { return !!JSON.parse(localStorage.getItem("magt_debug") || "false"); } catch { return false; } })();
const log = (...a) => { if (DBG) { try { console.log("[TC]", ...a); } catch {} } };

const MANIFEST_URL = "https://magtcoin.com/tonconnect-manifest.json";
// const RETURN_URL = location.origin + "/";

function isB64(s){ return typeof s === "string" && /^(EQ|UQ)[A-Za-z0-9_-]{46,68}$/.test((s||"").trim()); }
function short(a){ return a ? a.slice(0,4)+"…"+a.slice(-4) : ""; }

function dispatchAddress(addr){
  try { window.dispatchEvent(new CustomEvent("magt:address",{detail:{address:addr||null}})); } catch{}
  try { if (typeof window.setOwnRefLink === "function") window.setOwnRefLink(addr || ""); } catch {}
}

async function waitTonLib(timeoutMs=15000){
  const t0 = performance.now();
  return new Promise((res, rej)=>{
    (function tick(){
      if (window.TON_CONNECT_UI) return res();
      if (performance.now()-t0 > timeoutMs) return rej(new Error("TON_CONNECT_UI not loaded"));
      setTimeout(tick, 60);
    })();
  });
}

function setCached(addr){
  const prev = cachedB64;
  cachedB64 = addr || null;
  if (cachedB64 !== prev) {
    log("address:", short(cachedB64));
    dispatchAddress(cachedB64);
  }
}

/* -------------------- Супер-guard проти передчасного закриття -------------------- */
function attachHardModalGuard(ui){
  if (!ui || ui.__mtHardGuard) return;
  ui.__mtHardGuard = true;

  // Активний захист: доки немає адреси, але не довше 20с з моменту першого відкриття
  let guardActive = false;
  let guardStart = 0;
  const GUARD_LIMIT_MS = 20000;

  const guardOn = () => { guardActive = true; guardStart = Date.now(); };
  const guardOff = () => { guardActive = false; };

  const guardAllowed = () => {
    if (!guardActive) return false;
    if (cachedB64) { guardOff(); return false; }
    if (Date.now() - guardStart > GUARD_LIMIT_MS) { guardOff(); return false; }
    return true;
  };

  // 1) Перехоплюємо закриття через API
  try {
    const origClose = ui.closeModal?.bind(ui);
    if (origClose) {
      ui.closeModal = async (...args) => {
        if (guardAllowed()) {
          log("closeModal blocked by guard");
          return; // ігноруємо
        }
        return origClose(...args);
      };
    }
  } catch {}

  // 2) Глобальні перехоплювачі кліків/клавіш, що можуть закрити модалку
  const shouldBlockEvent = (t) => {
    if (!guardAllowed()) return false;
    // backdrop / overlay / кнопка закриття / сам діалог
    return !!(
      t.closest('.tc-overlay, .tc-modal') ||
      t.closest('[class*="tc-"][aria-label="Close"], .tc-modal__close, [data-testid="modal-close"]')
    );
  };

  const onClickCapture = (e) => {
    if (shouldBlockEvent(e.target)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      // Підстрахуємося і відкриємо знову
      try { ui.openModal?.(); } catch {}
    }
  };

  const onKeydownCapture = (e) => {
    if (!guardAllowed()) return;
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      e.preventDefault();
      try { ui.openModal?.(); } catch {}
    }
  };

  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("touchstart", onClickCapture, { passive: true, capture: true });
  document.addEventListener("keydown", onKeydownCapture, true);

  // 3) Відслідковуємо стан модалки і автоматично її утримуємо відкритою
  try {
    ui.onModalStateChange?.((s) => {
      const isOpen = (s === true) || (s === "opened") || (s?.open === true);
      log("modal state:", s);
      if (isOpen) {
        if (!cachedB64) guardOn();
      } else {
        if (guardAllowed()) {
          // миттєво повертаємо
          try { ui.openModal?.(); } catch {}
        }
      }
    });
  } catch (e) { log("onModalStateChange hook error:", e); }

  // 4) Фолбек на будь-яке “тихе” закриття
  ui.__mtScheduleFallback = () => {
    setTimeout(() => {
      if (guardAllowed()) {
        try { ui.openModal?.(); } catch {}
      }
    }, 300);
  };

  // 5) При появі адреси – відключаємо guard
  const stopGuardWhenAddress = () => { if (cachedB64) guardOff(); else setTimeout(stopGuardWhenAddress, 300); };
  stopGuardWhenAddress();
}

/* ---------------------- Пошук контейнера для кнопки ---------------------- */
function pickFirstAvailableRoot(){
  const ids = ["tonconnect", "tonconnect-mobile-inline", "tonconnect-mobile"];
  for (const id of ids){
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

/* ------------------------------ Монтування UI ------------------------------ */
async function mountAt(root){
  await waitTonLib();
  if (!root || !(root instanceof HTMLElement)) return null;
  if (root.dataset.tcMounted === "1" && primaryUi) return primaryUi;

  const id = root.id || (root.id = "tcroot-" + Math.random().toString(36).slice(2));
  try { root.innerHTML = ""; } catch {}

  const cfg = {
    manifestUrl: MANIFEST_URL,
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
    restoreConnection: true
    // actionsConfiguration: { returnUrl: RETURN_URL }
  };

  const ui = new window.TON_CONNECT_UI.TonConnectUI(cfg);

  attachHardModalGuard(ui);

  root.dataset.tcMounted = "1";
  primaryUi = ui;
  window.__tcui = ui;

  log("TonConnectUI mounted at #"+id);
  return ui;
}

export async function mountTonButtons(){
  const root = pickFirstAvailableRoot();
  if (!root) { log("no available root for TonConnect button yet"); return []; }

  const created = [];
  if (!primaryUi) {
    const u = await mountAt(root).catch(()=>null);
    if (u) created.push(u);
  } else if (!root.dataset.tcMounted) {
    const u = await mountAt(root).catch(()=>null);
    if (u) created.push(u);
  }
  return created;
}

/* -------------------------------- Public API -------------------------------- */
export function getTonConnect(){ return primaryUi || window.__tcui || null; }
export function getWalletAddress(){ return isB64(cachedB64) ? cachedB64 : (cachedB64 || null); }

export async function openConnectModal(){
  await mountTonButtons().catch(()=>{});
  const ui = getTonConnect();
  try { await ui?.openModal?.(); } catch(e){ log("openModal err:", e); }
}

export async function forceDisconnect(){
  const ui = getTonConnect();
  try { await ui?.disconnect?.(); } catch {}
  try {
    const keys = [];
    for (let i=localStorage.length-1;i>=0;i--){
      const k = localStorage.key(i);
      if (k && /ton[-_]?connect/i.test(k)) keys.push(k);
    }
    keys.forEach((k)=>localStorage.removeItem(k));
    for (let i=sessionStorage.length-1;i>=0;i--){
      const k = sessionStorage.key(i);
      if (k && /ton[-_]?connect/i.test(k)) sessionStorage.removeItem(k);
    }
  } catch {}
  setCached(null);
}
export async function forgetCachedWallet(){ return forceDisconnect(); }

export async function initTonConnect({ onConnect, onDisconnect } = {}){
  if (readyPromise) return readyPromise;
  readyPromise = (async ()=>{
    await mountTonButtons().catch(()=>{});

    const ui = getTonConnect();
    if (!ui) return null;

    window.__tcui = ui;

    try {
      ui.onStatusChange?.((wallet)=>{
        const addr = wallet?.account?.address || null;

        if (addr && isB64(addr)) {
          setCached(addr);
          try { onConnect && onConnect(addr); } catch{}
          return;
        }

        const hadAddressBefore = !!cachedB64;
        if (hadAddressBefore) {
          setCached(null);
          try { onDisconnect && onDisconnect(); } catch{}
        } else {
          try { ui.__mtScheduleFallback?.(); } catch {}
        }
      });
      log("subscribed onStatusChange");
    } catch(e){ log("onStatusChange error:", e); }

    try {
      const w = await ui.getWallet?.();
      const addr = w?.account?.address;
      if (addr && isB64(addr)) setCached(addr); else setCached(null);
    } catch { setCached(null); }

    return ui;
  })();
  return readyPromise;
}

/* ----------------------- Перемонтування після partials ---------------------- */
function hookPartialsRemount(){
  const rebind = () => { mountTonButtons().catch(()=>{}); };
  window.addEventListener("partials:loaded", rebind);
  window.addEventListener("partials:nav-ready", rebind);
  window.addEventListener("partials:main-ready", rebind);
}
hookPartialsRemount();

/* --------------------------------- Auto-init -------------------------------- */
(function auto(){
  const run = ()=>{ initTonConnect().catch(()=>{}); };
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run, { once:true });
  } else run();
})();

/* ---------------------------------- Debug ---------------------------------- */
try { window.getTonConnect = getTonConnect; } catch {}
try { window.getWalletAddress = getWalletAddress; } catch {}
try { window.openConnectModal = openConnectModal; } catch {}
try { window.forceDisconnect = forceDisconnect; } catch {}
