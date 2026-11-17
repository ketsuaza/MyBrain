// 仕様: 行を足すボタンのラベルが、何をどこに足すかを表す名詞になっている（issue #72）。
// 入れ子の行を足すボタン（部分の中の区分、命題ごとの根拠）には、持ち主の番号が入る。ボタンの働きと並びは変わらない。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "", subs: ["区分A"] });
  const prop = (id, sup) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q: "Q1", grounds: [{ t: "根拠A", kind: "" }], arg: "", judge: "", why: "", self: "" });
  const b = { id: "t-labels", meta: { title: "ラベルのテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 2, P: 3 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", subject: "テスト", unity: { what: "学問", claim: "学べ" },
      terms: [{ w: "用語A", m: "意味", p: "1", g: false }], points: ["要点A"], unclear: ["分からない語A"],
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1"), part("S3", "第3部", "S2")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "" }],
      props: [prop("P1", "main"), prop("P2", "P1"), prop("P3", "P2")] } };
  Object.assign(b.v, over || {});
  return b;
}
async function setup(page, book) {
  await openTool(page);
  book = book || base();
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose || "");
}
/* ラベルが label の欄（.item） */
const item = (page, label) => page.locator(".item").filter({ has: page.locator(".label .grow", { hasText: label }) });
/* 行を足すボタンの、[足す先（data-p）, ラベル] の一覧（画面に出ている順） */
const addButtons = root => root.locator('button[data-a="push"]').evaluateAll(els => els.map(el => [el.dataset.p, el.textContent]));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* 行を足すボタンのうち、ラベルが2行以上に折り返しているもの */
const wrapped = page => page.locator('#app button[data-a="push"]').evaluateAll(els => els.filter(el => {
  const r = document.createRange(); r.selectNodeContents(el);
  const tops = new Set([...r.getClientRects()].map(c => Math.round(c.top)));
  return tops.size !== 1 || el.scrollWidth > el.clientWidth + 1;
}).map(el => el.textContent));

test("行を足すボタンのラベルが、足すものの名詞になっている。入れ子のものには、持ち主の番号が入る", async ({ page }) => {
  await setup(page);
  expect(await addButtons(item(page, "分からなかった所"))).toEqual([["unclear", "＋ 分からなかった所"]]);
  expect(await addButtons(item(page, "鍵になりそうな言葉"))).toEqual([["terms", "＋ 用語"]]);
  expect(await addButtons(ruleItem(page, 5))).toEqual([["terms", "＋ 用語"]]);
  expect(await addButtons(ruleItem(page, 3))).toEqual([["parts.0.subs", "＋ S1 の区分"], ["parts.1.subs", "＋ S2 の区分"], ["parts.2.subs", "＋ S3 の区分"], ["parts", "＋ 部分"]]);
  expect(await addButtons(ruleItem(page, 4))).toEqual([["qs", "＋ 問題"]]);
  expect(await addButtons(ruleItem(page, 6))).toEqual([["props", "＋ 命題"]]);
  expect(await addButtons(ruleItem(page, 7))).toEqual([["props.0.grounds", "＋ P1 の根拠"], ["props.1.grounds", "＋ P2 の根拠"], ["props.2.grounds", "＋ P3 の根拠"]]);
  expect(await addButtons(page.locator("#sec-hyomen"))).toEqual([["points", "＋ 述べられていたこと"], ["unclear", "＋ 分からなかった所"]]);
  // 「足す」という述語のラベルは、行を足すボタンには残っていない
  const all = (await addButtons(page.locator("#app"))).map(b => b[1]);
  expect(all.filter(t => /足す/.test(t)), "「足す」を含むラベル").toEqual([]);
  expect(all.filter(t => !/^＋ \S/.test(t)), "「＋ 名詞」の形でないラベル").toEqual([]);
  // 読み上げられる名前も同じ（ラベルがそのまま名前になる）
  await expect(ruleItem(page, 7).getByRole("button", { name: "＋ P2 の根拠", exact: true })).toHaveCount(1);
  await expect(ruleItem(page, 3).getByRole("button", { name: "＋ S3 の区分", exact: true })).toHaveCount(1);
});

test("見出しの「本を足す」と、ダイアログの題名は、そのまま", async ({ page }) => {
  await setup(page);
  await expect(page.locator("#btnNew")).toHaveText("本を足す");
  await page.click("#btnNew");
  await expect(page.locator("#dlgBookTitle")).toHaveText("本を足す");
});

test("ボタンの働きは変わらない: 押すと、その並びの末尾に1行足され、足した行の最初の欄にフォーカスが移る", async ({ page }) => {
  await setup(page);
  const cases = [
    [item(page, "分からなかった所"), "＋ 分からなかった所", "unclear.1", b => b.v.unclear.length, 2],
    [item(page, "鍵になりそうな言葉"), "＋ 用語", "terms.1.w", b => b.v.terms.length, 2],
    [ruleItem(page, 3), "＋ S2 の区分", "parts.1.subs.1", b => b.v.parts[1].subs.length, 2],
    [ruleItem(page, 3), "＋ 部分", "parts.3.t", b => b.v.parts.length, 4],
    [ruleItem(page, 4), "＋ 問題", "qs.2.t", b => b.v.qs.length, 3],
    [ruleItem(page, 6), "＋ 命題", "props.3.t", b => b.v.props.length, 4],
    [ruleItem(page, 7), "＋ P3 の根拠", "props.2.grounds.1.t", b => b.v.props[2].grounds.length, 2],
  ];
  for (const [root, name, p, count, n] of cases) {
    await root.getByRole("button", { name, exact: true }).click();
    expect(await page.evaluate(() => document.activeElement.dataset.p), name + " を押したあとのフォーカス").toBe(p);
    expect(count(await current(page)), name + " を押したあとの行の数").toBe(n);
  }
  // ほかの部分、ほかの命題には足されていない
  const b = await current(page);
  expect(b.v.parts.map(o => o.subs.length)).toEqual([1, 2, 1, 0]);
  expect(b.v.props.map(o => o.grounds.length)).toEqual([1, 1, 2, 0]);
  // 足した部分の区分のボタンには、足した部分の番号が出る
  await expect(ruleItem(page, 3).locator('button[data-a="push"][data-p="parts.3.subs"]')).toHaveText("＋ S4 の区分");
});

test("部分を並べ替えると、区分のボタンの番号も、その行の部分の番号になる。文が空の命題には、根拠のボタンが出ない", async ({ page }) => {
  await setup(page);
  await ruleItem(page, 3).locator('button[data-a="down"][data-i="0"]').click();
  await expect(ruleItem(page, 3).locator(".prow .id").first()).toHaveText("S2");
  expect((await addButtons(ruleItem(page, 3))).map(b => b[1])).toEqual(["＋ S2 の区分", "＋ S1 の区分", "＋ S3 の区分", "＋ 部分"]);
  await ruleItem(page, 6).locator('[data-p="props.1.t"]').fill("");
  await expect(ruleItem(page, 7).locator('button[data-a="push"]')).toHaveText(["＋ P1 の根拠", "＋ P3 の根拠"]);
});

test("部分や命題の番号にタグが書かれていても、ラベルに文字として出るだけで、スクリプトが動かない", async ({ page }) => {
  const X = k => k + '"\'><img src=x onerror="__xss=1"><b data-x="1">&amp;';
  const book = base();
  book.v.parts[0].id = X("S1"); book.v.parts[1].to = X("S1"); book.v.props[0].id = X("P1"); book.v.props[1].sup = X("P1");
  await setup(page, book);
  await expect(ruleItem(page, 3).locator('button[data-a="push"][data-p="parts.0.subs"]')).toHaveText("＋ " + X("S1") + " の区分");
  await expect(ruleItem(page, 7).locator('button[data-a="push"][data-p="props.0.grounds"]')).toHaveText("＋ " + X("P1") + " の根拠");
  // 画像の読み込みの失敗（onerror）は遅れて起きるので、あとから入れた目印の画像の onerror が起きるまで待ってから見る
  await page.evaluate(() => new Promise(done => { const i = new Image(); i.onerror = done; i.src = "x"; }));
  expect(await page.evaluate(() => window.__xss), "スクリプトが動いた目印").toBeUndefined();
  expect(await page.evaluate(() => document.querySelectorAll("#app img, #app b[data-x], #app [onerror]").length), "入れたタグからできた要素の数").toBe(0);
  // 押すと、その部分、その命題に足される
  await ruleItem(page, 3).locator('button[data-a="push"][data-p="parts.0.subs"]').click();
  await ruleItem(page, 7).locator('button[data-a="push"][data-p="props.0.grounds"]').click();
  const b = await current(page);
  expect(b.v.parts[0].subs.length).toBe(2);
  expect(b.v.props[0].grounds.length).toBe(2);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、行を足すボタンのラベルが1行に収まり、横にはみ出さない", async ({ page }) => {
    // 番号が2桁（S12、P12）のときも収まる
    const book = base();
    book.v.parts[2].id = "S12"; book.v.props[2].id = "P12"; book.v._n = { S: 12, Q: 2, P: 12 };
    await setup(page, book);
    const labels = (await addButtons(page.locator("#app"))).map(b => b[1]);
    for (const t of ["＋ 分からなかった所", "＋ 述べられていたこと", "＋ 用語", "＋ S12 の区分", "＋ 部分", "＋ 問題", "＋ 命題", "＋ P12 の根拠"]) expect(labels, "画面に出ているラベル").toContain(t);
    expect(await wrapped(page), "2行以上に折り返したラベル").toEqual([]);
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    for (const b of await page.locator('#app button[data-a="push"]').all()) {
      const box = await b.boundingBox();
      expect(box.x, "ボタンの左端").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, "ボタンの右端").toBeLessThanOrEqual(390);
      expect(box.height, "ボタンの高さ").toBeGreaterThanOrEqual(24);
    }
  });
});
