// 仕様: iPhone の幅（390px）でも、分析読書の欄が横にはみ出さない。
const { test, expect } = require("@playwright/test");
const { openTool, shot } = require("./helpers");

test.use({ viewport: { width: 390, height: 844 } });
test("390px の幅で、ページが横にスクロールしない", async ({ page }) => {
  await openTool(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  await page.locator("#sec-a1 .item").nth(2).evaluate(el => el.scrollIntoView());
  await shot(page, "13-mobile-rule3");
  await page.locator("#sec-a4").evaluate(el => el.scrollIntoView());
  await shot(page, "14-mobile-critique");
});
