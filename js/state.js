// /js/state.js
import { $ } from "./utils.js";

/**
 * Глобальний стан застосунку.
 * Тут зберігаємо реферала (referrer) та власника (owner) — адресу підключеного гаманця.
 */
export const state = {
  // referral (запрошувач)
  referrer: null,       // повна TON-адреса EQ… / UQ…
  referrerShort: "",    // короткий вигляд для UI

  // owner (поточний користувач)
  owner: null,          // повна TON-адреса EQ… / UQ…
  ownerShort: "",       // короткий вигляд для UI
};

/**
 * Посилання на елементи інтерфейсу (оновлюються через refreshUiRefs()).
 * Для стійкості додано кілька альтернативних селекторів.
 */
export const ui = {
  // заголовки/прогрес
  year: null,
  price: null,
  level: null,
  left: null,
  raised: null,
  bar: null,

  // форма купівлі
  tonIn: null,   // НОВЕ: інпут сумми в TON
  usdtIn: null,  // залишаємо для зворотної сумісності
  magOut: null,
  agree: null,
  btnMax: null,
  btnBuy: null,
  btnClaim: null,
  status: null,

  // TonConnect
  tcContainers: [],   // НОВЕ: куди монтувати офіційну кнопку Connect
  tcPrimary: null,    // перший доступний контейнер

  // рефералка
  refDetected: null,
  referrerShort: null,
  refYourLink: null,
  refLink: null,
  btnCopyRef: null,
  refPayout: null,
  refBonusUsd: null,
  refBonusTo: null,

  // claim
  claimWrap: null,
  claimInfo: null,
  claimBadge: null,
};

/**
 * Безпечний пошук першого існуючого елемента з набору селекторів.
 */
function pickOne(selectors = []) {
  for (const s of selectors) {
    const el = $(s);
    if (el) return el;
  }
  return null;
}

/**
 * Повертає всі елементи, що відповідають набору селекторів.
 */
function pickAll(selectors = []) {
  const out = [];
  for (const s of selectors) {
    const nodes = document.querySelectorAll(s);
    nodes.forEach(n => out.push(n));
  }
  return out;
}

/**
 * Перечитує всі потрібні елементи з DOM.
 * Викликати безпечно скільки завгодно разів (ідемпотентно).
 */
export function refreshUiRefs() {
  // заголовки/прогрес
  ui.year   = pickOne(["#year", "[data-year]"]);
  ui.price  = pickOne(["#ui-price", "[data-ui-price]"]);
  ui.level  = pickOne(["#ui-level", "[data-ui-level]"]);
  ui.left   = pickOne(["#ui-left", "[data-ui-left]"]);
  ui.raised = pickOne(["#ui-raised", "[data-ui-raised]"]);
  ui.bar    = pickOne(["#bar", "[data-progress-bar]"]);

  // форма купівлі (TON-first, USDT fallback)
  ui.tonIn   = pickOne(["#tonIn", "[data-ton-in]", "input[name='ton']"]);
  ui.usdtIn  = pickOne(["#usdtIn", "[data-usdt-in]", "input[name='usdt']"]);
  ui.magOut  = pickOne(["#magOut", "[data-mag-out]"]);
  ui.agree   = pickOne(["#agree", "[data-agree]"]);
  ui.btnMax  = pickOne(["#btn-max", "[data-btn-max]"]);
  ui.btnBuy  = pickOne(["#btn-buy", "[data-btn-buy]"]);
  ui.btnClaim= pickOne(["#btn-claim", "[data-btn-claim]"]);
  ui.status  = pickOne(["#status", "[data-status]"]);

  // TonConnect кнопка — збираємо всі відомі контейнери
  ui.tcContainers = pickAll([
    "#tonconnect",
    "#tonconnect-mobile",
    "#tonconnect-hero",
    "[data-tonconnect]",
    ".tonconnect"
  ]);
  ui.tcPrimary = ui.tcContainers?.[0] || null;

  // рефералка
  ui.refDetected   = pickOne(["#ref-detected", "[data-ref-detected]"]);
  ui.referrerShort = pickOne(["#referrer-short", "[data-referrer-short]"]);
  ui.refYourLink   = pickOne(["#ref-yourlink", "[data-ref-yourlink]"]);
  ui.refLink       = pickOne(["#ref-link", "[data-ref-link]"]);
  ui.btnCopyRef    = pickOne(["#btn-copy-ref", "[data-btn-copy-ref]"]);
  ui.refPayout     = pickOne(["#ref-payout", "[data-ref-payout]"]);
  ui.refBonusUsd   = pickOne(["#ref-bonus-usd", "[data-ref-bonus-usd]"]);
  ui.refBonusTo    = pickOne(["#ref-bonus-to", "[data-ref-bonus-to]"]);

  // claim (підстраховка: або id, або data-атрибут)
  ui.claimWrap  = pickOne(["#claim-wrap", "[data-claim-wrap]"]);
  ui.claimInfo  = pickOne(["#claim-info", "[data-claim-info]"]);
  ui.claimBadge = pickOne(["#claim-badge", "[data-claim-badge]"]);
}

/* ===== Авто-оновлення посилань на UI ===== */

// якщо DOM уже готовий — одразу оновимо
if (typeof document !== "undefined" && document.readyState !== "loading") {
  refreshUiRefs();
} else {
  window.addEventListener("DOMContentLoaded", () => refreshUiRefs(), { once: true });
}

// після підвантаження partials (ці події шле /js/partials.js)
window.addEventListener("partials:loaded", refreshUiRefs);
window.addEventListener("partials:main-ready", refreshUiRefs);

// якщо на сторінці щось динамічно підвантажується, можна періодично освіжати (very light)
let __lastRefresh = Date.now();
const __obs = new MutationObserver(() => {
  const now = Date.now();
  if (now - __lastRefresh > 1500) {
    __lastRefresh = now;
    refreshUiRefs();
  }
});
try {
  __obs.observe(document.documentElement, { childList: true, subtree: true });
} catch { /* no-op */ }
