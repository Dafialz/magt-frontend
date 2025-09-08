// /js/buy.js  (TON-only)
import { CONFIG } from "./config.js";
import { pushPurchaseToBackend } from "./ton.js";
import { setBtnLoading } from "./utils.js";
import { ui, state } from "./state.js";
import { toast, recalc, refreshButtons, updateRefBonus } from "./ui.js";
import { getWalletAddress, getTonConnect, openConnectModal } from "./tonconnect.js";

/* ---------------- helpers ---------------- */
function isTonEqUq(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  return !!a && (a.startsWith("EQ") || a.startsWith("UQ")) && /^[A-Za-z0-9_-]{48,68}$/.test(a);
}

function getTonInput() {
  return (
    document.getElementById("tonIn") ||
    document.querySelector("[data-ton-in]") ||
    document.querySelector("input[name='ton']") ||
    null
  );
}
function getAgree() {
  return document.getElementById("agree") || document.querySelector("[data-agree]") || null;
}
function u8ToBase64(u8) {
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin);
}
async function ensureTonWeb() {
  if (!window.TonWeb) {
    await import("https://cdn.jsdelivr.net/npm/tonweb@0.0.66/dist/tonweb.min.js");
  }
  return window.TonWeb;
}

/* <-- ВАЖЛИВО: тепер експортована функція */
export function mapTonConnectError(e) {
  const raw = e?.message || String(e) || "";
  const msg = raw.toLowerCase();
  if (msg.includes("wallet_not_connected") || msg.includes("wallet not connected")) return "Підключи гаманець і спробуй ще раз.";
  if (msg.includes("user reject") || msg.includes("rejected")) return "Користувач скасував підпис.";
  if (msg.includes("manifest")) return "Помилка маніфесту TonConnect. Перевір /tonconnect-manifest.json.";
  if (msg.includes("network") || msg.includes("rpc") || msg.includes("failed to fetch")) return "Мережна помилка RPC. Спробуй ще раз.";
  return "Скасовано або помилка відправки.";
}
/* --> */

/* ===== локальний CLAIM бейдж (як і раніше) ===== */
function bumpLocalClaim(tokens) {
  try {
    const key = "magt_claim_local";
    const cur = Number(localStorage.getItem(key) || "0");
    const next = cur + Number(tokens || 0);
    localStorage.setItem(key, String(next));
    return next;
  } catch { return null; }
}
function updateClaimUI(tokensAdded) {
  const next = bumpLocalClaim(tokensAdded);
  const badge = document.getElementById("claim-badge");
  const info = document.getElementById("claim-info");
  if (badge) badge.textContent = (next ?? tokensAdded).toLocaleString("en-US");
  if (info) info.classList.remove("hidden");
}

/* ===== Побудова TON-транзакції на пресейл ===== */
async function buildTonPurchaseTx(tonAmount, refAddr) {
  const TonWeb = await ensureTonWeb();

  const dest = (CONFIG.PRESALE_ADDRESS || CONFIG.PRESALE_OWNER_ADDRESS || "").trim();
  if (!dest) throw new Error("Не задано PRESALE_ADDRESS / PRESALE_OWNER_ADDRESS у config.js");

  const amount = Number(tonAmount);
  if (!Number.isFinite(amount) || !(amount > 0)) throw new Error("Некоректна сума TON");

  // короткий коментар у payload
  const buyer = (window.__magtAddr || getWalletAddress() || "").trim();
  const A = TonWeb.utils.Address;
  const buyerB64 = buyer ? new A(buyer).toString(true, true, true) : "-";
  let refB64 = "-";
  if (refAddr) {
    try { refB64 = new A(refAddr).toString(true, true, true); } catch {}
  }
  const ts = Date.now();
  const nonce = (Math.floor(Math.random() * 1e9) >>> 0);
  const short = (s) => (s && s !== "-" ? `${s.slice(0,6)}..${s.slice(-6)}` : "-");
  const note = `MAGT|b=${short(buyerB64)}|r=${short(refB64)}|t=${ts}|n=${nonce}`;

  const cell = new TonWeb.boc.Cell();
  cell.bits.writeUint(0, 32);
  cell.bits.writeString(note);

  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: new A(dest).toString(true, true, false), // EQ bounceable
        amount: TonWeb.utils.toNano(String(amount)).toString(),
        payload: u8ToBase64(await cell.toBoc(false)),
      },
    ],
  };
}

/* ===== основний клік BUY (TON-only) ===== */
let _buyInFlight = false;

export async function onBuyClick() {
  if (_buyInFlight) return;
  _buyInFlight = true;

  const walletAddress = getWalletAddress();
  const tonConnectUI = getTonConnect();

  // підключення
  if (!tonConnectUI || !walletAddress) {
    await openConnectModal();
    _buyInFlight = false;
    return toast("Підключи гаманець");
  }
  if (!ui?.agree?.checked && getAgree()) {
    _buyInFlight = false;
    return toast("Підтверди правила пресейлу");
  }

  // сума TON
  const tonEl = getTonInput();
  const raw = String(tonEl?.value || "").replace(",", ".").trim();
  const ton = Math.max(0, Number(raw));
  const minTon = Number(CONFIG.MIN_BUY_TON || 0.1);
  if (!(ton > 0) || ton < minTon) {
    _buyInFlight = false;
    return toast(`Мінімум ${minTon} TON`);
  }

  // реферал
  let ref = null;
  if (state?.referrer && isTonEqUq(state.referrer)) ref = state.referrer.trim();
  if (!ref) {
    try {
      const qRef = new URLSearchParams(location.search).get("ref") || "";
      if (isTonEqUq(qRef)) ref = qRef.trim();
    } catch {}
  }
  if (!ref) {
    try {
      const saved = localStorage.getItem("magt_ref") || "";
      if (isTonEqUq(saved)) ref = saved.trim();
    } catch {}
  }
  if (ref && CONFIG.REF_SELF_BAN && walletAddress && walletAddress.trim() === ref) ref = null;
  try { window.__referrer = ref || null; } catch {}

  try {
    setBtnLoading(ui.btnBuy, true, "Підпис…");
    toast("Готуємо транзакцію…");

    const tx = await buildTonPurchaseTx(ton, ref);
    toast("Підтверди платіж у гаманці…");
    const res = await tonConnectUI.sendTransaction(tx);
    console.log("[BUY TON] sent:", res);

    // Оцінка куплених токенів для локального бейджа/фіду
    const priceTon = Number(window.__CURRENT_PRICE_TON ?? CONFIG.PRICE_TON ?? 0);
    const tokensBought = priceTon > 0 ? Math.floor(ton / priceTon) : 0;

    updateClaimUI(tokensBought);

    // демо-фід і реф-лідерборд (локально)
    try {
      window.dispatchEvent(
        new CustomEvent("magt:purchase", {
          detail: { usd: 0, tokens: tokensBought, address: walletAddress, ref: ref || null },
        })
      );
    } catch {}

    // пуш у бекенд (якщо є ENDPOINTS.purchase)
    pushPurchaseToBackend({ usd: 0, tokens: tokensBought, address: walletAddress, ref });

    // очистити інпут і оновити UI
    if (tonEl) tonEl.value = "";
    recalc();
    updateRefBonus?.();
    toast("Готово. Транзакцію відправлено в мережу.");

  } catch (e) {
    console.error(e);
    toast(mapTonConnectError(e));
  } finally {
    setBtnLoading(ui.btnBuy, false);
    refreshButtons();
    _buyInFlight = false;
  }
}
