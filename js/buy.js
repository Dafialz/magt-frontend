
// /js/buy.js
import { CONFIG } from "./config.js";
import {
buildUsdtTransferTx,
buildUsdtTxUsingConnected,
pushPurchaseToBackend,
RPC\_URL
} from "./ton.js";
import { cfgReady, setBtnLoading } from "./utils.js";
import { ui, state } from "./state.js";
import { toast, recalc, refreshButtons, updateRefBonus } from "./ui.js";
import { getWalletAddress, getTonConnect, openConnectModal } from "./tonconnect.js";

/\* ---------------- helpers ---------------- \*/
export function mapTonConnectError(e) {
const raw = e?.message || String(e) || "";
const msg = raw\.toLowerCase();
if (msg.includes("wallet\_not\_connected") || msg.includes("wallet not connected")) return "Підключи гаманець і спробуй ще раз.";
if (msg.includes("user reject") || msg.includes("rejected")) return "Користувач скасував підпис.";
if (msg.includes("manifest")) return "Помилка маніфесту TonConnect. Перевір /tonconnect-manifest.json.";
if (msg.includes("network") || msg.includes("rpc") || msg.includes("failed to fetch")) return "Мережна помилка RPC. Спробуй ще раз.";
return "Скасовано або помилка відправки.";
}

function isTonAddress(addr) {
if (typeof addr !== "string") return false;
const a = addr.trim();
if (!a || !(a.startsWith("EQ") || a.startsWith("UQ"))) return false;
return /^\[A-Za-z0-9\_-]{48,68}\$/.test(a);
}

function isConnected(ui) {
return Boolean(
ui?.account?.address ||
ui?.state?.account?.address ||
ui?.wallet?.account?.address ||
ui?.connector?.wallet?.account?.address ||
ui?.tonConnect?.account?.address ||
ui?.\_wallet?.account?.address
);
}

/\* ===== баланс USDT (через бекенд-проксі /api/rpc) ===== */
/*\* Читаємо баланс по КОЖНОМУ майстру і беремо максимум \*/
export async function getUserUsdtBalance() {
try {
const walletAddress = getWalletAddress();
if (!window\.TonWeb || !walletAddress || !cfgReady()) return null;

```
const TonWeb = window.TonWeb;
const provider = new TonWeb.HttpProvider(RPC_URL);
const tonweb = new TonWeb(provider);

const userAddr = new TonWeb.utils.Address(walletAddress);
const JettonMinter = TonWeb.token.jetton.JettonMinter;

const masters = (Array.isArray(CONFIG.USDT_MASTERS) && CONFIG.USDT_MASTERS.length
  ? CONFIG.USDT_MASTERS
  : [CONFIG.USDT_MASTER]
).map(s => String(s || "").trim()).filter(Boolean);

if (!masters.length) return null;

let bestHuman = 0;
const dec = Number(CONFIG.JETTON_DECIMALS ?? 6);

for (const m of masters) {
  try {
    const masterAddr = new TonWeb.utils.Address(m);
    const minter = new JettonMinter(tonweb.provider, { address: masterAddr });
    const userJettonWalletAddr = await minter.getJettonWalletAddress(userAddr);
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

    if (!Array.isArray(stack) || stack.length === 0) continue;

    const raw0 = stack[0];
    let hexRaw = (raw0 && (raw0[1] ?? raw0.value ?? raw0.number)) ?? "";
    if (typeof hexRaw === "number") hexRaw = "0x" + hexRaw.toString(16);
    const hex = String(hexRaw).startsWith("0x") ? String(hexRaw) : "0x" + String(hexRaw);
    const balanceUnits = BigInt(hex);
    const human = Number(balanceUnits) / 10 ** dec;
    if (human > bestHuman) bestHuman = human;
  } catch (e) {
    console.warn("getUserUsdtBalance per-master fail:", m, e?.message || e);
  }
}

return bestHuman;
```

} catch (e) {
console.warn("getUserUsdtBalance failed:", e?.message || e);
return null;
}
}

export async function showDebugJettonInfo() {
const walletAddress = getWalletAddress();
if (!window\.TonWeb) { console.warn("TonWeb не завантажено."); return; }
if (!cfgReady()) { console.warn("⚠️ Заповни CONFIG.USDT\_MASTER та CONFIG.PRESALE\_OWNER\_ADDRESS у /js/config.js"); return; }
if (!walletAddress) return;

const TonWeb = window\.TonWeb;
const provider = new TonWeb.HttpProvider(RPC\_URL);
const tonweb = new TonWeb(provider);

const userAddr     = new TonWeb.utils.Address(walletAddress);
const masterAddr   = new TonWeb.utils.Address(CONFIG.USDT\_MASTER);
const presaleOwner = new TonWeb.utils.Address(CONFIG.PRESALE\_OWNER\_ADDRESS);

const JettonMinter  = TonWeb.token.jetton.JettonMinter;
const minter = new JettonMinter(tonweb.provider, { address: masterAddr });

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
const jw = userJettonWalletAddr.toString(true, true, false);
const res = await fetch(RPC\_URL, {
method: "POST",
headers: { "content-type": "application/json" },
body: JSON.stringify({
method: "runGetMethod",
params: { address: jw, method: "get\_wallet\_data", stack: \[] }
})
});
const json = await res.json();
const stack = json?.result?.stack || json?.result?.data?.stack || json?.stack || \[];
const hexRaw = (stack\[0] && (stack\[0]\[1] ?? stack\[0].value ?? stack\[0].number)) ?? "0x0";
const hex = String(hexRaw).startsWith("0x") ? String(hexRaw) : "0x" + String(hexRaw);
const balanceUnits = BigInt(hex);
const dec = Number(CONFIG.JETTON\_DECIMALS ?? 6);
const human = Number(balanceUnits) / 10 \*\* dec;
console.log(`USDT balance (user): ${human}`);
} catch (e2) {
console.warn("Не вдалось прочитати баланс USDT у користувача:", e2?.message || e2);
}
}

/\* ===== локальний CLAIM (для миттєвого бейджа) ===== \*/
function bumpLocalClaim(tokens) {
try {
const key = "magt\_claim\_local";
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

/\* ===== утиліти очікування/конвертації ===== \*/
function toUnits(usd, dec = Number(CONFIG.USDT\_DECIMALS ?? 6)) {
const s = String(usd).replace(",", ".");
const n = Math.round(Number(s) \* 10 \*\* dec);
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

/\* ===== основний клік BUY ===== \*/
let \_buyInFlight = false;

export async function onBuyClick() {
if (\_buyInFlight) return; // антидубль
\_buyInFlight = true;

const walletAddress = getWalletAddress();
const tonConnectUI = getTonConnect();

if (!tonConnectUI || !walletAddress || !isConnected(tonConnectUI)) {
await openConnectModal();
\_buyInFlight = false;
return toast("Підключи гаманець");
}

if (!ui?.agree?.checked) { \_buyInFlight = false; return toast("Підтверди правила пресейлу"); }

const usdRaw = ui.usdtIn?.value || 0;
const usd = Math.max(0, Math.round(Number(String(usdRaw).replace(",", ".")) \* 100) / 100);
const minBuy = Number(CONFIG.MIN\_BUY\_USDT || 0);
if (!(usd >= minBuy)) { \_buyInFlight = false; return toast(`Мінімум $${minBuy}`); }

if (!cfgReady()) { \_buyInFlight = false; return toast("⚠️ Заповни USDT\_MASTER і PRESALE\_OWNER\_ADDRESS у /js/config.js"); }
if (!window\.TonWeb) { \_buyInFlight = false; return toast("TonWeb не завантажено (перевір <script src=tonweb...> у <head>)"); }

// === реферал
let ref = null;
if (state?.referrer && isTonAddress(state.referrer)) ref = state.referrer.trim();
if (!ref) ref = (new URLSearchParams(location.search)).get("ref")?.trim() || null;
if (!ref) {
try {
const saved = localStorage.getItem("magt\_ref");
if (isTonAddress(saved)) ref = saved.trim();
} catch {}
}
if (!isTonAddress(ref || "")) ref = null;
if (ref && CONFIG.REF\_SELF\_BAN && typeof walletAddress === "string" && walletAddress.trim() === ref) {
console.warn("Self-ref detected — ref cleared by REF\_SELF\_BAN");
ref = null;
}

try {
setBtnLoading(ui.btnBuy, true, "Підпис…");
toast("Готуємо транзакцію…");

```
const usdtBalBefore = await getUserUsdtBalance();
console.log("[BUY] usdt balance before =", usdtBalBefore);

window.__referrer = ref || null;

let tx;
try {
  tx = await buildUsdtTxUsingConnected(usd, ref);
} catch {
  tx = await buildUsdtTransferTx(walletAddress, usd, ref);
}

// Нормалізуємо адресу одержувача → EQ (bounceable)
try {
  const TonWeb = window.TonWeb;
  const A = TonWeb?.utils?.Address;
  if (A && tx?.messages?.[0]?.address) {
    const addrObj = new A(tx.messages[0].address);
    tx.messages[0].address = addrObj.toString(true, true, true);
  }
} catch (eAddr) {
  console.warn("Address normalize warning:", eAddr?.message || eAddr);
}

if (!tx?.messages?.[0]?.payload) {
  throw new Error("TX_WITHOUT_PAYLOAD");
}

console.log("[BUY] TonConnect tx =", tx);
toast("Підтверди платіж у гаманці…");
const res = await tonConnectUI.sendTransaction(tx);
console.log("[BUY] USDT transfer sent →", res);
toast("Платіж відправлено в мережу. Чекаємо підтвердження…");

// Пулінг списання (з урахуванням мульти-майстрів)
const expectedUnits = toUnits(usd);
const ok = await pollUntil(async () => {
  const now = await getUserUsdtBalance();
  console.log("[BUY] poll balance:", now, "(before:", usdtBalBefore, ")");
  if (now === null || usdtBalBefore === null) return false;
  const beforeUnits = toUnits(usdtBalBefore);
  const nowUnits = toUnits(now);
  return beforeUnits - nowUnits >= expectedUnits;
}, { timeoutMs: 60000, everyMs: 2000 });

if (!ok) {
  toast("Не бачу списання USDT поки що. Якщо кошти спишуться пізніше — токени нарахуються автоматично.");
  return;
}

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
```

} catch (e) {
console.error(e);
toast(mapTonConnectError(e));
} finally {
setBtnLoading(ui.btnBuy, false);
refreshButtons();
\_buyInFlight = false;
}
}
