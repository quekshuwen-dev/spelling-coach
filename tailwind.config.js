/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // One friendly palette, used everywhere. Kept small on purpose.
        ink: { DEFAULT: '#2D1F0E', soft: '#7A5C3A' },
        grape: { 50: '#FFF3E0', 100: '#FFE0B2', 400: '#FFA040', DEFAULT: '#FF5722', 600: '#E64A19' },
        leaf: { 50: '#E9F9EE', DEFAULT: '#34C759', 600: '#1F9B42' },
        berry: { 50: '#FFEDF1', DEFAULT: '#FF4D6D', 600: '#D62B4C' },
        sunny: { 50: '#FFF7E0', DEFAULT: '#FF9F1C', 600: '#D97E00' },
        cream: '#FFF3E0',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: { soft: '0 6px 22px rgba(255, 87, 34, 0.18)' },
      keyframes: {
        bob: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pop: { '0%': { transform: 'scale(0.8)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        fall: { '0%': { transform: 'translateY(-10vh)', opacity: '1' }, '100%': { transform: 'translateY(110vh) rotate(360deg)', opacity: '0' } },
        pulseRing: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(255,77,109,0.5)' },
          '50%': { boxShadow: '0 0 0 22px rgba(255,77,109,0)' },
        },
      },
      animation: {
        bob: 'bob 2.5s ease-in-out infinite',
        pop: 'pop 0.25s ease-out',
        fall: 'fall 2.6s ease-in forwards',
        pulseRing: 'pulseRing 1s infinite',
      },
    },
  },
  plugins: [],
}
