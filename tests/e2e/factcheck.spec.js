// 仕様6: factcheck.js のファクトチェックの結果が、サンプルの命題ごとに、規則9のカードの下に出る。
const { test, expect } = require("@playwright/test");
const { loadWindowJs, openTool, ruleItem, shot } = require("./helpers");

const FC = loadWindowJs("factcheck.js").FACTCHECK;
const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];

test("サンプルの命題ごとに、判定・説明・出典・確認日が出る", async ({ page }) => {
  const result = FC[SAMPLE.id];
  expect(result, "factcheck.js にサンプルの結果がある").toBeTruthy();
  const pids = SAMPLE.v.props.map(p => p.id);
  expect(pids.length).toBeGreaterThan(0);
  await openTool(page);
  const item = ruleItem(page, 9);
  for (const pid of pids) {
    const f = result.props[pid];
    expect(f, `${pid} の結果が factcheck.js にある`).toBeTruthy();
    const card = item.locator(".card").filter({ has: page.locator(".id", { hasText: new RegExp("^" + pid + "$") }) });
    const fc = card.locator(".fc");
    await expect(fc).toHaveCount(1);
    await expect(fc.locator("b").first()).toHaveText("Agent: " + f.verdict);
    await expect(fc).toContainText(f.note.slice(0, 30));
    await expect(fc).toContainText(result.checked + " に確認");
    await expect(fc.locator("a")).toHaveCount(f.sources.length);
    for (const [k, s] of f.sources.entries()) await expect(fc.locator("a").nth(k)).toHaveAttribute("href", s.url);
  }
  await item.scrollIntoViewIfNeeded();
  await shot(page, "09-factcheck", item);
});

test("命題を書き換えると、結果は「書き換える前の文に対するもの」と出る", async ({ page }) => {
  await openTool(page);
  await ruleItem(page, 6).locator('[data-p="props.0.t"]').fill("書き換えた命題");
  await ruleItem(page, 6).locator('[data-p="props.0.t"]').blur();
  await page.locator('#sec-a3 button[data-p="props.1.judge"][data-val="賛成"]').first().click(); // 画面を描き直す
  await page.locator('#sec-a3 button[data-p="props.1.judge"][data-val="賛成"]').first().click();
  await expect(ruleItem(page, 9).locator(".fc").first()).toContainText("そのあと命題が書き換えられた");
});
