// /js/buy.js
import { CONFIG } from "./config.js";
import { buildUsdtTransferTx, buildUsdtTxUsingConnected } from "./ton.js";
import { api, cfgReady, setBtnLoading } from "./utils.js";
import { ui, state } from "./state.js";
import { toast, recalc, refreshButtons, updateRefBonus } from "./ui.js";
import { getWalletAddress, getTonConnect, openConnectModal } from "./tonconnect.js";

/* ---------------- helpers ---------------- */
export function mapTonConnectError(e) {
  const msg = (e?.message || String(e) || "").toLowerCase();
  if (msg.includes("wallet_not_connected") || msg.includes("wallet not connected")) return "Підключи гаманець і спробуй ще раз.";
  if (msg.includes("user reject") || msg.includes("rejected")) return "Користувач скасував підпис.";
  if (msg.includes("manifest")) return "Помилка маніфесту TonConnect. Перевір /tonconnect-manifest.json.";
  if (msg.includes("network") || msg.includes("rpc")) return "Мережна помилка RPC. Спробуй ще раз.";
  return "Скасовано або помилка відправки.";
}

// простенька перевірка TON-адреси (base64url, зазвичай EQ/UQ)
function isTonAddress(addr) {
  if (typeof addr !== "string") return false;
  const a = addr.trim();
  if (!a || !(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
  return /^[A-Za-z0-9_-]{48,68}$/.test(a);
}

/* ===== баланс USDT (довідково) ===== */
export async function getUserUsdtBalance() {
  try {
    const walletAddress = getWalletAddress();
    if (!window.TonWeb || !walletAddress || !cfgReady()) return null;
    const TonWeb = window.TonWeb;
    const provider = new TonWeb.HttpProvider(CONFIG.TON_RPC || "https://toncenter.com/api/v2/jsonRPC");
    const tonweb = new TonWeb(provider);

    const userAddr   = new TonWeb.utils.Address(walletAddress);
    const masterAddr = new TonWeb.utils.Address(CONFIG.USDT_MASTER);

    const JettonMinter = TonWeb.token.jetton.JettonMinter;
    const JettonWallet = TonWeb.token.jetton.JettonWallet;

    const minter = new JettonMinter(tonweb.provider, { address: masterAddr });
    // ✅ правильний метод SDK
    const userJettonWalletAddr = await minter.getJettonWalletAddress(userAddr);
    const userJettonWallet = new JettonWallet(tonweb.provider, { address: userJettonWalletAddr });
    const data = await userJettonWallet.getData();
    const raw = data.balance;
    const dec = CONFIG.JETTON_DECIMALS ?? 6;
    return Number(raw) / (10 ** dec);
  } catch (e) {
    console.warn("getUserUsdtBalance failed:", e?.message || e);
    return null;
  }
}

export async function showDebugJettonInfo() {
  const walletAddress = getWalletAddress();
  if (!window.TonWeb) { console.warn("TonWeb не завантажено."); return; }
  if (!cfgReady()) { console.warn("⚠️ Заповни CONFIG.USDT_MASTER та CONFIG.PRESALE_OWNER_ADDRESS у /js/config.js"); return; }
  if (!walletAddress) return;

  const TonWeb = window.TonWeb;
  const provider = new TonWeb.HttpProvider(CONFIG.TON_RPC || "https://toncenter.com/api/v2/jsonRPC");
  const tonweb = new TonWeb(provider);

  const userAddr     = new TonWeb.utils.Address(walletAddress);
  const masterAddr   = new TonWeb.utils.Address(CONFIG.USDT_MASTER);
  const presaleOwner = new TonWeb.utils.Address(CONFIG.PRESALE_OWNER_ADDRESS);

  const JettonMinter  = TonWeb.token.jetton.JettonMinter;
  const JettonWallet  = TonWeb.token.jetton.JettonWallet;
  const minter = new JettonMinter(tonweb.provider, { address: masterAddr });

  // ✅ правильний метод SDK
  const userJettonWalletAddr    = await minter.getJettonWalletAddress(userAddr);
  const presaleJettonWalletAddr = await minter.getJettonWalletAddress(presaleOwner);

  console.groupCollapsed("%cMAGT Presale • Jetton debug", "color:#65d2ff");
  console.log("USDT master:", masterAddr.toString(true, true, true));
  console.log("Presale owner:", presaleOwner.toString(true, true, true));
  console.log("User address:", userAddr.toString(true, true, true));
  console.log("User USDT wallet:", userJettonWalletAddr.toString(true, true, true));
  console.log("Presale USDT wallet:", presaleJettonWalletAddr.toString(true, true, true));
  console.groupEnd();

  try {
    const userJettonWallet = new JettonWallet(tonweb.provider, { address: userJettonWalletAddr });
    const data = await userJettonWallet.getData();
    const raw = data.balance;
    const dec = CONFIG.JETTON_DECIMALS ?? 6;
    const human = Number(raw) / (10 ** dec);
    console.log(`USDT balance (user): ${human}`);
  } catch (e) {
    console.warn("Не вдалось прочитати баланс USDT у користувача:", e?.message || e);
  }
}

/* ===== бекенд-пінг покупки ===== */
export async function postPurchaseToApi({ usd, tokens, address, ref }) {
  const url = api(CONFIG.ENDPOINTS?.purchase);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usd, tokens, address, ref })
    });
  } catch (e) {
    console.warn("purchase POST failed:", e);
  }
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

/* ===== основний клік BUY ===== */
let _buyInFlight = false;

export async function onBuyClick() {
  if (_buyInFlight) return; // антидубль
  _buyInFlight = true;

  const walletAddress = getWalletAddress();
  const tonConnectUI = getTonConnect();

  if (!walletAddress || !tonConnectUI) {
    openConnectModal();
    _buyInFlight = false;
    return toast("Підключи гаманець");
  }

  if (!ui?.agree?.checked) { _buyInFlight = false; return toast("Підтверди правила пресейлу"); }

  // нормалізуємо USD
  const usdRaw = ui.usdtIn?.value || 0;
  const usd = Math.max(0, Math.round(Number(String(usdRaw).replace(",", ".")) * 100) / 100);
  const minBuy = Number(CONFIG.MIN_BUY_USDT || 0);
  if (!(usd >= minBuy)) { _buyInFlight = false; return toast(`Мінімум $${minBuy}`); }

  if (!cfgReady()) { _buyInFlight = false; return toast("⚠️ Заповни USDT_MASTER і PRESALE_OWNER_ADDRESS у /js/config.js"); }
  if (!window.TonWeb) { _buyInFlight = false; return toast("TonWeb не завантажено (перевір <script src=tonweb...> у <head>)"); }

  // === реферал
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

  try {
    setBtnLoading(ui.btnBuy, true, "Підпис…");
    toast("Готуємо транзакцію…");

    window.__referrer = ref || null;

    // ✅ новий зручний виклик: адресу беремо з TonConnect автоматично
    let tx;
    try {
      tx = await buildUsdtTxUsingConnected(usd, ref);
    } catch {
      // фолбек на старий підпис (на випадок кешованого ton.js)
      tx = await buildUsdtTransferTx(walletAddress, usd, ref);
    }

    toast("Підтверди платіж у гаманці…");
    const res = await tonConnectUI.sendTransaction(tx);
    console.log("USDT transfer sent:", res);
    toast("Успіх! Платіж відправлено.");

    // ДИНАМІЧНА ціна від рівня (якщо задано у вікні) або конфіг
    const dynPrice = Number(window.__magtPriceUsd || CONFIG.PRICE_USD || 0.00383);
    const tokensBought = dynPrice > 0 ? Math.floor(usd / dynPrice) : 0;

    // миттєво показуємо у UI «Доступно: N MAGT»
    updateClaimUI(tokensBought);

    // подія для маскота/фідів
    if (CONFIG.REF_DEBUG_DEMO !== false) {
      window.dispatchEvent(new CustomEvent("magt:purchase", {
        detail: { usd, tokens: tokensBought, address: walletAddress, ref: ref || null }
      }));
    }

    // бекенд (не блокує)
    postPurchaseToApi({ usd, tokens: tokensBought, address: walletAddress, ref });

    // оновити форму
    ui.usdtIn.value = "";
    recalc();
    updateRefBonus?.();
  } catch (e) {
    console.error(e);
    toast(mapTonConnectError(e));
  } finally {
    setBtnLoading(ui.btnBuy, false);
    refreshButtons();
    _buyInFlight = false;
  }
}
