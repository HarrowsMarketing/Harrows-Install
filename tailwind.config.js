/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        harrows: {
          yellow: '#EBA117',
          charcoal: '#1E293B',
        },
      },
    },
  },
  plugins: [],
}
