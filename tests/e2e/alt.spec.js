// 仕様: 「この本にはない」「なかった」「やらない」（欄の下のボタン）は、欄を隠すだけで、書いた内容を消さない。
// 押し直すと内容が戻る。再読み込み、保存した Markdown の読み込み、前の形（値が __alt__）の読み込みでも、印と内容が保たれる。
const { test, expect } = require("@playwright/test");
const { openTool, addManualBook, importState, current } = require("./helpers");

const KEY = "dokusho-memo.v2"; // ブラウザに残る状態の置き場
const S1 = "表題と序文 — 著者が述べている本のねらい";
const LINE = "テスト用の1行";
const ROWS = ["テスト用の箇所 1", "テスト用の箇所 2"];
const TODO = "テスト用のやること";

/* ラベルが label の欄（.item） */
const item = (page, label) => page.locator(".item").filter({ has: page.locator(".label .grow", { hasText: label }) });
const altBtn = (page, label, name) => item(page, label).getByRole("button", { name, exact: true });
const markdown = page => page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
/* Markdown のうち、読む人に見える部分（末尾の state より前） */
const visible = md => md.split("\n%%\n")[0];

async function newBook(page, title) {
  await openTool(page);
  await addManualBook(page, { title });
  // 閉じたときの処理（close イベント）は非同期なので、足した本が今の本になるまで待つ
  await page.waitForFunction(t => ((window.__dokusho.current() || {}).meta || {}).title === t, title);
}
/* 判定で「表面読みへ進む」を選び、「分からなかった所」に ROWS を書く */
async function writeUnclear(page) {
  await item(page, "判定").getByRole("button", { name: "表面読みへ進む", exact: true }).click();
  const it = item(page, "分からなかった所");
  for (const [i, row] of ROWS.entries()) {
    await it.getByRole("button", { name: "＋ 分からなかった所", exact: true }).click();
    await it.locator('input[type="text"]').nth(i).fill(row);
  }
  return it;
}
const rowValues = it => it.locator('input[type="text"]').evaluateAll(els => els.map(el => el.value));

test("下読みの欄に書いて「この本にはない」を押しても内容が残り、押し直すと戻る", async ({ page }) => {
  await newBook(page, "テスト用の本 1");
  const it = item(page, S1), btn = altBtn(page, S1, "この本にはない");
  await it.locator("textarea").fill(LINE);
  await btn.click();
  await expect(btn).toHaveClass(/on/);
  await expect(it.locator("textarea")).toHaveCount(0);
  await expect(page.locator("#prog")).toContainText("下読み 1/6");
  const md = await markdown(page);
  expect(md).toContain("- " + S1 + ": この本にはない\n");
  expect(visible(md), "隠れている内容は Markdown の本文に出ない").not.toContain(LINE);
  await btn.click();
  await expect(btn).not.toHaveClass(/on/);
  await expect(it.locator("textarea")).toHaveValue(LINE);
  expect(await markdown(page)).toContain("- " + S1 + ": " + LINE + "\n");
});

test("「分からなかった所」に2行書いて「なかった」を押しても内容が残り、押し直すと戻る", async ({ page }) => {
  await newBook(page, "テスト用の本 2");
  const it = await writeUnclear(page), btn = altBtn(page, "分からなかった所", "なかった");
  await btn.click();
  await expect(btn).toHaveClass(/on/);
  await expect(it.locator('input[type="text"]')).toHaveCount(0);
  await expect(it.getByRole("button", { name: "＋ 分からなかった所", exact: true })).toHaveCount(0);
  const md = await markdown(page);
  expect(md).toContain("- 分からなかった所: なかった\n");
  for (const row of ROWS) expect(visible(md), "隠れている行は Markdown の本文に出ない").not.toContain(row);
  await btn.click();
  await expect(btn).not.toHaveClass(/on/);
  await expect(it.locator('input[type="text"]')).toHaveCount(2);
  expect(await rowValues(it)).toEqual(ROWS);
  expect(await markdown(page)).toContain("- 分からなかった所:\n  - " + ROWS[0] + "\n  - " + ROWS[1] + "\n");
});

test("「やること」に書いて「やらない」を押しても内容が残り、押し直すと戻る", async ({ page }) => {
  await newBook(page, "テスト用の本 3");
  const it = item(page, "やること"), btn = altBtn(page, "やること", "やらない");
  await it.locator("textarea").fill(TODO);
  await btn.click();
  await expect(btn).toHaveClass(/on/);
  await expect(it.locator("textarea")).toHaveCount(0);
  const md = await markdown(page);
  expect(md).toContain("- やること: やらない\n");
  expect(visible(md)).not.toContain(TODO);
  await btn.click();
  await expect(btn).not.toHaveClass(/on/);
  await expect(it.locator("textarea")).toHaveValue(TODO);
});

test("「ない」にしたまま再読み込みしても、印も内容も残る", async ({ page }) => {
  await newBook(page, "テスト用の本 4");
  await item(page, S1).locator("textarea").fill(LINE);
  await altBtn(page, S1, "この本にはない").click();
  await writeUnclear(page);
  await altBtn(page, "分からなかった所", "なかった").click();
  await item(page, "やること").locator("textarea").fill(TODO);
  await altBtn(page, "やること", "やらない").click();
  const before = await current(page);

  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect(await current(page)).toEqual(before);
  for (const [label, name] of [[S1, "この本にはない"], ["分からなかった所", "なかった"], ["やること", "やらない"]])
    await expect(altBtn(page, label, name), label).toHaveClass(/on/);
  await expect(page.locator("#prog")).toContainText("下読み 1/6");

  await altBtn(page, S1, "この本にはない").click();
  await expect(item(page, S1).locator("textarea")).toHaveValue(LINE);
  await altBtn(page, "分からなかった所", "なかった").click();
  expect(await rowValues(item(page, "分からなかった所"))).toEqual(ROWS);
  await altBtn(page, "やること", "やらない").click();
  await expect(item(page, "やること").locator("textarea")).toHaveValue(TODO);
});

/* 前の形: 「ない」の印を、欄の値そのもの（"__alt__"）で持っていた */
const oldBook = id => ({ id, meta: { title: "前の形のテスト用の本", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
  v: { purpose: "テスト用の目的", s1: LINE, s3: "__alt__", s4: "__alt__", judge: "表面読みへ進む", points: ["テスト用の要点"], unclear: "__alt__", meaning: "テスト用の意義", action: "__alt__" } });

/* 前の形の本が、前と同じに見えること（印、進み具合、Markdown の出方）と、新しい形に直っていること */
async function expectOldBookKept(page) {
  for (const [label, name] of [["索引 — 載っているページが多い言葉", "この本にはない"], ["カバーのうたい文句 — 約束していること", "この本にはない"], ["分からなかった所", "なかった"], ["やること", "やらない"]]) {
    await expect(altBtn(page, label, name), label).toHaveClass(/on/);
    await expect(item(page, label).locator("textarea, input[type=text]"), label).toHaveCount(0);
  }
  await expect(altBtn(page, S1, "この本にはない")).not.toHaveClass(/on/);
  await expect(item(page, S1).locator("textarea")).toHaveValue(LINE);
  // 進み具合: 下読みは s1、s3、s4 の3つが済み。読了まで残るのは、下読みの3欄と、本の種類、何についての本か
  await expect(page.locator("#prog")).toContainText("下読み 3/6");
  await expect(page.locator("#prog")).toContainText("読了まで 5");
  const md = await markdown(page);
  expect(md).toContain("- " + S1 + ": " + LINE + "\n");
  expect(md).toContain("- 索引 — 載っているページが多い言葉: この本にはない\n");
  expect(md).toContain("- カバーのうたい文句 — 約束していること: この本にはない\n");
  expect(md).toContain("- 分からなかった所: なかった\n\n## ");
  expect(md).toContain("- やること: やらない\n");
  // 押し直すと空の欄が出て、そこに書いてもう一度押しても、内容が残る
  const it = item(page, "やること"), btn = altBtn(page, "やること", "やらない");
  await btn.click();
  await expect(it.locator("textarea")).toHaveValue("");
  await it.locator("textarea").fill(TODO);
  await btn.click();
  await btn.click();
  await expect(it.locator("textarea")).toHaveValue(TODO);
  await btn.click();
  await expect(btn).toHaveClass(/on/);
  // 新しい形では、欄の値に印（__alt__）を入れない
  expect(JSON.stringify(await current(page)), "直した state に __alt__ が残らない").not.toContain("__alt__");
  expect(await markdown(page)).not.toContain("__alt__");
}

test("前の形（値が __alt__）の state を読み込むと、「ない」の印が保たれ、進み具合と Markdown の出方が変わらない", async ({ page }) => {
  await openTool(page);
  await importState(page, oldBook("old-alt-1"));
  await expectOldBookKept(page);
  // 直した本を読み込み直しても、同じになる（2回目の変換で変わらない）
  // 先に別の本（サンプル）を今の本にしておく。読み込みが反映されてはじめて、今の本がこの本に戻る
  const once = await current(page);
  await page.locator("#bookSel").selectOption("sample-gakumon");
  await expect.poll(async () => (await current(page)).id).toBe("sample-gakumon");
  await importState(page, once);
  expect((await current(page)).id).toBe("old-alt-1");
  expect(await current(page)).toEqual(once);
});

test("ブラウザに残っている前の形（値が __alt__）の状態も、開くと直り、「ない」の印が保たれる", async ({ page }) => {
  await openTool(page);
  await page.evaluate(([key, book]) => {
    const s = JSON.parse(localStorage.getItem(key) || "null") || { books: [], seen: ["sample-gakumon"] };
    s.books = [book]; s.current = book.id;
    localStorage.setItem(key, JSON.stringify(s));
  }, [KEY, oldBook("old-alt-2")]);
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect((await current(page)).id).toBe("old-alt-2");
  await expectOldBookKept(page);
  // 直った形がブラウザに残り、開き直しても同じになる
  const once = await current(page);
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect(await current(page)).toEqual(once);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).not.toContain("__alt__");
});

test("「ない」にした本を保存した Markdown を読み込み直すと、印も内容も同じ状態に戻る", async ({ page }) => {
  await newBook(page, "テスト用の本 5");
  await item(page, S1).locator("textarea").fill(LINE);
  await altBtn(page, S1, "この本にはない").click();
  await writeUnclear(page);
  await altBtn(page, "分からなかった所", "なかった").click();
  await item(page, "やること").locator("textarea").fill(TODO);
  await altBtn(page, "やること", "やらない").click();
  const saved = await current(page), md = await markdown(page);

  // 保存したあとで、印を外して内容を書き換える。読み込み直すと、保存したときの状態に戻る
  await altBtn(page, S1, "この本にはない").click();
  await item(page, S1).locator("textarea").fill("テスト用の書き換え");
  await altBtn(page, "やること", "やらない").click();
  expect(await current(page)).not.toEqual(saved);

  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(md);
  await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  await page.locator("#dlgImport").waitFor({ state: "hidden" });
  await expect.poll(() => current(page)).toEqual(saved);
  expect(await markdown(page)).toBe(md);
  for (const [label, name] of [[S1, "この本にはない"], ["分からなかった所", "なかった"], ["やること", "やらない"]])
    await expect(altBtn(page, label, name), label).toHaveClass(/on/);
  await altBtn(page, S1, "この本にはない").click();
  await expect(item(page, S1).locator("textarea")).toHaveValue(LINE);
  await altBtn(page, "分からなかった所", "なかった").click();
  expect(await rowValues(item(page, "分からなかった所"))).toEqual(ROWS);
  await altBtn(page, "やること", "やらない").click();
  await expect(item(page, "やること").locator("textarea")).toHaveValue(TODO);
});

test.describe("390px の幅", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("「この本にはない」を押して戻しても、横にはみ出さず、ボタンが押せる大きさで出ている", async ({ page }) => {
    await newBook(page, "テスト用の本 6");
    const it = item(page, S1), btn = altBtn(page, S1, "この本にはない");
    await it.locator("textarea").fill(LINE);
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const on of [true, false]) {
      await btn.click();
      on ? await expect(btn).toHaveClass(/on/) : await expect(it.locator("textarea")).toHaveValue(LINE);
      expect(await over(), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
      const box = await btn.boundingBox();
      expect(box.height, "ボタンの高さ（px）").toBeGreaterThanOrEqual(32);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
  });
});
