// /js/partials.js

function applyI18nSafe() {
  // Викликаємо наш i18n одразу після інжекту partials
  try {
    if (window.__i18n) {
      const cur = window.__i18n.lang || "uk";
      window.__i18n.setLang(cur); // це й зробить translateAll()
    }
  } catch (e) {}
}

function runScriptsFrom(host) {
  const scripts = Array.from(host.querySelectorAll("script"));
  for (const old of scripts) {
    const s = document.createElement("script");
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    if (old.textContent) s.textContent = old.textContent;
    old.replaceWith(s);
  }
}

/* ===== Глобальна розсилка адреси для HERO/UI ===== */
function dispatchAddress(addr) {
  try {
    window.dispatchEvent(new CustomEvent("magt:address", { detail: { address: addr || null } }));
  } catch {}
}

/* ===== Витяг адреси з TonConnectUI і розсилка ===== */
async function emitAddrFromTcui(ui) {
  try {
    if (!ui || typeof ui.getWallet !== "function") return false;
    const w = await ui.getWallet(); // повертає { account: { address }, ... } або null
    const addr =
      w?.account?.address ||
      ui?.wallet?.account?.address ||
      ui?.account?.address ||
      null;
    if (addr) {
      dispatchAddress(addr);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Монтаж TonConnect-кнопки ПРИБРАНО з partials:
 * сінглтон/кнопки монтує /js/tonconnect.js, щоб уникнути дублювань.
 */
function mountTonButtonsIfAny(root = document) {
  // важливо: нічого не робимо, все керує tonconnect.js
  return;
}

/* Короткий ретрі-луп (залишено як no-op для сумісності) */
function ensureAddressReady(ui, windowKey = "__magtAddrRetry") {
  // більше не потрібен тут; логіка в tonconnect.js
  return;
}

async function loadInto(id, url, { mode = "replace", retries = 1, timeout = 8000 } = {}) {
  const host = document.getElementById(id);
  if (!host) return false;

  let attempt = 0;
  while (attempt <= retries) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);

    try {
      const res = await fetch(url, { cache: "no-cache", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      if (mode === "append") {
        host.insertAdjacentHTML("beforeend", html);
      } else {
        const next = html.trim();
        const prev = host.innerHTML.trim();
        if (next !== prev) {
          if (id === "slot-main" && host.dataset.widgetsInjected) {
            delete host.dataset.widgetsInjected;
          }
          host.innerHTML = next;
          runScriptsFrom(host);
        }
      }

      host.dataset.partial = url;

      // Переклад + (TonConnect монтується окремо в tonconnect.js)
      applyI18nSafe();
      mountTonButtonsIfAny(host);

      // Сигнали готовності
      if (id === "slot-nav") {
        window.dispatchEvent(new CustomEvent("partials:nav-ready", { detail: { id, url, attempt } }));
      }
      window.dispatchEvent(new CustomEvent("partials:loaded", { detail: { id, url, attempt } }));
      return true;
    } catch (e) {
      clearTimeout(t);
      if (attempt > retries) {
        console.warn(`Failed to load ${url}:`, e);
        if (!host.innerHTML.trim()) {
          host.innerHTML = `<div class="text-sm text-red-300/80">Не вдалося завантажити ${url}</div>`;
        }
        return false;
      }
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  return false;
}

function ensureWidgetsInjected() {
  const host = document.getElementById("slot-main");
  const tpl  = document.getElementById("widgets-tpl");
  if (!host || !tpl) return;
  // якщо вже є ключові вузли — просто ре-ініт
  if (host.querySelector("#sec-sale") || host.querySelector("#sale-bar")) {
    if (typeof window.__reinitWidgets === "function") window.__reinitWidgets();
    // повідомимо слухачів (i18n вже чекає на це)
    window.dispatchEvent(new Event("widgets:ready"));
    return;
  }
  host.insertAdjacentHTML("beforeend", tpl.innerHTML);
  host.dataset.widgetsInjected = "1";
  if (typeof window.__reinitWidgets === "function") window.__reinitWidgets();
  window.dispatchEvent(new Event("widgets:ready"));
}

let emittedMainReady = false;
let emittedAllReady = false;

async function boot() {
  await loadInto("slot-nav",  "/partials/nav.html",  { retries: 1 });
  await loadInto("slot-hero", "/partials/hero.html", { retries: 1 });

  const mainOk = await loadInto("slot-main", "/partials/main.html", { retries: 1 });
  if (mainOk) {
    ensureWidgetsInjected();
    if (!emittedMainReady) {
      emittedMainReady = true;
      window.dispatchEvent(new CustomEvent("partials:main-ready", {
        detail: { id: "slot-main", url: "/partials/main.html" }
      }));
      await Promise.resolve();
    }
  }

  await loadInto("slot-footer", "/partials/footer.html", { retries: 1 });

  if (!emittedAllReady) {
    emittedAllReady = true;
    window.dispatchEvent(new Event("partials:ready"));
  }
}

async function reload() {
  emittedMainReady = false;
  await boot();
}

window.partials = { loadInto, reload };
boot();
