/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        custom: {
          900: '#092328', // Very dark teal
          700: '#12544F', // Dark teal
          500: '#2A835F', // Medium emerald
          300: '#8BBB92', // Light sage
        },
        primary: {
          light: '#2A835F', // mapped to custom-500
          dark: '#12544F',  // mapped to custom-700
        },
        emerald: {
          50: '#ebf3ed',  // 5% of 8BBB92
          100: '#d7e7da', // 15% of 8BBB92
          200: '#8BBB92', // Light sage
          300: '#8BBB92',
          400: '#2A835F', // Medium emerald
          500: '#2A835F', 
          600: '#12544F', // Dark teal
          700: '#12544F', 
          800: '#092328', // Very dark teal
          900: '#092328',
          950: '#041113', 
        }
      }
    },
  },
  plugins: [],
}
