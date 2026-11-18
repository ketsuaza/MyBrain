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

/* HTML を開く。GitHub の book_principles.json は手元の版に、openBD は空の応答に差し替える。
   入力の画面は、ブックリストの取得を待たずに出る（#62）。「本を足す」の表をすぐに見る仕様が、届く前の表を見ないよう、ブックリストが届くまで待つ
   （届かない場合、届く前の場合を確かめる仕様は、この道具を使わずに開く） */
async function openTool(page, opts = {}) {
  await page.route("https://raw.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.booklist || BOOKLIST) }));
  await page.route("https://api.openbd.jp/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.openbd || [null]) }));
  await page.goto("index.html");
  await page.locator("#app section").first().waitFor();
  await page.waitForFunction(() => window.__dokusho.listed());
}

async function shot(page, name, target) {
  fs.mkdirSync(SHOTS, { recursive: true });
  // 画面より高い部品を撮ると、固定の見出しが途中に写り込む。撮るあいだだけ固定を外す
  if (target) await target.screenshot({ path: path.join(SHOTS, name + ".png"), style: "header { position: static !important; }" });
  else await page.screenshot({ path: path.join(SHOTS, name + ".png") });
}

/* ダイアログを閉じたときの処理（close イベント）は非同期で、その中で本の一覧が変わり、画面が描き直される。
   いまの画面に印を付けてから fn を行い、描き直されて印が消えるまで待つ。
   ダイアログが閉じるのを待つだけでは、直後の入力が前の本に入ることがある。今の本の id を待つだけでは、同じ id の本を読み込んだときに、反映の前に戻る */
async function untilRedrawn(page, fn) {
  await page.evaluate(() => { document.getElementById("app").firstElementChild.setAttribute("data-e2e-stale", "1"); });
  await fn();
  await page.waitForFunction(() => !document.querySelector("#app [data-e2e-stale]"));
}

/* 「本を足す」で、ブックリストを使わずに書誌を手で入れて本を作る。足した本が今の本になる（画面が描き直される）まで待つ */
async function addManualBook(page, meta) {
  await page.click("#btnNew");
  const f = page.locator("#formBook");
  for (const [k, v] of Object.entries(meta)) await f.locator(`input[name="${k}"]`).fill(v);
  await untilRedrawn(page, async () => {
    await f.getByRole("button", { name: "決定" }).click();
    await page.locator("#dlgBook").waitFor({ state: "hidden" });
  });
}

/* 「読み込む」に state を貼って、本を1冊入れる（前の形の state も、新しい形に直って入る）。今の本と同じ id の本を読み込んだときも、読み込みが反映されるまで待つ */
async function importState(page, book) {
  await untilRedrawn(page, async () => {
    await page.click("#btnImport");
    await page.locator("#formImport textarea").fill("```state\n" + JSON.stringify(book) + "\n```");
    await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
    await page.locator("#dlgImport").waitFor({ state: "hidden" });
  });
  // 読み込んだ本が今の本になっている
  await page.waitForFunction(id => (window.__dokusho.current() || {}).id === id, book.id);
}
const current = page => page.evaluate(() => window.__dokusho.current());

/* 規則の欄（ラベルの「規則N」）を含む .item */
const ruleItem = (page, r) => page.locator(".item").filter({ has: page.locator(".rule", { hasText: new RegExp("^規則" + r + "$") }) });

module.exports = { ROOT, BOOKLIST, SHOTS, loadWindowJs, openTool, shot, addManualBook, ruleItem, importState, current, untilRedrawn };
