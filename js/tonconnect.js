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

// ---- helpers ---------------------------------------------------------------
const DBG = (() => {
  try { return !!JSON.parse(localStorage.getItem("magt_debug") || "false"); }
  catch { return false; }
})();
const log = (...a) => { if (DBG) { try { console.log("[TC]", ...a); } catch {} } };

function isB64(s){ return typeof s === "string" && /^(EQ|UQ)[A-Za-z0-9_-]{46,68}$/.test(s.trim()); }
function short(a){ return a ? a.slice(0,4)+"…"+a.slice(-4) : ""; }

function dispatchAddress(addr){
  try { window.dispatchEvent(new CustomEvent("magt:address",{detail:{address:addr||null}})); } catch{}
  try {
    // необов’язково: оновимо реф-лінк, якщо є функція в ui.js
    if (addr && typeof window.setOwnRefLink === "function") window.setOwnRefLink(addr);
    if (!addr && typeof window.setOwnRefLink === "function") window.setOwnRefLink("");
  } catch {}
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
  if (cachedB64 !== prev) log("address:", short(cachedB64));
  if (cachedB64 !== prev) dispatchAddress(cachedB64);
}

// ---- mount ---------------------------------------------------------------
async function mountAt(root, tag="primary"){
  await waitTonLib();
  const el = typeof root === "string" ? document.getElementById(root) : root;
  if (!el || !(el instanceof HTMLElement)) return null;
  if (el.dataset.tcMounted === "1") return null;

  const id = el.id || (el.id = "tcroot-" + Math.random().toString(36).slice(2));
  try { el.innerHTML = ""; } catch {}

  const ui = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://magtcoin.com/tonconnect-manifest.json?v=3",
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
    restoreConnection: true,
    actionsConfiguration: { returnUrl: location.origin + "/", twaReturnUrl: location.origin + "/" }
  });

  el.dataset.tcMounted = "1";
  log(`TonConnectUI mounted (${tag}) -> #${id}`);
  return ui;
}

async function waitHeaderRoot(timeoutMs=8000){
  const t0 = performance.now();
  return new Promise((res)=>{
    (function loop(){
      const el = document.getElementById("tonconnect");
      if (el) return res(el);
      if (performance.now()-t0 > timeoutMs) return res(null);
      setTimeout(loop,120);
    })();
  });
}

export async function mountTonButtons(){
  const headerRoot = await waitHeaderRoot();
  const created = [];

  if (!primaryUi && headerRoot) {
    primaryUi = await mountAt(headerRoot, "primary");
    if (primaryUi) created.push(primaryUi);
  } else if (headerRoot && !headerRoot.dataset.tcMounted) {
    const u = await mountAt(headerRoot, "primary(rebind)");
    if (u) { primaryUi = u; created.push(u); }
  }

  const inline = document.getElementById("tonconnect-mobile-inline");
  if (inline && !inline.dataset.tcMounted) {
    const u = await mountAt(inline, "mobile-inline"); if (u) created.push(u);
  }
  const drawer = document.getElementById("tonconnect-mobile");
  if (drawer && !drawer.dataset.tcMounted) {
    const u = await mountAt(drawer, "mobile-drawer"); if (u) created.push(u);
  }
  return created;
}

// ---- public ---------------------------------------------------------------
export function getTonConnect(){ return primaryUi || window.__tcui || null; }
export function getWalletAddress(){ return isB64(cachedB64) ? cachedB64 : (cachedB64 || null); }

export async function openConnectModal(){
  await mountTonButtons().catch(()=>{});
  const ui = getTonConnect();
  try { await ui?.openModal?.(); } catch(e){ log("openModal err", e); }
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

    // 1) підписка на зміни
    try {
      ui.onStatusChange?.((wallet)=>{
        const addr = wallet?.account?.address || null;
        if (addr && isB64(addr)) {
          setCached(addr);
          try { onConnect && onConnect(addr); } catch{}
        } else {
          const was = cachedB64;
          setCached(null);
          if (was && onDisconnect) { try { onDisconnect(); } catch{} }
        }
      });
      log("subscribed onStatusChange");
    } catch(e){ log("onStatusChange error", e); }

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

// ---- auto ---------------------------------------------------------------
function auto(){
  const run = ()=>{ initTonConnect().catch(()=>{}); };
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run, { once:true });
  } else run();
}
auto();

// ---- debug ---------------------------------------------------------------
try { window.getTonConnect = getTonConnect; } catch {}
try { window.getWalletAddress = getWalletAddress; } catch {}
try { window.openConnectModal = openConnectModal; } catch {}
try { window.forceDisconnect = forceDisconnect; } catch {}
