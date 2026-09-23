import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182322",
        muted: "#586664",
        line: "#d9dfdc",
        canvas: "#f5f6f4",
        accent: "#185d51",
        warning: "#945925",
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
