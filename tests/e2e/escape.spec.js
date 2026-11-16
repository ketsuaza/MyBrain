// 仕様: 読み込んだ読書メモの id や判定に HTML が書かれていても、文字として出るだけで、スクリプトが動かない（issue #56）。
// 「読み込む」に貼る state の値（本の id、命題・問題・部分の id、判定、選択の値など）に、タグと引用符を入れて確かめる。
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current, loadWindowJs } = require("./helpers");

const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/old-format-sample.json"), "utf8"));
/* タグと引用符を入れた値。k は、どこに入れた値かの目印。スクリプトが動くと window.__xss が立つ */
const X = k => k + '"\'><img src=x onerror="__xss=1"><i data-x="' + k + '">&amp;';
const P1 = X("P1"), P2 = X("P2"), Q1 = X("Q1"), Q2 = X("Q2"), S1 = X("S1"), S2 = X("S2");

function evil() {
  const part = (id, t, to) => ({ id, t, role: X("role"), to, link: X("link"), sum: "概要", rel: "", subs: ["区分A"] });
  const prop = (id, t, sup, judge) => ({ id, t, loc: "1章", sup, q: Q1, grounds: [{ t: "根拠A", kind: X("gkind") }], arg: "", judge, why: "", self: "", k12: "", k13: "", k14: "", k15: "" });
  return { id: X("book"), meta: { title: "エスケープのテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 3, P: 3 }, purpose: "テスト用の目的", budget: X("budget"), judge: "分析読書へ進む", kind: "理論書", ksub: X("ksub"), subject: "テスト", unity: { what: "学問", claim: "学べ" }, unityA: { what: "学問", claim: "学べ" }, unity2: X("unity2"),
      terms: [{ w: "用語A", m: "意味", p: "1", g: true }], points: ["要点A"], unclear: ["分からない語A"], stance: X("stance"),
      parts: [part(S1, "第1部", ""), part(S2, "第2部", S1), part("S3", "第3部", X("to"))],
      qs: [{ id: Q1, t: "問いの一", parent: "" }, { id: Q2, t: "問いの二", parent: Q1 }, { id: "Q3", t: "問いの三", parent: X("parent") }],
      solved: { [Q1]: { s: X("solved"), aware: X("aware"), why: "" }, [Q2]: { s: "一部", aware: "", why: "" } },
      props: [prop(P1, "テスト用の命題1", "main", X("judge")), prop(P2, "テスト用の命題2", P1, "反対"), prop("P3", "テスト用の命題3", X("sup"), "判断保留")],
      restate: { s: "つまり", ex: "たとえば" } } };
}
async function setup(page, book) {
  await openTool(page);
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose || "");
}
/* スクリプトが動いていないこと、入れたタグの要素ができていないことを確かめる。
   画像の読み込みの失敗（onerror）は遅れて起きるので、あとから入れた目印の画像の onerror が起きるまで待ってから見る */
async function expectInert(page, when) {
  await page.evaluate(() => new Promise(done => { const i = new Image(); i.onerror = done; i.src = "x"; }));
  expect(await page.evaluate(() => window.__xss), when + ": スクリプトが動いた目印").toBeUndefined();
  expect(await page.evaluate(() => [...document.querySelectorAll("img, i, [onerror], [data-x]")].map(el => el.outerHTML.slice(0, 80))), when + ": 入れたタグからできた要素").toEqual([]);
}

test("id、判定、選択の値にタグと引用符を入れた state を読み込んでも、スクリプトが動かず、文字として出る", async ({ page }) => {
  const book = evil();
  await setup(page, book);
  await expectInert(page, "読み込んだ直後");
  expect(await current(page), "読み込んだ値は、そのまま残る").toEqual(book);
  // 値は、文字として見える
  await expect(page.locator("#bookSel option:checked")).toHaveAttribute("value", book.id);
  await expect(ruleItem(page, 6).locator(".card .id")).toHaveText([P1, P2, "P3"]);
  await expect(ruleItem(page, 4).locator(".row .rule")).toHaveText([Q1, Q2, "Q3"]);
  await expect(ruleItem(page, 3).locator(".prow > .id")).toHaveText([S1, S2, "S3"]);
  await expect(ruleItem(page, 7).locator(".chain")).toContainText(P2);
  await expect(ruleItem(page, 8).locator(".card").first()).toContainText("答えている命題: " + [P1, P2, "P3"].join("、"));
  await expect(ruleItem(page, 9)).toContainText("中心の主張 " + P1 + ": テスト用の命題1");
  await expect(ruleItem(page, 11).locator(".card").first()).toContainText("テスト用の命題1 — " + X("judge"));
  // 名前（aria-label）にも、そのまま入る
  await expect(ruleItem(page, 6).locator('input[data-p="props.0.t"]')).toHaveAttribute("aria-label", P1 + " の命題");
  await expect(ruleItem(page, 4).locator('select[data-p="qs.1.parent"]')).toHaveAttribute("aria-label", Q2 + " の従属先");
  // 相手を指すプルダウンの選択肢にも、文字として出る
  await expect(ruleItem(page, 6).locator('select[data-p="props.1.sup"]')).toHaveValue(P1);
  await expect(ruleItem(page, 6).locator('select[data-p="props.1.sup"] option:checked')).toHaveText(P1 + " を支える");
  await expect(ruleItem(page, 4).locator('select[data-p="qs.1.parent"]')).toHaveValue(Q1);
  await expect(ruleItem(page, 3).locator('select[data-p="parts.1.to"]')).toHaveValue(S1);
  // Markdown にも、そのままの文字で出る
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("  - " + P2 + " テスト用の命題2（" + P1 + " を支える）");
});

test("そのあとボタンを押し、文字を打ち、プルダウンを変えても、スクリプトが動かない。id に記号のある問題の欄も、そのまま使える", async ({ page }) => {
  const book = evil();
  await setup(page, book);
  // ボタン（全体の描き直し）。id に記号のある問題 Q1 の「解決した」「そう見た理由」
  const card = ruleItem(page, 8).locator(".card").first();
  await card.getByRole("button", { name: "解決した", exact: true }).click();
  await expect(card.getByRole("button", { name: "解決した", exact: true })).toHaveClass(/on/);
  expect((await current(page)).v.solved[Q1].s).toBe("解決した");
  await expectInert(page, "ボタンを押したあと");
  await card.locator("input").fill("理由を書いた");
  expect((await current(page)).v.solved[Q1].why).toBe("理由を書いた");
  // 文字の入力（入力のたびの描き直し）
  const t = ruleItem(page, 6).locator('input[data-p="props.1.t"]');
  await t.click();
  await t.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.type("を直す");
  await expect(ruleItem(page, 7).locator(".chain")).toContainText("テスト用の命題2を直す");
  await expect(ruleItem(page, 7).locator(".chain")).toContainText(P2);
  await expect(t).toBeFocused();
  await expectInert(page, "文字を打ったあと");
  // プルダウン
  await ruleItem(page, 6).locator('select[data-p="props.2.sup"]').selectOption(P2);
  expect((await current(page)).v.props[2].sup).toBe(P2);
  await ruleItem(page, 6).locator('select[data-p="props.0.q"]').selectOption(Q2);
  expect((await current(page)).v.props[0].q).toBe(Q2);
  await expect(ruleItem(page, 8).locator(".card").nth(1)).toContainText("答えている命題: " + P1);
  await expectInert(page, "プルダウンを変えたあと");
  // 「×」、「やらない」、行の追加
  await ruleItem(page, 4).locator('button[data-a="del"][data-i="2"]').click();
  await ruleItem(page, 9).locator('button[data-a="skip"]').click();
  await ruleItem(page, 6).getByRole("button", { name: "＋ 命題を足す" }).click();
  await expectInert(page, "行を消して、足したあと");
  // 本の選択で、ほかの本に切り替えて、戻れる
  const other = await page.locator("#bookSel option").evaluateAll((os, id) => os.map(o => o.value).find(v => v !== id), book.id);
  await page.locator("#bookSel").selectOption(other);
  await page.waitForFunction(id => window.__dokusho.current().id === id, other);
  await page.locator("#bookSel").selectOption(book.id);
  await page.waitForFunction(id => window.__dokusho.current().id === id, book.id);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("テスト用の目的");
  await expectInert(page, "本を切り替えたあと");
  // 開き直しても同じ
  await page.reload();
  await page.locator("#app section").first().waitFor();
  await expect(page.locator("#bookSel option:checked")).toHaveAttribute("value", book.id);
  await expectInert(page, "開き直したあと");
});

test("判定、本の種類、書誌にタグを入れた state（分析読書に進んでいない本）でも、スクリプトが動かない", async ({ page }) => {
  const book = evil();
  book.id = X("book2"); book.v.judge = X("vjudge"); book.v.kind = X("kind"); book.skip = { [X("skip")]: true };
  Object.keys(book.meta).forEach(k => { book.meta[k] = X(k); });
  await openTool(page);
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toHaveText("✓ " + X("title"));
  await expectInert(page, "読み込んだ直後");
  await expect(page.locator("#finish")).toContainText("読了: " + X("finished"));
  await page.locator('button[data-a="set"][data-p="judge"][data-val="分析読書へ進む"]').click();
  await expect(page.locator("#sec-a1")).toBeVisible();
  await expectInert(page, "分析読書へ進めたあと");
  await page.click("#btnEdit");
  await expect(page.locator('#formBook input[name="title"]')).toHaveValue(X("title"));
  await expectInert(page, "書誌を開いたあと");
});

test("「ない」の印（v._alt）のキーや値にタグを入れた state でも、スクリプトが動かない。true でない値は、印として扱わない", async ({ page }) => {
  const book = evil();
  book.v._alt = { [X("altkey")]: true, s1: X("altval"), s2: true, unclear: X("altval") };
  book.v.s1 = X("s1"); book.v.s2 = X("s2"); book.v.unclear = [X("unclear")];
  await setup(page, book);
  await expectInert(page, "読み込んだ直後");
  await expect(page.locator('#app textarea[data-p="s1"]'), "値が true でない印は、印として扱わない").toHaveValue(X("s1"));
  await expect(page.locator('#app button[data-a="alt"][data-p="s1"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('#app textarea[data-p="s2"]')).toHaveCount(0);
  await expect(page.locator('#app button[data-a="alt"][data-p="s2"]')).toHaveAttribute("aria-pressed", "true");
  await expect(ruleItem(page, 5).locator(".note")).toHaveText("表面読みで分からなかった所: " + X("unclear"));
  // 印を外す、付ける、文字を打つ
  await page.locator('#app button[data-a="alt"][data-p="s2"]').click();
  await expect(page.locator('#app textarea[data-p="s2"]')).toHaveValue(X("s2"));
  await page.locator('#app button[data-a="alt"][data-p="unclear"]').click();
  await expect(ruleItem(page, 5).locator(".note")).toHaveCount(0);
  await page.locator('#app button[data-a="alt"][data-p="unclear"]').click();
  await page.locator('#app input[data-p="unclear.0"]').click();
  await page.keyboard.type("x");
  await expect(ruleItem(page, 5).locator(".note")).toContainText('<img src=x onerror="__xss=1">');
  await expectInert(page, "印を外し、付け、文字を打ったあと");
});

test("ふつうの state の読み込み（サンプル、前の形のサンプル）は、これまでどおり動く", async ({ page }) => {
  await openTool(page);
  const sample = loadWindowJs("sample.js").SAMPLES[0];
  const copy = JSON.parse(JSON.stringify(sample)); copy.id = "t-escape-sample"; copy.meta.title = "サンプルの写し";
  await importState(page, copy);
  await expect(page.locator("#bookSel option:checked")).toHaveText("サンプルの写し");
  await expect(page.locator("#bookSel option:checked")).toHaveAttribute("value", "t-escape-sample");
  const ids = copy.v.props.filter(p => p.t).map(p => p.id);
  await expect(ruleItem(page, 6).locator(".card .id")).toHaveText(copy.v.props.map(p => p.id));
  await expect(ruleItem(page, 4).locator(".row .rule")).toHaveText(copy.v.qs.map(q => q.id));
  const q1 = copy.v.qs[0].id, ans = copy.v.props.filter(p => p.t && p.q === q1).map(p => p.id);
  await expect(ruleItem(page, 8).locator(".card").first()).toContainText("答えている命題: " + (ans.length ? ans.join("、") : "なし"));
  const judged = copy.v.props.find(p => p.t && p.judge);
  await expect(ruleItem(page, 11).locator(".card").first()).toContainText(" — " + judged.judge);
  expect(ids.length).toBeGreaterThan(0);
  // 記号の文字が、二重にエスケープされて見えることがない
  expect(await page.locator("#app").innerText()).not.toMatch(/&(amp|lt|gt|quot|#39);/);
  expect(await current(page)).toEqual(copy);
  // 前の形のサンプル
  const old = JSON.parse(JSON.stringify(OLD)); old.id = "t-escape-old"; old.meta.title = "前の形の写し";
  await importState(page, old);
  await expect(page.locator("#bookSel option:checked")).toHaveText("前の形の写し");
  await expect(ruleItem(page, 6).locator(".card .id")).toHaveText(OLD.v.props.map(p => p.id));
  await expect(ruleItem(page, 9).locator('button[data-p="props.0.judge"][data-val="' + OLD.v.props[0].judge + '"]')).toHaveClass(/on/);
  expect(await page.locator("#app").innerText()).not.toMatch(/&(amp|lt|gt|quot|#39);/);
  // 本の選択で、サンプルの写しに戻れる
  await page.locator("#bookSel").selectOption("t-escape-sample");
  await page.waitForFunction(() => window.__dokusho.current().id === "t-escape-sample");
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、タグを入れた state を読み込んで、スクリプトが動かない", async ({ page }) => {
    const book = evil();
    await setup(page, book);
    await expectInert(page, "読み込んだ直後");
    await expect(ruleItem(page, 6).locator(".card .id")).toHaveText([P1, P2, "P3"]);
  });
});
