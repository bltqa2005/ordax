import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0D10",
        bg2: "#12161B",
        card: "#171C22",
        accent: "#FF5500",
        ink: "#F3F4F6",
        mute: "#8B949E",
        win: "#3FA672",
        loss: "#B5524B",
        line: "#252B33",
        steel: "#2B323B",
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,85,0,.35), 0 0 22px rgba(255,85,0,.10)",
      },
    },
  },
  plugins: [],
};

export default config;
