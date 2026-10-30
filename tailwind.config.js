const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        surface: { DEFAULT: token('surface'), muted: token('surface-muted') },
        border: token('border'),
        foreground: token('foreground'),
        muted: token('muted'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        danger: token('danger'),
        warning: token('warning'),
        success: token('success'),
        info: token('info'),
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
    },
  },
  plugins: [],
};
