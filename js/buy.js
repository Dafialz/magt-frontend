// /js/buy.js
import { CONFIG } from "./config.js";
import { buildUsdtTransferTx, buildUsdtTxUsingConnected, pushPurchaseToBackend, RPC_URL } from "./ton.js";
import { cfgReady, setBtnLoading } from "./utils.js";
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

// локальна перевірка підключення, безпечна щодо різних версій SDK
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

/* ===== баланс USDT (довідково) ===== */
/** Надійне читання балансу USDT: через runGetMethod(get_wallet_data) на /api/rpc */
export async function getUserUsdtBalance() {
  try {
    const walletAddress = getWalletAddress();
    if (!window.TonWeb || !walletAddress || !cfgReady()) return null;

    const TonWeb = window.TonWeb;
    const provider = new TonWeb.HttpProvider(RPC_URL); // наш проксі
    const tonweb = new TonWeb(provider);

    const userAddr   = new TonWeb.utils.Address(walletAddress);
    const masterAddr = new TonWeb.utils.Address(CONFIG.USDT_MASTER);

    const JettonMinter = TonWeb.token.jetton.JettonMinter;
    const minter = new JettonMinter(tonweb.provider, { address: masterAddr });

    // 1) адреса USDT-джеттон-гаманця користувача
    const userJettonWalletAddr = await minter.getJettonWalletAddress(userAddr);
    const jw = userJettonWalletAddr.toString(true, true, false); // urlSafe, non-bounce

    // 2) напряму викликаємо get_wallet_data
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "runGetMethod",
        params: { address: jw, method: "get_wallet_data", stack: [] }
      })
    });

    const json = await res.json();
    const stack =
      json?.result?.stack ||
      json?.result?.data?.stack ||
      json?.stack ||
      null;

    if (!Array.isArray(stack) || stack.length === 0) return null;

    // balance може бути як hex/uint256, так і числом
    const raw0 = stack[0];
    let hexRaw = (raw0 && (raw0[1] ?? raw0.value ?? raw0.number)) ?? "";
    if (typeof hexRaw === "number") hexRaw = "0x" + hexRaw.toString(16);
    const hex = String(hexRaw).startsWith("0x") ? String(hexRaw) : "0x" + String(hexRaw);
    const balanceUnits = BigInt(hex);
    const dec = Number(CONFIG.JETTON_DECIMALS ?? 6);
    const human = Number(balanceUnits) / 10 ** dec;

    return human;
  } catch (e) {
    console.warn("getUserUsdtBalance failed (manual runGetMethod):", e?.message || e);
    return null;
  }
}

export async function showDebugJettonInfo() {
  const walletAddress = getWalletAddress();
  if (!window.TonWeb) { console.warn("TonWeb не завантажено."); return; }
  if (!cfgReady()) { console.warn("⚠️ Заповни CONFIG.USDT_MASTER та CONFIG.PRESALE_OWNER_ADDRESS у /js/config.js"); return; }
  if (!walletAddress) return;

  const TonWeb = window.TonWeb;
  // ⛳ лише через наш бекенд-проксі
  const provider = new TonWeb.HttpProvider(RPC_URL);
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

  // Спроба зчитати баланс: спершу через наш ручний метод (щоб уникати parse errors)
  try {
    const jw = userJettonWalletAddr.toString(true, true, false);
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "runGetMethod",
        params: { address: jw, method: "get_wallet_data", stack: [] }
      })
    });
    const json = await res.json();
    const stack = json?.result?.stack || json?.result?.data?.stack || json?.stack || [];
    const hexRaw = (stack[0] && (stack[0][1] ?? stack[0].value ?? stack[0].number)) ?? "0x0";
    const hex = String(hexRaw).startsWith("0x") ? String(hexRaw) : "0x" + String(hexRaw);
    const balanceUnits = BigInt(hex);
    const dec = Number(CONFIG.JETTON_DECIMALS ?? 6);
    const human = Number(balanceUnits) / 10 ** dec;
    console.log(`USDT balance (user): ${human}`);
  } catch (e) {
    // як fallback — стара TonWeb-логіка (на випадок, якщо бекенд повернув інший формат)
    try {
      const userJettonWallet = new JettonWallet(tonweb.provider, { address: userJettonWalletAddr });
      const data = await userJettonWallet.getData();
      const raw = data.balance;
      const dec = CONFIG.JETTON_DECIMALS ?? 6;
      const human = Number(raw) / (10 ** dec);
      console.log(`USDT balance (user, fallback TonWeb): ${human}`);
    } catch (e2) {
      console.warn("Не вдалось прочитати баланс USDT у користувача:", e2?.message || e2);
    }
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

/* ===== warmup: ініціалізація JettonWallet простим TON-переказом ===== */
async function buildWarmupTxToUserJettonWallet() {
  if (!window.TonWeb) throw new Error("TonWeb не завантажено");
  const TonWeb = window.TonWeb;

  const walletAddress = getWalletAddress();
  if (!walletAddress) throw new Error("WALLET_NOT_CONNECTED");
  if (!cfgReady()) throw new Error("CONFIG_NOT_READY");

  const provider = new TonWeb.HttpProvider(RPC_URL);
  const tonweb = new TonWeb(provider);

  const userAddr   = new TonWeb.utils.Address(walletAddress);
  const masterAddr = new TonWeb.utils.Address(CONFIG.USDT_MASTER);
  const JettonMinter = TonWeb.token.jetton.JettonMinter;
  const minter = new JettonMinter(tonweb.provider, { address: masterAddr });

  const userJettonWalletAddr = await minter.getJettonWalletAddress(userAddr);

  const openTon = TonWeb.utils.toNano(String(CONFIG.JETTON_WALLET_TON ?? 0.25));
  // порожній payload: просто ініціалізаційний переказ
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: userJettonWalletAddr.toString(true, true, false),
        amount: openTon.toString(),
      },
    ],
  };
}

/* ===== утиліти очікування/конвертації ===== */
function toUnits(usd, dec = Number(CONFIG.USDT_DECIMALS ?? 6)) {
  const s = String(usd).replace(",", ".");
  const n = Math.round(Number(s) * 10 ** dec);
  return BigInt(Number.isFinite(n) ? n : 0);
}
async function pollUntil(fn, { timeoutMs = 60000, everyMs = 2000 } = {}) {
  const t0 = Date.now();
  while (true) {
    const ok = await fn();
    if (ok) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise(r => setTimeout(r, everyMs));
  }
}
async function waitUsdtWalletReady({ timeoutMs = 20000, everyMs = 1500 } = {}) {
  return pollUntil(async () => (await getUserUsdtBalance()) !== null, { timeoutMs, everyMs });
}

/* ===== основний клік BUY ===== */
let _buyInFlight = false;

export async function onBuyClick() {
  if (_buyInFlight) return; // антидубль
  _buyInFlight = true;

  const walletAddress = getWalletAddress();
  const tonConnectUI = getTonConnect();

  // якщо SDK ще не піднявся — просимо підключити гаманець
  if (!tonConnectUI || !walletAddress || !isConnected(tonConnectUI)) {
    await openConnectModal();
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

    // === PRE-FLIGHT: чи готовий USDT JettonWallet
    let usdtBalBefore = await getUserUsdtBalance(); // null => не ініціалізований/не читається

    // Одноразовий warm-up (0.25 TON) + очікування готовності, без потреби тиснути ще раз
    if (usdtBalBefore === null) {
      toast("Активуємо USDT-гаманець (одноразово 0.25 TON)…");
      const warmupTx = await buildWarmupTxToUserJettonWallet();
      await tonConnectUI.sendTransaction(warmupTx);
      toast("Чекаємо підтвердження ініціалізації…");
      const ready = await waitUsdtWalletReady({ timeoutMs: 20000, everyMs: 1500 });
      if (!ready) {
        setBtnLoading(ui.btnBuy, false);
        refreshButtons();
        _buyInFlight = false;
        return toast("USDT-гаманець активовано, але мережа ще не підтвердила. Спробуй ще раз за хвилинку.");
      }
      // після warm-up перевіряємо баланс знов
      usdtBalBefore = (await getUserUsdtBalance()) ?? 0;
    }

    window.__referrer = ref || null;

    // ✅ будуємо Jetton transfer
    let tx;
    try {
      tx = await buildUsdtTxUsingConnected(usd, ref);
    } catch {
      tx = await buildUsdtTransferTx(walletAddress, usd, ref);
    }

    toast("Підтверди платіж у гаманці…");
    const res = await tonConnectUI.sendTransaction(tx);
    console.log("USDT transfer sent:", res);
    toast("Платіж відправлено в мережу. Чекаємо підтвердження…");

    // ===== ПІДТВЕРДЖЕННЯ СПИСАННЯ USDT (до 60с) =====
    const expectedUnits = toUnits(usd);
    const ok = await pollUntil(async () => {
      const now = await getUserUsdtBalance();
      if (now === null) return false; // ще не читається
      const beforeUnits = toUnits(usdtBalBefore);
      const nowUnits = toUnits(now);
      return beforeUnits - nowUnits >= expectedUnits;
    }, { timeoutMs: 60000, everyMs: 2000 });

    if (!ok) {
      toast("Не бачу списання USDT поки що. Якщо кошти спишуться пізніше — токени нарахуються автоматично.");
      return; // не оновлюємо бейдж/бекенд поки не впевнилися
    }

    // ===== СПИСАННЯ ПІДТВЕРДЖЕНО — оновлюємо локальний бейдж і пушимо бекенд =====
    const dynPrice = Number(window.__magtPriceUsd || CONFIG.PRICE_USD || 0.00383);
    const tokensBought = dynPrice > 0 ? Math.floor(usd / dynPrice) : 0;

    updateClaimUI(tokensBought);

    if (CONFIG.REF_DEBUG_DEMO !== false) {
      window.dispatchEvent(new CustomEvent("magt:purchase", {
        detail: { usd, tokens: tokensBought, address: walletAddress, ref: ref || null }
      }));
    }

    pushPurchaseToBackend({ usd, tokens: tokensBought, address: walletAddress, ref });

    ui.usdtIn.value = "";
    recalc();
    updateRefBonus?.();
    toast("Готово. MAGT нараховано.");
  } catch (e) {
    console.error(e);
    toast(mapTonConnectError(e));
  } finally {
    setBtnLoading(ui.btnBuy, false);
    refreshButtons();
    _buyInFlight = false;
  }
}
