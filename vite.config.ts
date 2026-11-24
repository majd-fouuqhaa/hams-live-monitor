import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

const src = fileURLToPath(new URL("./src", import.meta.url));
const untouchable = ["mock/**", "src/test/public/mockServiceWorker.js", "dist/**"];

export default defineConfig({
  resolve: {
    alias: { "@": src },
  },
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  staged: {
    "*": "vp check --fix",
    "src/**/*.{ts,tsx}": "node scripts/check-rtl.mjs",
  },
  fmt: {
    ignorePatterns: untouchable,
  },
  lint: {
    ignorePatterns: untouchable,
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        // shadcn/ui files export their cva variants next to the component by design.
        files: ["src/components/ui/**"],
        rules: { "react/only-export-components": "off" },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        // MSW's service worker is served only to browser tests, so it never ships in the production build.
        publicDir: "src/test/public",
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx", "src/**/*.browser.test.ts"],
          setupFiles: ["src/test/setup.browser.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            // Desktop by default: below `md` the conversation list lives in a closed Sheet.
            viewport: { width: 1280, height: 800 },
          },
        },
      },
    ],
  },
  run: {
    tasks: {
      "check:rtl": { command: "node scripts/check-rtl.mjs", cache: false },
      verify: {
        command: ["vp check", "node scripts/check-rtl.mjs", "vp test", "vp build"],
        cache: false,
      },
    },
  },
});
