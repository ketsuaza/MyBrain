// 仕様2: 1280x800 で、ダイアログの中をスクロールしなくても全部が見える（ブックリストの表の縦方向だけは中でスクロールしてよい）。
const { test, expect } = require("@playwright/test");
const { openTool, shot } = require("./helpers");

/* el がスクロールできる（中身が枠より大きい）か */
const overflows = (loc, axis) => loc.evaluate((el, axis) => axis === "x" ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1, axis);
/* 部品が全部、ダイアログの枠と画面の中に収まっている */
async function expectInside(page, dialog, sel) {
  const box = await dialog.boundingBox();
  const vp = page.viewportSize();
  for (const loc of await dialog.locator(sel).all()) {
    if (!(await loc.isVisible())) continue;
    const b = await loc.boundingBox();
    const name = await loc.evaluate(el => el.name || el.textContent.trim().slice(0, 20));
    expect(b.y, `${name} の上端`).toBeGreaterThanOrEqual(Math.max(box.y, 0) - 0.5);
    expect(b.y + b.height, `${name} の下端`).toBeLessThanOrEqual(Math.min(box.y + box.height, vp.height) + 0.5);
    expect(b.x, `${name} の左端`).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(b.x + b.width, `${name} の右端`).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
}

test("本を足す: ダイアログもフォームもスクロールせず、表は横にスクロールしない", async ({ page }) => {
  await openTool(page);
  await page.click("#btnNew");
  const dlg = page.locator("#dlgBook");
  await page.locator("#pickHits tbody tr").first().waitFor();
  expect(await overflows(dlg, "y"), "ダイアログが縦にスクロールする").toBe(false);
  expect(await overflows(dlg, "x"), "ダイアログが横にスクロールする").toBe(false);
  expect(await overflows(page.locator("#formBook"), "y"), "フォームが縦にスクロールする").toBe(false);
  expect(await overflows(page.locator("#pickHits"), "x"), "ブックリストの表が横にスクロールする").toBe(false);
  await expectInside(page, dlg, "input, button.primary, button[value=cancel], #pickHits");
  // 表は、少なくとも8行が見えている（狭くなりすぎていない）
  const h = await page.locator("#pickHits").evaluate(el => el.clientHeight);
  expect(h, "ブックリストの表の高さ").toBeGreaterThanOrEqual(8 * 28);
  await shot(page, "03-modal-add");
  // 本を選んだあとも同じ
  await page.locator("#pickHits tbody tr").nth(3).click();
  expect(await overflows(dlg, "y")).toBe(false);
  await expectInside(page, dlg, "input, button.primary, button[value=cancel]");
  await shot(page, "04-modal-picked");
});

test("書誌: ダイアログがスクロールせず、欄とボタンが全部見える", async ({ page }) => {
  await openTool(page);
  await page.click("#btnEdit");
  const dlg = page.locator("#dlgBook");
  await dlg.waitFor();
  expect(await overflows(dlg, "y")).toBe(false);
  expect(await overflows(dlg, "x")).toBe(false);
  await expectInside(page, dlg, "input, button");
  await shot(page, "05-modal-edit");
});

test("読み込む: ダイアログがスクロールせず、欄とボタンが全部見える", async ({ page }) => {
  await openTool(page);
  await page.click("#btnImport");
  const dlg = page.locator("#dlgImport");
  await dlg.waitFor();
  expect(await overflows(dlg, "y")).toBe(false);
  expect(await overflows(dlg, "x")).toBe(false);
  await expectInside(page, dlg, "textarea, button");
});
