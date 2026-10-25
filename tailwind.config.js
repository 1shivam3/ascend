/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core Named Brand Reference Tokens
        brand: {
          graphite: '#171916',
          chalk: '#F3F0E7',
          vermilion: '#E44427',
          sage: '#858076',
        },
        graphite: {
          DEFAULT: '#171916',
          surface: '#212420',
          elevated: '#2A2E29',
          border: '#2C302B',
        },
        chalk: {
          DEFAULT: '#F3F0E7',
          surface: '#FFFFFF',
          sunken: '#E8E5DC',
          border: '#E2DFD6',
        },
        vermilion: {
          DEFAULT: '#E44427',
          dim: '#C7351B',
          glow: 'rgba(228, 68, 39, 0.20)',
          subtle: 'rgba(228, 68, 39, 0.12)',
        },
        sage: {
          DEFAULT: '#858076',
          dim: '#6E6A61',
          subtle: 'rgba(133, 128, 118, 0.15)',
        },
        bg: {
          primary: 'rgb(var(--bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--bg-card) / <alpha-value>)',
          highlight: 'rgb(var(--bg-secondary) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dim: 'rgb(var(--accent-dim) / <alpha-value>)',
          glow: 'var(--accent-glow)',
          vermilion: '#E44427',
          text: 'var(--accent-text)',
          on: 'var(--accent-on)',
          subtle: 'var(--accent-subtle)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          primary: 'rgb(var(--border) / <alpha-value>)',
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          hover: 'rgb(var(--border-hover) / <alpha-value>)',
        },
        water: '#38BDF8',
        protein: '#22C55E',
        creatine: '#F5B301',
        weight: '#A78BFA',
        // D2 fix (UX redesign): success is NO LONGER sage. Light #157347
        // on #E6F4EA, dark #4ADE80 on rgba(74,222,128,0.15) — see
        // globals.css --success / --success-bg. Always paired with a
        // check icon + label, never color alone.
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: '#f59e0b',
        danger: '#ef4444',
        error: '#ef4444',
        info: '#3b82f6',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'var(--font-devanagari)', 'system-ui', '-apple-system', 'sans-serif'],
        // Display: Barlow Condensed, wired ONLY for display headings
        // ≥28px + wordmark (design-system §4). Devanagari glyphs fall
        // back per-glyph to Noto; if a live check shows mixed-script
        // inconsistency, the fallback is Inter-only with tight tracking.
        display: ['var(--font-display)', 'Barlow Condensed', 'var(--font-devanagari)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Label floor raised (UX redesign): 3xs (10px) is REMOVED; 2xs
        // is redefined to 11px. All former text-3xs usages were bumped
        // to text-2xs (341 sites) — 10px text no longer exists.
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
        label:   ['12px', '16px'],
        body:    ['14px', '20px'],
        title:   ['17px', '24px'],
        pageTitle: ['22px', '28px'],
        display: ['32px', '36px'],
        prominent: ['28px', '32px'],
        compactMetric: ['20px', '24px'],
        chartLabel: ['11px', '14px'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'tab-enter': 'tabEnter 0.22s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        tabEnter: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.995)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
