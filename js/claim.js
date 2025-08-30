// /js/claim.js
import { CONFIG } from "./config.js";
import { buildClaimTx } from "./ton.js"; // ок, якщо його немає — нижче fallback
import { api, setBtnLoading } from "./utils.js";
import { ui } from "./state.js";
import { toast } from "./ui.js";
import { getWalletAddress, getTonConnect, openConnectModal } from "./tonconnect.js";
import { mapTonConnectError } from "./buy.js";

export const claimStatus = {
  enabledByFlag: !!CONFIG.CLAIM_ENABLED,
  claimable: 0,
  claimed: false,
  mode: "unknown",
};

function q(id, fallback) {
  return ui?.[id] || document.getElementById(id) || fallback || null;
}

function updateClaimUI(status) {
  const walletAddress = getWalletAddress();
  const wrap = ui?.claimWrap || q("claim-wrap") || q("btn-claim")?.closest?.("[data-claim-wrap]") || null;

  // приховуємо все, якщо клейм вимкнений або немає адреси
  if (!CONFIG.CLAIM_ENABLED || !walletAddress) {
    if (wrap) wrap.classList.add("hidden");
    if (q("btn-claim")) q("btn-claim").disabled = true;
    if (q("claim-info")) q("claim-info").classList.add("hidden");
    return;
  }
  if (wrap) wrap.classList.remove("hidden");

  const hasData = status && typeof status.claimable === "number";
  const claimable = hasData ? status.claimable : 0;
  const already = hasData ? !!status.claimed : false;

  const badge = ui?.claimBadge || q("claim-badge");
  const info  = ui?.claimInfo  || q("claim-info");
  const btn   = ui?.btnClaim   || q("btn-claim");

  if (badge) badge.textContent = String(Math.floor(claimable));
  if (info)  info.classList.toggle("hidden", !(claimable > 0));

  const canClaim = CONFIG.CLAIM_ENABLED && !!walletAddress && claimable > 0 && !already;
  if (btn) btn.disabled = !canClaim;

  claimStatus.claimable = claimable;
  claimStatus.claimed = already;
}

async function fetchClaimStatus() {
  const walletAddress = getWalletAddress();
  const claimUrl = CONFIG.ENDPOINTS?.claim ? api(CONFIG.ENDPOINTS.claim) : null;

  if (CONFIG.CLAIM_ENABLED && claimUrl && walletAddress) {
    try {
      const url = new URL(claimUrl);
      url.searchParams.set("address", walletAddress);
      const res = await fetch(url.toString(), { method: "GET", cache: "no-cache" });
      if (!res.ok) throw new Error("claim status http " + res.status);
      const data = await res.json();
      if (typeof data?.claimable === "number") {
        claimStatus.mode = "api";
        return { claimable: Number(data.claimable) || 0, claimed: !!data.claimed };
      }
    } catch (e) {
      console.warn("claim status API failed:", e?.message || e);
    }
  }
  claimStatus.mode = "unknown";
  return { claimable: 0, claimed: false };
}

export async function refreshClaimSection() {
  const walletAddress = getWalletAddress();
  if (!CONFIG.CLAIM_ENABLED || !walletAddress) { updateClaimUI(null); return; }
  const status = await fetchClaimStatus();
  updateClaimUI(status);
}

async function postClaimToApi() {
  const walletAddress = getWalletAddress();
  const claimUrl = CONFIG.ENDPOINTS?.claim ? api(CONFIG.ENDPOINTS.claim) : null;
  if (!claimUrl) throw new Error("claim API не налаштований");
  const res = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: walletAddress })
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`claim http ${res.status} ${t || ""}`.trim());
  }
  return res.json().catch(()=> ({}));
}

let claimInFlight = false;
export async function onClaimClick() {
  if (claimInFlight) return;
  if (!CONFIG.CLAIM_ENABLED) return toast("Claim ще не активований.");

  const walletAddress = getWalletAddress();
  if (!walletAddress) { openConnectModal(); return toast("Підключи гаманець"); }
  if (claimStatus.claimed) return toast("Вже отримано.");
  if ((claimStatus.claimable || 0) <= 0) return toast("Немає що клеймити.");

  try {
    claimInFlight = true;
    setBtnLoading(q("btn-claim"), true, "Підпис…");

    const onchain = (typeof window.buildClaimTx === "function")
      ? window.buildClaimTx
      : (typeof buildClaimTx === "function" ? buildClaimTx : null);

    if (onchain) {
      const uiTc = getTonConnect();
      if (!uiTc) { openConnectModal(); throw new Error("TonConnect не готовий"); }
      const tx = await onchain(walletAddress, CONFIG.CLAIM_CONTRACT || null);
      toast("Підтверди клейм у гаманці…");
      const res = await uiTc.sendTransaction(tx);
      console.log("Claim tx sent:", res);
      toast("Готово! Запит на отримання відправлено.");
    } else {
      await postClaimToApi();
      toast("Готово! Запит на отримання прийнято.");
    }

    await refreshClaimSection();
    window.dispatchEvent(new CustomEvent("magt:claim-done", { detail: { address: walletAddress } }));
  } catch (e) {
    console.error("claim error:", e);
    const msg = (e?.message || "").includes("http") ? "Помилка запиту claim." : mapTonConnectError(e);
    toast(msg);
  } finally {
    claimInFlight = false;
    setBtnLoading(q("btn-claim"), false);
  }
}

// авто-оновлення claim статусу
let claimPollT = null;
export function startClaimPolling() {
  if (!CONFIG.CLAIM_ENABLED) return;
  stopClaimPolling();
  const doOnce = () => { if (getWalletAddress()) refreshClaimSection().catch(()=>{}); };
  doOnce(); // миттєве перше оновлення
  const interval = Number(CONFIG.CLAIM_POLL_INTERVAL_MS || 30000);
  claimPollT = setInterval(doOnce, Math.max(5000, interval));
}
export function stopClaimPolling() {
  if (claimPollT) { clearInterval(claimPollT); claimPollT = null; }
}
