/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial',
          '"Noto Sans"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"',
          'sans-serif',
          '"Apple Color Emoji"', '"Segoe UI Emoji"',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 4px 12px -2px rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
};
