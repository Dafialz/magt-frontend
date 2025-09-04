// /js/buy.js
import { CONFIG } from "./config.js";
import { cfgReady, setBtnLoading } from "./utils.js";
import { ui, state } from "./state.js";
import { toast, recalc, refreshButtons, updateRefBonus } from "./ui.js";
import { getWalletAddress, getTonConnect, openConnectModal } from "./tonconnect.js";

/* ---------------- helpers ---------------- */
export function mapTonConnectError(e) {
  const raw = e?.message || String(e) || "";
  const msg = raw.toLowerCase();
  if (msg.includes("wallet_not_connected") || msg.includes("wallet not connected")) return "Підключи гаманець і спробуй ще раз.";
  if (msg.includes("user reject") || msg.includes("rejected")) return "Користувач скасував підпис.";
  if (msg.includes("manifest")) return "Помилка маніфесту TonConnect. Перевір /tonconnect-manifest.json.";
  if (msg.includes("network") || msg.includes("rpc") || msg.includes("failed to fetch")) return "Мережна помилка RPC. Спробуй ще раз.";
  return "Скасовано або помилка відправки.";
}

function isTonAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (!a || !(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
  return /^[A-Za-z0-9_-]{48,68}$/.test(a);
}

function isConnected(ui) {
  return Boolean(
    ui?.account?.address ||
    ui?.state?.account?.address ||
    ui?.wallet?.account?.address ||
    ui?.connector?.wallet?.account?.address ||
    ui?.tonConnect?.account?.address ||
    ui?._wallet?.account?.address
  );
}

/* ===== локальний CLAIM (для миттєвого бейджа) ===== */
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
  const info  = document.getElementById("claim-info");
  if (badge) badge.textContent = (next ?? tokensAdded).toLocaleString("en-US");
  if (info)  info.classList.remove("hidden");
}

/* ===== утиліти ===== */
// Коректне перетворення "0.123456789" TON → нанотони (BigInt)
function toNanoStr(tonStr) {
  const s = String(tonStr ?? "").trim().replace(",", ".");
  if (!s) return "0";
  const [intPartRaw, fracRaw0 = ""] = s.split(".");
  const intPart = intPartRaw.replace(/\D/g, "") || "0";
  const frac9 = (fracRaw0 + "000000000").slice(0, 9).replace(/\D/g, "");
  const bi = (BigInt(intPart) * 1000000000n) + BigInt(frac9 || "0");
  return bi.toString(); // TonConnect очікує рядок нанотонів
}

/* ===== основний клік BUY (TON → пресейл) ===== */
let _buyInFlight = false;

export async function onBuyClick() {
  if (_buyInFlight) return; // антидубль
  _buyInFlight = true;

  const walletAddress = getWalletAddress();
  const tonConnectUI = getTonConnect();

  if (!tonConnectUI || !walletAddress || !isConnected(tonConnectUI)) {
    await openConnectModal();
    _buyInFlight = false;
    return toast("Підключи гаманець");
  }

  if (!ui?.agree?.checked) { _buyInFlight = false; return toast("Підтверди правила пресейлу"); }

  // Вводимо суму в TON: спроба взяти з tonIn; якщо немає — fallback на usdtIn як тимчасове поле.
  const tonRaw = (ui.tonIn?.value ?? ui.usdtIn?.value ?? 0);
  const ton = Math.max(0, Number(String(tonRaw).replace(",", ".")));
  const minTon = Number(CONFIG.MIN_BUY_TON ?? 0);
  if (!(ton > 0 && ton >= minTon)) {
    _buyInFlight = false;
    return toast(minTon > 0 ? `Мінімум ${minTon} TON` : "Вкажи суму в TON");
  }

  // Перевірка наявності адреси пресейлу
  const presaleAddr = String(CONFIG.PRESALE_ADDRESS || "").trim();
  if (!/^E[QU][A-Za-z0-9_-]{46,66}$/.test(presaleAddr)) {
    _buyInFlight = false;
    return toast("⚠️ Вкажи PRESALE_ADDRESS у /js/config.js (адреса контракту пресейлу)");
  }

  // === реферал (збираємо і кешимо, але на кроці 1 payload НЕ додаємо)
  let ref = null;
  if (state?.referrer && isTonAddress(state.referrer)) ref = state.referrer.trim();
  if (!ref) ref = (new URLSearchParams(location.search)).get("ref")?.trim() || null;
  if (!ref) {
    try {
      const saved = localStorage.getItem("magt_ref");
      if (isTonAddress(saved)) ref = saved.trim();
    } catch {}
  }
  if (!isTonAddress(ref || "")) ref = null;
  if (ref && CONFIG.REF_SELF_BAN && typeof walletAddress === "string" && walletAddress.trim() === ref) {
    console.warn("Self-ref detected — ref cleared by REF_SELF_BAN");
    ref = null;
  }
  window.__referrer = ref || null;

  try {
    setBtnLoading(ui.btnBuy, true, "Підпис…");
    toast("Готуємо транзакцію…");

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: presaleAddr,                  // ← контракт пресейлу
          amount: toNanoStr(ton),                // сума в нанотонах (рядок)
          // КРОК 1: payload відсутній (Buy без ref приймається як простий вхідний TON)
          // КРОК 2 (наступний): додамо payload для Buy{ref}
        }
      ]
    };

    console.log("[BUY] TonConnect tx =", tx);
    toast("Підтверди платіж у гаманці…");
    const res = await tonConnectUI.sendTransaction(tx);
    console.log("[BUY] TON transfer sent →", res);
    toast("Платіж відправлено в мережу. Чекаємо нарахування MAGT…");

    // Оцінка кількості токенів (лише для UI бейджа, якщо відома ціна в TON)
    const priceTon = Number(CONFIG.PRICE_TON ?? 0);
    const tokensBought = priceTon > 0 ? Math.floor(ton / priceTon) : 0;
    if (tokensBought > 0) {
      updateClaimUI(tokensBought);
      window.dispatchEvent(new CustomEvent("magt:purchase", {
        detail: { ton, tokens: tokensBought, address: walletAddress, ref: ref || null }
      }));
    }

    // Очистка інпута і оновлення UI
    if (ui.tonIn) ui.tonIn.value = "";
    else if (ui.usdtIn) ui.usdtIn.value = ""; // fallback, якщо використовуєш старе поле
    recalc?.();
    updateRefBonus?.();
    toast("Готово. MAGT скоро буде на гаманці.");
  } catch (e) {
    console.error(e);
    toast(mapTonConnectError(e));
  } finally {
    setBtnLoading(ui.btnBuy, false);
    refreshButtons();
    _buyInFlight = false;
  }
}
