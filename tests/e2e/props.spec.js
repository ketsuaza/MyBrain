// 仕様4: 命題を足し、どの2つの命題も、互いに3クリック以内で「支える」関係につなげられる。
// 数え方: クリック1回 = 1、プルダウンで選ぶ = 2（開く + 選ぶ）。文の入力は数えない。命題を足すクリックは含めない。
const { test, expect } = require("@playwright/test");
const { openTool, addManualBook, ruleItem, shot } = require("./helpers");

const PROPS = ["人は学ぶことで差がつく", "実学を学ぶべきである", "個人の独立が国の独立を支える"];

async function setupProps(page) {
  await openTool(page);
  await addManualBook(page, { title: "命題をつなぐテスト" });
  await page.locator('#sec-shitayomi button[data-val="分析読書へ進む"]').click();
  const item = ruleItem(page, 6);
  for (const [i, t] of PROPS.entries()) {
    await item.getByRole("button", { name: "＋ 命題", exact: true }).click();
    await item.locator(`input[data-p="props.${i}.t"]`).fill(t);
  }
  return item;
}

test("3つの命題のどの組も、文を書き終えたその場から、3クリック以内でつなげる", async ({ page }) => {
  const item = await setupProps(page);
  const ids = ["P1", "P2", "P3"];
  // 最後の命題を書き終えた直後（ほかに何も押していない状態）で、どの命題からも残りの全部が選べる
  for (const [i, from] of ids.entries())
    for (const to of ids.filter(x => x !== from))
      await expect(item.locator(`select[data-p="props.${i}.sup"] option[value="${to}"]`), `書き終えた直後、${from} の位置づけに ${to} がある`).toHaveCount(1);
  for (const [i, from] of ids.entries()) {
    for (const to of ids) {
      if (to === from) continue;
      let clicks = 0;
      const sup = item.locator(`select[data-p="props.${i}.sup"]`);
      // つなぐ相手が、何も押さずに選べる
      await expect(sup, `${from} から ${to} が選べる`).toBeVisible();
      await expect(sup.locator(`option[value="${to}"]`), `${from} の位置づけに ${to} がある`).toHaveCount(1);
      await sup.selectOption(to); clicks += 2;
      expect(clicks, `${from} → ${to} のクリック数`).toBeLessThanOrEqual(3);
      await expect(item.locator(`select[data-p="props.${i}.sup"]`)).toHaveValue(to);
      const saved = await page.evaluate(i => JSON.parse(localStorage.getItem("dokusho-memo.v2")).books[0].v.props[i].sup, i);
      expect(saved, `${from} → ${to} が保存される`).toBe(to);
    }
  }
});

test("互いに支える（P1→P2 と P2→P1）を同時に持て、Markdown にも出る", async ({ page }) => {
  const item = await setupProps(page);
  await item.locator('select[data-p="props.0.sup"]').selectOption("P2");
  await item.locator('select[data-p="props.1.sup"]').selectOption("P1");
  await item.locator('select[data-p="props.2.sup"]').selectOption("main");
  await expect(item.locator('select[data-p="props.0.sup"]')).toHaveValue("P2");
  await expect(item.locator('select[data-p="props.1.sup"]')).toHaveValue("P1");
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("P1 人は学ぶことで差がつく（P2 を支える）");
  expect(md).toContain("P2 実学を学ぶべきである（P1 を支える）");
  expect(md).toContain("P3 個人の独立が国の独立を支える（中心の主張）");
  await shot(page, "07-props-linked", item);
});
