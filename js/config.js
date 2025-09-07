// /js/config.js
// ВАЖЛИВО: жодних <script> тут бути не повинно. Це ES-module з export { CONFIG }.

const IS_BROWSER = typeof window !== "undefined" && typeof location !== "undefined";
const IS_LOCAL   = IS_BROWSER && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

// Публічний продовий бекенд
const PROD_API_BASE = "https://api.magtcoin.com";

// Можливість override (для тестів/стендів) — задається в index.html через window.API_BASE_OVERRIDE
const OVERRIDE = (IS_BROWSER && window.API_BASE_OVERRIDE)
  ? String(window.API_BASE_OVERRIDE).trim()
  : "";

// У локалці — локальний бекенд; у проді рядок порожній (використовуємо абсолютні ендпоінти нижче)
const API_BASE_RUNTIME = OVERRIDE || (IS_LOCAL ? "http://127.0.0.1:8787" : "");

// Абсолютна база, яку реально підставляємо в ENDPOINTS
const API_BASE_ABS = API_BASE_RUNTIME || PROD_API_BASE;

function join(base, path) {
  if (!base) return path;
  if (!path) return base;
  return base.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}

export const CONFIG = {
  /* ===== Загальна емісія / Токеноміка ===== */
  TOKEN_TOTAL_SUPPLY: 10_000_000_000,
  TOKENOMICS: [
    { label: "Пресейл",       pct: 5  },
    { label: "Ліквідність",   pct: 15 },
    { label: "Маркетинг",     pct: 5  },
    { label: "Команда",       pct: 5  },
    { label: "Фонд розвитку", pct: 10 },
    { label: "Наші Проєкти ", pct: 60 },
  ],

  /* ===== Ціноутворення для UI ===== */
  PRICE_USD: 0.011490,      // показ у віджетах
  PRICE_TON: 0,             // якщо продаєш і за TON — вистави тут ціну, інакше 0
  RAISED_OFFSET_USD: 0,
  GOAL_USD: 20_000_000,
  HARD_CAP: 20_000_000,

  /* ===== TON RPC ===== */
  // За замовчуванням — через твій бекенд-проксі (/api/rpc). У ton.js є fallback-логіка.
  TON_RPC:          join(API_BASE_ABS, "/api/rpc"),
  TON_RPC_FALLBACK: "",

  /* ===== Адреси пресейлу ===== */
  // ВСТАВ ОДНУ АБО ОБИДВІ, ЗАЛЕЖНО ВІД ТВОЄЇ СХЕМИ
  // PRESALE_OWNER_ADDRESS — власник USDT-джеттонів (адреса, для якої рахуємо JW отримувача)
  // PRESALE_ADDRESS       — якщо є окремий контракт пресейлу (для віджетів/перевірок)
  PRESALE_OWNER_ADDRESS: "", // <-- ВСТАВ СВОЮ EQ/UQ
  PRESALE_ADDRESS:       "", // <-- за наявності

  // Мінімальна покупка в TON для фронту
  MIN_BUY_TON: 0.1,

  /* ===== MAGT / USDT (для сумісності старого UI) ===== */
  MAGT_MASTER: "",
  JETTON_DECIMALS: 6,
  USDT_DECIMALS:   6,

  // Кандидати майстрів USDT-джеттона (TON)
  USDT_MASTERS: [
    "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
    "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  ],
  USDT_MASTER: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
  USDT_JETTON: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",

  // Куди відкривати TON при трансфері джеттонів (витрати на відкриття та forward)
  JETTON_WALLET_TON: 0.15,
  FORWARD_TON:       0.05,

  // Казначейський гаманець (за потреби в бекенді/виджетах)
  TREASURY_WALLET: "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",

  /* ===== Рефералка (UI) ===== */
  MIN_BUY_USDT: 1,       // лишено для USD-режиму
  REF_ENABLED: true,
  REF_BONUS_PCT: 5,
  REF_MIN_USDT: 10,
  REF_SELF_BAN: true,
  REF_BIND_ONCE: true,
  REF_DAILY_CAP_USD: 0,
  REF_TOTAL_CAP_USD: 0,
  REF_POOL_TOKENS: 25_000_000,
  REF_DEBUG_DEMO: false,

  /* ===== Дані пресейлу / рівні (для віджетів) ===== */
  TOTAL_SUPPLY: 500_000_000,
  ROUND_DEADLINE_TS: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  LEVELS: [
    { tokens: 65_225_022, price: 0.011490 },
    { tokens: 57_039_669, price: 0.013443 },
    { tokens: 50_370_908, price: 0.015729 },
    { tokens: 44_326_399, price: 0.018402 },
    { tokens: 39_007_231, price: 0.021531 },
    { tokens: 34_326_365, price: 0.025191 },
    { tokens: 30_207_200, price: 0.029472 },
    { tokens: 26_582_336, price: 0.034482 },
    { tokens: 23_392_455, price: 0.040344 },
    { tokens: 20_585_361, price: 0.047205 },
    { tokens: 18_115_117, price: 0.055230 },
    { tokens: 15_941_303, price: 0.064617 },
    { tokens: 14_028_347, price: 0.075603 },
    { tokens: 12_344_945, price: 0.088455 },
    { tokens: 10_863_552, price: 0.103494 },
    { tokens:  9_559_925, price: 0.121086 },
    { tokens:  8_412_734, price: 0.141672 },
    { tokens:  7_423_267, price: 0.165756 },
    { tokens:  6_514_821, price: 0.193935 },
    { tokens:  5_733_043, price: 0.226902 },
  ],
  FALLBACK_SOLD_TOKENS: 0,

  /* ===== Claim (опційно) ===== */
  CLAIM_ENABLED: false,
  CLAIM_CONTRACT: "",
  CLAIM_POLL_INTERVAL_MS: 30000,

  /* ===== API ===== */
  API_BASE: API_BASE_RUNTIME,
  ENDPOINTS: {
    stats:       join(API_BASE_ABS, "/api/presale/stats"),
    feed:        join(API_BASE_ABS, "/api/presale/feed"),
    leaders:     join(API_BASE_ABS, "/api/presale/leaders"),
    purchase:    join(API_BASE_ABS, "/api/presale/purchase"),
    claim:       join(API_BASE_ABS, "/api/presale/claim"),
    order:       join(API_BASE_ABS, "/api/order"),
    referral:    join(API_BASE_ABS, "/api/referral"),
    rpc:         join(API_BASE_ABS, "/api/rpc"),
    myBalances:  join(API_BASE_ABS, "/api/my-stats"),
    balances:    join(API_BASE_ABS, "/api/my-stats"),
    myStats:     join(API_BASE_ABS, "/api/my-stats"),
  },

  __DEBUG: { API_BASE_RUNTIME, API_BASE_ABS, OVERRIDE, IS_LOCAL },
};

/* ===== Runtime-чек (м’який) ===== */
if (!CONFIG.PRESALE_OWNER_ADDRESS && !CONFIG.PRESALE_ADDRESS) {
  console.warn("⚠️ Вкажи PRESALE_OWNER_ADDRESS або PRESALE_ADDRESS у config.js — інакше купівля працюватиме, але деякі віджети/перевірки можуть бути обмежені.");
}
if (CONFIG.MIN_BUY_TON <= 0) {
  console.warn("⚠️ Задай адекватний MIN_BUY_TON у config.js");
}
if (IS_BROWSER) {
  console.log(
    "[MAGT CONFIG] API_BASE:", CONFIG.API_BASE || "(empty, use absolute endpoints)",
    "API_BASE_ABS:", CONFIG.__DEBUG.API_BASE_ABS,
    "override:", CONFIG.__DEBUG.OVERRIDE || "(none)",
    "is_local:", CONFIG.__DEBUG.IS_LOCAL
  );
}
