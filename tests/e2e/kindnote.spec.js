// 仕様: 本の種類による注意（「実践書では…」「文学には…」）を、欄の上に出さない（issue #73）。
// 「？」で開く説明の文言、欄の働き、「済み」の条件は変わらない。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, loadWindowJs } = require("./helpers");

const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
const PRACTICAL = "実践書では、著者は読者に何をさせたいか";
const FICTION = "文学には、分析読書の規則がそのままは当てはまらない";
function base(kind) {
  return { id: "t-kindnote", meta: { title: "本の種類の注意のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 1, Q: 2, P: 1 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind, subject: "テスト用の主題", unity: { what: "学問", claim: "学べ" },
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" }],
      props: [{ id: "P1", t: "テスト用の命題1", sup: "main", q: "Q1", grounds: [] }],
      solved: { Q1: { s: "解決した", why: "", aware: "" }, Q2: { s: "未解決", why: "", aware: "" } } } };
}
async function setup(page, kind) {
  await openTool(page);
  await importState(page, base(kind));
  await expect(page.locator("#sec-a1")).toBeVisible();
}
const done = page => page.evaluate(() => window.__dokusho.done());
/* 規則の欄に、注意（.note）が1つも出ていない */
async function expectNoNote(page, rs) {
  for (const r of rs) {
    await expect(ruleItem(page, r), "規則" + r).not.toContainText("実践書では");
    await expect(ruleItem(page, r), "規則" + r).not.toContainText("文学には");
    await expect(ruleItem(page, r).locator(".note"), "規則" + r + " の注意の数").toHaveCount(0);
  }
}

test("本の種類が実践書でも、規則1、規則4、規則8に「実践書では…」の注意が出ない", async ({ page }) => {
  await setup(page, "実践書");
  await expect(ruleItem(page, 1).locator('button[data-p="kind"][data-val="実践書"]')).toHaveAttribute("aria-pressed", "true");
  await expect(ruleItem(page, 8).locator(".card")).toHaveCount(2); // 規則8の欄が出ている
  await expectNoNote(page, [1, 4, 8]);
  await expect(page.locator("#app")).not.toContainText(PRACTICAL);
});

test("本の種類が文学でも、規則1に「文学には…」の注意が出ない。画面で種類を切り替えても出ない", async ({ page }) => {
  await setup(page, "文学");
  await expect(ruleItem(page, 1).locator('button[data-p="kind"][data-val="文学"]')).toHaveAttribute("aria-pressed", "true");
  await expectNoNote(page, [1, 4, 8]);
  await expect(page.locator("#app")).not.toContainText(FICTION);
  for (const k of ["実践書", "理論書", "まだ分からない", "文学"]) {
    await ruleItem(page, 1).locator('button[data-p="kind"][data-val="' + k + '"]').click();
    await expect(ruleItem(page, 1).locator('button[data-p="kind"][data-val="' + k + '"]')).toHaveAttribute("aria-pressed", "true");
    await expectNoNote(page, [1, 4, 8]);
  }
  // 下読みの側で選んでも同じ
  await page.locator('#sec-shitayomi button[data-p="kind"][data-val="実践書"]').click();
  await expect(ruleItem(page, 1).locator('button[data-p="kind"][data-val="実践書"]')).toHaveAttribute("aria-pressed", "true");
  await expectNoNote(page, [1, 4, 8]);
});

test("サンプルの本（実践書）でも、注意が出ない。分からなかった所の表示（規則5・6）は、これまでどおり出る", async ({ page }) => {
  await openTool(page);
  expect(SAMPLE.v.kind).toBe("実践書");
  await expectNoNote(page, [1, 4, 8]);
  await expect(page.locator("#app")).not.toContainText(PRACTICAL);
  await expect(ruleItem(page, 5).locator(".note")).toContainText("表面読みで分からなかった所");
  await expect(ruleItem(page, 6).locator(".note")).toContainText("表面読みで分からなかった所");
});

test("「？」で開く説明の文言は変わらない（規則1、規則4の問いの型、規則8、「やること」）", async ({ page }) => {
  await setup(page, "実践書");
  const help = async it => { await it.locator('button[data-a="help"]').click(); return it.locator(".help").first(); };
  await expect(await help(ruleItem(page, 1))).toHaveText("章の中の規則: 読者は、今読んでいるのがどんな種類の本なのかを知らねばならない。これを知るのは早いほど良い。できれば読み始める前に知る方が良い。種類は下読みで選んだものが出ている。理論書なら、歴史・科学・哲学のどれかも選ぶ。主題には、本が扱う分野を書く。「まだ分からない」のうちは済みにならない。");
  await expect(await help(ruleItem(page, 4))).toHaveText("章の中の規則: 著者の問題としている点は何であるかを知る。まず主な問いを書き、主な問いが複雑なときは、その下に従属する問いを足して、分かる順に並べる。実践書の問いの型: 目的、手段、順序、条件、どちらがより良いか（「何を目ざすべきか」「どうすれば〜できるか」）。型は、行ごとに選べる（選ばなくてもよい）。選ぶと、問いの書き出しの例が欄に出る（例は、このツールの補助である）。 Q1、Q2 と番号が付き、命題と結びつけられる。");
  await expect(await help(ruleItem(page, 8))).toHaveText("規則4の問題ごとに、著者が答えを出したかを見る。答えが正しいかどうかは、第三段階で判断する。一部・未解決なら、著者がそれを自覚しているかを選ぶ。本を読んで新しく生じた問題も書ける。");
  const action = page.locator("#sec-checkout .item").filter({ has: page.locator('textarea[data-p="action"]') });
  await expect(await help(action)).toHaveText("実践書に賛成するなら、行動することになる（英語版 第13章による）。1つでよい。");
  const kind = page.locator("#sec-shitayomi .item").filter({ has: page.locator('button[data-p="kind"]') });
  await expect(await help(kind)).toHaveText("理論書は「何が真実か」を、実践書は「何をすべきか」を扱う。");
});

test("欄の働きと「済み」の条件は変わらない（規則1、規則4、規則8）", async ({ page }) => {
  await setup(page, "実践書");
  let d = await done(page);
  expect(d[1], "実践書は、種類と主題があれば済み").toBe(true);
  expect(d[4], "主な問いがあれば済み").toBe(true);
  expect(d[8], "未解決の問題に、著者の自覚がまだない").toBe(false);
  await ruleItem(page, 8).locator('button[data-p="solved.Q2.aware"][data-val="自覚している"]').click();
  expect((await done(page))[8]).toBe(true);
  await ruleItem(page, 1).locator('button[data-p="kind"][data-val="文学"]').click();
  expect((await done(page))[1], "文学も、種類と主題があれば済み").toBe(true);
  await ruleItem(page, 1).locator('button[data-p="kind"][data-val="理論書"]').click();
  expect((await done(page))[1], "理論書は、歴史・科学・哲学を選ぶまで済みでない").toBe(false);
  await expect(ruleItem(page, 1).locator('button[data-p="ksub"]')).toHaveCount(3);
  await ruleItem(page, 1).locator('button[data-p="kind"][data-val="まだ分からない"]').click();
  expect((await done(page))[1]).toBe(false);
  // 主題の欄は、これまでどおり書ける
  await ruleItem(page, 1).locator('input[data-p="subject"]').fill("");
  await ruleItem(page, 1).locator('button[data-p="kind"][data-val="実践書"]').click();
  expect((await done(page))[1], "主題が空").toBe(false);
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toMatch(/^- 規則1 種類と主題によって本を分類する: 実践書$/m);
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、実践書と文学の注意が出ず、横にはみ出さない", async ({ page }) => {
    await setup(page, "実践書");
    await expectNoNote(page, [1, 4, 8]);
    await ruleItem(page, 1).locator('button[data-p="kind"][data-val="文学"]').click();
    await expect(ruleItem(page, 1).locator('button[data-p="kind"][data-val="文学"]')).toHaveAttribute("aria-pressed", "true");
    await expectNoNote(page, [1, 4, 8]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
