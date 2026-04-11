/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          card:    '#181c25',
          border:  '#252a38',
          muted:   '#2e3447',
        },
        brand: {
          DEFAULT: '#3b82f6',
          dim:     '#1d4ed8',
        },
        rx: '#22d3ee',
        tx: '#f472b6',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
