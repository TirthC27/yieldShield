/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060a14",
          900: "#0a0f1e",
          800: "#0f1629",
          700: "#161e35",
          600: "#1e293b",
        },
        accent: {
          orange: "#f59e0b",
          amber: "#fbbf24",
          gold: "#d4a017",
          cyan: "#06b6d4",
          purple: "#7c3aed",
          green: "#22c55e",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      animation: {
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(245,158,11,0.2)" },
          "50%": { boxShadow: "0 0 24px rgba(245,158,11,0.4)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
