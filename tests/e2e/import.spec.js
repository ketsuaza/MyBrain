// 仕様: 自由メモにコードブロックがあっても、保存した読書メモを読み込める（issue #57）。
// 自由メモを書いた本を保存し（HTML が Obsidian に送る Markdown を捕まえる）、その Markdown を「読み込む」に貼って、同じ状態に戻ることを確かめる。
const { test, expect } = require("@playwright/test");
const { openTool, importState, current } = require("./helpers");

const F = "```";
function base(memo) {
  return { id: "t-import", meta: { title: "読み込みのテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { purpose: "テスト用の目的", budget: "1時間", judge: "点検読書で終える", kind: "理論書", unity: { what: "学問", claim: "学べ" }, terms: [{ w: "用語A", m: "意味", p: "1", g: false }], memo: memo || "" } };
}
/* 本の形をした、別の JSON（自由メモに書かれていても、こちらを読み込んではいけない） */
const OTHER = JSON.stringify({ id: "t-import-other", meta: { title: "自由メモの中の別の本" }, v: { purpose: "別の本の目的" }, skip: {} });
const MEMOS = [
  ["issue の手順どおりの3行（JSON だが本の形でない）", [F + "state", '{"a":"b"}', F].join("\n")],
  ["中身が JSON でない state のブロック", ["前置き", F + "state", "これは JSON ではない { [", F, "後書き"].join("\n")],
  ["本の形をした別の JSON の state のブロック", [F + "state", OTHER, F].join("\n")],
  ["state のブロックが2つ（本の形の JSON と、JSON でないもの）", [F + "state", OTHER, F, "", F + "state", "x", F].join("\n")],
  ["%% だけの行と、``` だけの行", ["%%", "コメントのつもり", "%%", F, "コード", F, "%%"].join("\n")],
  ["閉じていない state のブロック", ["メモ", F + "state"].join("\n")],
  ["言語の指定がないコードブロックと、表の記号", [F, "{}", F, "| a | b |", "# 見出し"].join("\n")],
];
async function setup(page, book) {
  await openTool(page);
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose);
}
/* 「Obsidian に保存」で HTML が送る Markdown（obsidian:// の content） */
async function savedMarkdown(page) {
  await page.evaluate(() => { window.__opened = []; window.__dokusho.openUri = u => window.__opened.push(u); });
  await page.locator('button[data-a="save"]').click();
  const [uri] = await page.evaluate(() => window.__opened);
  return new URL(uri).searchParams.get("content");
}
/* 「読み込む」に text を貼って、読み込む。出たメッセージ（alert）を alerts に集める。
   中身を変えた同じ本を置き換える前の確認（confirm。#59）は、メッセージには数えず、受ける */
function watchAlerts(page) { const alerts = []; page.on("dialog", d => { if (d.type() !== "confirm") alerts.push(d.message()); d.accept(); }); return alerts; }
async function paste(page, text) {
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(text);
  await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  await page.locator("#dlgImport").waitFor({ state: "hidden" });
}
/* いまの画面: 出たメッセージ、今の本の id、「この本を読む目的」と自由メモの欄の値 */
const seen = async (page, alerts) => ({ alerts: alerts.slice(), id: (await current(page)).id, purpose: await page.locator("#app textarea[data-p='purpose']").inputValue(), memo: await page.locator("#app textarea[data-p='memo']").inputValue() });

for (const [name, memo] of MEMOS) {
  test("自由メモに" + name + "を書いた本を保存し、読み込み直すと、同じ状態に戻る", async ({ page }) => {
    const alerts = watchAlerts(page);
    await setup(page, base());
    // 自由メモは、画面の欄に書く
    await page.locator("#app textarea[data-p='memo']").fill(memo);
    const book = await current(page);
    expect(book.v.memo).toBe(memo);
    const md = await savedMarkdown(page);
    expect(md, "保存した Markdown に、自由メモがそのまま入る").toContain("## 自由メモ\n\n" + memo + "\n");
    // 保存したあとで書き換える。読み込み直すと、保存したときの状態に戻る
    await page.locator("#app textarea[data-p='purpose']").fill("保存のあとで書き換えた");
    await page.locator("#app textarea[data-p='memo']").fill("消した");
    await paste(page, md);
    await expect.poll(() => seen(page, alerts)).toEqual({ alerts: [], id: book.id, purpose: "テスト用の目的", memo });
    expect(await current(page)).toEqual(book);
    expect(await page.locator("#bookSel option").allInnerTexts(), "自由メモの中の本は、一覧に足されない").not.toContain("自由メモの中の別の本");
    // 読み込み直した本を保存すると、同じ Markdown になる
    expect(await savedMarkdown(page)).toBe(md);
  });
}

test("「Markdown をコピー」でコピーした Markdown も、自由メモに state のブロックがあって、読み込める", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const alerts = watchAlerts(page);
  await setup(page, base());
  await page.locator("#app textarea[data-p='memo']").fill(MEMOS[0][1]);
  const book = await current(page);
  await page.locator('button[data-a="copy"]').click();
  await expect(page.locator("#msg")).toHaveText("コピーした。");
  const md = await page.evaluate(() => navigator.clipboard.readText());
  await page.locator("#app textarea[data-p='memo']").fill("");
  await paste(page, md);
  await expect.poll(() => seen(page, alerts)).toEqual({ alerts: [], id: book.id, purpose: "テスト用の目的", memo: MEMOS[0][1] });
  expect(await current(page)).toEqual(book);
});

test("ほかの欄（複数行の欄、用語）に state のブロックのような文字があっても、読み込み直せる", async ({ page }) => {
  const alerts = watchAlerts(page);
  const b = base("メモ"); b.v.purpose = ["1行目", F + "state", "{}", F].join("\n"); b.v.terms[0].m = F + "state";
  await openTool(page);
  await importState(page, b);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(b.v.purpose);
  const md = await savedMarkdown(page);
  await page.locator("#app textarea[data-p='purpose']").fill("書き換えた");
  await paste(page, md);
  await expect.poll(() => seen(page, alerts)).toEqual({ alerts: [], id: b.id, purpose: b.v.purpose, memo: "メモ" });
  expect(await current(page)).toEqual(b);
});

test("これまでどおり: state のない文を貼ると「読み込めなかった」と出て、今の本は変わらない", async ({ page }) => {
  const alerts = watchAlerts(page);
  await setup(page, base("メモ"));
  const book = await current(page);
  for (const [text, msg] of [["state のない、ただの文", "読み込めなかった: state が見つからない"], ["# 見出し\n\n" + F + "js\n{}\n" + F, "読み込めなかった: state が見つからない"],
    [F + "state\n" + JSON.stringify(book), "読み込めなかった: state が見つからない"], [F + "state\n" + '{"a":"b"}' + "\n" + F, "読み込めなかった: state の形が違う"]]) {
    alerts.length = 0;
    await paste(page, text);
    await expect.poll(() => alerts.slice()).toEqual([msg]);
    expect(await current(page), "今の本は変わらない").toEqual(book);
  }
  // 壊れた JSON でも、読み込めなかったと出る
  alerts.length = 0;
  await paste(page, F + "state\n{ 壊れた JSON\n" + F);
  await expect.poll(() => alerts.length).toBe(1);
  expect(alerts[0]).toContain("読み込めなかった: ");
  expect(await current(page)).toEqual(book);
});

test("これまでどおり: state だけを貼る形でも、Markdown の全文の前後に文があっても、読み込める", async ({ page }) => {
  const alerts = watchAlerts(page);
  await setup(page, base("メモ"));
  const book = await current(page);
  const md = await savedMarkdown(page);
  // state だけ
  await page.locator("#app textarea[data-p='purpose']").fill("書き換えた1");
  await paste(page, F + "state\n" + JSON.stringify(book) + "\n" + F);
  await expect.poll(() => seen(page, alerts)).toEqual({ alerts: [], id: book.id, purpose: "テスト用の目的", memo: "メモ" });
  // 手で整形した state（複数行の JSON）
  await page.locator("#app textarea[data-p='purpose']").fill("書き換えた2");
  await paste(page, F + "state\n" + JSON.stringify(book, null, 2) + "\n" + F + "\n");
  await expect.poll(() => seen(page, alerts)).toEqual({ alerts: [], id: book.id, purpose: "テスト用の目的", memo: "メモ" });
  // 全文の前に文がある
  await page.locator("#app textarea[data-p='purpose']").fill("書き換えた3");
  await paste(page, "前に足した文\n\n" + md);
  await expect.poll(() => seen(page, alerts)).toEqual({ alerts: [], id: book.id, purpose: "テスト用の目的", memo: "メモ" });
  expect(await current(page)).toEqual(book);
});
