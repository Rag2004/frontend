/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        desk: {
          main: 'var(--bg-main)',
          card: 'var(--bg-card)',
          panel: 'var(--bg-panel)',
          border: 'var(--border)',
          muted: 'var(--text-muted)',
          text: 'var(--text)',
          accent: 'var(--accent)',
          positive: 'var(--positive)',
          negative: 'var(--negative)',
          warning: 'var(--warning)',
          danger: 'var(--danger)',
          info: 'var(--info)',
        },
        pf: {
          bg: 'var(--pf-bg)',
          card: 'var(--pf-card)',
          border: 'var(--pf-border)',
          accent: 'var(--pf-accent)',
          success: 'var(--pf-success)',
          warning: 'var(--pf-warning)',
          danger: 'var(--pf-danger)',
          text: 'var(--pf-text)',
          muted: 'var(--pf-muted)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        desk: 'var(--shadow-elev)',
        focus: 'var(--shadow-focus)',
      },
      borderRadius: {
        'desk-sm': 'var(--radius-sm)',
        'desk-md': 'var(--radius-md)',
        'desk-lg': 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
};
