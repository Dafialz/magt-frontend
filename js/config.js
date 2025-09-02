// /js/config.js
const IS_BROWSER = typeof window !== "undefined" && typeof location !== "undefined";
const IS_LOCAL   = IS_BROWSER && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

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
  /* ===== Ціноутворення / капа ===== */
  // ⬆️ стартова ціна рівня 1 помножена ×3
  PRICE_USD: 0.011490,

  // Прогрес збору
  RAISED_OFFSET_USD: 0,
  GOAL_USD: 20_000_000,
  HARD_CAP: 20_000_000,

  /* ===== TON RPC / мережа ===== */
  // ВСІ запити лише через наш бекенд-проксі
  TON_RPC: join(API_BASE_ABS, "/api/rpc"),
  // ⚠️ Вимкнено зовнішній фолбек, щоб не ламати CSP (раніше: https://tonhubapi.com/jsonRPC)
  TON_RPC_FALLBACK: "",

  /* ===== USDT (Jetton) mainnet ===== */
  // Декілька можливих майстрів USDT, щоб підхоплювати баланс незалежно від походження токена
  USDT_MASTERS: [
    "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx", // класичний USDT майстер
    "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", // твій майстер з tonviewer (де лежать $10.94)
  ],
  // Для зворотної сумісності: перший з масиву
  USDT_MASTER: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
  USDT_JETTON: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",

  PRESALE_OWNER_ADDRESS: "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",
  TREASURY_WALLET:       "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",

  JETTON_DECIMALS: 6,
  USDT_DECIMALS:   6,

  // Оптимальні TON для виконання init/transfer
  JETTON_WALLET_TON: 0.15,
  FORWARD_TON: 0.05,

  /* ===== Обмеження / рефералка ===== */
  MIN_BUY_USDT: 1,
  REF_ENABLED: true,
  REF_BONUS_PCT: 5,
  REF_MIN_USDT: 10,
  REF_SELF_BAN: true,
  REF_BIND_ONCE: true,
  REF_DAILY_CAP_USD: 0,
  REF_TOTAL_CAP_USD: 0,
  REF_POOL_TOKENS: 25_000_000,
  REF_DEBUG_DEMO: false,

  /* ===== Дані пресейлу / таймер ===== */
  TOTAL_SUPPLY: 500_000_000,
  ROUND_DEADLINE_TS: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,

  // ⬆️ кожен рівень — та сама кількість токенів, але ціни ×3
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
  API_BASE: API_BASE_RUNTIME, // у проді порожньо — використовуємо абсолютні ендпоінти
  ENDPOINTS: {
    stats:    join(API_BASE_ABS, "/api/presale/stats"),
    feed:     join(API_BASE_ABS, "/api/presale/feed"),
    leaders:  join(API_BASE_ABS, "/api/presale/leaders"),
    purchase: join(API_BASE_ABS, "/api/presale/purchase"),
    claim:    join(API_BASE_ABS, "/api/presale/claim"),
    order:    join(API_BASE_ABS, "/api/order"),
    referral: join(API_BASE_ABS, "/api/referral"),
    rpc:      join(API_BASE_ABS, "/api/rpc"),
  },

  __DEBUG: { API_BASE_RUNTIME, API_BASE_ABS, OVERRIDE, IS_LOCAL },
};

/* ===== Runtime-чек (для дебагу) ===== */
if (CONFIG.MIN_BUY_USDT < 1) console.warn("⚠️ MIN_BUY_USDT занадто малий, перевір значення в config.js");
if ((!CONFIG.USDT_MASTERS || CONFIG.USDT_MASTERS.length === 0) && !CONFIG.USDT_MASTER) {
  console.error("❌ Немає адрес майстрів USDT у config.js");
}
if (!CONFIG.PRESALE_OWNER_ADDRESS) console.error("❌ Немає PRESALE_OWNER_ADDRESS у config.js");
if (!(CONFIG.REF_BONUS_PCT >= 0 && CONFIG.REF_BONUS_PCT <= 50)) console.warn("⚠️ REF_BОНУС_PCT виглядає підозріло. Рекомендується 0..50%");

if (IS_BROWSER) {
  console.log(
    "[MAGT CONFIG] API_BASE:", CONFIG.API_BASE || "(empty, use absolute endpoints)",
    "API_BASE_ABS:", CONFIG.__DEBUG.API_BASE_ABS,
    "override:", CONFIG.__DEBUG.OVERRIDE || "(none)",
    "is_local:", CONFIG.__DEBUG.IS_LOCAL,
    "usdt_masters:", (CONFIG.USDT_MASTERS || []).length
  );
}
