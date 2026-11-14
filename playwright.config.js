// 読書メモ HTML（docs/index.html）の E2E 仕様。docs/ を静的に配り、Chromium の 1280x800 で開く。
const { defineConfig } = require("@playwright/test");
const PORT = 4173;
module.exports = defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}/`, viewport: { width: 1280, height: 800 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: { command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory docs`, url: `http://127.0.0.1:${PORT}/index.html`, reuseExistingServer: !process.env.CI, stdout: "ignore", stderr: "pipe" },
});
