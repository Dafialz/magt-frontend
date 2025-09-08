// /js/partials.js

function applyI18nSafe() {
  try {
    if (window.__i18n) {
      const cur = window.__i18n.lang || "uk";
      window.__i18n.setLang(cur);
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
    const w = await ui.getWallet();
    const addr = w?.account?.address || ui?.wallet?.account?.address || ui?.account?.address || null;
    if (addr) { dispatchAddress(addr); return true; }
  } catch {}
  return false;
}

/**
 * Монтаж TonConnect-кнопки ПРИБРАНО з partials:
 * сінглтон/кнопки монтує /js/tonconnect.js, щоб уникнути дублювань.
 */
function mountTonButtonsIfAny(_root = document) {
  return;
}

/* Короткий ретрі-луп (залишено як no-op для сумісності) */
function ensureAddressReady(_ui, _windowKey = "__magtAddrRetry") {
  return;
}

/**
 * Акуратне завантаження partial у контейнер.
 * Особливий кейс: для slot-nav ми зберігаємо живий вузол #tonconnect,
 * щоб не переривати роботу TonConnectUI та відкриту модалку.
 */
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

      // === ПІДГОТОВКА ДО ПЕРЕЗАПИСУ ДЛЯ NAV ===
      let preservedTc = null;
      let tcWasMounted = false;

      if (id === "slot-nav") {
        const currentTc = host.querySelector("#tonconnect");
        if (currentTc) {
          // якщо кнопка вже змонтована – зберігаємо живий вузол
          tcWasMounted = !!(currentTc.dataset.tcMounted || window.__tcui);
          if (tcWasMounted) {
            preservedTc = currentTc; // реальний DOM-вузол з внутрішнім станом
          }
        }
      }

      if (mode === "append") {
        host.insertAdjacentHTML("beforeend", html);
      } else {
        const next = html.trim();
        const prev = host.innerHTML.trim();

        // тільки якщо контент реально змінився
        if (next !== prev) {
          // тимчасовий «якір», щоб вставити збережений вузол на те саме місце
          let tcAnchor = null;
          if (preservedTc) {
            tcAnchor = document.createComment("TC_PRESERVED_ANCHOR");
            try { preservedTc.replaceWith(tcAnchor); } catch {}
          }

          host.innerHTML = next;
          runScriptsFrom(host);

          // після оновлення DOM намагаємось знайти новий контейнер для #tonconnect
          if (preservedTc) {
            // якщо в новому шаблоні теж є #tonconnect — підміняємо його нашим «живим»
            const newSlot = host.querySelector("#tonconnect");
            if (newSlot) {
              try { newSlot.replaceWith(preservedTc); } catch { host.prepend(preservedTc); }
            } else if (tcAnchor && tcAnchor.parentNode) {
              try { tcAnchor.replaceWith(preservedTc); } catch { host.prepend(preservedTc); }
            } else {
              // крайній випадок: просто додаємо у кінець навігації
              host.appendChild(preservedTc);
            }
            // позначимо, що в контейнері вже змонтовано
            preservedTc.dataset.tcMounted = "1";
          }
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

  if (host.querySelector("#sec-sale") || host.querySelector("#sale-bar")) {
    if (typeof window.__reinitWidgets === "function") window.__reinitWidgets();
    window.dispatchEvent(new Event("widgets:ready"));
    return;
  }
  host.insertAdjacentHTML("beforeend", tpl.innerHTML);
  host.dataset.widgetsInjected = "1";
  if (typeof window.__reinitWidgets === "function") window.__reinitWidgets();
  window.dispatchEvent(new Event("widgets:ready"));
}

let emittedMainReady = false;
let emittedAllReady  = false;

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
