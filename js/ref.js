// /js/ref.js
// Stub module — залишено для сумісності зі старим кодом.
// УВАГА: актуальна реф-логіка тепер у /js/ui.js та /js/refstore.js.

const DBG = (() => {
  try { return !!JSON.parse(localStorage.getItem("magt_debug") || "false"); } catch { return false; }
})();
const log = (...a) => { if (DBG) try { console.log("[ref.js stub]", ...a); } catch {} };

// короткий формат адреси
export const shortAddr = (a) => (a ? a.slice(0,4) + "…"+ a.slice(-4) : "—");

// дістає ?ref= з URL (без побічок)
export function getUrlRef() {
  try {
    const u = new URL(location.href);
    const r = (u.searchParams.get("ref") || "").trim();
    return r || null;
  } catch { return null; }
}

// локальне збереження / читання (без перевірок валідності)
const REF_STORAGE_KEY = "mag_referrer";
export const saveReferrer = (a) => { try { if (a) localStorage.setItem(REF_STORAGE_KEY, a); } catch {} };
export const loadReferrer = () => {
  try { return localStorage.getItem(REF_STORAGE_KEY) || null; } catch { return null; }
};

// заглушки DOM-онова (більше не використовується)
export function showRefDetected(_addr) { log("showRefDetected() stub"); }
export async function buildYourRefLink() { log("buildYourRefLink() stub"); return false; }
