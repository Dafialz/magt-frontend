// /js/tonconnect.js
// Публічне API: initTonConnect({ onConnect, onDisconnect }), mountTonButtons(),
// getWalletAddress(), getTonConnect(), openConnectModal(), forceDisconnect(), forgetCachedWallet()

import { ui as UI, refreshUiRefs } from "./state.js";

let primaryUi = null;
let readyPromise = null;
let cachedBase64Addr = null;
let connectedOnce = false;

// додаткові інстанси для мобільних контейнерів
let mobileInlineUi = null;
let mobileDrawerUi = null;

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
    const st = [{ o: obj, d: 0 } ];
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
function addrFromWalletObj(w){
  const raw = w?.account?.address || null;
  return normalizeToBase64(raw) || null;
}

/* =============== монтування кнопок =============== */

/** Раніше тут ховали ще мобільні контейнери — тепер залишаємо їх видимими */
function hideExtraSlots() {
  const ids = ["tonconnect-hero"]; // тільки hero-плейсхолдер, мобільні НЕ чіпаємо
  ids.forEach((id) => {
    const n = document.getElementById(id);
    if (n) {
      n.innerHTML = "";
      n.style.display = "none";
      n.setAttribute("aria-hidden", "true");
      n.dataset.tcHidden = "1";
    }
  });
}

/** Чекаємо появу кореня в хедері */
function waitForHeaderRoot(timeoutMs = 8000) {
  const start = performance.now();
  return new Promise((resolve) => {
    (function tick() {
      hideExtraSlots();
      try { refreshUiRefs(); } catch {}
      const headerRoot = document.getElementById("tonconnect");
      if (headerRoot instanceof HTMLElement) return resolve(headerRoot);
      if (performance.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 120);
    })();
  });
}

/** UX-підстраховка: якщо модалка закрилась і підключення немає — знову показуємо QR */
function attachUxFallback(ui) {
  if (!ui || ui.__magtUxHooked) return;
  ui.__magtUxHooked = true;

  let fallbackTimer = null;

  const ensureModalWithHint = () => {
    try { ui.openModal?.(); } catch {}
    setTimeout(() => {
      try {
        const box = document.querySelector(".tc-modal__body");
        if (box && !box.querySelector(".tc-hint")) {
          const hint = document.createElement("div");
          hint.className = "tc-hint";
          hint.style.cssText = "margin-top:12px;font-size:12px;opacity:.8;text-align:center;";
          hint.textContent = "Не бачиш вікна гаманця? Проскануй QR у Tonkeeper/MyTonWallet або встанови розширення.";
          box.appendChild(hint);
        }
      } catch {}
    }, 100);
  };

  try {
    ui.onModalStateChange?.((s) => log("modal:", s));
  } catch {}

  ui.__magtScheduleFallback = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      if (!getWalletAddress()) ensureModalWithHint();
    }, 2500);
  };
}

const RETURN_URL = `${location.origin}/`;
const TWA_RETURN_URL = `${location.origin}/`; // якщо з’явиться TWA-бот — заміниш

async function mountPrimaryAt(root) {
  if (primaryUi) return primaryUi;
  if (!root) return null;

  await waitTonLib();
  if (!window.TON_CONNECT_UI) return null;

  try { root.innerHTML = ""; } catch {}
  const id = root.id || (root.id = "tcroot-" + Math.random().toString(36).slice(2));

  const ui = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://magtcoin.com/tonconnect-manifest.json",
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
    restoreConnection: true,
    actionsConfiguration: { returnUrl: RETURN_URL, twaReturnUrl: TWA_RETURN_URL }
  });

  attachUxFallback(ui);

  primaryUi = ui;
  window.__tcui = ui;
  root.dataset.tcMounted = "1";
  log("TonConnectUI mounted at #" + id);
  return ui;
}

/** Монтуємо другі інстанси кнопки в мобільні слоти (той самий стейт, інший контейнер) */
async function mountSecondaryAt(rootOrId, existingRefName = "mobile") {
  await waitTonLib();
  if (!window.TON_CONNECT_UI) return null;

  const root = typeof rootOrId === "string" ? document.getElementById(rootOrId) : rootOrId;
  if (!root || !(root instanceof HTMLElement)) return null;

  // не перезатираємо, якщо вже є TonConnectUI в цьому контейнері
  if (root.dataset.tcMounted === "1") return null;

  const id = root.id || (root.id = "tcroot-" + Math.random().toString(36).slice(2));
  try { root.innerHTML = ""; } catch {}

  const ui = new window.TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://magtcoin.com/tonconnect-manifest.json",
    buttonRootId: id,
    uiPreferences: { theme: "DARK", borderRadius: "m" },
    restoreConnection: true,
    actionsConfiguration: { returnUrl: RETURN_URL, twaReturnUrl: TWA_RETURN_URL }
  });

  root.dataset.tcMounted = "1";
  log(`TonConnectUI mounted (secondary:${existingRefName}) at #${id}`);
  return ui;
}

export async function mountTonButtons() {
  const root = await waitForHeaderRoot();
  if (!root) { log("no #tonconnect root found; skip mount"); return []; }

  const created = [];

  // ГОЛОВНА кнопка в хедері
  if (!primaryUi) {
    const ui = await mountPrimaryAt(root).catch(() => null);
    if (ui) created.push(ui);
  } else {
    const headerRoot = document.getElementById("tonconnect");
    if (headerRoot && !headerRoot.dataset.tcMounted) {
      const ui = await mountPrimaryAt(headerRoot).catch(() => null);
      if (ui) created.push(ui);
    }
  }

  // МОБІЛЬНА інлайн-кнопка (біля бургера)
  const inlineRoot = document.getElementById("tonconnect-mobile-inline");
  if (inlineRoot && !inlineRoot.dataset.tcMounted) {
    mobileInlineUi = await mountSecondaryAt(inlineRoot, "inline").catch(() => null);
    if (mobileInlineUi) created.push(mobileInlineUi);
  }

  // МОБІЛЬНА кнопка всередині дроуера
  const drawerRoot = document.getElementById("tonconnect-mobile");
  if (drawerRoot && !drawerRoot.dataset.tcMounted) {
    mobileDrawerUi = await mountSecondaryAt(drawerRoot, "drawer").catch(() => null);
    if (mobileDrawerUi) created.push(mobileDrawerUi);
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
  await mountTonButtons().catch(() => {});
  const ui = (primaryUi || window.__tcui);
  if (!ui) return;
  try { await ui.openModal?.(); } catch (e) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("already connected")) return;
    log("openConnectModal error:", e);
  }
  try { ui.__magtScheduleFallback?.(); } catch {}
}

export async function initTonConnect({ onConnect, onDisconnect } = {}) {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await mountTonButtons().catch(() => {});

    async function bindOn(ui) {
      if (!ui || ui.__magtHooked) return;
      ui.__magtHooked = true;
      try {
        ui.onStatusChange?.((wallet) => {
          if (!wallet || !wallet?.account?.address) {
            try { ui.__magtScheduleFallback?.(); } catch {}
          }
          const fromEvent = addrFromWalletObj(wallet);
          const fallback  = addrFromUiAccount(ui);
          const raw = fromEvent || fallback || null;
          log("statusChange:", wallet, "addr:", raw);
          syncAddress(raw, { onConnect, onDisconnect }, "statusChange");
        });
        log("subscribed to onStatusChange");
      } catch (e) { log("onStatusChange subscribe error:", e); }
    }

    if (primaryUi) await bindOn(primaryUi);

    try {
      const w = await primaryUi?.getWallet?.();
      const addr = addrFromWalletObj(w) || addrFromUiAccount(primaryUi);
      await syncAddress(addr || null, { onConnect, onDisconnect }, "getWallet/immediate");
    } catch {
      await syncAddress(null, { onConnect, onDisconnect }, "no-addr-initial");
    }

    if (primaryUi && !primaryUi.__magtPoll) {
      primaryUi.__magtPoll = setInterval(async () => {
        try {
          const w = await primaryUi.getWallet?.();
        const fromEvent = addrFromWalletObj(w);
          const fromUi = fromEvent || addrFromUiAccount(primaryUi);
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
try { window.magtSetAddr = (addr) => { dispatchAddress(addr || null); }; } catch {}
setTimeout(() => {
  try { if (cachedBase64Addr) dispatchAddress(cachedBase64Addr); } catch {}
}, 0);
try { window.debugTC = () => ({ ui: getTonConnect(), addr: getTonConnect()?.account?.address || null, cached: getWalletAddress() }); } catch {}
