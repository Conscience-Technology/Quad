import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "space-void": "var(--color-space-void)",
        "space-bg": "var(--color-space-bg)",
        "space-surface": "var(--color-space-surface)",
        "space-elevated": "var(--color-space-elevated)",
        "space-hover": "var(--color-space-hover)",
        "space-border": "var(--color-space-border)",
        "space-border-strong": "var(--color-space-border-strong)",
        "star-100": "var(--color-star-100)",
        "star-300": "var(--color-star-300)",
        "star-500": "var(--color-star-500)",
        "star-700": "var(--color-star-700)",
        "nebula-violet": "var(--color-nebula-violet)",
        "nebula-cyan": "var(--color-nebula-cyan)",
        "nebula-rose": "var(--color-nebula-rose)",
        "nebula-amber": "var(--color-nebula-amber)",
        "nebula-green": "var(--color-nebula-green)",
      },
      fontSize: {
        "2xs": ["10px", "1.4"],
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Malgun Gothic"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"Geist Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      transitionTimingFunction: {
        cosmos: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
