/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // SwiftShip brand
        brand: {
          50:  '#f0f7ff',
          100: '#dceeff',
          200: '#b5d9ff',
          300: '#84beff',
          400: '#4f9aff',
          500: '#2976ff',
          600: '#1859f0',
          700: '#1546d6',
          800: '#173bab',
          900: '#193783',
          950: '#142358',
        },
      },
    },
  },
  plugins: [],
};
