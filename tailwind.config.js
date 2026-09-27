/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0a',
          secondary: '#111111',
          tertiary: '#1f1f1f',
          card: '#161616',
          elevated: '#1c1c1c',
        },
        surface: {
          DEFAULT: '#161616',
          highlight: '#202020',
          elevated: '#1c1c1c',
        },
        text: {
          primary: '#f5f5f5',
          secondary: '#a3a3a3',
          muted: '#6b6b6b',
        },
        accent: {
          DEFAULT: '#e5c07b',
          dim: '#b8973f',
          glow: 'rgba(229, 192, 123, 0.15)',
        },
        border: {
          DEFAULT: '#262626',
          primary: '#262626',
          subtle: '#1f1f1f',
          hover: '#383838',
        },
        success: '#73c991',
        warning: '#e5c07b',
        danger: '#e06c75',
        error: '#e06c75',
        info: '#61afef',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
