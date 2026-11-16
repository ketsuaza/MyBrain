// 仕様: 390px の幅では、「本を足す」の表を見やすくし、小さなボタン（「？」「×」「↑」「↓」）を押しやすくする（issue #66）。
// 390x844 で「本を足す」を開くと、表が6行以上見え、横にスクロールしなくても書名と状況が読める。小さなボタンの押せる範囲は、縦横 32px 以上。1280x800 の見た目は変わらない。
const { test, expect } = require("@playwright/test");
const { BOOKLIST, openTool } = require("./helpers");

const rows = page => page.locator("#pickHits tbody tr");
/* 表の枠（#pickHits）の中に、全部が見えている行の数と、見えている列の見出し、横にスクロールできる幅 */
const table = page => page.evaluate(() => { const box = document.getElementById("pickHits"), b = box.getBoundingClientRect(), head = box.querySelector("thead").getBoundingClientRect();
  const seen = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= b.left - 0.5 && r.right <= b.right + 0.5; };
  const full = [...box.querySelectorAll("tbody tr")].filter(tr => { const r = tr.getBoundingClientRect(); return r.top >= head.bottom - 0.5 && r.bottom <= b.bottom + 0.5; });
  return { rows: full.length, heads: [...box.querySelectorAll("th")].filter(seen).map(th => th.textContent.replace(/[ ▼▲]/g, "")), scrollX: box.scrollWidth - box.clientWidth,
    cells: full.map(tr => [...tr.children].filter(seen).map(td => td.textContent)), cut: full.some(tr => [...tr.children].some(td => td.getClientRects().length && !seen(td))) }; });
/* ダイアログの中の部品 sel が全部、ダイアログの枠と画面の中に収まっている */
async function expectInside(page, dialog, sel) {
  const box = await dialog.boundingBox(), vp = page.viewportSize();
  for (const loc of await dialog.locator(sel).all()) {
    if (!(await loc.isVisible())) continue;
    const b = await loc.boundingBox(), name = await loc.evaluate(el => el.name || el.id || el.textContent.trim().slice(0, 20));
    expect(b.y, name + " の上端").toBeGreaterThanOrEqual(Math.max(box.y, 0) - 0.5);
    expect(b.y + b.height, name + " の下端").toBeLessThanOrEqual(Math.min(box.y + box.height, vp.height) + 0.5);
    expect(b.x, name + " の左端").toBeGreaterThanOrEqual(box.x - 0.5);
    expect(b.x + b.width, name + " の右端").toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
}
const scrolls = (loc, axis) => loc.evaluate((el, axis) => (axis === "x" ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1), axis);
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* #app の中の、見えている小さなボタン（「？」「×」「↑」「↓」）の大きさと、押せる範囲。
   hit: ボタンの上下左右の端（辺の中央の 1px 内側）と中心を押すと、そのボタンに当たる（ボタンは丸いので、四隅は見ない）。overlap: ほかのボタンや入力欄と重なっている */
const smallButtons = page => page.evaluate(() => {
  const all = [...document.querySelectorAll("#app button, #app input, #app select, #app textarea")].filter(el => el.getClientRects().length);
  const out = [];
  for (const el of document.querySelectorAll("#app button.q, #app button.x")) {
    if (!el.getClientRects().length) continue;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, pts = [[r.left + 1, cy], [r.right - 1, cy], [cx, r.top + 1], [cx, r.bottom - 1], [cx, cy]];
    const overlap = all.some(o => { if (o === el) return false; const q = o.getBoundingClientRect(); return q.left < r.right - 0.5 && q.right > r.left + 0.5 && q.top < r.bottom - 0.5 && q.bottom > r.top + 0.5; });
    out.push({ text: el.textContent, w: r.width, h: r.height, hit: pts.every(p => document.elementFromPoint(p[0], p[1]) === el), overlap, font: getComputedStyle(el).fontSize, left: r.left, right: r.right });
  }
  window.scrollTo(0, 0);
  return out; });

test.describe("iPhone の幅（390x844）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("issue の手順: 「本を足す」を開くと、表が6行以上見え、横にスクロールしなくても書名と状況が読める", async ({ page }) => {
    await openTool(page);
    await page.click("#btnNew");
    await expect(rows(page)).toHaveCount(BOOKLIST.length);
    const t = await table(page);
    expect(t.rows, "表の枠の中に、全部が見えている行の数").toBeGreaterThanOrEqual(6);
    expect(t.scrollX, "表が横にスクロールする幅").toBeLessThanOrEqual(0);
    expect(t.heads, "見えている列").toEqual(expect.arrayContaining(["no", "書名", "状況"]));
    expect(t.cut, "列が途中で切れている").toBe(false);
    // 見えている行の no、書名、状況が、ブックリストの内容のまま読める
    for (const c of t.cells) { const b = BOOKLIST.find(o => String(o.no) === c[0]); expect(c[1].replace("追加済み", ""), "no " + c[0] + " の書名").toBe(String(b.title).trim()); expect(c[2]).toBe(b.reading_status || "なし"); }
    await expect(page.locator("#pickCount")).toHaveText(BOOKLIST.length + "件 / 全" + BOOKLIST.length + "件");
    // ダイアログも、ページも、はみ出さない。書誌の欄と決定のボタンは、いつも画面に入る
    const dlg = page.locator("#dlgBook");
    expect(await scrolls(dlg, "y")).toBe(false); expect(await scrolls(dlg, "x")).toBe(false);
    expect(await scrolls(page.locator("#formBook"), "y")).toBe(false);
    await expectInside(page, dlg, "input, button.primary, button[value=cancel], #pickHits");
    expect(await overflow(page)).toBe(0);
    // 書誌の欄は、これまでの7つが、名前つきで全部ある
    expect(await page.locator("#formBook .fields label").allInnerTexts()).toEqual(["書名", "著者", "出版社", "刊行日", "ISBN", "no", "読み始めた日"]);
    for (const b of await page.locator("#formBook .fields input").all()) expect((await b.boundingBox()).height, "書誌の欄の高さ").toBeGreaterThanOrEqual(30);
  });

  test("行を選ぶと、書誌の欄に入り、表は6行以上見えたまま。見えている列（no、書名、状況）で並べ替えられる", async ({ page }) => {
    await openTool(page);
    await page.click("#btnNew");
    await rows(page).nth(2).click();
    await expect(rows(page).nth(2)).toHaveClass(/sel/);
    const no = await rows(page).nth(2).getAttribute("data-no");
    await expect(page.locator('#formBook input[name="booklist_no"]')).toHaveValue(no);
    await expect(page.locator('#formBook input[name="title"]')).toHaveValue(String(BOOKLIST.find(b => String(b.no) === no).title).trim());
    expect((await table(page)).rows).toBeGreaterThanOrEqual(6);
    await expectInside(page, page.locator("#dlgBook"), "input, button.primary, button[value=cancel], #pickHits");
    // no で並べ替える（最初は大きい順、もう一度押すと小さい順）
    const head = name => page.locator("#pickHits th button", { hasText: name });
    await head("no").click();
    await expect(head("no")).toHaveText("no ▼");
    let nos = (await table(page)).cells.map(c => Number(c[0]));
    expect(nos).toEqual(nos.slice().sort((a, b) => b - a));
    await head("no").click();
    await expect(head("no")).toHaveText("no ▲");
    nos = (await table(page)).cells.map(c => Number(c[0]));
    expect(nos).toEqual(nos.slice().sort((a, b) => a - b));
    await head("書名").click();
    await expect(head("書名")).toHaveText("書名 ▼");
    await head("状況").click();
    await expect(head("状況")).toHaveText("状況 ▼");
    const t = await table(page);
    expect(t.rows).toBeGreaterThanOrEqual(6);
    expect(t.scrollX).toBeLessThanOrEqual(0);
    // 見出しのボタンは、押しやすい高さがある
    for (const b of await page.locator("#pickHits th button").all()) if (await b.isVisible()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(32);
  });

  test("検索で絞っても、見つからないときも、表は横にスクロールせず、ダイアログに収まる", async ({ page }) => {
    await openTool(page);
    await page.click("#btnNew");
    await page.locator("#pickQ").fill(String(BOOKLIST[0].title).slice(0, 2));
    await expect.poll(async () => (await rows(page).count())).toBeLessThan(BOOKLIST.length);
    expect((await table(page)).scrollX).toBeLessThanOrEqual(0);
    await page.locator("#pickQ").fill("見つからない文字列のテスト");
    await expect(page.locator("#pickHits")).toContainText("見つからない");
    await expectInside(page, page.locator("#dlgBook"), "input, button.primary, button[value=cancel], #pickHits");
    expect(await scrolls(page.locator("#pickHits"), "x")).toBe(false);
  });

  test("「書誌」のダイアログも、スクロールせず、欄とボタンが全部見える", async ({ page }) => {
    await openTool(page);
    await page.click("#btnEdit");
    const dlg = page.locator("#dlgBook");
    await dlg.waitFor();
    expect(await scrolls(dlg, "y")).toBe(false); expect(await scrolls(dlg, "x")).toBe(false);
    await expectInside(page, dlg, "input, button");
    await expect(page.locator("#pick")).toBeHidden();
  });

  test("「？」「×」「↑」「↓」の押せる範囲が、縦横 32px 以上ある。ほかの部品と重ならず、字の大きさは変わらず、横にはみ出さない", async ({ page }) => {
    await openTool(page);
    const bs = await smallButtons(page);
    expect(new Set(bs.map(b => b.text))).toEqual(new Set(["？", "×", "↑", "↓"]));
    expect(bs.length).toBe(await page.locator("#app button.q:visible, #app button.x:visible").count());
    expect(bs.length).toBeGreaterThan(50);
    const small = bs.filter(b => b.w < 32 || b.h < 32);
    expect(small.map(b => b.text + " " + b.w + "x" + b.h), "32px に足りないボタン").toEqual([]);
    expect(bs.filter(b => !b.hit).map(b => b.text), "端まで押せないボタン").toEqual([]);
    expect(bs.filter(b => b.overlap).map(b => b.text), "ほかの部品と重なるボタン").toEqual([]);
    expect(bs.filter(b => b.left < 0 || b.right > 390).length, "画面の外に出たボタン").toBe(0);
    expect([...new Set(bs.filter(b => b.text === "？").map(b => b.font))]).toEqual(["12px"]);
    expect([...new Set(bs.filter(b => b.text !== "？").map(b => b.font))]).toEqual(["15px"]);
    expect(await overflow(page)).toBe(0);
    // 押すと、これまでどおり働く
    const q = page.locator('#sec-checkin button.q').first();
    await q.click({ position: { x: 16, y: 1 } }); // 広げた範囲の上の端
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#sec-checkin .help").first()).toBeVisible();
  });
});

test("見張り: 1280x800 の見た目は変わらない。表は12列が全部出て、「？」は 24x24 のまま", async ({ page }) => {
  await openTool(page);
  const q = await page.locator("#app button.q").first().boundingBox();
  expect([q.width, q.height]).toEqual([24, 24]);
  const x = await page.locator("#app button.x").first().boundingBox();
  expect(x.height).toBe(29.5);
  await page.click("#btnNew");
  await expect(rows(page)).toHaveCount(BOOKLIST.length);
  const t = await table(page);
  expect(t.heads).toEqual(["no", "書名", "状況", "重", "難", "名", "原", "優先", "外部", "ブクログ", "読メ", "Amazon"]);
  expect(t.scrollX).toBeLessThanOrEqual(0);
  const f = await page.locator("#formBook .fields").boundingBox();
  expect(Math.round(f.height * 10) / 10, "書誌の欄の高さ（3段）").toBe(175.5);
});
