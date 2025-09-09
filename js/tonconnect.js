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

// Використовуємо стабільний маніфест та мінімальну конфіг без twaReturnUrl
const MANIFEST_URL = "https://magtcoin.com/tonconnect-manifest.json";
// Деякі гаманці коректніше працюють без явного returnUrl (особливо у розширеннях)
// Якщо потрібно — розкоментуй рядок нижче
// const RETURN_URL   = location.origin + "/";

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

/* ---------------- UX-guard: не давати модалці «зникнути» без підключення --- */
function attachModalGuard(ui){
  if (!ui || ui.__mtGuard) return;
  ui.__mtGuard = true;

  let reopenCount = 0;
  let lastTick = 0;

  function canReopen() {
    const now = Date.now();
    if (now - lastTick > 10000) reopenCount = 0; // «вікно» 10с
    return reopenCount < 3; // не більше 3 автоспроб
  }

  function tryReopen(delay = 350){
    if (!canReopen()) return;
    reopenCount++;
    lastTick = Date.now();
    setTimeout(() => {
      if (!getWalletAddress()) { // лише якщо ще не підключено
        try { ui.openModal?.(); } catch {}
      }
    }, delay);
  }

  try {
    ui.onModalStateChange?.((s) => {
      const isOpen = (s === true) || (s === "opened") || (s?.open === true);
      log("modal state:", s);
      if (!isOpen && !getWalletAddress()) {
        tryReopen(320);
      }
    });
  } catch (e) {
    log("onModalStateChange hook error:", e);
  }

  // Запасний «м’який» фолбек (може викликатись із onStatusChange)
  ui.__mtScheduleFallback = () => {
    setTimeout(() => { if (!getWalletAddress()) tryReopen(0); }, 700);
  };
}

/* ============ Пошук першого доступного контейнера під кнопку ============ */
function pickFirstAvailableRoot(){
  const ids = ["tonconnect", "tonconnect-mobile-inline", "tonconnect-mobile"];
  for (const id of ids){
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

/* =========================== Монтування (один раз) =========================== */
async function mountAt(root){
  await waitTonLib();
  if (!root || !(root instanceof HTMLElement)) return null;

  // не плодимо інстанси в тому ж root
  if (root.dataset.tcMounted === "1" && primaryUi) return primaryUi;

  const id = root.id || (root.id = "tcroot-" + Math.random().toString(36).slice(2));
  try { root.innerHTML = ""; } catch {}

  const cfg = {
    manifestUrl: MANIFEST_URL,
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
    restoreConnection: true
  };
  // Якщо потрібен явний повернення у мобільних — раскоментуй:
  // cfg.actionsConfiguration = { returnUrl: RETURN_URL };

  const ui = new window.TON_CONNECT_UI.TonConnectUI(cfg);

  attachModalGuard(ui);

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

/* ============================== Public API ============================== */
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

    // 1) підписка на зміни статусу
    try {
      ui.onStatusChange?.((wallet)=>{
        const addr = wallet?.account?.address || null;
        if (addr && isB64(addr)) {
          setCached(addr);
          try { onConnect && onConnect(addr); } catch{}
        } else {
          const was = cachedB64;
          setCached(null);
          // якщо закрили без підключення — м’яко дозволяємо фолбеку підняти модалку
          try { ui.__mtScheduleFallback?.(); } catch {}
          if (was && onDisconnect) { try { onDisconnect(); } catch{} }
        }
      });
      log("subscribed onStatusChange");
    } catch(e){ log("onStatusChange error:", e); }

    // 2) початкове відновлення
    try {
      const w = await ui.getWallet?.();
      const addr = w?.account?.address;
      if (addr && isB64(addr)) setCached(addr); else setCached(null);
    } catch { setCached(null); }

    return ui;
  })();
  return readyPromise;
}

/* ===================== Перемонтування після partials ===================== */
function hookPartialsRemount(){
  const rebind = () => { mountTonButtons().catch(()=>{}); };
  window.addEventListener("partials:loaded", rebind);
  window.addEventListener("partials:nav-ready", rebind);
  window.addEventListener("partials:main-ready", rebind);
}
hookPartialsRemount();

/* ================================ Auto-init ================================ */
(function auto(){
  const run = ()=>{ initTonConnect().catch(()=>{}); };
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run, { once:true });
  } else run();
})();

/* ================================= Debug ================================= */
try { window.getTonConnect = getTonConnect; } catch {}
try { window.getWalletAddress = getWalletAddress; } catch {}
try { window.openConnectModal = openConnectModal; } catch {}
try { window.forceDisconnect = forceDisconnect; } catch {}
