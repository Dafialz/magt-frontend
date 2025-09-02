// Один-єдиний інстанс офіційної TonConnectUI-кнопки у NAV (пріоритет).
// Публічне API: initTonConnect({ onConnect, onDisconnect }), mountTonButtons(),
// getWalletAddress(), getTonConnect(), openConnectModal()

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

/** Синхронна нормалізація в EQ/UQ, якщо TonWeb уже є */
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
  // Якщо TonWeb недоступний — не повертаємо hex/0:, краще зачекати на конвертацію
  return null;
}

/** Гарантовано отримати EQ/UQ: якщо треба — підтягуємо TonWeb і конвертуємо */
async function ensureBase64(addr) {
  const a = (addr || "").trim();
  if (!a) return null;
  if (isB64(a)) return a;

  // Спроба швидкої конвертації (TonWeb вже є)
  let b64 = normalizeToBase64(a);
  if (b64) return b64;

  // Якщо адреса схожа на hex/0:, а TonWeb ще не підвантажений — підвантажимо і сконвертимо
  if (isHexLike(a)) {
    try {
      if (!window.TonWeb) {
        await import("https://unpkg.com/tonweb@0.0.66/dist/tonweb.min.js");
      }
      const A = window.TonWeb.utils.Address;
      b64 = new A(a).toString(true, true, true);
      if (isB64(b64)) return b64;
    } catch (e) {
      log("ensureBase64 convert failed:", e);
    }
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

/** Головний синк адреси. НІКОЛИ не зберігає hex — лише EQ/UQ. */
async function syncAddress(addr, { onConnect, onDisconnect } = {}, source = "unknown") {
  // Прагнемо EQ/UQ; якщо ні — конвертуємо (у т.ч. підвантаживши TonWeb)
  let base64 = normalizeToBase64(addr);
  if (!base64 && isHexLike(addr)) {
    base64 = await ensureBase64(addr);
    if (base64) {
      // після конвертації повторимо шлях уже з чистою адресою
      return syncAddress(base64, { onConnect, onDisconnect }, source + "/hex->b64");
    }
  }
  if (!base64 && isB64(addr)) base64 = addr?.trim() || null; // рідкісний випадок

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
function extractFromUi(ui) {
  const quick = [
    ui?.account?.address,
    ui?.wallet?.account?.address,
    ui?.state?.account?.address,
    ui?.state?.wallet?.account?.address,
    ui?.tonConnect?.account?.address,
    ui?.tonConnect?.wallet?.account?.address,
    ui?._wallet?.account?.address,
    ui?.connector?.wallet?.account?.address,
    ui?.connector?.account?.address,
  ].filter(Boolean);
  for (const raw of quick) {
    const b64 = normalizeToBase64(raw);
    if (b64) return b64;
  }
  return deepFindAddress(ui, 8);
}
function extractFromLocalStorage() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (!v) continue;
      try {
        const data = JSON.parse(v);
        const b64 = deepFindAddress(data, 8);
        if (b64) return b64;
      } catch {}
    }
  } catch {}
  return null;
}

/* =============== кнопка (рівно одна) =============== */
/**
 * Пріоритет місця монтування:
 * 1) NAV: #tonconnect або #tonconnect-mobile
 * 2) Будь-який інший [data-ton-root], КРІМ #tonconnect-hero
 * 3) Fallback: #tonconnect-hero (якщо інших коренів немає)
 */
function findRootOnce() {
  const navRoot = document.querySelector("#tonconnect") || document.querySelector("#tonconnect-mobile");
  if (navRoot) return navRoot;

  const anyNonHero = document.querySelector("[data-ton-root]:not(#tonconnect-hero)");
  if (anyNonHero) return anyNonHero;

  // Fallback лише якщо зовсім немає інших контейнерів
  const hero = document.querySelector("#tonconnect-hero");
  if (hero) return hero;

  return document.querySelector("[data-ton-root]") || null;
}

async function mountPrimaryAt(root) {
  if (primaryUi) return primaryUi;
  await waitTonLib();
  if (!window.TON_CONNECT_UI) return null;

  // ВАЖЛИВО: НЕ чистимо кеш SDK — інакше розлогін після reload
  const id = root.id || (root.id = "tcroot-" + Math.random().toString(36).slice(2));
  const ui = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: `${location.origin}/tonconnect-manifest.json`,
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
  });
  primaryUi = ui;
  window.__tcui = ui;
  root.dataset.tcMounted = "1";
  log("TonConnectUI mounted at #"+id);
  return ui;
}

export async function mountTonButtons() {
  const root = findRootOnce();
  if (!root) return [];
  const created = [];
  if (!primaryUi) {
    const ui = await mountPrimaryAt(root).catch(()=>null);
    if (ui) created.push(ui);
  }
  // Якщо обрано NAV, а в херо є контейнер — сховаємо його, щоб не було «порожньої» зони
  try {
    const hero = document.querySelector("#tonconnect-hero");
    if (hero && hero !== root) hero.style.display = "none";
  } catch {}
  return created;
}

/* =============== public API =============== */
export function getWalletAddress() {
  return isB64(cachedBase64Addr) ? cachedBase64Addr : (cachedBase64Addr || null);
}
export function getTonConnect() {
  return primaryUi || window.__tcui || null;
}

// невеликий хелпер, аби визначити, чи вже є підключення
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

export async function openConnectModal() {
  await mountTonButtons().catch(()=>{});
  const ui = (primaryUi || window.__tcui);
  if (!ui) return;

  // Якщо вже підключено — нічого не робимо (уникаємо TON_CONNECT_SDK_ERROR I)
  if (_isConnected(ui)) {
    log("openConnectModal skipped: already connected");
    return;
  }

  try {
    await ui.openModal?.();
  } catch (e) {
    const msg = String(e?.message || e || "").toLowerCase();
    // тихо ігноруємо “already connected”
    if (msg.includes("already connected")) return;
    log("openConnectModal error:", e);
  }
}

export async function initTonConnect({ onConnect, onDisconnect } = {}) {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await mountTonButtons().catch(()=>{});
    try {
      if (!cachedBase64Addr && window.__magtAddr) {
        await syncAddress(window.__magtAddr, { onConnect, onDisconnect }, "warm-cache");
      }
    } catch {}

    async function bindOn(ui) {
      if (!ui || ui.__magtHooked) return;
      ui.__magtHooked = true;
      try {
        ui.onStatusChange?.(() => {
          const raw = addrFromUiAccount(ui) || extractFromUi(ui) || null;
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
      const snapshot = primaryUi ? (extractFromUi(primaryUi) || extractFromLocalStorage()) : extractFromLocalStorage();
      if (snapshot) await syncAddress(snapshot, { onConnect, onDisconnect }, "immediate");
    }

    if (primaryUi && !primaryUi.__magtPoll) {
      primaryUi.__magtPoll = setInterval(() => {
        try {
          const fromUi = addrFromUiAccount(primaryUi) || extractFromUi(primaryUi);
          const fromLS = extractFromLocalStorage();
          const addr   = fromUi || fromLS;
          if (addr && addr !== cachedBase64Addr) {
            syncAddress(addr, { onConnect, onDisconnect }, fromUi ? "ui.account/poll" : "ls/poll");
          }
        } catch {}
      }, 1200);
    }

    if (!window.__magtLsBound) {
      window.addEventListener("storage", () => {
        const addr = extractFromLocalStorage();
        if (addr && addr !== cachedBase64Addr) {
          syncAddress(addr, { onConnect, onDisconnect }, "ls/event");
        }
      });
      window.__magtLsBound = true;
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

/* =============== debug helpers (корисно у дев-режимі) =============== */
try { window.getWalletAddress = getWalletAddress; } catch {}
try { window.getTonConnect   = getTonConnect;   } catch {}
try {
  window.magtSetAddr = (addr) => {
    // ручний тригер (для діагностики): приймає EQ/UQ або hex — всередині буде нормалізація
    dispatchAddress(addr || null);
  };
} catch {}
setTimeout(() => {
  try {
    if (cachedBase64Addr) dispatchAddress(cachedBase64Addr);
    else if (window.__magtAddr) dispatchAddress(window.__magtAddr);
  } catch {}
}, 0);
try { window.debugTC = () => ({ ui: getTonConnect(), addr: getTonConnect()?.account?.address || null, cached: getWalletAddress() }); } catch {}
