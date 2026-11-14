// 仕様3: 分析読書の規則1〜4の欄が、アドラー（とヴァン・ドーレン）の用語を使っている。
// 出典は原典の規則の文言（How to Read a Book, 改訂版 1972, Part Two, 第6〜8章）。用語の訳は下の表で決める。
const { test, expect } = require("@playwright/test");
const { openTool, ruleItem, shot } = require("./helpers");

const ADLER = {
  1: { en: "Classify the book according to kind and subject matter.", terms: ["種類", "主題"] },
  2: { en: "State what the whole book is about with the utmost brevity.", terms: ["全体", "統一"] },
  3: { en: "Enumerate its major parts in their order and relation, and outline these parts as you have outlined the whole.", terms: ["主要な部分", "順序", "関係"] },
  4: { en: "Define the problem or problems the author has tried to solve.", terms: ["著者", "問題"] },
};

test("規則1〜4のラベルが、原典の用語を含む", async ({ page }) => {
  await openTool(page); // 最初の本はサンプル（分析読書まで進んでいる）
  await page.locator("#sec-a1").evaluate(el => el.scrollIntoView());
  for (const [r, { en, terms }] of Object.entries(ADLER)) {
    const label = (await ruleItem(page, r).locator(".label .grow").innerText()).trim();
    for (const t of terms) expect(label, `規則${r}（${en}）`).toContain(t);
  }
  await shot(page, "06-analytic-stage1");
});
