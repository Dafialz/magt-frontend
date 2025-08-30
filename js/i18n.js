// /js/i18n.js
// i18n з базовими словниками, делегованим кліком по мовах та підтримкою partials.

(function () {
  // Мови (мають збігатися з меню)
  const SUPPORTED = [
    { code: "uk", label: "Українська" },
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "ru", label: "Русский" },
    { code: "pt", label: "Português" },
    { code: "id", label: "Bahasa" },
  ];
  const FLAG = {
    uk: "uk.png", en: "en.png", zh: "cn.png", es: "es.png",
    fr: "fr.png", ru: "ru.png", pt: "pt.png", id: "id.png"
  };
  const STORE_KEY = "lang";
  const DEFAULT_LANG = "uk";

  // ---- словники
  const BASE = {
    uk: {
      "nav.brand": "Magic Time",
      "nav.buy": "Купити", "nav.tokenomics": "Токеноміка",
      "nav.roadmap": "Дорожня карта", "nav.faq": "FAQ",
      "nav.connect": "Підключити",
      "hero.buy": "Купити", "hero.claim": "Забрати MAGT",
      "hero.amount": "Сума, USDT", "hero.max": "MAX",
      "widgets.saleProgress.title": "Прогрес пресейлу",
      "widgets.saleProgress.percent": "0% продано",
      "widgets.saleProgress.remaining": "Залишок:",
      "widgets.saleProgress.raised": "Зібрано:",
      "widgets.roundTimer.title": "Раунд закінчиться через",
      "widgets.roundTimer.note": "Наступна ціна після таймера.",
      "widgets.calc.title": "Калькулятор прибутку",
      "widgets.calc.invest": "Твоя інвестиція (USD)",
      "widgets.calc.listing": "Ціна лістингу (USD)",
      "widgets.calc.receive": "Отримаєш ≈",
      "widgets.calc.potential": "Потенційна вартість",
      "widgets.feed.title": "Останні покупки",
      "widgets.leaders.title": "Реферальний лідерборд",
      "widgets.leaders.address": "Адреса",
      "widgets.leaders.volume": "Обсяг (USD)"
    },
    en: {
      "nav.brand": "Magic Time",
      "nav.buy": "Buy", "nav.tokenomics": "Tokenomics",
      "nav.roadmap": "Roadmap", "nav.faq": "FAQ",
      "nav.connect": "Connect",
      "hero.buy": "Buy", "hero.claim": "Claim MAGT",
      "hero.amount": "Amount, USDT", "hero.max": "MAX",
      "widgets.saleProgress.title": "Sale progress",
      "widgets.saleProgress.percent": "0% sold",
      "widgets.saleProgress.remaining": "Remaining:",
      "widgets.saleProgress.raised": "Raised:",
      "widgets.roundTimer.title": "Round ends in",
      "widgets.roundTimer.note": "Next price after timer.",
      "widgets.calc.title": "Profit calculator",
      "widgets.calc.invest": "Your investment (USD)",
      "widgets.calc.listing": "Listing price (USD)",
      "widgets.calc.receive": "You’ll receive ≈",
      "widgets.calc.potential": "Potential value",
      "widgets.feed.title": "Latest purchases",
      "widgets.leaders.title": "Referral leaderboard",
      "widgets.leaders.address": "Address",
      "widgets.leaders.volume": "Volume (USD)"
    },
    zh: { "nav.brand":"Magic Time","nav.buy":"购买","nav.tokenomics":"代币经济学","nav.roadmap":"路线图","nav.faq":"常见问题","nav.connect":"连接",
          "hero.buy":"购买","hero.claim":"领取 MAGT","hero.amount":"金额, USDT","hero.max":"最大" },
    es: { "nav.brand":"Magic Time","nav.buy":"Comprar","nav.tokenomics":"Tokenómica","nav.roadmap":"Hoja de ruta","nav.faq":"Preguntas","nav.connect":"Conectar",
          "hero.buy":"Comprar","hero.claim":"Retirar MAGT","hero.amount":"Importe, USDT","hero.max":"MÁX" },
    fr: { "nav.brand":"Magic Time","nav.buy":"Acheter","nav.tokenomics":"Tokenomics","nav.roadmap":"Feuille de route","nav.faq":"FAQ","nav.connect":"Connexion",
          "hero.buy":"Acheter","hero.claim":"Récupérer MAGT","hero.amount":"Montant, USDT","hero.max":"MAX" },
    ru: { "nav.brand":"Magic Time","nav.buy":"Купить","nav.tokenomics":"Токеномика","nav.roadmap":"Дорожная карта","nav.faq":"FAQ","nav.connect":"Подключить",
          "hero.buy":"Купить","hero.claim":"Забрать MAGT","hero.amount":"Сумма, USDT","hero.max":"MAX" },
    pt: { "nav.brand":"Magic Time","nav.buy":"Comprar","nav.tokenomics":"Tokenomics","nav.roadmap":"Roteiro","nav.faq":"FAQ","nav.connect":"Conectar",
          "hero.buy":"Comprar","hero.claim":"Resgatar MAGT","hero.amount":"Valor, USDT","hero.max":"MÁX" },
    id: { "nav.brand":"Magic Time","nav.buy":"Beli","nav.tokenomics":"Tokenomik","nav.roadmap":"Peta Jalan","nav.faq":"FAQ","nav.connect":"Hubungkan",
          "hero.buy":"Beli","hero.claim":"Klaim MAGT","hero.amount":"Jumlah, USDT","hero.max":"MAX" },
  };

  // ---- вибір мови
  function isSupported(code){ return SUPPORTED.some(x => x.code === code); }
  function getLangFromQuery(){
    try { return (new URLSearchParams(location.search).get("lang") || "").trim().toLowerCase(); }
    catch { return ""; }
  }
  let current = (()=> {
    const q = getLangFromQuery();
    if (q && isSupported(q)) return q;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && isSupported(saved)) return saved;
    } catch {}
    const guess = (navigator.language||DEFAULT_LANG).slice(0,2).toLowerCase();
    return isSupported(guess) ? guess : DEFAULT_LANG;
  })();

  const packs = {};  // кеш словників
  async function load(lang){
    if (packs[lang]) return packs[lang];
    packs[lang] = { ...(BASE[lang]||{}) };
    try {
      const r = await fetch(`/i18n/${lang}.json`, { cache: "no-cache" });
      if (r.ok) Object.assign(packs[lang], await r.json());
    } catch {}
    return packs[lang];
  }
  function t(key){
    return (packs[current] && packs[current][key]) ??
           (packs[DEFAULT_LANG] && packs[DEFAULT_LANG][key]) ?? key;
  }

  function syncHtml(){
    document.documentElement.lang = current;
    document.documentElement.dir  = "ltr";
  }
  function syncDropdown(){
    const label = (SUPPORTED.find(x=>x.code===current)?.label)||current.toUpperCase();
    const flag  = `/assets/lang/${FLAG[current]||"en.png"}`;
    const lbl  = document.getElementById("lang-label");
    const flg  = document.getElementById("lang-flag");
    const lblm = document.getElementById("lang-label-m");
    const flgm = document.getElementById("lang-flag-m");
    if (lbl)  lbl.textContent = label;
    if (flg)  flg.src = flag;
    if (lblm) lblm.textContent = label;
    if (flgm) flgm.src = flag;
  }
  function translateNode(node){
    node.querySelectorAll("[data-i18n]").forEach(el=>{
      const key = el.getAttribute("data-i18n");
      const txt = t(key);
      if (el.childElementCount === 0) el.textContent = txt; else el.innerHTML = txt;
    });
    node.querySelectorAll("[data-i18n-html]").forEach(el=>{
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    node.querySelectorAll("[data-i18n-title]").forEach(el=>{
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    node.querySelectorAll("[data-i18n-ph]").forEach(el=>{
      el.placeholder = t(el.getAttribute("data-i18n-ph"));
    });
    node.querySelectorAll("[data-i18n-aria]").forEach(el=>{
      const spec = el.getAttribute("data-i18n-aria"); // "key" або "key|label,title"
      const [k, attrsRaw] = String(spec).split("|");
      const val = t(k);
      const attrs = (attrsRaw||"label").split(",").map(s=>s.trim()).filter(Boolean);
      attrs.forEach(a => el.setAttribute(`aria-${a}`, val));
    });
  }
  async function translateAll(){
    await Promise.all([load(DEFAULT_LANG), load(current)]);
    translateNode(document);
    syncHtml();
    syncDropdown();
  }
  function setLang(lang){
    if (!isSupported(lang)) lang = DEFAULT_LANG;
    current = lang;
    try { localStorage.setItem(STORE_KEY, lang); } catch {}
    // оновлюємо URL
    try {
      const u = new URL(location.href);
      if (current === DEFAULT_LANG) u.searchParams.delete("lang"); else u.searchParams.set("lang", current);
      history.replaceState({}, "", u.toString());
    } catch {}
    translateAll();
  }

  // ---- делегований клік
  document.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-lang][data-label][data-flag]");
    if (!btn) return;
    setLang(btn.dataset.lang);
    document.getElementById("lang-switcher")?.removeAttribute("open");
    document.getElementById("lang-switcher-mobile")?.removeAttribute("open");
  });

  // ---- MutationObserver
  const mo = new MutationObserver(muts=>{
    for (const m of muts) {
      m.addedNodes.forEach(n=>{
        if (n.nodeType !== 1) return;
        translateNode(n);
        if (n.id === "slot-nav" || n.querySelector?.("#lang-label") || n.querySelector?.("#lang-label-m")) {
          syncDropdown();
        }
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ---- переклад після partials/widgets
  window.addEventListener("partials:loaded", translateAll);
  window.addEventListener("partials:main-ready", translateAll);
  window.addEventListener("widgets:ready", translateAll);

  // ---- публічний API
  window.__i18n = { setLang, t, get lang(){ return current; } };

  // ---- старт
  translateAll();
})();
