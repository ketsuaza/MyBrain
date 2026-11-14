// 仕様で共通に使う道具。外への通信は止め、ブックリストは手元の book_principles.json を返す。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const BOOKLIST = JSON.parse(fs.readFileSync(path.join(ROOT, "book_principles.json"), "utf8"));
const SHOTS = path.join(ROOT, "screenshots");

/* docs/*.js（window.X = ... の形）を Node で読む */
function loadWindowJs(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "docs", file), "utf8"), sandbox);
  return sandbox.window;
}

/* HTML を開く。GitHub の book_principles.json は手元の版に、openBD は空の応答に差し替える */
async function openTool(page, opts = {}) {
  await page.route("https://raw.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.booklist || BOOKLIST) }));
  await page.route("https://api.openbd.jp/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.openbd || [null]) }));
  await page.goto("index.html");
  await page.locator("#app section").first().waitFor();
}

async function shot(page, name, target) {
  fs.mkdirSync(SHOTS, { recursive: true });
  // 画面より高い部品を撮ると、固定の見出しが途中に写り込む。撮るあいだだけ固定を外す
  if (target) await target.screenshot({ path: path.join(SHOTS, name + ".png"), style: "header { position: static !important; }" });
  else await page.screenshot({ path: path.join(SHOTS, name + ".png") });
}

/* 「本を足す」で、ブックリストを使わずに書誌を手で入れて本を作る */
async function addManualBook(page, meta) {
  await page.click("#btnNew");
  const f = page.locator("#formBook");
  for (const [k, v] of Object.entries(meta)) await f.locator(`input[name="${k}"]`).fill(v);
  await f.getByRole("button", { name: "決定" }).click();
  await page.locator("#dlgBook").waitFor({ state: "hidden" });
}

/* 規則の欄（ラベルの「規則N」）を含む .item */
const ruleItem = (page, r) => page.locator(".item").filter({ has: page.locator(".rule", { hasText: new RegExp("^規則" + r + "$") }) });

module.exports = { ROOT, BOOKLIST, SHOTS, loadWindowJs, openTool, shot, addManualBook, ruleItem };
