// /assets/tw-config.js
// Конфіг Tailwind для CDN-режиму (виносимо з inline-скрипта)
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    extend: {
      colors: { brand: '#65D2FF' },
      boxShadow: { soft: '0 8px 30px rgba(0,0,0,.35)' },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' }
    }
  }
};
