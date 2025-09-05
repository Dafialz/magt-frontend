// /js/tonconnect.js
// Публічне API: initTonConnect({ onConnect, onDisconnect }), mountTonButtons(),
// getWalletAddress(), getTonConnect(), openConnectModal(), forceDisconnect(), forgetCachedWallet()

import { ui as UI, refreshUiRefs } from "./state.js";

let primaryUi = null;
let readyPromise = null;
let cachedBase64Addr = null;
let connectedOnce = false;

const DBG = (() => {
  try { return !!JSON.parse(localStorage.getItem("magt_debug") || "false"); } catch { return false; }
})();
const log = (...a) => { if (DBG) { try { console.log("[TC]", ...a); } catch {} } };

/* =============== helpers =============== */
function isB64(a) {
  if (typeof a !== "string") return false;
  const s = a.trim();
  return !!s && (s.startsWith("EQ") || s.startsWith("UQ")) && /^[A-Za-z0-9_-]{48,68}$/.test(s);
}
function isHexLike(a) {
  if (typeof a !== "string") return false;
  const s = a.trim();
  return !!s && (s.startsWith("0:") || /^[0-9a-fA-F:]{48,90}$/.test(s));
}
function normalizeToBase64(addr) {
  const a = (addr || "").trim();
  if (!a) return null;
  if (isB64(a)) return a;
  try {
    if (window.TonWeb?.utils?.Address) {
      const A = window.TonWeb.utils.Address;
      return new A(a).toString(true, true, true);
    }
  } catch {}
  return null;
}
async function ensureBase64(addr) {
  const a = (addr || "").trim();
  if (!a) return null;
  if (isB64(a)) return a;

  let b64 = normalizeToBase64(a);
  if (b64) return b64;

  if (isHexLike(a)) {
    try {
      if (!window.TonWeb) {
        await import("https://unpkg.com/tonweb@0.0.66/dist/tonweb.min.js");
      }
      const A = window.TonWeb.utils.Address;
      b64 = new A(a).toString(true, true, true);
      if (isB64(b64)) return b64;
    } catch (e) { log("ensureBase64 convert failed:", e); }
  }
  return null;
}
function shortAddr(a) { return a ? (a.slice(0,4) + "…" + a.slice(-4)) : ""; }

async function waitTonLib(timeoutMs = 15000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      if (window.TON_CONNECT_UI) return resolve();
      if (performance.now() - start > timeoutMs) return reject(new Error("TON_CONNECT_UI not loaded"));
      setTimeout(tick, 60);
    })();
  });
}

function dispatchAddress(addr) {
  try {
    window.dispatchEvent(new CustomEvent("magt:address", { detail: { address: addr || null } }));
    log("dispatch magt:address =", addr);
  } catch {}
}

/** Головний синк адреси. Зберігаємо тільки EQ/UQ. */
async function syncAddress(addr, { onConnect, onDisconnect } = {}, source = "unknown") {
  let base64 = normalizeToBase64(addr);
  if (!base64 && isHexLike(addr)) {
    base64 = await ensureBase64(addr);
    if (base64) return syncAddress(base64, { onConnect, onDisconnect }, source + "/hex->b64");
  }
  if (!base64 && isB64(addr)) base64 = addr?.trim() || null;

  if (base64) {
    const changed = cachedBase64Addr !== base64;
    cachedBase64Addr = base64;
    try { window.__magtAddr = base64; } catch {}
    if (changed) {
      log("address set from:", source, base64, "UI:", shortAddr(base64));
      dispatchAddress(base64);
      try { (await import("./ui.js")).setOwnRefLink(base64); } catch {}
    }
    if (!connectedOnce && typeof onConnect === "function") {
      connectedOnce = true;
      try { onConnect(base64); } catch {}
    }
  } else {
    if (cachedBase64Addr !== null) {
      cachedBase64Addr = null;
      try { window.__magtAddr = null; } catch {}
      log("address cleared");
      dispatchAddress(null);
      try { (await import("./ui.js")).setOwnRefLink(""); } catch {}
    }
    if (connectedOnce && typeof onDisconnect === "function") {
      connectedOnce = false;
      try { onDisconnect(); } catch {}
    }
  }
}

function deepFindAddress(obj, maxDepth = 8) {
  try {
    const seen = new WeakSet();
    const st = [{ o: obj, d: 0 }];
    while (st.length) {
      const { o, d } = st.pop();
      if (!o || typeof o !== "object") continue;
      if (seen.has(o)) continue;
      seen.add(o);
      const raw = o?.account?.address ?? o?.wallet?.account?.address ?? o?.address;
      if (raw) {
        const b64 = normalizeToBase64(raw) || (isHexLike(raw) ? null : raw);
        if (b64) return b64;
      }
      if (d >= maxDepth) continue;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (v && typeof v === "object") st.push({ o: v, d: d + 1 });
      }
    }
  } catch {}
  return null;
}
function addrFromUiAccount(ui){
  const raw =
    ui?.account?.address ||
    ui?.state?.account?.address ||
    ui?.connector?.wallet?.account?.address ||
    ui?.tonConnect?.account?.address ||
    ui?._wallet?.account?.address ||
    null;
  const b64 = normalizeToBase64(raw);
  return b64 || deepFindAddress(ui, 8) || null;
}

/* ====== БІЛЬШЕ НЕ ЧИТАЄМО ніякі localStorage кеші ====== */
// Випиляли extractFromLocalStorage() та весь код, який його викликав.

/* =============== монтування кнопки =============== */
function ensureFallbackContainer() {
  let el = document.getElementById("tonconnect-fallback");
  if (!el) {
    el = document.createElement("div");
    el.id = "tonconnect-fallback";
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.zIndex = "9999";
    document.body.appendChild(el);
  }
  return el;
}
function pickMountRoot() {
  try { refreshUiRefs(); } catch {}
  if (Array.isArray(UI.tcContainers) && UI.tcContainers.length) {
    for (const el of UI.tcContainers) {
      if (el && el instanceof HTMLElement) return el;
    }
  }
  if (UI.tcPrimary && UI.tcPrimary instanceof HTMLElement) return UI.tcPrimary;
  return ensureFallbackContainer();
}
async function mountPrimaryAt(root) {
  if (primaryUi) return primaryUi;
  await waitTonLib();
  if (!window.TON_CONNECT_UI) return null;

  const id = root.id || (root.id = "tcroot-" + Math.random().toString(36).slice(2));
  const ui = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: `${location.origin}/tonconnect-manifest.json`,
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
    // критично: НЕ відновлюємо попереднє підключення
    restoreConnection: false
  });
  primaryUi = ui;
  window.__tcui = ui;
  root.dataset.tcMounted = "1";
  log("TonConnectUI mounted at #"+id);
  return ui;
}

export async function mountTonButtons() {
  const root = pickMountRoot();
  if (!root) return [];
  const created = [];
  if (!primaryUi) {
    const ui = await mountPrimaryAt(root).catch(()=>null);
    if (ui) created.push(ui);
  }
  return created;
}

/* =============== public API =============== */
export function getWalletAddress() {
  return isB64(cachedBase64Addr) ? cachedBase64Addr : (cachedBase64Addr || null);
}
export function getTonConnect() {
  return primaryUi || window.__tcui || null;
}

function _isConnected(ui) {
  if (!ui) return false;
  return Boolean(
    ui?.account?.address ||
    ui?.state?.account?.address ||
    ui?.wallet?.account?.address ||
    ui?.connector?.wallet?.account?.address ||
    ui?.tonConnect?.account?.address ||
    ui?._wallet?.account?.address
  );
}

export async function forceDisconnect() {
  const ui = (primaryUi || window.__tcui);
  try { await ui?.disconnect?.(); } catch {}
  // на всякий випадок — стираємо можливі ключі SDK
  try {
    const prefixes = ["tonconnect", "ton-connect", "tonconnect-ui"];
    for (const p of prefixes) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.toLowerCase().includes(p)) localStorage.removeItem(k);
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.toLowerCase().includes(p)) sessionStorage.removeItem(k);
      }
    }
  } catch {}
  await syncAddress(null, {}, "forceDisconnect");
}

export async function forgetCachedWallet() {
  await forceDisconnect();
}

export async function openConnectModal() {
  await mountTonButtons().catch(()=>{});
  const ui = (primaryUi || window.__tcui);
  if (!ui) return;
  // якщо раптом має статус підключення — спершу скинемо, щоб точно не взяв чужий кеш
  if (_isConnected(ui)) {
    await forceDisconnect().catch(()=>{});
  }
  try { await ui.openModal?.(); } catch (e) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("already connected")) return;
    log("openConnectModal error:", e);
  }
}

export async function initTonConnect({ onConnect, onDisconnect } = {}) {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await mountTonButtons().catch(()=>{});

    // НІЯКИХ теплих кешів із LS — тільки те, що повертає сам UI
    async function bindOn(ui) {
      if (!ui || ui.__magtHooked) return;
      ui.__magtHooked = true;
      try {
        ui.onStatusChange?.(() => {
          const raw = addrFromUiAccount(ui) || null;
          syncAddress(raw, { onConnect, onDisconnect }, "statusChange/ui.account");
        });
        log("subscribed to onStatusChange");
      } catch (e) { log("onStatusChange subscribe error:", e); }
    }

    if (primaryUi) await bindOn(primaryUi);

    const accAddr = primaryUi ? addrFromUiAccount(primaryUi) : null;
    if (accAddr) {
      await syncAddress(accAddr, { onConnect, onDisconnect }, "ui.account/immediate");
    } else {
      // Жодних snapshot із localStorage — нехай користувач підключиться вручну
      await syncAddress(null, { onConnect, onDisconnect }, "no-addr-initial");
    }

    // Легка періодична перевірка лише з UI (без LS)
    if (primaryUi && !primaryUi.__magtPoll) {
      primaryUi.__magtPoll = setInterval(() => {
        try {
          const fromUi = addrFromUiAccount(primaryUi);
          if (fromUi && fromUi !== cachedBase64Addr) {
            syncAddress(fromUi, { onConnect, onDisconnect }, "ui.account/poll");
          }
        } catch {}
      }, 1200);
    }

    if (cachedBase64Addr) dispatchAddress(cachedBase64Addr);
    return primaryUi || null;
  })();
  return readyPromise;
}

/* =============== авто-ініт =============== */
function autoInit() { initTonConnect().catch((e) => log("init failed:", e)); }
function autoMount(){ mountTonButtons().catch((e) => log("mount failed:", e)); }

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => { autoMount(); autoInit(); });
} else {
  autoMount(); autoInit();
}

/* =============== debug helpers =============== */
try { window.getWalletAddress = getWalletAddress; } catch {}
try { window.getTonConnect   = getTonConnect;   } catch {}
try { window.forceDisconnect = forceDisconnect; } catch {}
try { window.forgetCachedWallet = forgetCachedWallet; } catch {}
try {
  window.magtSetAddr = (addr) => { dispatchAddress(addr || null); };
} catch {}
setTimeout(() => {
  try {
    if (cachedBase64Addr) dispatchAddress(cachedBase64Addr);
  } catch {}
}, 0);
try { window.debugTC = () => ({ ui: getTonConnect(), addr: getTonConnect()?.account?.address || null, cached: getWalletAddress() }); } catch {}
