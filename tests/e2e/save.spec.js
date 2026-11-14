// 仕様5: 「Obsidian に保存」で、vault「MyBrain」の 60_notes/読書メモ/ に、有効な Obsidian の Markdown ができる。
// obsidian:// は Obsidian でしか開けないので、HTML が開こうとした URI を捕まえ、Obsidian と同じく仮の vault に書き出して確かめる。
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { test, expect } = require("@playwright/test");
const { ROOT, openTool, addManualBook, shot } = require("./helpers");

const FOLDER = "60_notes/読書メモ";
const BAD_NAME = /[\\/:*?"<>|#^\[\]]/; // Obsidian のファイル名・リンクで使えない文字

/* HTML が開こうとした obsidian:// の URI を受け取る */
async function captureSave(page) {
  await page.evaluate(() => { window.__opened = []; window.__dokusho.openUri = u => window.__opened.push(u); });
  await page.locator('button[data-a="save"]').click();
  const [uri] = await page.evaluate(() => window.__opened);
  return uri;
}
/* obsidian://new を、Obsidian と同じく vault の中のファイルに書き出す */
function writeLikeObsidian(uri, vaultDir) {
  const u = new URL(uri);
  expect(u.protocol).toBe("obsidian:");
  expect(u.host).toBe("new");
  const q = u.searchParams;
  expect(q.get("vault")).toBe("MyBrain");
  expect(q.get("overwrite")).toBe("true");
  const file = path.join(vaultDir, q.get("file") + ".md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, q.get("content"));
  return { rel: q.get("file"), file, content: q.get("content") };
}
function validate(rel, content, title) {
  expect(path.posix.dirname(rel), "保存先のフォルダ").toBe(FOLDER);
  expect(BAD_NAME.test(path.posix.basename(rel)), `ファイル名「${path.posix.basename(rel)}」に使えない文字がある`).toBe(false);
  const m = /^---\n([\s\S]*?)\n---\n/.exec(content);
  expect(m, "frontmatter がある").not.toBeNull();
  const fm = yaml.load(m[1]);
  expect(fm.tags).toEqual(["読書メモ"]);
  expect(String(fm.title)).toBe(title);
  for (const k of ["author", "publisher", "published", "isbn", "booklist_no", "status", "depth", "started", "finished"]) expect(fm, `frontmatter の ${k}`).toHaveProperty(k);
  expect(content).toContain("\n# " + title + "\n");
  const st = /```state\n([\s\S]*?)\n```/.exec(content);
  expect(st, "末尾に state がある").not.toBeNull();
  return { fm, state: JSON.parse(st[1]) };
}

test("サンプルを保存すると、60_notes/読書メモ/ に有効な Markdown ができ、読み込み直すと元に戻る", async ({ page }, info) => {
  const vault = path.join(ROOT, "test-results", "vault-" + info.workerIndex);
  await openTool(page);
  const book = await page.evaluate(() => window.__dokusho.current());
  const uri = await captureSave(page);
  await expect(page.locator("#msg")).toHaveText("Obsidian に送った。");
  await shot(page, "08-saved", page.locator("#sec-checkout"));
  const { rel, file, content } = writeLikeObsidian(uri, vault);
  expect(fs.existsSync(path.join(vault, FOLDER, "【サンプル】学問のすすめ.md"))).toBe(true);
  const { fm, state } = validate(rel, content, "【サンプル】学問のすすめ");
  expect(fm.depth).toBe("分析");
  expect(state).toEqual(book);
  // 書き出したファイルを「読み込む」に貼ると、同じ本になる
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(fs.readFileSync(file, "utf8"));
  await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  expect(await page.evaluate(() => window.__dokusho.current())).toEqual(book);
});

test("記号を含む書誌でも、frontmatter が有効で、ファイル名に使えない文字が入らない", async ({ page }, info) => {
  const vault = path.join(ROOT, "test-results", "vault-" + info.workerIndex);
  const title = 'テスト: 規則/1 #a "引用" [注]?';
  await openTool(page);
  await addManualBook(page, { title, author: "A: B", publisher: "#出版", published: "2004-07: 第2版", isbn: "978-4-00-000000-0", booklist_no: "12", started: "2026-11-15" });
  const { rel, content } = writeLikeObsidian(await captureSave(page), vault);
  const { fm } = validate(rel, content, title);
  expect(fm.author).toBe("A: B");
  expect(fm.publisher).toBe("#出版");
  expect(String(fm.published)).toBe("2004-07: 第2版");
});
