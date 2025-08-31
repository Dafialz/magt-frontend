// /js/config.js
const IS_BROWSER = typeof window !== "undefined" && typeof location !== "undefined";
const IS_LOCAL   = IS_BROWSER && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

// Публічний продовий бекенд
const PROD_API_BASE = "https://api.magtcoin.com";

// Даємо можливість примусово підмінити API через window.API_BASE_OVERRIDE (для тестів/стендів)
const OVERRIDE = (IS_BROWSER && window.API_BASE_OVERRIDE) ? String(window.API_BASE_OVERRIDE).trim() : "";

// У локалці використовуємо локальний бекенд; у проді рядок порожній,
// щоб не злипався домен у конкатенаціях і використовувались абсолютні ендпоінти нижче.
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
  PRICE_USD: 0.00383,

  // НОВЕ: параметри прогресу збору
  // Сума, з якої показуємо прогрес (офсет «вже зібрано»)
  RAISED_OFFSET_USD: 5_900_000,
  // Поточна ціль збору
  GOAL_USD: 25_900_000,

  // Якщо десь у фронті ще використовується стара «HARD_CAP» — хай співпадає з GOAL_USD
  HARD_CAP: 25_900_000,

  /* ===== TON RPC / мережа ===== */
  // Використовуємо Toncenter з твоїм ключем, щоб не впиратись у 429
  TON_RPC: "https://toncenter.com/api/v2/jsonRPC?api_key=a503464fcf4bd07fbee166734a28443a0604f0c422fab4af9a2a347c99e387b5",
  // Резервний вузол (на випадок, якщо Toncenter тимчасово недоступний)
  TON_RPC_FALLBACK: "https://tonhubapi.com/jsonRPC",

  /* ===== USDT (Jetton) mainnet ===== */
  USDT_MASTER: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",
  USDT_JETTON: "EQDxQWrZz7vI1EqVvtDv1sFLmvK1hNpxrQpvMXhjBasUSXjx",

  PRESALE_OWNER_ADDRESS: "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",
  TREASURY_WALLET:       "UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD",

  JETTON_DECIMALS: 6,
  USDT_DECIMALS:   6,
  JETTON_WALLET_TON: 0.15,
  FORWARD_TON: 0.02,

  /* ===== Обмеження / рефералка ===== */
  MIN_BUY_USDT: 1,
  REF_ENABLED: true,
  REF_BONUS_PCT: 5,
  REF_MIN_USDT: 10,
  REF_SELF_BAN: true,
  REF_BIND_ONCE: true,
  REF_DAILY_CAP_USD: 0,
  REF_TOTAL_CAP_USD: 0,
  // у проді вимикаємо демо-емуляцію подій
  REF_DEBUG_DEMO: false,

  /* ===== Дані пресейлу / таймер ===== */
  TOTAL_SUPPLY: 1_500_000_000, // загальний обсяг MAGT у пресейлі (для "Залишок")
  ROUND_DEADLINE_TS: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,

  LEVELS: [
    { tokens: 195_135_235, price: 0.003830 },
    { tokens: 171_119_007, price: 0.004481 },
    { tokens: 151_112_725, price: 0.005243 },
    { tokens: 132_979_198, price: 0.006134 },
    { tokens: 117_021_694, price: 0.007177 },
    { tokens: 102_979_097, price: 0.008397 },
    { tokens:  90_621_600, price: 0.009824 },
    { tokens:  79_747_008, price: 0.011494 },
    { tokens:  70_177_367, price: 0.013448 },
    { tokens:  61_756_083, price: 0.015735 },
    { tokens:  54_345_353, price: 0.018410 },
    { tokens:  47_823_911, price: 0.021539 },
    { tokens:  42_085_041, price: 0.025201 },
    { tokens:  37_034_836, price: 0.029485 },
    { tokens:  32_590_656, price: 0.034498 },
    { tokens:  28_679_777, price: 0.040362 },
    { tokens:  25_238_204, price: 0.047224 },
    { tokens:  22_269_802, price: 0.055252 },
    { tokens:  19_544_465, price: 0.064645 },
    { tokens:  17_199_129, price: 0.075634 },
  ],
  FALLBACK_SOLD_TOKENS: 0,

  /* ===== Claim ===== */
  CLAIM_ENABLED: false,
  CLAIM_CONTRACT: "",
  CLAIM_POLL_INTERVAL_MS: 30000,

  /* ===== API ===== */
  // у проді тримаємо порожнім (використовуємо абсолютні ендпоінти нижче)
  API_BASE: API_BASE_RUNTIME,
  ENDPOINTS: {
    stats:    join(API_BASE_ABS, "/api/presale/stats"),
    feed:     join(API_BASE_ABS, "/api/presale/feed"),
    leaders:  join(API_BASE_ABS, "/api/presale/leaders"),
    purchase: join(API_BASE_ABS, "/api/presale/purchase"),
    claim:    join(API_BASE_ABS, "/api/presale/claim"),
    order:    join(API_BASE_ABS, "/api/order"),
    referral: join(API_BASE_ABS, "/api/referral"),
  },

  __DEBUG: { API_BASE_RUNTIME, API_BASE_ABS, OVERRIDE, IS_LOCAL },
};

/* ===== Runtime-чек (для дебагу) ===== */
if (CONFIG.MIN_BUY_USDT < 1) console.warn("⚠️ MIN_BUY_USDT занадто малий, перевір значення в config.js");
if (!CONFIG.USDT_MASTER || !CONFIG.PRESALE_OWNER_ADDRESS) console.error("❌ Немає ключових TON-адрес у config.js");
if (!(CONFIG.REF_BONUS_PCT >= 0 && CONFIG.REF_BONUS_PCT <= 50)) console.warn("⚠️ REF_BONUS_PCT виглядає підозріло. Рекомендується 0..50%");

if (IS_BROWSER) {
  console.log(
    "[MAGT CONFIG] API_BASE:", CONFIG.API_BASE || "(empty, use absolute endpoints)",
    "API_BASE_ABS:", CONFIG.__DEBUG.API_BASE_ABS,
    "override:", CONFIG.__DEBUG.OVERRIDE || "(none)",
    "is_local:", CONFIG.__DEBUG.IS_LOCAL
  );
}
