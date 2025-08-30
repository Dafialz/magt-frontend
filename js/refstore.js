// /js/refstore.js
// Клієнтська обгортка над бекендом для збереження пари owner->referrer.
// Працює з Netlify Function за адресою /api/refmap
// Якщо бекенд недоступний — методи мовчки фейляться, фронт продовжує працювати локально.

import { CONFIG } from "./config.js";

const REF_API_URL = CONFIG.ENDPOINTS?.refmap || "/api/refmap";

const DBG = (() => {
  try { return !!JSON.parse(localStorage.getItem("magt_debug") || "false"); } catch { return false; }
})();
function log(...a){ if (DBG) { try{ console.log("[REFSTORE]", ...a);}catch{} } }

async function safeFetch(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function saveOwnerRef(ownerBase64, refBase64){
  try {
    if (!ownerBase64 || !refBase64) return false;
    const res = await safeFetch(REF_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: ownerBase64, ref: refBase64 })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(()=>({ok:true}));
    log("saved", ownerBase64, "->", refBase64, json);
    return true;
  } catch (e) {
    log("save fail:", e?.message || e);
    return false;
  }
}

export async function loadRefByOwner(ownerBase64){
  try {
    if (!ownerBase64) return null;
    const url = `${REF_API_URL}?owner=${encodeURIComponent(ownerBase64)}`;
    const res = await safeFetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(()=>null);
    const ref = json && typeof json.ref === "string" ? json.ref.trim() : null;
    if (ref) log("loaded", ownerBase64, "->", ref);
    return ref || null;
  } catch (e) {
    log("load fail:", e?.message || e);
    return null;
  }
}
