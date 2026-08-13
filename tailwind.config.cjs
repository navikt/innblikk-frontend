/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // @navikt/ds-tailwind (loaded as a preset below) *replaces* theme.colors with its
      // own `ax-*` tokens instead of extending Tailwind's defaults (documented behavior:
      // https://aksel.nav.no/grunnleggende/kode/tailwind — "color og screen ikke extender
      // tailwind config og overskriver tailwind sine defaults"). That silently broke every
      // default-palette utility class across the app (text-white, bg-gray-900, border-neutral-200,
      // text-blue-600, etc. — 100+ files) since @config started loading this preset, because
      // presets set the base theme.colors and this project's theme.extend.colors merges on
      // top of it. Re-spreading Tailwind's own color module here restores the full default
      // palette alongside Aksel's ax-* tokens, so existing usages keep working without
      // per-file changes. Prefer Aksel's `ax-*` tokens in new code for proper theming support.
      colors: {
        ...colors,
        deepblue: {
          500: '#0067c5', // Check exact value, assumed action blue
          800: 'rgb(0, 52, 83)',
          900: '#191d26',
        },
      },
      gridTemplateColumns: {
        20: 'repeat(20, minmax(0, 1fr))',
      },
      gridColumn: {
        'span-13': 'span 13 / span 13',
        'span-14': 'span 14 / span 14',
        'span-15': 'span 15 / span 15',
        'span-16': 'span 16 / span 16',
        'span-17': 'span 17 / span 17',
        'span-18': 'span 18 / span 18',
        'span-19': 'span 19 / span 19',
        'span-20': 'span 20 / span 20',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
  presets: [require('@navikt/ds-tailwind')],
}
