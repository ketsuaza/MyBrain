// 仕様: キーボードで「↑」「↓」「×」を押したあと、フォーカスのある部品が、固定の見出しの下や画面の外に出たときは、見える所まで画面が動く（issue #75）。
// フォーカスのある部品が見えているときは、画面の縦の位置は変わらない（issue #54 のまま）。マウスで押したときの動きも変わらない。
const { test, expect } = require("@playwright/test");
const { openTool, ruleItem, current, loadWindowJs } = require("./helpers");

const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
const IDS = SAMPLE.v.parts.map(o => o.id);
const btn = (page, a, i) => ruleItem(page, 3).locator('button[data-a="' + a + '"][data-p="parts"][data-i="' + i + '"]');
const scrollY = page => page.evaluate(() => window.scrollY);
/* いまフォーカスのある部品の、働きと位置。head は固定の見出しの下端、vh は画面の高さ */
const where = page => page.evaluate(() => { const el = document.activeElement, r = el.getBoundingClientRect();
  return { a: el.dataset.a, p: el.dataset.p, i: el.dataset.i, top: r.top, bottom: r.bottom, head: document.querySelector("header").getBoundingClientRect().bottom, vh: window.innerHeight }; });
/* 部品の上端が、固定の見出しの下端から gap px 下に来るように画面を動かし、画面を動かさずにフォーカスを置く */
async function putBelowHeader(page, loc, gap) {
  await loc.evaluate((el, gap) => { window.scrollBy(0, el.getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom - gap); el.focus({ preventScroll: true }); }, gap);
  await expect(loc).toBeFocused();
  const w = await where(page);
  expect(Math.round(w.top - w.head), "置いた部品の上端と、見出しの下端の間").toBe(gap);
}
/* 部品の下端が、画面の下端から gap px 上に来るように画面を動かし、画面を動かさずにフォーカスを置く */
async function putAboveBottom(page, loc, gap) {
  await loc.evaluate((el, gap) => { window.scrollBy(0, el.getBoundingClientRect().bottom - window.innerHeight + gap); el.focus({ preventScroll: true }); }, gap);
  await expect(loc).toBeFocused();
  const w = await where(page);
  expect(Math.round(w.vh - w.bottom), "置いた部品の下端と、画面の下端の間").toBe(gap);
}
/* フォーカスのある部品が、見出しの下から画面の下端までに、全部入っている */
function expectVisible(w, what) {
  expect(w.top, what + ": 上端（" + w.top + "px）が、固定の見出しの下端（" + w.head + "px）より下").toBeGreaterThanOrEqual(w.head);
  expect(w.bottom, what + ": 下端（" + w.bottom + "px）が、画面の下端（" + w.vh + "px）より上").toBeLessThanOrEqual(w.vh);
}
const order = async page => (await current(page)).v.parts.map(o => o.id);
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("サンプルの本: 見出しのすぐ下の「↑」を Enter で押すと、行が上へ動いても、フォーカスのある「↑」が見出しの下に見えている", async ({ page }) => {
  await openTool(page);
  await putBelowHeader(page, btn(page, "up", 3), 8);
  const y = await scrollY(page);
  await page.keyboard.press("Enter");
  expect(await order(page)).toEqual([IDS[0], IDS[1], IDS[3], IDS[2], IDS[4]]);
  let w = await where(page);
  expect({ a: w.a, p: w.p, i: w.i }, "フォーカスは、動かした行の「↑」").toEqual({ a: "up", p: "parts", i: "2" });
  expectVisible(w, "「↑」");
  expect(w.top - w.head, "動かす量は最小限（見出しのすぐ下）").toBeLessThanOrEqual(8);
  expect(await scrollY(page), "画面は上へ動いた").toBeLessThan(y);
  // 続けて押しても、同じように見えている。次の Tab は、隣の「↓」へ進む
  await page.keyboard.press("Enter");
  expect(await order(page)).toEqual([IDS[0], IDS[3], IDS[1], IDS[2], IDS[4]]);
  w = await where(page);
  expect({ a: w.a, i: w.i }).toEqual({ a: "up", i: "1" });
  expectVisible(w, "2回目の「↑」");
  await page.keyboard.press("Tab");
  w = await where(page);
  expect({ a: w.a, i: w.i }).toEqual({ a: "down", i: "1" });
});

test("サンプルの本: 画面の下端の「↓」を Space で押すと、行が下へ動いても、フォーカスのある「↓」が画面の中に見えている", async ({ page }) => {
  await openTool(page);
  await putAboveBottom(page, btn(page, "down", 1), 8);
  const y = await scrollY(page);
  await page.keyboard.press("Space");
  expect(await order(page)).toEqual([IDS[0], IDS[2], IDS[1], IDS[3], IDS[4]]);
  const w = await where(page);
  expect({ a: w.a, p: w.p, i: w.i }, "フォーカスは、動かした行の「↓」").toEqual({ a: "down", p: "parts", i: "2" });
  expectVisible(w, "「↓」");
  expect(w.vh - w.bottom, "動かす量は最小限（画面の下端のすぐ上）").toBeLessThanOrEqual(8);
  expect(await scrollY(page), "画面は下へ動いた").toBeGreaterThan(y);
});

test("サンプルの本: 見出しのすぐ下の、末尾の行の「×」を Enter で押すと、前の行の「×」にフォーカスが移り、見出しの下に見えている", async ({ page }) => {
  await openTool(page);
  const last = IDS.length - 1;
  await putBelowHeader(page, btn(page, "del", last), 8);
  const y = await scrollY(page);
  await page.keyboard.press("Enter");
  expect(await order(page)).toEqual(IDS.slice(0, last));
  const w = await where(page);
  expect({ a: w.a, p: w.p, i: w.i }, "フォーカスは、前の行の「×」").toEqual({ a: "del", p: "parts", i: String(last - 1) });
  expectVisible(w, "「×」");
  expect(w.top - w.head, "動かす量は最小限（見出しのすぐ下）").toBeLessThanOrEqual(8);
  expect(await scrollY(page), "画面は上へ動いた").toBeLessThan(y);
});

test("フォーカスのある部品が見えているときは、「↑」「↓」「×」を押しても、画面の縦の位置は変わらない", async ({ page }) => {
  await openTool(page);
  // 画面のまん中あたりに置く。動かしても、消しても、見えたままになる
  const mid = async loc => { await loc.evaluate(el => { window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight / 2); el.focus({ preventScroll: true }); }); await expect(loc).toBeFocused(); return scrollY(page); };
  let y = await mid(btn(page, "up", 2));
  await page.keyboard.press("Enter");
  expectVisible(await where(page), "「↑」");
  expect(await scrollY(page), "「↑」のあとの縦の位置").toBe(y);
  y = await mid(btn(page, "down", 1));
  await page.keyboard.press("Enter");
  expectVisible(await where(page), "「↓」");
  expect(await scrollY(page), "「↓」のあとの縦の位置").toBe(y);
  y = await mid(btn(page, "del", 2));
  await page.keyboard.press("Enter");
  expectVisible(await where(page), "「×」");
  expect(await scrollY(page), "「×」のあとの縦の位置").toBe(y);
  // 端の行で動かなかったとき（先頭の行の「↑」）も、変わらない
  y = await mid(btn(page, "up", 0));
  await page.keyboard.press("Enter");
  expect(await scrollY(page), "動かなかった「↑」のあとの縦の位置").toBe(y);
  // 見出しのすぐ下にあっても、隠れていなければ変わらない
  await putBelowHeader(page, btn(page, "up", 0), 2);
  y = await scrollY(page);
  await page.keyboard.press("Enter");
  expect(await scrollY(page), "見出しのすぐ下で、動かなかった「↑」のあとの縦の位置").toBe(y);
});

test("マウスで「↑」を押したときの動きは変わらない: 行が上へ動いても、画面の縦の位置は変わらない", async ({ page }) => {
  await openTool(page);
  await putBelowHeader(page, btn(page, "up", 3), 8);
  const y = await scrollY(page), box = await btn(page, "up", 3).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await order(page)).toEqual([IDS[0], IDS[1], IDS[3], IDS[2], IDS[4]]);
  expect(await scrollY(page), "画面の縦の位置").toBe(y);
  const w = await where(page);
  expect({ a: w.a, i: w.i }, "フォーカスは、動かした行の「↑」（issue #54 のまま）").toEqual({ a: "up", i: "2" });
  // マウスで「×」を押したときも、画面の縦の位置は変わらない
  await putBelowHeader(page, btn(page, "del", 3), 8);
  const y2 = await scrollY(page), box2 = await btn(page, "del", 3).boundingBox();
  await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2);
  expect((await order(page)).length).toBe(IDS.length - 1);
  expect(await scrollY(page), "「×」のあとの縦の位置").toBe(y2);
});

test("ほかの一覧（用語、命題、問題、根拠）の「×」でも、フォーカスの移った先が見出しに隠れたら、見える所まで動く", async ({ page }) => {
  await openTool(page);
  // 命題は1つが高いので、末尾の「×」を見出しのすぐ下に置くと、前の命題の「×」は見出しの上に出る
  const n = SAMPLE.v.props.length;
  const del = ruleItem(page, 6).locator('button[data-a="del"][data-p="props"][data-i="' + (n - 1) + '"]');
  await putBelowHeader(page, del, 8);
  await page.keyboard.press("Enter");
  expect((await current(page)).v.props.length).toBe(n - 1);
  const w = await where(page);
  expect({ a: w.a, p: w.p, i: w.i }).toEqual({ a: "del", p: "props", i: String(n - 2) });
  expectVisible(w, "前の命題の「×」");
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、キーボードで「↑」「↓」「×」を押したあと、フォーカスのある部品が見えていて、横にはみ出さない", async ({ page }) => {
    await openTool(page);
    await putBelowHeader(page, btn(page, "up", 3), 8);
    await page.keyboard.press("Enter");
    let w = await where(page);
    expect({ a: w.a, i: w.i }).toEqual({ a: "up", i: "2" });
    expectVisible(w, "「↑」");
    await putAboveBottom(page, btn(page, "down", 1), 8);
    await page.keyboard.press("Enter");
    w = await where(page);
    expect({ a: w.a, i: w.i }).toEqual({ a: "down", i: "2" });
    expectVisible(w, "「↓」");
    await putBelowHeader(page, btn(page, "del", 4), 8);
    await page.keyboard.press("Enter");
    w = await where(page);
    expect({ a: w.a, i: w.i }).toEqual({ a: "del", i: "3" });
    expectVisible(w, "「×」");
    // 見えているときは、縦の位置が変わらない
    await btn(page, "up", 2).evaluate(el => { window.scrollBy(0, el.getBoundingClientRect().top - (window.innerHeight - 100)); el.focus({ preventScroll: true }); }); // 画面の下のほうに置く。1行ぶん上へ動いても、見出しの下に残る
    const y = await scrollY(page);
    await page.keyboard.press("Enter");
    expectVisible(await where(page), "下のほうに置いた「↑」");
    expect(await scrollY(page)).toBe(y);
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
