// 仕様: ブックリストの取得を待たずに、入力の画面を出す（issue #62）。
// 取得に応答がないあいだも、入力の画面が1秒以内に出る。その間に「本を足す」を開くと「ブックリストを読み込み中」と出て、書誌を手で入れて本を足せる。
// ブックリストが届くと、開いたままの「本を足す」の表に出る（検索の文字、書誌の欄に入れた文字を壊さない）。取得に失敗したときの表示は変わらない。
const { test, expect } = require("@playwright/test");
const { BOOKLIST, current, loadWindowJs } = require("./helpers");

const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
const LIST_URL = "https://raw.githubusercontent.com/**";
/* ブックリストの取得を、応答しないまま止めて開く。返り値の release() を呼ぶと、そのときに応答する（渡した fn で応答する。省くと、手元のブックリストを返す） */
async function openHeld(page) {
  let held = null; const got = new Promise(done => { held = done; });
  await page.route(LIST_URL, r => { held(r); });
  await page.route("https://api.openbd.jp/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[null]" }));
  const t0 = Date.now();
  await page.goto("index.html");
  return { t0, release: async fn => { const r = await got; await (fn ? fn(r) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BOOKLIST) })); } };
}
const rows = page => page.locator("#pickHits tbody tr");

test("issue の手順: ブックリストの取得に応答がなくても、入力の画面が1秒以内に出る", async ({ page }) => {
  const { t0 } = await openHeld(page);
  await page.locator("#app section").first().waitFor({ timeout: 1000 });
  expect(Date.now() - t0, "開いてから、入力の画面が出るまで（ミリ秒）").toBeLessThan(1000);
  // サンプルの本が出ていて、入力もできる
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  await page.locator("#app textarea[data-p='purpose']").fill("取得を待たずに書いた目的");
  expect((await current(page)).v.purpose).toBe("取得を待たずに書いた目的");
});

test("取得のあいだに「本を足す」を開くと「ブックリストを読み込み中」と出て、書誌を手で入れて本を足せる", async ({ page }) => {
  await openHeld(page);
  await page.locator("#app section").first().waitFor({ timeout: 1000 });
  await page.click("#btnNew");
  await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
  await expect(page.locator("#pickHits")).not.toContainText("ブックリストを読めなかった");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator("#pickCount")).toHaveText("読み込み中");
  // 検索の欄に打っても、読み込み中のまま
  await page.locator("#pickQ").fill("あ");
  await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
  await page.locator('#formBook input[name="title"]').fill("手で入れた本");
  await page.locator('#formBook input[name="author"]').fill("手で入れた著者");
  await page.locator("#formBook").getByRole("button", { name: "決定" }).click();
  await expect(page.locator("#bookSel option:checked")).toHaveText("手で入れた本");
  expect((await current(page)).meta).toMatchObject({ title: "手で入れた本", author: "手で入れた著者" });
});

test("ブックリストが届くと、開いたままの「本を足す」の表に出る。検索の文字、書誌の欄に入れた文字、フォーカスとカーソルは変わらない", async ({ page }) => {
  const { release } = await openHeld(page);
  await page.locator("#app section").first().waitFor({ timeout: 1000 });
  await page.click("#btnNew");
  await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
  const word = BOOKLIST[0].title.slice(0, 2), hits = BOOKLIST.filter(b => String(b.title).toLowerCase().includes(word.toLowerCase())).length;
  await page.locator("#pickQ").fill(word);
  const title = page.locator('#formBook input[name="title"]');
  await title.fill("書きかけの書名");
  await title.evaluate(el => { el.__same = true; el.setSelectionRange(2, 2); });
  await release();
  await expect(rows(page)).toHaveCount(hits);
  await expect(page.locator("#pickCount")).toHaveText(hits + "件 / 全" + BOOKLIST.length + "件");
  await expect(page.locator("#pickHits")).not.toContainText("読み込み中");
  await expect(page.locator("#pickQ")).toHaveValue(word);
  expect(await page.evaluate(() => { const el = document.activeElement; return [el.__same === true, el.name, el.value, el.selectionStart]; }), "書誌の欄は、同じ部品のまま").toEqual([true, "title", "書きかけの書名", 2]);
  // 検索の文字を消すと、全件が出る。行を選ぶと、書誌の欄に入る
  await page.locator("#pickQ").fill("");
  await expect(rows(page)).toHaveCount(BOOKLIST.length);
  await rows(page).first().click();
  await expect(rows(page).first()).toHaveClass(/sel/);
  await expect(title).not.toHaveValue("書きかけの書名");
});

test("「本を足す」を閉じているあいだに届いたブックリストも、次に開くと表に出る。書誌のダイアログ（今の本）には、表を出さない", async ({ page }) => {
  const { release } = await openHeld(page);
  await page.locator("#app section").first().waitFor({ timeout: 1000 });
  await page.click("#btnEdit");
  await expect(page.locator("#pick")).toBeHidden();
  const t = await page.locator('#formBook input[name="title"]').inputValue();
  await release();
  await expect.poll(() => page.evaluate(() => window.__dokusho.listed())).toBe(true);
  await expect(page.locator("#pick")).toBeHidden();
  await expect(page.locator('#formBook input[name="title"]')).toHaveValue(t);
  await page.locator("#formBook").getByRole("button", { name: "やめる" }).click();
  await page.click("#btnNew");
  await expect(rows(page)).toHaveCount(BOOKLIST.length);
});

for (const [name, fail] of [["エラーの応答（500）", r => r.fulfill({ status: 500, body: "error" })], ["通信の失敗", r => r.abort()]]) {
  test("取得に失敗したとき（" + name + "）の表示は変わらない: 開いたままの「本を足す」が「ブックリストを読めなかった」になる", async ({ page }) => {
    const { release } = await openHeld(page);
    await page.locator("#app section").first().waitFor({ timeout: 1000 });
    await page.click("#btnNew");
    await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
    await release(fail);
    await expect(page.locator("#pickHits")).toContainText("ブックリストを読めなかった（通信を確かめて、開き直す）。下の欄に直接書くこともできる。");
    await expect(page.locator("#pickHits")).not.toContainText("読み込み中");
    await expect(page.locator("#pickCount")).toHaveText("0件 / 全0件");
  });
}

test("8秒たっても応答がないときは、諦めて「ブックリストを読めなかった」と出す", async ({ page }) => {
  await page.clock.install();
  await openHeld(page);
  await page.locator("#app section").first().waitFor();
  await page.click("#btnNew");
  await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
  await page.clock.fastForward(7000);
  await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
  await page.clock.fastForward(1500);
  await expect(page.locator("#pickHits")).toContainText("ブックリストを読めなかった");
});

test("見張り: sample.js と factcheck.js は、これまでどおり、読めてから画面を出す（サンプルが足され、ファクトチェックの結果が出る）", async ({ page }) => {
  let held = null; const got = new Promise(done => { held = done; });
  await page.route("**/sample.js*", r => { held(r); });
  await page.route(LIST_URL, () => {});
  await page.goto("index.html", { waitUntil: "commit" });
  const route = await got;
  // sample.js が読めるまでは、入力の画面も、「本を足す」からの案内も出さない
  await expect(page.locator("#bookSel")).toBeVisible();
  expect(await page.locator("#app").innerHTML()).toBe("");
  await route.continue();
  await page.locator("#app section").first().waitFor();
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  await expect(page.locator("#sec-a3 .fc").first()).toBeVisible();
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、読み込み中の表示と、届いたあとの表が出て、ページは横にはみ出さない", async ({ page }) => {
    const { release } = await openHeld(page);
    await page.locator("#app section").first().waitFor({ timeout: 1000 });
    await page.click("#btnNew");
    await expect(page.locator("#pickHits")).toContainText("ブックリストを読み込み中");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBe(0);
    const box = await page.locator("#dlgBook").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    await release();
    await expect(rows(page)).toHaveCount(BOOKLIST.length);
    expect(await overflow()).toBe(0);
  });
});
