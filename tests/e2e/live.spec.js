// 仕様: 文字を入力したら、その内容を使うほかの欄も、その場で最新になる（issue #53）。
// 入力のあと、表示を最新にするためのボタンやプルダウンの操作はしない（前準備と、結果を確かめるための操作は行う）。
// 入力はキーボードで1文字ずつ打つ（かな漢字変換の仕様だけは、変換の途中の状態をブラウザの口から直接入れる）。
// 入力中の欄は同じ部品のまま残り、フォーカスとカーソルの位置が変わらないことも確かめる。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

function base(over) {
  const b = { id: "t-live", meta: { title: "その場で最新になるテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 2, Q: 2, P: 3 }, judge: "分析読書へ進む", kind: "理論書", unity: { what: "学問", claim: "学べ" }, unclear: ["分からない語A"],
      parts: [{ id: "S1", t: "第1部", role: "問題を示す", to: "", link: "" }, { id: "S2", t: "第2部", role: "主張を述べる", to: "S1", link: "を受けて進める" }],
      qs: [{ id: "Q1", t: "問いの一" }, { id: "Q2", t: "問いの二" }],
      props: [{ id: "P1", t: "テスト用の命題1", sup: "main", q: "Q1", grounds: [] }, { id: "P2", t: "テスト用の命題2", sup: "P1", q: "Q1", grounds: [] }, { id: "P3", t: "テスト用の命題3", sup: "P2", q: "", grounds: [] }] } };
  Object.assign(b.v, over || {});
  return b;
}
/* 読み込んだ本が画面に出るまで待つ（importState は今の本の id だけを待つ） */
async function setup(page, over) {
  await openTool(page);
  await importState(page, base(over));
  await expect(page.locator("#sec-a2 [data-p='props.2.t']")).toHaveValue("テスト用の命題3");
}
/* 欄を押してフォーカスを入れ、あとで同じ部品かどうかを見分けられるよう、印を付ける */
async function enter(loc) {
  await loc.click();
  await expect(loc).toBeFocused();
  await loc.evaluate(el => { el.__live = true; });
}
/* カーソルを、欄の n 文字目のあと（省くと末尾）に置く。Home や End のキーは OS によって働きが違うので使わない */
const caret = (loc, n) => loc.evaluate((el, n) => { const i = n == null ? el.value.length : n; el.setSelectionRange(i, i); }, n);
/* いまフォーカスのある部品が、印を付けた部品そのものか。カーソルの位置と値も返す */
const active = page => page.evaluate(() => { const el = document.activeElement; return { same: el.__live === true, p: el.dataset.p, value: el.value, start: el.selectionStart, end: el.selectionEnd }; });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("規則9: 言い直しと例を打つと、欄を離れなくても、命題ごとの賛否のボタンが出る。境目をまたいで打った文字は全部入る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 9);
  await expect(item).toContainText("言い直しと例を書いてから");
  await enter(item.locator('input[data-p="restate.s"]'));
  await page.keyboard.type("つまりこうだ");
  await expect(item.locator('button[data-p$=".judge"]')).toHaveCount(0);
  const ex = item.locator('input[data-p="restate.ex"]');
  await enter(ex);
  // 1文字目で賛否のボタンが出る。そのまま打ち続ける
  await page.keyboard.type("abcdefghij");
  await expect(item.locator('button[data-p$=".judge"]')).toHaveCount(9);
  await expect(item.locator('button[data-p="props.0.judge"][data-val="賛成"]')).toBeVisible();
  await expect(item).not.toContainText("言い直しと例を書いてから");
  expect(await active(page)).toEqual({ same: true, p: "restate.ex", value: "abcdefghij", start: 10, end: 10 });
  // 全部消すと、賛否のボタンは引っ込む。欄は同じ部品のまま
  for (let i = 0; i < 10; i++) await page.keyboard.press("Backspace");
  await expect(item.locator('button[data-p$=".judge"]')).toHaveCount(0);
  await expect(item).toContainText("言い直しと例を書いてから");
  expect(await active(page)).toEqual({ same: true, p: "restate.ex", value: "", start: 0, end: 0 });
  await page.keyboard.type("k");
  await expect(item.locator('button[data-p$=".judge"]')).toHaveCount(9);
  expect((await current(page)).v.restate).toEqual({ s: "つまりこうだ", ex: "k" });
});

test("規則3を打って埋めると、規則2の「このままでよい」「直した」が押せる", async ({ page }) => {
  await setup(page);
  const r2 = ruleItem(page, 2), r3 = ruleItem(page, 3);
  const ok = r2.locator('button[data-p="unity2"][data-val="このままでよい"]'), fixed = r2.locator('button[data-p="unity2"][data-val="直した"]');
  await expect(ok).toBeDisabled();
  await expect(r2).toContainText("規則3を埋めてから");
  await enter(r3.locator('[data-p="parts.0.sum"]'));
  await page.keyboard.type("概要1");
  await expect(ok).toBeDisabled();
  await enter(r3.locator('[data-p="parts.1.sum"]'));
  await page.keyboard.type("概要2");
  await expect(ok).toBeEnabled();
  await expect(fixed).toBeEnabled();
  await expect(r2).not.toContainText("規則3を埋めてから");
  expect(await active(page)).toEqual({ same: true, p: "parts.1.sum", value: "概要2", start: 3, end: 3 });
  await ok.click();
  expect((await current(page)).v.unity2).toBe("このままでよい");
});

test("規則6で命題の文を書き換えると、規則7の図とカード、規則8〜15のカードの文が変わる。欄の途中に打っても、カーソルの位置は変わらない", async ({ page }) => {
  const b = base(); b.v.restate = { s: "つまり", ex: "たとえば" };
  b.v.props[0].judge = "反対"; b.v.props[1].judge = "賛成"; b.v.props[2].judge = "判断保留";
  await setup(page, b.v);
  const r6 = ruleItem(page, 6), r7 = ruleItem(page, 7);
  const cardOf = (r, pid) => ruleItem(page, r).locator(".card").filter({ has: page.locator(".id", { hasText: new RegExp("^" + pid + "$") }) });
  await expect(r7.locator(".chain")).toContainText("P1 テスト用の命題1");
  // P1（中心の主張、反対）の文の、2文字目のあとに打つ
  await enter(r6.locator('[data-p="props.0.t"]'));
  await caret(r6.locator('[data-p="props.0.t"]'), 2);
  await page.keyboard.type("XYZ");
  const t1 = "テスXYZト用の命題1";
  expect(await active(page)).toEqual({ same: true, p: "props.0.t", value: t1, start: 5, end: 5 });
  await expect(r7.locator(".chain")).toContainText("P1 " + t1);
  await expect(r7.locator(".chain")).not.toContainText("P1 テスト用の命題1");
  await expect(cardOf(7, "P1").locator(".ro")).toHaveText(t1 + "（中心の主張）");
  await expect(ruleItem(page, 9).locator(".help", { hasText: "中心の主張 P1" })).toHaveText("中心の主張 P1: " + t1);
  await expect(cardOf(9, "P1").locator(".ro")).toHaveText(t1);
  await expect(cardOf(10, "P1").locator(".ro")).toHaveText(t1 + " — 反対");
  await expect(cardOf(11, "P1").locator(".ro")).toHaveText(t1 + " — 反対");
  for (const r of [12, 13, 14]) await expect(cardOf(r, "P1").locator(".ro")).toHaveText(t1 + " — 反対");
  await expect(page.locator("#sec-checkout dl.sum dd").nth(1)).toContainText("P1 " + t1);
  // P3（判断保留）の文の末尾に打つ
  await enter(r6.locator('[data-p="props.2.t"]'));
  await caret(r6.locator('[data-p="props.2.t"]'));
  await page.keyboard.type("Q");
  await expect(cardOf(15, "P3").locator(".ro")).toHaveText("テスト用の命題3Q — 判断保留");
  await expect(cardOf(11, "P3").locator(".ro")).toHaveText("テスト用の命題3Q — 判断保留");
  // P2 の文を全部消すと、P2 のカードと、規則8の「答えている命題」から消える。打ち直すと戻る
  await expect(cardOf(8, "Q1")).toContainText("答えている命題: P1、P2");
  const p2 = r6.locator('[data-p="props.1.t"]');
  await enter(p2);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(cardOf(8, "Q1")).toContainText("答えている命題: P1");
  await expect(cardOf(8, "Q1")).not.toContainText("P2");
  await expect(cardOf(7, "P2")).toHaveCount(0);
  await expect(cardOf(9, "P2")).toHaveCount(0);
  expect(await active(page)).toEqual({ same: true, p: "props.1.t", value: "", start: 0, end: 0 });
  await page.keyboard.type("戻した命題");
  await expect(cardOf(7, "P2").locator(".ro")).toHaveText("戻した命題");
  await expect(cardOf(9, "P2").locator('button[data-val="賛成"]')).toHaveClass(/on/);
  await expect(cardOf(8, "Q1")).toContainText("答えている命題: P1、P2");
  expect(await active(page)).toEqual({ same: true, p: "props.1.t", value: "戻した命題", start: 5, end: 5 });
});

test("サンプルの命題を1文字書き換えると、ファクトチェックの結果に「そのあと命題が書き換えられた」と出る", async ({ page }) => {
  await openTool(page);
  const fc = ruleItem(page, 9).locator(".fc").first();
  await expect(fc).toBeVisible();
  await expect(fc).not.toContainText("そのあと命題が書き換えられた");
  const t = ruleItem(page, 6).locator('[data-p="props.0.t"]');
  const before = await t.inputValue();
  await enter(t);
  await caret(t);
  await page.keyboard.type("z");
  await expect(fc).toContainText("そのあと命題が書き換えられた");
  expect(await active(page)).toEqual({ same: true, p: "props.0.t", value: before + "z", start: before.length + 1, end: before.length + 1 });
  // 元の文に戻すと、注意は消える
  await page.keyboard.press("Backspace");
  await expect(fc).not.toContainText("そのあと命題が書き換えられた");
});

test("用語を足して打つと、チェックアウトの「用語集に入れる語」と、規則5の欄に出る", async ({ page }) => {
  await setup(page);
  const gloss = page.locator("#sec-checkout .item").filter({ hasText: "用語集に入れる語" });
  await expect(gloss).toContainText("用語を挙げると、ここから選べる。");
  await page.locator("#sec-shitayomi").getByRole("button", { name: "＋ 用語", exact: true }).click();
  const w = page.locator('#sec-shitayomi input[data-p="terms.0.w"]');
  await enter(w);
  await page.keyboard.type("用語A");
  await expect(gloss.locator('button[data-p="terms.0.g"]')).toHaveText("用語A");
  await expect(gloss).not.toContainText("用語を挙げると、ここから選べる。");
  await expect(ruleItem(page, 5).locator('input[data-p="terms.0.w"]')).toHaveValue("用語A");
  expect(await active(page)).toEqual({ same: true, p: "terms.0.w", value: "用語A", start: 3, end: 3 });
  // 規則5の側の同じ欄に打っても、下読みの欄と、用語集に入れる語が変わる
  const w5 = ruleItem(page, 5).locator('input[data-p="terms.0.w"]');
  await enter(w5);
  await caret(w5);
  await page.keyboard.type("B");
  await expect(w).toHaveValue("用語AB");
  await expect(gloss.locator('button[data-p="terms.0.g"]')).toHaveText("用語AB");
  const a = await active(page);
  expect(a).toEqual({ same: true, p: "terms.0.w", value: "用語AB", start: 4, end: 4 });
  expect(await w5.evaluate(el => el === document.activeElement), "フォーカスは規則5の側の欄に残る").toBe(true);
});

test("チェックアウトの「4つの問いへの答え」が、打った内容に合わせて変わる", async ({ page }) => {
  await setup(page);
  const dd = page.locator("#sec-checkout dl.sum dd");
  await expect(dd.nth(3)).toHaveText("まだ書いていない");
  const meaning = page.locator('#sec-checkout textarea[data-p="meaning"]');
  await enter(meaning);
  await page.keyboard.type("意義の1行目");
  await expect(dd.nth(3)).toHaveText("意義の1行目");
  await expect(dd.nth(3)).not.toHaveClass(/none/);
  expect(await active(page)).toEqual({ same: true, p: "meaning", value: "意義の1行目", start: 6, end: 6 });
  // 1番目の答えは、規則2の統一の文から作る
  await expect(dd.nth(0)).toHaveText("学問 について、学べ と言っている本");
  await enter(ruleItem(page, 2).locator('input[data-p="unityA.claim"]'));
  await caret(ruleItem(page, 2).locator('input[data-p="unityA.claim"]'));
  await page.keyboard.type("!");
  await expect(dd.nth(0)).toHaveText("学問 について、学べ! と言っている本");
  await expect(ruleItem(page, 2)).toContainText("下読みの答え: 学問 について、学べ と言っている本");
});

test("ほかの表示も打ったその場で変わる: 分からなかった所、プルダウンの選択肢、規則9の済み具合。開いている説明と選んだボタンは、そのまま", async ({ page }) => {
  const b = base(); b.v.restate = { s: "つまり", ex: "たとえば" }; b.v.props[0].judge = "賛成";
  await setup(page, b.v);
  // 開いた説明と、選んだ賛否
  await ruleItem(page, 9).locator('button[data-a="help"]').click();
  const help = ruleItem(page, 9).locator(".help").first();
  await expect(help).toContainText("章の中の規則");
  const judge = ruleItem(page, 9).locator('button[data-p="props.0.judge"][data-val="賛成"]');
  await expect(judge).toHaveClass(/on/);
  // 表面読みの「分からなかった所」→ 規則5・6
  await enter(page.locator('#sec-hyomen input[data-p="unclear.0"]'));
  await caret(page.locator('#sec-hyomen input[data-p="unclear.0"]'));
  await page.keyboard.type("B");
  await expect(ruleItem(page, 5)).toContainText("分からない語AB");
  await expect(ruleItem(page, 6)).toContainText("分からない語AB");
  // 規則4の問題の文 → 規則6の「答える問題」の選択肢と、規則8のカード
  await enter(ruleItem(page, 4).locator('[data-p="qs.0.t"]'));
  await caret(ruleItem(page, 4).locator('[data-p="qs.0.t"]'));
  await page.keyboard.type("C");
  const q = ruleItem(page, 6).locator('select[data-p="props.0.q"]');
  await expect(q.locator('option[value="Q1"]')).toHaveText("Q1 問いの一C");
  await expect(q).toHaveValue("Q1");
  await expect(ruleItem(page, 8).locator(".card").first().locator(".ro")).toHaveText("問いの一C");
  // 規則6の「重要な文の場所」→ 規則9の済み具合
  const status = ruleItem(page, 9).locator(".status");
  await expect(status).toContainText("規則6 まだ");
  for (const i of [0, 1, 2]) { await enter(ruleItem(page, 6).locator(`input[data-p="props.${i}.loc"]`)); await page.keyboard.type("1章"); }
  await expect(status).toContainText("規則6 済");
  expect(await active(page)).toEqual({ same: true, p: "props.2.loc", value: "1章", start: 2, end: 2 });
  await expect(help).toContainText("章の中の規則");
  await expect(judge).toHaveClass(/on/);
  expect((await current(page)).v.props[0].judge).toBe("賛成");
});

test("かな漢字変換の途中でも、入力中の欄は同じ部品のままで、変換を確定した文字が全部入る", async ({ page }) => {
  await setup(page, { restate: { s: "つまり", ex: "" } });
  const item = ruleItem(page, 9);
  const ex = item.locator('input[data-p="restate.ex"]');
  await enter(ex);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "たとえ", selectionStart: 3, selectionEnd: 3 });
  // 変換の途中の文字でも、賛否のボタンが出る
  await expect(item.locator('button[data-p$=".judge"]')).toHaveCount(9);
  await cdp.send("Input.imeSetComposition", { text: "たとえば", selectionStart: 4, selectionEnd: 4 });
  await cdp.send("Input.insertText", { text: "例えば" });
  await page.keyboard.type("x");
  expect(await active(page)).toEqual({ same: true, p: "restate.ex", value: "例えばx", start: 4, end: 4 });
  expect((await current(page)).v.restate.ex).toBe("例えばx");
  await expect(item.locator('button[data-p$=".judge"]')).toHaveCount(9);
});

test("あちこちの欄に打ったあとの画面は、同じ内容を開き直して描いた画面と、欄の値まで含めて同じになる", async ({ page }) => {
  const b = base(); b.v.restate = { s: "つまり", ex: "" };
  b.v.props[0].judge = "反対"; b.v.props[1].judge = "賛成"; b.v.props[2].judge = "判断保留";
  await setup(page, b.v);
  /* 画面の中身を、欄の今の値と、プルダウンの今の選択を書き込んだ形で取り出す */
  const snapshot = () => page.evaluate(() => {
    const app = document.getElementById("app"), copy = app.cloneNode(true);
    const live = app.querySelectorAll("input, textarea, select"), dup = copy.querySelectorAll("input, textarea, select");
    live.forEach((el, i) => { const d = dup[i];
      if (el.tagName === "SELECT") [...d.options].forEach((o, k) => { el.options[k].selected ? o.setAttribute("selected", "") : o.removeAttribute("selected"); });
      else if (el.tagName === "TEXTAREA") d.textContent = el.value;
      else d.setAttribute("value", el.value); });
    return copy.innerHTML;
  });
  const type = async (loc, text, at) => { await enter(loc); await caret(loc, at); await page.keyboard.type(text); };
  await type(ruleItem(page, 9).locator('input[data-p="restate.ex"]'), "たとえば");
  await type(ruleItem(page, 6).locator('[data-p="props.0.t"]'), "<b>&\"'", 3);
  await type(ruleItem(page, 3).locator('input[data-p="parts.0.t"]'), "の名前");
  await type(ruleItem(page, 3).locator('[data-p="parts.0.sum"]'), "概要1");
  await type(ruleItem(page, 3).locator('[data-p="parts.1.sum"]'), "概要2");
  await type(ruleItem(page, 4).locator('[data-p="qs.1.t"]'), "の続き");
  await type(page.locator('#sec-hyomen input[data-p="unclear.0"]'), "B");
  await type(ruleItem(page, 10).locator('input[data-p="props.0.self"]'), "読み違い");
  await type(ruleItem(page, 15).locator('input[data-p="props.2.k15"]'), "説明が足りない");
  await type(page.locator('#sec-checkout textarea[data-p="memo"]'), "メモ");
  const p2 = ruleItem(page, 6).locator('[data-p="props.1.t"]');
  await enter(p2);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(ruleItem(page, 8).locator(".card").first()).not.toContainText("P2");
  // 打った記号は、文字のまま出る
  await expect(ruleItem(page, 7).locator(".chain")).toContainText("P1 テスト<b>&\"'用の命題1");
  await expect(page.locator("#app b", { hasText: /^&/ })).toHaveCount(0);
  const typed = await snapshot();
  await page.reload();
  await expect(page.locator("#sec-a2 [data-p='props.2.t']")).toHaveValue("テスト用の命題3");
  expect(typed).toBe(await snapshot());
});

test("同じ用語の欄の片方に打ち、もう片方で元の値に戻すと、先に打った側の欄も戻る", async ({ page }) => {
  await setup(page, { terms: [{ w: "foo", m: "", p: "", g: false }, { w: "", m: "", p: "", g: false }] });
  const top = i => page.locator(`#sec-shitayomi input[data-p="terms.${i}.w"]`), r5 = i => ruleItem(page, 5).locator(`input[data-p="terms.${i}.w"]`);
  const word = async i => (await current(page)).v.terms[i].w;
  // 規則5で「bar」を足し、下読みの同じ欄で「bar」を選んで消す
  await enter(r5(0));
  await caret(r5(0));
  await page.keyboard.type("bar");
  await expect(top(0)).toHaveValue("foobar");
  await enter(top(0));
  await top(0).evaluate(el => el.setSelectionRange(3, 6));
  await page.keyboard.press("Backspace");
  expect(await word(0)).toBe("foo");
  await expect(top(0)).toHaveValue("foo");
  await expect(r5(0)).toHaveValue("foo");
  // 規則5で空の用語に打ち、下読みの同じ欄で全部を選んで消す
  await enter(r5(1));
  await page.keyboard.type("用語A");
  await expect(top(1)).toHaveValue("用語A");
  await enter(top(1));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  expect(await word(1)).toBe("");
  await expect(r5(1)).toHaveValue("");
  // ほかの欄に打ったあとも、消した文字は戻らない
  await enter(page.locator('#sec-checkout textarea[data-p="memo"]'));
  await page.keyboard.type("メモ");
  await expect(r5(1)).toHaveValue("");
  await expect(top(1)).toHaveValue("");
  // その欄に打つと、打った文字だけが入る
  await enter(r5(1));
  await page.keyboard.type("!");
  expect(await word(1)).toBe("!");
  await expect(top(1)).toHaveValue("!");
  expect(await active(page)).toEqual({ same: true, p: "terms.1.w", value: "!", start: 1, end: 1 });
});

test("広げた自由メモの欄の高さは、ほかの欄に打っても、その欄に打っても、元に戻らない", async ({ page }) => {
  await setup(page);
  const memo = page.locator('#sec-checkout textarea[data-p="memo"]');
  const height = async () => (await memo.boundingBox()).height;
  const h0 = await height();
  // つまみを引いて広げたときと同じく、欄に高さが付いた状態を作る
  await memo.evaluate((el, h) => { el.style.height = h + "px"; }, h0 + 150);
  expect(await height()).toBe(h0 + 150);
  const dd = page.locator("#sec-checkout dl.sum dd").nth(3);
  await enter(page.locator('#sec-checkout textarea[data-p="meaning"]'));
  await page.keyboard.type("意義");
  await expect(dd).toHaveText("意義");
  expect(await height(), "ほかの欄に打ったあとの高さ").toBe(h0 + 150);
  await enter(memo);
  await page.keyboard.type("メモ");
  await enter(page.locator('#sec-checkout textarea[data-p="meaning"]'));
  await page.keyboard.type("x");
  await expect(dd).toHaveText("意義x");
  expect(await height(), "その欄に打ち、またほかの欄に打ったあとの高さ").toBe(h0 + 150);
  await expect(memo).toHaveValue("メモ");
});

test.describe("390px の幅", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("入力中に横にはみ出さず、入力中の欄より上の高さが変わっても、欄は画面の同じ位置に残る", async ({ page }) => {
    await setup(page);
    const r2 = ruleItem(page, 2), r3 = ruleItem(page, 3), r9 = ruleItem(page, 9);
    expect(await overflow(page), "入力の前に横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    // 規則3（下）を埋めると、規則2（上）の注意が消えて、上の高さが変わる
    await enter(r3.locator('[data-p="parts.0.sum"]'));
    await page.keyboard.type("概要1");
    const sum = r3.locator('[data-p="parts.1.sum"]');
    await enter(sum);
    const h0 = (await r2.boundingBox()).height;
    const top = () => sum.evaluate(el => el.getBoundingClientRect().top);
    const y0 = await top();
    await page.keyboard.type("概");
    await expect(r2.locator('button[data-p="unity2"][data-val="このままでよい"]')).toBeEnabled();
    expect((await r2.boundingBox()).height, "規則2の欄の高さが変わる（この仕様の前提）").not.toBe(h0);
    expect(Math.abs((await top()) - y0), "入力中の欄の縦位置のずれ（px）").toBeLessThanOrEqual(1);
    await page.keyboard.type("要2");
    expect(Math.abs((await top()) - y0), "入力中の欄の縦位置のずれ（px）").toBeLessThanOrEqual(1);
    await expect(sum).toBeInViewport();
    expect(await active(page)).toEqual({ same: true, p: "parts.1.sum", value: "概要2", start: 3, end: 3 });
    expect(await overflow(page), "規則3を打ったあとに横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    // 規則9で賛否のボタンが出たあと、長い命題に書き換えても、はみ出さない
    await enter(r9.locator('input[data-p="restate.s"]'));
    await page.keyboard.type("つまり");
    const ex = r9.locator('input[data-p="restate.ex"]');
    await enter(ex);
    await page.keyboard.type("たとえば");
    await expect(r9.locator('button[data-p$=".judge"]')).toHaveCount(9);
    await expect(ex).toBeInViewport();
    expect(await overflow(page), "賛否のボタンが出たあとに横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    const t = ruleItem(page, 6).locator('[data-p="props.0.t"]');
    await enter(t);
    await caret(t);
    await page.keyboard.type("を長くした文".repeat(8));
    await expect(ruleItem(page, 7).locator(".chain")).toContainText("を長くした文を長くした文");
    await expect(t).toBeInViewport();
    expect(await overflow(page), "長い命題を打ったあとに横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
