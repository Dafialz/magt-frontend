// /js/widgets.js
import { CONFIG } from "./config.js";
import {
  getPresaleStats,
  getRecentPurchases,
  getReferralLeaders,
  fmt as tonFmt,
} from "./ton.js";

/* =========================
 * Інжект шаблону віджетів
 * ========================= */
function ensureWidgetsInjected() {
  const host = document.getElementById("slot-main");
  const tpl  = document.getElementById("widgets-tpl");
  if (!host || !tpl) return false;
  if (host.dataset.widgetsInjected === "1") return true;

  host.insertAdjacentHTML("beforeend", tpl.innerHTML);
  host.dataset.widgetsInjected = "1";
  return true;
}

/* =========================
 * Утиліти
 * ========================= */
const $ = (s) => document.querySelector(s);
const fmtNum = (n, d = 0) =>
  Number(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: d });

function animateWidth(el, from, to, ms = 600) {
  if (!el) return;
  const start = performance.now();
  function tick(t) {
    const k = Math.min(1, (t - start) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.style.width = (from + (to - from) * e) + "%";
    if (k < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function animateEnter(el, ms = 400) {
  if (!el) return;
  el.style.opacity = "0";
  el.style.transform = "translateY(-6px)";
  el.style.willChange = "opacity, transform";
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${ms}ms ease, transform ${ms}ms ease`;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
    setTimeout(() => {
      el.style.transition = "";
      el.style.willChange = "";
    }, ms + 50);
  });
}

/* =========================
 * 1) Sale Progress + Timer
 * ========================= */
let ui = null;
function resolveProgressUi() {
  ui = {
    bar: $("#sale-bar"),
    pct: $("#sale-percent"),
    remaining: $("#sale-remaining"),
    raised: $("#sale-raised"),
    timer: $("#round-timer"),
    deadlineLabel: $("#round-deadline-label"),
  };
  return ui;
}
const hasProgressUI = () => {
  if (!ui) resolveProgressUi();
  return ui && ui.bar && ui.pct && ui.remaining && ui.raised;
};

// допоміжне: якщо задані рівні — порахувати сумарний supply по рівнях
function tiersTotalSupply() {
  const tiers = Array.isArray(CONFIG.SALE_TIERS) ? CONFIG.SALE_TIERS : null;
  if (!tiers || !tiers.length) return null;
  return tiers.reduce((s, t) => s + (Number(t.qty) || 0), 0);
}

let lastPct = 0;
async function refreshProgress() {
  if (!hasProgressUI()) return;

  let soldMag = 0, totalMagFromApi = 0, raisedUsd = 0;
  try {
    const stats = await getPresaleStats();
    soldMag = Number(stats?.soldMag ?? 0);
    totalMagFromApi = Number(stats?.totalMag ?? 0);
    raisedUsd = Number(stats?.raisedUsd ?? 0);
  } catch (e) {
    // тихий фолбек
  }

  // якщо є tiers — використовуємо суму qty; інакше беремо totalMag з API/конфіга
  const totalFromTiers = tiersTotalSupply();
  const total = Number.isFinite(totalFromTiers)
    ? totalFromTiers
    : (Number(totalMagFromApi) || Number(CONFIG.TOTAL_SUPPLY) || 0);

  const sold = Number.isFinite(Number(soldMag)) ? Number(soldMag) : 0;
  const raised = Number.isFinite(Number(raisedUsd)) ? Number(raisedUsd) : 0;

  const pct = total > 0 ? Math.max(0, Math.min(100, (sold / total) * 100)) : 0;
  const remaining = Math.max(0, total - sold);

  ui.pct.textContent = `${fmtNum(pct, 2)}% sold`;
  ui.remaining.textContent = fmtNum(remaining, 0);
  ui.raised.textContent = `$${fmtNum(raised, 0)}`;

  const from = lastPct;
  const to = pct;
  lastPct = pct;
  animateWidth(ui.bar, from, to, 700);
}

function initRoundTimer() {
  if (!ui) resolveProgressUi();
  if (!ui.timer || !ui.deadlineLabel) return;
  const deadlineTs = Number(CONFIG.ROUND_DEADLINE_TS || 0) || Math.floor(Date.now() / 1000) + 3 * 24 * 3600;
  const date = new Date(deadlineTs * 1000);
  try {
    ui.deadlineLabel.textContent = date.toLocaleString();
  } catch {
    ui.deadlineLabel.textContent = date.toISOString();
  }

  const tick = () => {
    const now = Date.now();
    let left = Math.max(0, deadlineTs * 1000 - now);
    const h = Math.floor(left / 3_600_000); left -= h * 3_600_000;
    const m = Math.floor(left / 60_000);     left -= m * 60_000;
    const s = Math.floor(left / 1000);
    ui.timer.textContent = [h, m, s].map(x => String(x).padStart(2, "0")).join(":");
    requestAnimationFrame(tick);
  };
  tick();
}

/* =========================
 * 2) Profit calculator
 * ========================= */
function initCalc() {
  const $usd = $("#calc-usd");
  const $lst = $("#calc-listing");
  const $tok = $("#calc-tokens");
  const $val = $("#calc-value");
  const $note = $("#calc-note");
  if (!$usd || !$lst || !$tok || !$val) return;

  function recalc() {
    const usd = Number($usd.value || 0);
    const price = Number(CONFIG.PRICE_USD || 0.00383);
    const tokens = usd > 0 && price > 0 ? usd / price : 0;
    $tok.textContent = `${fmtNum(tokens, 0)} MAGT`;

    const listing = Number($lst.value || 0);
    const pot = listing > 0 ? tokens * listing : 0;
    $val.textContent = pot > 0 ? `$${fmtNum(pot, 2)}` : "$—";

    if ($note) {
      if (listing > 0 && price > 0) {
        const x = listing / price;
        $note.textContent = `Listing is ×${fmtNum(x, 2)} of presale price — potential ROI before fees/slippage.`;
      } else {
        $note.textContent = "";
      }
    }
  }
  $usd.addEventListener("input", recalc);
  $lst.addEventListener("input", recalc);
  recalc();
}

/* =========================
 * 3) Tokenomics donut (SVG)
 * ========================= */
function initTokenomics() {
  const TOK = Array.isArray(CONFIG.TOKENOMICS) && CONFIG.TOKENOMICS.length
    ? CONFIG.TOKENOMICS
    : [
        { label: "Public sale", pct: 35 },
        { label: "Staking", pct: 20 },
        { label: "Marketing", pct: 15 },
        { label: "Team", pct: 15 },
        { label: "Ecosystem", pct: 10 },
        { label: "Liquidity", pct: 5 },
      ];

  const svg = $("#tok-chart");
  const legend = $("#tok-legend");
  if (!svg || !legend) return;

  svg.innerHTML = "";
  legend.innerHTML = "";

  // Нормалізуємо %, якщо їх сума не дорівнює 100
  const totalPct = TOK.reduce((s, seg) => s + (Number(seg.pct) || 0), 0) || 100;
  const norm = TOK.map((seg) => ({
    label: seg.label || "",
    pct: (Number(seg.pct) || 0) * (100 / totalPct),
  }));

  const R = 48, CX = 60, CY = 60;
  const circ = 2 * Math.PI * R;
  let offset = 0;

  norm.forEach((seg, i) => {
    const len = (seg.pct / 100) * circ;
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", CX); ring.setAttribute("cy", CY); ring.setAttribute("r", R);
    ring.setAttribute("fill", "none"); ring.setAttribute("stroke-width", "16");
    ring.setAttribute("stroke-dasharray", `${len} ${Math.max(0, circ - len)}`);
    ring.setAttribute("stroke-dashoffset", String(-offset));
    ring.style.stroke = `hsl(${(i * 57) % 360} 90% 60%)`;
    svg.appendChild(ring);

    offset += len;

    const row = document.createElement("div");
    row.className = "flex items-center gap-3";
    row.innerHTML = `
      <span class="inline-block w-3 h-3 rounded-sm" style="background:${ring.style.stroke}" aria-hidden="true"></span>
      <span class="flex-1">${seg.label}</span>
      <b>${fmtNum(seg.pct, 0)}%</b>`;
    legend.appendChild(row);
  });

  const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  hole.setAttribute("cx", CX); hole.setAttribute("cy", CY); hole.setAttribute("r", R - 14);
  hole.setAttribute("fill", "currentColor");
  hole.setAttribute("opacity", "0.12");
  svg.appendChild(hole);
}

/* =========================
 * 4) Live feed
 * ========================= */
function normalizeFeed(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const asset = it.asset || "USDT";
    const usd = Number(it.amountUsd ?? it.usd ?? 0);
    const tokens = Number(it.magt ?? it.tokens ?? 0);
    const addr = it.addr || it.address || "";
    const ts = Number(it.ts ?? Date.now());
    return { asset, usd, tokens, addr, ts };
  });
}
const feedMax = 10;
let lastFeedHash = "";
function hashFeed(data) {
  try { return JSON.stringify(data.slice(0, feedMax)); } catch { return ""; }
}
function renderFeed(items = []) {
  const list = $("#feed-list");
  const counter = $("#feed-count");
  if (!list || !counter) return;

  const data = normalizeFeed(items);
  const newHash = hashFeed(data);
  if (newHash === lastFeedHash && list.children.length > 0) {
    counter.textContent = String(data.length);
    return;
  }
  lastFeedHash = newHash;

  list.setAttribute("role", "list");
  list.innerHTML = "";
  data.slice(0, feedMax).forEach((it) => {
    const li = document.createElement("li");
    li.setAttribute("role", "listitem");
    li.className = "flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2 will-change-transform";
    const shortAddr = it.addr ? it.addr.slice(0, 4) + "…" + it.addr.slice(-4) : "—";
    const ts = it.ts ? new Date(it.ts).toLocaleTimeString() : "now";
    li.innerHTML = `
      <span class="opacity-80">${it.asset || "USDT"} → <b>${fmtNum(it.tokens || 0, 0)} MAGT</b></span>
      <span class="opacity-60 text-xs">$${fmtNum(it.usd || 0, 2)} • ${shortAddr} • ${ts}</span>
    `;
    list.appendChild(li);
    animateEnter(li, 380);
  });
  counter.textContent = String(data.length);
}
function demoFeed() {
  const json = localStorage.getItem("demo.feed");
  try { return json ? JSON.parse(json) : []; } catch { return []; }
}
async function loadFeed() {
  try {
    const items = await getRecentPurchases(20);
    renderFeed(items);
  } catch (e) {
    console.warn("feed load failed, using demo:", e);
    renderFeed(demoFeed());
  }
}

/* =========================
 * 5) Referral leaderboard
 * ========================= */
function normalizeLeaders(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    address: r.address || r.addr || "",
    usd: Number(r.usd || 0),
  }));
}
async function renderLeaders() {
  const tbody = $("#leaders-body");
  if (!tbody) return;
  try {
    const rows = normalizeLeaders(await getReferralLeaders(10));
    tbody.innerHTML = "";
    const sorted = rows
      .filter((r) => r.address)
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 10);

    if (!sorted.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="py-3 text-sm opacity-70" colspan="3">Ще немає реферальних покупок</td>`;
      tbody.appendChild(tr);
      return;
    }

    sorted.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="py-2 pr-6">${i + 1}</td>
        <td class="py-2 pr-6">${r.address ? r.address.slice(0, 6) + "…" + r.address.slice(-6) : "—"}</td>
        <td class="py-2">${tonFmt.usd(r.usd)}</td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.warn("leaders load failed:", e);
    tbody.innerHTML = `<tr><td class="py-3 text-sm opacity-70" colspan="3">Недоступно</td></tr>`;
  }
}

/* =========================
 * Інтеграція з подіями застосунку
 * ========================= */
// DEMО-оновлення лідерборду за рефералами
function demoUpdateLeaders(refAddr, usd) {
  if (!refAddr || refAddr === "-") return;
  let obj;
  try { obj = JSON.parse(localStorage.getItem("demo.ref.leaders") || "{}"); }
  catch { obj = {}; }
  obj[refAddr] = Number(obj[refAddr] || 0) + (Number(usd) || 0);
  localStorage.setItem("demo.ref.leaders", JSON.stringify(obj));
}

window.addEventListener("magt:purchase", async (e) => {
  const { usd, tokens, address, ref } = e.detail || {};

  // DEMO: фіди/сума
  const arr = demoFeed();
  arr.unshift({
    asset: "USDT",
    amountUsd: Number(usd) || 0,
    magt: Number(tokens) || 0,
    addr: address || "",
    ts: Date.now(),
  });
  while (arr.length > 50) arr.pop();
  localStorage.setItem("demo.feed", JSON.stringify(arr));

  // DEMO: реф-лідери
  demoUpdateLeaders(ref || window.__referrer || null, Number(usd) || 0);

  await Promise.all([loadFeed(), refreshProgress(), renderLeaders()]);
});

window.addEventListener("magt:claim-done", async () => {
  await Promise.all([refreshProgress(), loadFeed(), renderLeaders()]);
});
window.addEventListener("magt:claim", async () => {
  await Promise.all([refreshProgress(), loadFeed(), renderLeaders()]);
});

/* =========================
 * Старт / повторна ініціалізація
 * ========================= */
let refreshInterval = null;
function startIntervals() {
  if (refreshInterval) return;
  refreshInterval = setInterval(() => {
    if (!document.hidden) {
      refreshProgress();
      loadFeed();
      renderLeaders();
    }
  }, 20_000);
}
function stopIntervals() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
function init() {
  // гарантуємо, що DOM для віджетів присутній
  if (!ensureWidgetsInjected()) return;

  resolveProgressUi();
  initRoundTimer();
  initCalc();
  initTokenomics();
  refreshProgress();
  renderLeaders();
  loadFeed();
  startIntervals();
}

// ре-ініт за потреби
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopIntervals();
  else {
    Promise.all([refreshProgress(), loadFeed(), renderLeaders()]);
    startIntervals();
  }
});

// Публічні хелпери
window.__reinitWidgets = function () { init(); };
window.widgetsRefresh = () => Promise.all([refreshProgress(), loadFeed(), renderLeaders()]);

// Авто-старт: після частин або якщо вже все є
function tryInit() { try { init(); } catch (e) { /* тихо */ } }
window.addEventListener("partials:main-ready", tryInit, { once: true });
if (document.readyState !== "loading") setTimeout(tryInit, 0);
else document.addEventListener("DOMContentLoaded", tryInit);
