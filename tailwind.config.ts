import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
          900: "#172554",
        },
        gold: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
      },
      backgroundImage: {
        "app-gradient":
          "radial-gradient(circle at 8% 8%, rgba(37,99,235,0.16), transparent 40%), radial-gradient(circle at 92% 12%, rgba(245,158,11,0.16), transparent 42%), radial-gradient(circle at 50% 100%, rgba(16,185,129,0.14), transparent 45%), linear-gradient(180deg, #f1f5fb 0%, #eef2f9 100%)",
        "login-gradient":
          "radial-gradient(circle at 15% 20%, rgba(37,99,235,0.55), transparent 45%), radial-gradient(circle at 85% 15%, rgba(245,158,11,0.4), transparent 45%), radial-gradient(circle at 50% 100%, rgba(16,185,129,0.35), transparent 50%), linear-gradient(160deg, #0b1220 0%, #101a33 55%, #0b1220 100%)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(15, 23, 42, 0.12)",
        "glass-dark": "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;
