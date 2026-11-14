// 仕様: 分析読書の規則1〜15のラベルが、『本を読む本』（講談社学術文庫）の「分析読書の三段階のまとめ」の文言と同じで、
// 章の中の文言は説明文（？）にある。英語版 1972 年版の Rule 1〜15 も、同じ番号と内容である。
const { test, expect } = require("@playwright/test");
const { openTool, ruleItem, shot } = require("./helpers");

/* まとめの文言（ユーザーが訳書から写したもの。20_inbox/20261115-035733-q11への回答.md） */
const SUMMARY = {
  1: "種類と主題によって本を分類する",
  2: "その本全体が何に関するものかを、できるだけ簡潔に述べる",
  3: "主要な部分を順序よく関連づけてあげ、その概要を述べる",
  4: "著者が解決しようとしている問題が何であるかを明らかにする",
  5: "キー・ワードを見つけ、著者と折り合いをつける",
  6: "重要な文を見つけ著者の主要な命題を把握する",
  7: "一連の文の中に著者の論証を見つける。または、いくつかの文を取り出して、論証を組み立てる",
  8: "著者が解決した問題はどれで、解決していない問題はどれか、見きわめる。未解決の問題については、解決に失敗したことを、著者が自覚しているかどうか見定める",
  9: "「概略」と「解釈」を終えないうちは、批評に取りかからないこと（「わかった」と言えるまでは、賛成、反対、判断保留の態度の表明をさし控えること）",
  10: "けんか腰の反論は良くない",
  11: "批評的な判断を下すには、十分な根拠を挙げて、知識と単なる個人的な意見を、はっきり区別すること",
  12: "著者が知識不足である点を、明らかにすること",
  13: "著者の知識に誤りがある点を、明らかにすること",
  14: "著者が論理性に欠ける点を、明らかにすること",
  15: "著者の分析や説明が不完全である点を、明らかにすること",
};
/* 章の中の文言（同じ inbox）。説明文に含まれる */
const CHAPTER = {
  1: "読者は、今読んでいるのがどんな種類の本なのかを知らねばならない",
  2: "その本全体の統一を2,3行か、せいぜい数行の文にあらわしてみること",
  3: "それらの部分がどのように順序よく統一性をもって配列されて全体を構成しているかを示すこと",
  4: "著者の問題としている点は何であるかを知る",
  9: "まず、<この本がわかった>と、ある程度、確実に言えること",
  10: "反論は筋道をたててすること、けんか腰は良くない",
  11: "反論は解消できるものだと考えること",
};
const NOTE = "(12)(13)(14)は、反論の心得である。この三つが立証できない限り、著者の主張に、ある程度賛成しなくてはならない。そのうえで、(15)の批判に照らして、全体について判断を保留する場合もある。";

test("規則1〜15のラベルが、まとめの文言と同じ", async ({ page }) => {
  await openTool(page); // 最初の本はサンプル（分析読書まで進んでいる）
  for (const [r, label] of Object.entries(SUMMARY))
    await expect(ruleItem(page, r).locator(".label .grow"), `規則${r}`).toHaveText(label);
  await expect(page.locator(".label .rule")).toHaveCount(15);
});

test("章の中の文言と、まとめの注が、説明文にある", async ({ page }) => {
  await openTool(page);
  for (const [r, text] of Object.entries(CHAPTER)) {
    const item = ruleItem(page, r);
    await item.locator('button[data-a="help"]').click();
    await expect(item.locator(".help").first(), `規則${r} の説明`).toContainText(text);
  }
  const r12 = ruleItem(page, 12);
  await r12.locator('button[data-a="help"]').click();
  await expect(r12.locator(".help").first()).toContainText(NOTE);
});

test("段階の見出しがまとめと同じで、進み具合と Markdown の分母が15", async ({ page }) => {
  await openTool(page);
  await expect(page.locator("#sec-a1 h2")).toContainText("何についての本であるか見分ける");
  await expect(page.locator("#sec-a2 h2")).toContainText("内容を解釈する");
  await expect(page.locator("#sec-a3 h2")).toContainText("知識は伝達されたか");
  await expect(page.locator("#sec-a3 h2")).toContainText("知的エチケットの一般的心得");
  await expect(page.locator("#sec-a4 h2")).toContainText("批判に関してとくに注意すべき事項");
  await expect(page.locator("#prog")).toContainText("分析読書 15/15");
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("analysis_rules: 15/15");
  for (const [r, label] of Object.entries(SUMMARY)) expect(md, `Markdown の規則${r}`).toContain("- 規則" + r + " " + label);
  await page.locator("#sec-a1").evaluate(el => el.scrollIntoView());
  await shot(page, "06-analytic-stage1");
});
