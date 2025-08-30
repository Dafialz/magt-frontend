// /js/utils.js
import { CONFIG } from "./config.js";

/* ========== DOM ========== */
export const $ = (sel) => document.querySelector(sel);

/* ========== Numbers & formatting ========== */
export const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: d });

export const fmtUsd = (n, d = 2) => {
  const v = Number(n || 0);
  return isFinite(v) ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d })}` : "$0";
};

/* ========== API url helper ========== */
// api("/purchase") -> "https://api.example.com/purchase" або null (DEMO режим)
export function api(path) {
  if (!CONFIG.API_BASE) return null;
  const base = String(CONFIG.API_BASE || "").replace(/\/+$/g, "");
  const p = String(path || "").replace(/^\/?/g, "");
  return `${base}/${p}`;
}

/* ========== Misc utils ========== */
export function shortAddr(a) { return a ? a.slice(0, 4) + "…" + a.slice(-4) : ""; }
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* TON address helpers (щоб не дублювати по модулях) */
export function isTonAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (!a || !(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
  return /^[A-Za-z0-9_-]{48,68}$/.test(a);
}
export function normalizeToBase64Url(addr) {
  const a = (addr || "").trim();
  if (!a) return null;
  if (isTonAddress(a)) return a;
  try {
    if (window.TonWeb?.utils?.Address) {
      const A = new window.TonWeb.utils.Address(a);
      return A.toString(true, true, true);
    }
  } catch {}
  return null;
}

/* ========== Config sanity ========== */
export function cfgReady() {
  const bad = (v) => !v || String(v).includes("REPLACE") || String(v).trim().length < 8;
  return !(bad(CONFIG.USDT_MASTER) || bad(CONFIG.PRESALE_OWNER_ADDRESS));
}

/* ========== Buttons ========== */
export function setBtnLoading(btn, isLoading, labelLoading = "…") {
  if (!btn) return;
  // запам'ятати оригінальний текст
  if (btn.dataset.label == null) btn.dataset.label = btn.textContent?.trim?.() || "";
  // тримати ширину, щоб не "скакав" лейаут
  if (!btn.dataset.wHeld) {
    const w = btn.getBoundingClientRect().width;
    if (w) { btn.style.minWidth = `${Math.ceil(w)}px`; btn.dataset.wHeld = "1"; }
  }
  btn.disabled = !!isLoading;
  btn.classList.toggle("opacity-60", !!isLoading);
  btn.setAttribute("aria-busy", isLoading ? "true" : "false");
  btn.textContent = isLoading ? labelLoading : btn.dataset.label;
}

/* ========== Async helpers ========== */
// очікування появи елемента (для динамічних partials)
export async function waitForEl(selector, timeout = 10000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(iv); clearTimeout(to); resolve(el); }
    };
    const iv = setInterval(tick, 50);
    const to = setTimeout(() => {
      clearInterval(iv);
      reject(new Error(`Timeout waiting for ${selector} after ${Math.round(performance.now() - start)}ms`));
    }, timeout);
    tick();
  });
}

// fetch із таймаутом
export async function safeFetch(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
