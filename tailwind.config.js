/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './partials/**/*.{html,js}',
    './js/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: { brand: '#65D2FF' }
    }
  },
  safelist: [
    // якщо є динамічно зібрані класи (через шаблонні строки), додай їх тут
    // 'bg-brand', 'from-brand', 'to-brand', 'max-w-6xl', 'px-4', ...
  ]
}
