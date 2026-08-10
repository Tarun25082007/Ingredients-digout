/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#84cc16', // lime-500
          dark: '#059669',  // emerald-600
        }
      }
    },
  },
  plugins: [],
}
