// /js/config.js
const IS_BROWSER = typeof window !== "undefined" && typeof location !== "undefined";
const IS_LOCAL   = IS_BROWSER && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

<script type="module" src="/js/api-override.js?v=1"></script>

// Публічний продовий бекенд
const PROD_API_BASE = "https://api.magtcoin.com";

// Можливість override (для тестів/стендів)
const OVERRIDE = (IS_BROWSER && window.API_BASE_OVERRIDE) ? String(window.API_BASE_OVERRIDE).trim() : "";

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
    { label: "Пресейл",            pct: 5  },
    { label: "Ліквідність",        pct: 15 },
    { label: "Маркетинг",          pct: 5  },
    { label: "Команда",            pct: 5  },
    { label: "Фонд розвитку",      pct: 10 },
    { label: "Наші Проєкти ",      pct: 60 },
  ],

  /* ===== Ціноутворення (USD для віджетів, за бажанням) ===== */
  PRICE_USD: 0.011490,
  RAISED_OFFSET_USD: 0,
  GOAL_USD: 20_000_000,
  HARD_CAP: 20_000_000,

  /* ===== TON RPC / мережа ===== */
  TON_RPC: join(API_BASE_ABS, "/api/rpc"),
  TON_RPC_FALLBACK: "",

  /* ===== TON-пресейл (ГОЛОВНЕ) ===== */
  // ОБОВ'ЯЗКОВО: адреса контракту MagtPresale (EQ…)
  PRESALE_ADDRESS: "",

  // Мінімальна покупка в TON для фронту
  MIN_BUY_TON: 0.1,

  // Ціна 1 MAGT у TON (для UI/оцінки куплених токенів; контракт рахує сам по рівнях)
  PRICE_TON: 0, // наприклад: 0.000003 (залежить від рівнів у контракті)

  // (Опційно) майстер MAGT (EQ…), якщо потрібні перевірки/віджети
  MAGT_MASTER: "",

  /* ===== USDT (Jetton) — лишено для сумісності старих розділів UI ===== */
  USDT_MASTERS: [
    "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
    "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  ],
  USDT_MASTER: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
  USDT_JETTON: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
  PRESALE_OWNER_ADDRESS: "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",
  TREASURY_WALLET:       "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",
  JETTON_DECIMALS: 6,
  USDT_DECIMALS:   6,
  JETTON_WALLET_TON: 0.15,
  FORWARD_TON: 0.05,

  /* ===== Обмеження / рефералка (логіка бонусу виконується контрактом) ===== */
  MIN_BUY_USDT: 1,              // залишено для старого UI; TON-режим використовує MIN_BUY_TON
  REF_ENABLED: true,
  REF_BONUS_PCT: 5,
  REF_MIN_USDT: 10,             // для старого UI; за потреби додай REF_MIN_TON
  REF_SELF_BAN: true,
  REF_BIND_ONCE: true,
  REF_DAILY_CAP_USD: 0,
  REF_TOTAL_CAP_USD: 0,
  REF_POOL_TOKENS: 25_000_000,
  REF_DEBUG_DEMO: false,

  /* ===== Дані пресейлу / таймер ===== */
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

  /* ===== Claim ===== */
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

/* ===== Runtime-чек (для дебагу) ===== */
if (!CONFIG.PRESALE_ADDRESS) {
  console.error("❌ Вкажи PRESALE_ADDRESS (адреса контракту пресейлу) у config.js");
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
