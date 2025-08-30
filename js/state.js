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
  usdtIn: null,
  magOut: null,
  agree: null,
  btnMax: null,
  btnBuy: null,
  btnClaim: null,
  status: null,

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
 * Перечитує всі потрібні елементи з DOM.
 * Викликати безпечно скільки завгодно разів (ідемпотентно).
 */
export function refreshUiRefs() {
  // заголовки/прогрес
  ui.year   = $("#year");
  ui.price  = $("#ui-price");
  ui.level  = $("#ui-level");
  ui.left   = $("#ui-left");
  ui.raised = $("#ui-raised");
  ui.bar    = $("#bar");

  // форма купівлі
  ui.usdtIn   = $("#usdtIn");
  ui.magOut   = $("#magOut");
  ui.agree    = $("#agree");
  ui.btnMax   = $("#btn-max");
  ui.btnBuy   = $("#btn-buy");
  ui.btnClaim = $("#btn-claim");
  ui.status   = $("#status");

  // рефералка
  ui.refDetected   = $("#ref-detected");
  ui.referrerShort = $("#referrer-short");
  ui.refYourLink   = $("#ref-yourlink");
  ui.refLink       = $("#ref-link");
  ui.btnCopyRef    = $("#btn-copy-ref");
  ui.refPayout     = $("#ref-payout");
  ui.refBonusUsd   = $("#ref-bonus-usd");
  ui.refBonusTo    = $("#ref-bonus-to");

  // claim (підстраховка: або id, або data-атрибут)
  ui.claimWrap  = $("#claim-wrap") || $("[data-claim-wrap]");
  ui.claimInfo  = $("#claim-info");
  ui.claimBadge = $("#claim-badge");
}

/* ===== Авто-оновлення посилань на UI ===== */

// якщо DOM уже готовий — одразу оновимо
if (document.readyState !== "loading") {
  refreshUiRefs();
} else {
  window.addEventListener("DOMContentLoaded", () => refreshUiRefs(), { once: true });
}

// після підвантаження partials (ці події шле /js/partials.js)
window.addEventListener("partials:loaded", refreshUiRefs);
window.addEventListener("partials:main-ready", refreshUiRefs);
