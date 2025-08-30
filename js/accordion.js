// /js/accordion.js
// Делегований слухач + анімація висоти + ARIA. Працює для динамічного DOM.
// Опція: data-accordion="single" на контейнері — тримає відкритим лише один айтем.

(function () {
  const ACC_CONT_SEL = '[data-accordion]';
  const ACC_ITEM_SEL = '[data-accordion-item]';
  const ACC_BODY_SEL = '[data-accordion-body]';
  const BTN_SEL      = `${ACC_ITEM_SEL} > button`;
  const CHEVRON_SEL  = '[data-acc-chevron]';

  const prefersNoMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- utils ----------
  function qsa(root, sel) { return Array.from(root.querySelectorAll(sel)); }
  function isInSingleMode(item) {
    const c = item.closest(ACC_CONT_SEL);
    return c && (c.getAttribute('data-accordion') === 'single');
  }
  function getSiblings(item) {
    const c = item.closest(ACC_CONT_SEL);
    return c ? qsa(c, ACC_ITEM_SEL).filter(x => x !== item) : [];
  }

  // ---------- animation ----------
  function slide(el, open, ms = 240) {
    if (!el) return;
    if (prefersNoMotion) {
      el.style.transition = '';
      el.style.overflow = open ? '' : 'hidden';
      el.style.maxHeight = open ? 'none' : '0px';
      return;
    }

    // Скидаємо попередні transition-и
    el.style.transition = '';
    // Вимірюємо старт
    const start = el.offsetHeight; // реflow для точного виміру
    // Ціль
    el.style.maxHeight = 'none';
    const targetHeight = open ? el.scrollHeight : 0;
    // Повертаємось у старт
    el.style.maxHeight = start + 'px';
    el.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      el.style.transition = `max-height ${ms}ms ease`;
      el.style.maxHeight = targetHeight + 'px';
    });

    el.addEventListener('transitionend', () => {
      el.style.transition = '';
      if (open) {
        el.style.maxHeight = 'none';
        el.style.overflow = '';
      } else {
        el.style.maxHeight = '0px';
        el.style.overflow = 'hidden';
      }
    }, { once: true });
  }

  // ---------- state ----------
  function setOpen(item, willOpen) {
    const body = item.querySelector(ACC_BODY_SEL);
    const btn  = item.querySelector('button');
    const chev = item.querySelector(CHEVRON_SEL);

    if (willOpen && isInSingleMode(item)) {
      // закриваємо інші
      for (const sib of getSiblings(item)) {
        if (sib.classList.contains('open')) {
          sib.classList.remove('open');
          const b = sib.querySelector(ACC_BODY_SEL);
          const bt= sib.querySelector('button');
          const ch= sib.querySelector(CHEVRON_SEL);
          if (b) slide(b, false);
          if (bt) bt.setAttribute('aria-expanded', 'false');
          if (ch) ch.setAttribute('data-state', 'closed');
          const region = b;
          if (region) region.setAttribute('aria-hidden', 'true');
        }
      }
    }

    item.classList.toggle('open', willOpen);
    if (body) slide(body, willOpen);
    if (btn)  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (chev) chev.setAttribute('data-state', willOpen ? 'open' : 'closed');
    if (body) body.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
  }

  function toggle(item) {
    const next = !item.classList.contains('open');
    setOpen(item, next);
  }

  // ---------- click (delegated) ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest(BTN_SEL);
    if (!btn) return;
    const item = btn.closest(ACC_ITEM_SEL);
    if (!item) return;
    e.preventDefault();
    toggle(item);
  });

  // ---------- keyboard a11y ----------
  function focusTo(items, index) {
    const btn = items[index]?.querySelector('button');
    if (btn) btn.focus();
  }
  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest?.(BTN_SEL);
    if (!btn) return;

    const item = btn.closest(ACC_ITEM_SEL);
    const cont = btn.closest(ACC_CONT_SEL);
    const items = cont ? qsa(cont, ACC_ITEM_SEL) : [];
    const idx = items.indexOf(item);

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        toggle(item);
        break;
      case 'ArrowDown':
      case 'Down':
        e.preventDefault();
        focusTo(items, Math.min(items.length - 1, idx + 1));
        break;
      case 'ArrowUp':
      case 'Up':
        e.preventDefault();
        focusTo(items, Math.max(0, idx - 1));
        break;
      case 'Home':
        e.preventDefault();
        focusTo(items, 0);
        break;
      case 'End':
        e.preventDefault();
        focusTo(items, items.length - 1);
        break;
    }
  });

  // ---------- init ----------
  function ensureIds(btn, body) {
    // панель (region) має id
    if (!body.id) body.id = 'acc-' + Math.random().toString(36).slice(2);
    // кнопка посилається на панель
    btn.setAttribute('aria-controls', body.id);
    // панель озаглавлюється кнопкою
    if (!btn.id) btn.id = 'accbtn-' + Math.random().toString(36).slice(2);
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', btn.id);
  }

  function initItem(item) {
    const body = item.querySelector(ACC_BODY_SEL);
    const btn  = item.querySelector('button');
    if (!body || !btn) return;

    ensureIds(btn, body);

    const open = item.classList.contains('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.setAttribute('aria-hidden', open ? 'false' : 'true');

    // Початкові стилі висоти
    if (open) {
      body.style.maxHeight = 'none';
      body.style.overflow = '';
    } else {
      body.style.maxHeight = '0px';
      body.style.overflow = 'hidden';
    }

    // Додаємо chevron-мітку, якщо її нема (для стилізації через CSS)
    let chev = item.querySelector(CHEVRON_SEL);
    if (!chev) {
      chev = document.createElement('span');
      chev.setAttribute('data-acc-chevron', '');
      chev.className = 'ml-2 inline-block';
      btn.appendChild(chev);
    }
    chev.setAttribute('data-state', open ? 'open' : 'closed');

    // Контейнер робимо списком, якщо не задано
    const cont = item.closest(ACC_CONT_SEL);
    if (cont && !cont.hasAttribute('role')) cont.setAttribute('role', 'list');
    if (!item.hasAttribute('role')) item.setAttribute('role', 'listitem');
  }

  function init(root = document) {
    qsa(root, ACC_ITEM_SEL).forEach(initItem);
  }

  // первинний init
  init();

  // спостерігаємо за динамічним DOM (partials/переклади)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches?.(ACC_ITEM_SEL) || n.querySelector?.(ACC_ITEM_SEL)) {
          init(n);
        }
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ---------- deep-link по хешу ----------
  function openByHash() {
    const id = location.hash?.slice(1);
    if (!id) return;
    // Пробуємо знайти панель або кнопку
    const panel = document.getElementById(id);
    const btn = panel
      ? document.querySelector(`${BTN_SEL}[aria-controls="${id}"]`)
      : document.getElementById(id)?.closest?.(ACC_ITEM_SEL)?.querySelector('button') || null;

    const item = btn?.closest(ACC_ITEM_SEL);
    if (item) {
      setOpen(item, true);
      // прокрутка мʼяка
      document.getElementById(id)?.scrollIntoView?.({ behavior: prefersNoMotion ? 'auto' : 'smooth', block: 'start' });
      btn.focus?.();
    }
  }
  window.addEventListener('hashchange', openByHash);
  // відкриємо при першому завантаженні, якщо є хеш
  if (location.hash) {
    // невелика затримка, щоб DOM підтягнувся
    setTimeout(openByHash, 0);
  }
})();
