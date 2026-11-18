// 仕様: 規則4の欄は、主な問いと、その下にぶら下がる従属する問いに分かれている（issue #77）。
// 主か従かは、行を足す場所で決まる（プルダウンでは選ばない）。問いの型は、行ごとに、任意で選べる。
// 保存の形は、これまでの { id, t, parent } に、任意の type（問いの型）が足されるだけ。表示の並び（主 → 従）と、保存の並び（v.qs の順）は違うことがある。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current, loadWindowJs, untilRedrawn } = require("./helpers");

const THEORY = ["存在", "種類", "原因", "条件", "目的", "結果", "特性", "関係", "ふるまい"];
const PRACTICE = ["目的", "手段", "順序", "条件", "どちらがより良いか"];
const BOTH = THEORY.concat(["手段", "順序", "どちらがより良いか"]);
const PH = "著者が答えようとしている問い";

/* 保存の並びは Q1、Q2、Q3、Q4、Q5。表示の並びは Q1（Q2、Q4）、Q3（Q5） */
function base(over, meta) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "", subs: [] });
  const prop = (id, sup, q) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q, grounds: [], arg: "", judge: "", why: "", self: "", k12: "", k13: "", k14: "", k15: "" });
  const b = { id: "t-questions", meta: Object.assign({ title: "問いのテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, meta || {}), skip: {},
    v: { _n: { S: 2, Q: 5, P: 2 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", unity: { what: "下読みの主題", claim: "下読みの主張" }, unityA: { what: "テスト用の主題", claim: "テスト用の主張" },
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "" }, { id: "Q4", t: "問いの四", parent: "Q1" }, { id: "Q5", t: "問いの五", parent: "Q3" }],
      props: [prop("P1", "main", "Q1"), prop("P2", "P1", "Q4")] } };
  Object.assign(b.v, over || {});
  return b;
}
async function setup(page, book) {
  await openTool(page);
  book = book || base();
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  return book;
}
const markdown = page => page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
const done = (page, r) => page.evaluate(r => window.__dokusho.done()[r], r);
/* Markdown の、規則 r の欄の行（次の欄の手前まで。字下げもそのまま） */
async function mdRule(page, r) {
  const ls = (await markdown(page)).split("\n"), i = ls.findIndex(l => l.startsWith("- 規則" + r + " "));
  const out = []; for (let j = i + 1; j < ls.length && /^\s+\S/.test(ls[j]); j++) out.push(ls[j]);
  return out;
}
/* 規則4の欄の行を、表示の順に。[番号, "主" か "従"] */
const rows = page => ruleItem(page, 4).locator(".qrow").evaluateAll(els => els.map(el => [el.querySelector(".rule").textContent, el.classList.contains("sub") ? "従" : "主"]));
/* 規則4の欄の、見出し・行・行を足すボタンを、上から順に */
const outline = page => ruleItem(page, 4).evaluate(item => [...item.querySelectorAll(".qcap, .qrow, button[data-a='push']")].map(el =>
  el.matches(".qrow") ? el.querySelector(".rule").textContent : el.textContent));
const qField = (page, i) => ruleItem(page, 4).locator(`textarea[data-p="qs.${i}.t"]`);
const qType = (page, i) => ruleItem(page, 4).locator(`select[data-p="qs.${i}.type"]`);
const btn = (page, a, i) => ruleItem(page, 4).locator(`button[data-a="${a}"][data-p="qs"][data-i="${i}"]`);
const addMain = page => ruleItem(page, 4).getByRole("button", { name: "＋ 主な問い", exact: true });
const addSub = (page, id) => ruleItem(page, 4).getByRole("button", { name: "＋ " + id + " に従属する問い", exact: true });
const ids = async page => (await current(page)).v.qs.map(o => o.id);
/* フォーカスのある部品の data-* */
const active = page => page.evaluate(() => Object.assign({ tag: document.activeElement.tagName }, document.activeElement.dataset));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
function watch(page, answer) {
  const seen = [];
  page.on("dialog", d => { seen.push(d.message()); if (answer()) d.accept(); else d.dismiss(); });
  return seen;
}

test("見本の形: 主な問いの下に、従属する問いが並ぶ。行を足すボタンは「＋ 主な問い」と、主な問いごとの「＋ Q1 に従属する問い」。従属先のプルダウンはない", async ({ page }) => {
  await setup(page);
  page.on("dialog", d => d.accept()); // 同じ本を、中身を変えて読み込み直すときの確認（#59）を受ける
  expect(await outline(page)).toEqual(["主な問い", "Q1", "従属する問い", "Q2", "Q4", "＋ Q1 に従属する問い", "Q3", "従属する問い", "Q5", "＋ Q3 に従属する問い", "＋ 主な問い"]);
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q4", "従"], ["Q3", "主"], ["Q5", "従"]]);
  const item = ruleItem(page, 4);
  await expect(item.locator('select[data-p$=".parent"]'), "従属先のプルダウン").toHaveCount(0);
  await expect(item.getByRole("button", { name: "＋ 問題", exact: true })).toHaveCount(0);
  // 従属する問いは、主な問いより字下げされている
  const left = async i => (await qField(page, i).locator("xpath=..").boundingBox()).x;
  expect(await left(1)).toBeGreaterThan(await left(0));
  expect(await left(3)).toBe(await left(1));
  expect(await left(2)).toBe(await left(0));
  // 従属する問いにだけ、「↑」「↓」がある。「×」は、どの行にもある
  for (const [i, n] of [[0, 0], [1, 1], [2, 0], [3, 1], [4, 1]]) {
    await expect(btn(page, "up", i)).toHaveCount(n);
    await expect(btn(page, "down", i)).toHaveCount(n);
    await expect(btn(page, "del", i)).toHaveCount(1);
  }
  // 従属する問いのない主な問いには、「従属する問い」の見出しは出ず、行を足すボタンだけが出る
  await importState(page, base({ qs: [{ id: "Q1", t: "問いの一", parent: "" }] }));
  expect(await outline(page)).toEqual(["主な問い", "Q1", "＋ Q1 に従属する問い", "＋ 主な問い"]);
});

test("手がかり: 欄の上に規則2の統一の文と「この文が答えになる問いは何か」、欄の下に規則3の部分の番号と名前が出る。ほかの欄に打つと、その場で変わる", async ({ page }) => {
  await setup(page);
  page.on("dialog", d => d.accept()); // 同じ本を、中身を変えて読み込み直すときの確認（#59）を受ける
  const item = ruleItem(page, 4), top = item.locator(".qhint.qtop"), bottom = item.locator(".qhint.qbottom");
  await expect(top).toHaveText("規則2の文: テスト用の主題 について、テスト用の主張 と言っている本（この文が答えになる問いは何か）");
  await expect(bottom).toHaveText("手がかり（規則3の部分）: S1 第1部 / S2 第2部");
  // 上の手がかりは、主な問いの行より上に、下の手がかりは、「＋ 主な問い」より下にある
  const y = async loc => (await loc.boundingBox()).y;
  expect(await y(top)).toBeLessThan(await y(qField(page, 0)));
  expect(await y(bottom)).toBeGreaterThan(await y(addMain(page)));
  // 規則2の欄に打つと、その場で変わる
  const what = ruleItem(page, 2).locator('input[data-p="unityA.what"]');
  await what.click(); await page.keyboard.press("End"); await page.keyboard.type("X");
  await expect(top).toContainText("規則2の文: テスト用の主題X について、");
  await expect(what).toBeFocused();
  // 規則3の部分の名前を打つと、その場で変わる。名前を空にした部分は出ない
  const s2 = ruleItem(page, 3).locator('input[data-p="parts.1.t"]');
  await s2.click(); await page.keyboard.press("End"); await page.keyboard.type("Y");
  await expect(bottom).toHaveText("手がかり（規則3の部分）: S1 第1部 / S2 第2部Y");
  await s2.fill("");
  await expect(bottom).toHaveText("手がかり（規則3の部分）: S1 第1部");
  // 規則2の答えがなければ、下読みの答え。どちらもなければ、出ない。部分がなければ、下の手がかりも出ない
  await ruleItem(page, 2).locator('input[data-p="unityA.claim"]').fill("");
  await expect(top).toHaveText("規則2の文: 下読みの主題 について、下読みの主張 と言っている本（この文が答えになる問いは何か）");
  await importState(page, base({ unity: { what: "", claim: "" }, unityA: { what: "", claim: "" }, parts: [] }));
  await expect(qField(page, 0)).toHaveValue("問いの一");
  await expect(item.locator(".qhint")).toHaveCount(0);
});

test("主な問いを複数足せる。「＋ 主な問い」は従属先が空の問題を、「＋ Q1 に従属する問い」は従属先が Q1 の問題を足し、足した行の文の欄にフォーカスが移る", async ({ page }) => {
  await setup(page);
  await addMain(page).click();
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.5.t" });
  await page.keyboard.type("足した主な問い");
  await addMain(page).click();
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.6.t" });
  expect((await current(page)).v.qs.slice(5)).toEqual([{ id: "Q6", t: "足した主な問い", parent: "" }, { id: "Q7", t: "", parent: "" }]);
  // Q1 に従属する問いを足す。保存の並びでは末尾、表示では Q1 の従属する問いの並びの末尾（Q4 の次）に出る
  await addSub(page, "Q1").click();
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.7.t" });
  await page.keyboard.type("足した従属する問い");
  expect((await current(page)).v.qs[7]).toEqual({ id: "Q8", t: "足した従属する問い", parent: "Q1" });
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q4", "従"], ["Q8", "従"], ["Q3", "主"], ["Q5", "従"], ["Q6", "主"], ["Q7", "主"]]);
  // 文が空の主な問い（Q7）の下には、「＋ Q7 に従属する問い」は出ない。文を打つと、その場で出る
  await expect(addSub(page, "Q6")).toHaveCount(1);
  await expect(addSub(page, "Q7")).toHaveCount(0);
  await qField(page, 6).click();
  await page.keyboard.type("あ");
  await expect(addSub(page, "Q7")).toHaveCount(1);
  await expect(qField(page, 6)).toBeFocused();
  expect(await done(page, 4)).toBe(true);
});

test("「済み」の条件は、文のある主な問いが1つ以上。従属する問いも、型も、なくてよい", async ({ page }) => {
  await setup(page, base({ qs: [] }));
  expect(await done(page, 4), "問題がない").toBe(false);
  await addMain(page).click();
  expect(await done(page, 4), "文が空の主な問いだけ").toBe(false);
  await page.keyboard.type("打った主な問い");
  expect(await done(page, 4), "文のある主な問いが1つ").toBe(true);
  expect((await current(page)).v.qs).toEqual([{ id: "Q6", t: "打った主な問い", parent: "" }]);
  await expect(qType(page, 0)).toHaveValue("");
});

test("従属する問いの「↑」「↓」は、同じ主な問いの下の並びの中で入れ替える。端では動かない。ほかの主な問いの並びは変わらない", async ({ page }) => {
  await setup(page);
  // Q4（保存の並びの4番目）を上へ。Q2 と入れ替わる。あいだにある主な問い Q3 は動かない
  await btn(page, "up", 3).click();
  expect(await ids(page)).toEqual(["Q1", "Q4", "Q3", "Q2", "Q5"]);
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q4", "従"], ["Q2", "従"], ["Q3", "主"], ["Q5", "従"]]);
  // 端では動かない（Q4 は、いま Q1 の下の先頭。Q2 は末尾。Q5 は、Q3 の下に1つだけ）
  await btn(page, "up", 1).click();
  await btn(page, "down", 3).click();
  await btn(page, "up", 4).click();
  await btn(page, "down", 4).click();
  expect(await ids(page)).toEqual(["Q1", "Q4", "Q3", "Q2", "Q5"]);
  // 下へ。元に戻る
  await btn(page, "down", 1).click();
  expect(await ids(page)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5"]);
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q4", "従"], ["Q3", "主"], ["Q5", "従"]]);
  // 欄の文も、行と一緒に動いている
  await expect(qField(page, 1)).toHaveValue("問いの二");
  await expect(qField(page, 3)).toHaveValue("問いの四");
  expect((await current(page)).v.qs.map(o => o.parent)).toEqual(["", "Q1", "", "Q1", "Q3"]);
});

test("キーボードで「↑」「↓」を押すと、動いた行の同じボタンにフォーカスが残り、続けて押せる。端で押しても、フォーカスは同じボタンに残る", async ({ page }) => {
  await setup(page, base({ qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "" }, { id: "Q4", t: "問いの四", parent: "Q1" }, { id: "Q5", t: "問いの五", parent: "Q3" }, { id: "Q6", t: "問いの六", parent: "Q1" }] }));
  await btn(page, "up", 5).focus();
  await page.keyboard.press("Enter");
  expect(await ids(page)).toEqual(["Q1", "Q2", "Q3", "Q6", "Q5", "Q4"]);
  expect(await active(page)).toMatchObject({ tag: "BUTTON", a: "up", p: "qs", i: "3" });
  await page.keyboard.press("Space");
  expect(await ids(page)).toEqual(["Q1", "Q6", "Q3", "Q2", "Q5", "Q4"]);
  expect(await active(page)).toMatchObject({ tag: "BUTTON", a: "up", p: "qs", i: "1" });
  // 先頭でもう一度押しても、動かず、フォーカスは同じボタンに残る
  await page.keyboard.press("Enter");
  expect(await ids(page)).toEqual(["Q1", "Q6", "Q3", "Q2", "Q5", "Q4"]);
  expect(await active(page)).toMatchObject({ tag: "BUTTON", a: "up", p: "qs", i: "1" });
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q6", "従"], ["Q2", "従"], ["Q4", "従"], ["Q3", "主"], ["Q5", "従"]]);
});

test("問いの型のプルダウン: 理論書なら理論書の型、実践書なら実践書の型、それ以外なら両方（同じ語は1回だけ）。未選択の見出しは「型」", async ({ page }) => {
  await setup(page);
  page.on("dialog", d => d.accept()); // 同じ本を、中身を変えて読み込み直すときの確認（#59）を受ける
  const vals = () => qType(page, 0).locator("option").evaluateAll(os => os.map(o => o.value));
  const texts = () => qType(page, 0).locator("option").evaluateAll(os => os.map(o => o.textContent));
  expect(await vals()).toEqual([""].concat(THEORY));
  expect(await texts()).toEqual(["型"].concat(THEORY.map(t => "型: " + t)));
  await expect(qType(page, 0)).toHaveValue("");
  for (const [kind, want] of [["実践書", PRACTICE], ["文学", BOTH], ["まだ分からない", BOTH], ["", BOTH]]) {
    await importState(page, base({ kind }));
    await expect(qField(page, 0)).toHaveValue("問いの一");
    expect(await vals(), "本の種類: " + (kind || "未選択")).toEqual([""].concat(want));
  }
  // 規則1で本の種類を変えると、その場で一覧が変わる
  await ruleItem(page, 1).locator('button[data-p="kind"][data-val="理論書"]').click();
  expect(await vals()).toEqual([""].concat(THEORY));
  // どの行にも、型のプルダウンがある
  for (let i = 0; i < 5; i++) await expect(qType(page, i)).toHaveCount(1);
});

test("型を選ぶと、文の欄の書き出しの例が変わり、type として保存される。選ばなくても「済み」。型を外すと、例が元に戻る", async ({ page }) => {
  await setup(page, base({ kind: "" }));
  await expect(qField(page, 0)).toHaveAttribute("placeholder", PH);
  const EX = { "存在": "〜はあるか", "種類": "〜はどんな種類のものか", "原因": "なぜ〜か", "条件": "どんな条件で〜か", "目的": "〜は何のためか／何を目ざすべきか", "結果": "〜の結果、何が起きるか", "特性": "〜の特徴は何か", "関係": "〜と〜はどう関係するか",
    "ふるまい": "〜はどうふるまうか", "手段": "どうすれば〜できるか", "順序": "何を、どんな順序ですべきか", "どちらがより良いか": "〜と〜のどちらが良いか" };
  expect(Object.keys(EX)).toEqual(BOTH);
  for (const t of BOTH) {
    await qType(page, 3).selectOption(t);
    await expect(qField(page, 3)).toHaveAttribute("placeholder", "例: " + EX[t]);
    await expect(qType(page, 3)).toHaveValue(t);
  }
  let b = await current(page);
  expect(b.v.qs[3]).toEqual({ id: "Q4", t: "問いの四", parent: "Q1", type: "どちらがより良いか" });
  expect(b.v.qs[0], "型を選んでいない問題には、キーが足されない").toEqual({ id: "Q1", t: "問いの一", parent: "" });
  // ほかの行の例は変わらない。欄の文は変わらない
  await expect(qField(page, 0)).toHaveAttribute("placeholder", PH);
  await expect(qField(page, 3)).toHaveValue("問いの四");
  expect(await done(page, 4)).toBe(true);
  // 型を外すと、例が元に戻る
  await qType(page, 3).selectOption("");
  await expect(qField(page, 3)).toHaveAttribute("placeholder", PH);
  b = await current(page);
  expect(b.v.qs[3], "型を外すと、type のキーが消える（空の値を残さない）").toEqual({ id: "Q4", t: "問いの四", parent: "Q1" });
  // プルダウンにフォーカスを置いて選ぶと、描き直したあとも、同じプルダウンにフォーカスが残る
  await qType(page, 1).focus();
  await qType(page, 1).selectOption("存在");
  await expect(qType(page, 1)).toHaveValue("存在");
  await expect(qType(page, 1)).toBeFocused();
  await expect(qField(page, 1)).toHaveAttribute("placeholder", "例: 〜はあるか");
});

test("保存されている型が、いまの一覧にないときも、その値が選択肢に出て、選ばれたままになる（本の種類を変えたあと、手で書いた値）", async ({ page }) => {
  const evil = "\"><img src=x onerror=\"window.__xss=1\">";
  const book = base({ kind: "実践書" });
  book.v.qs[0].type = "原因"; book.v.qs[1].type = evil; book.v.qs[2].type = "手段";
  await setup(page, book);
  const vals = i => qType(page, i).locator("option").evaluateAll(os => os.map(o => o.value));
  expect(await vals(0)).toEqual([""].concat(PRACTICE, ["原因"]));
  await expect(qType(page, 0)).toHaveValue("原因");
  await expect(qType(page, 0).locator("option:checked")).toHaveText("型: 原因");
  await expect(qField(page, 0)).toHaveAttribute("placeholder", "例: なぜ〜か");
  expect(await vals(2)).toEqual([""].concat(PRACTICE));
  // 値は、文字として出る（HTML として働かない）
  expect(await vals(1)).toEqual([""].concat(PRACTICE, [evil]));
  await expect(qType(page, 1)).toHaveValue(evil);
  await expect(qField(page, 1)).toHaveAttribute("placeholder", PH);
  await expect(ruleItem(page, 4).locator("img")).toHaveCount(0);
  await expect(ruleItem(page, 8).locator("img")).toHaveCount(0);
  await expect(ruleItem(page, 8).locator(".card").nth(1)).toContainText("型: " + evil);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await current(page)).toEqual(book);
});

test("前の読書メモ（型のない問題、孫、相手のいない従属先、文が空の従属先、循環）は、そのまま開けて、状態が変わらない", async ({ page }) => {
  // Q3 は孫（Q2 → Q1）。Q4 の従属先は、いない。Q6 の従属先 Q5 は、文が空。Q7 と Q8 は循環。Q9 は、循環に入っていく
  const qs = [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "Q2" }, { id: "Q4", t: "問いの四", parent: "Q99" },
    { id: "Q5", t: "", parent: "" }, { id: "Q6", t: "問いの六", parent: "Q5" }, { id: "Q7", t: "問いの七", parent: "Q8" }, { id: "Q8", t: "問いの八", parent: "Q7" }, { id: "Q9", t: "問いの九", parent: "Q8" }, { id: "Q10", t: "問いの十" }];
  const book = await setup(page, base({ qs, _n: { S: 2, Q: 10, P: 2 } }));
  expect(await current(page), "読み込んだ状態は、変わらない").toEqual(book);
  // 孫は、たどった先の主な問いの下に、平らに並ぶ。相手のいない従属先、文が空の従属先は、主な問い。循環している問題は、主な問い（止まる）
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q3", "従"], ["Q4", "主"], ["Q5", "主"], ["Q6", "主"], ["Q7", "主"], ["Q8", "主"], ["Q9", "従"], ["Q10", "主"]]);
  expect(await outline(page)).toEqual(["主な問い", "Q1", "従属する問い", "Q2", "Q3", "＋ Q1 に従属する問い", "Q4", "＋ Q4 に従属する問い", "Q5", "Q6", "＋ Q6 に従属する問い", "Q7", "＋ Q7 に従属する問い",
    "Q8", "従属する問い", "Q9", "＋ Q8 に従属する問い", "Q10", "＋ Q10 に従属する問い", "＋ 主な問い"]);
  expect(await done(page, 4)).toBe(true);
  expect(await mdRule(page, 4)).toEqual(["  - Q1 問いの一（主な問い）", "    - Q2 問いの二（Q1 に従属）", "    - Q3 問いの三（Q2 に従属）", "  - Q4 問いの四（主な問い）", "  - Q6 問いの六（主な問い）",
    "  - Q7 問いの七（主な問い）", "  - Q8 問いの八（主な問い）", "    - Q9 問いの九（Q8 に従属）", "  - Q10 問いの十（主な問い）"]);
  // 打っても、ほかの問題の保存された値（従属先）は変わらない。型のキーも足されない
  await qField(page, 9).click(); await page.keyboard.press("End"); await page.keyboard.type("x");
  const after = (await current(page)).v.qs;
  expect(after.slice(0, 9)).toEqual(qs.slice(0, 9));
  expect(after[9]).toEqual({ id: "Q10", t: "問いの十x" });
  // 再読み込みしても、同じ
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect((await current(page)).v.qs).toEqual(after);
  expect((await rows(page)).length).toBe(10);
});

test("文が空の主な問いを指す従属先は、未選択として扱う（主な問いとして並び、Markdown でも主な問い）。主な問いの文を書き直すと、元に戻る", async ({ page }) => {
  await setup(page);
  const q1 = qField(page, 0);
  await q1.click(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("Backspace");
  await expect(q1).toBeFocused();
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "主"], ["Q3", "主"], ["Q5", "従"], ["Q4", "主"]]);
  await expect(addSub(page, "Q1")).toHaveCount(0);
  expect(await mdRule(page, 4)).toEqual(["  - Q2 問いの二（主な問い）", "  - Q3 問いの三（主な問い）", "    - Q5 問いの五（Q3 に従属）", "  - Q4 問いの四（主な問い）"]);
  expect(await done(page, 4)).toBe(true);
  expect((await current(page)).v.qs.map(o => o.parent), "保存された値は残る").toEqual(["", "Q1", "", "Q1", "Q3"]);
  await page.keyboard.type("書き直した問い");
  await expect(q1).toBeFocused();
  await expect(q1).toHaveValue("書き直した問い");
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q4", "従"], ["Q3", "主"], ["Q5", "従"]]);
  // ほかの欄の文は、行が動いても、それぞれの問題のまま
  for (const [i, t] of [[1, "問いの二"], [2, "問いの三"], [3, "問いの四"], [4, "問いの五"]]) await expect(qField(page, i)).toHaveValue(t);
});

test("規則8: カードは、主な問い、その従属する問いの順に並ぶ。従属する問いのカードには従属先が、型を選んだ問題のカードには型が出る。書く欄と「済み」は変わらない", async ({ page }) => {
  const book = base();
  book.v.qs[3].type = "原因"; book.v.qs[2].type = "目的";
  await setup(page, book);
  const cards = ruleItem(page, 8).locator(".card");
  await expect(cards.locator(".id")).toHaveText(["Q1", "Q2", "Q4", "Q3", "Q5"]);
  await expect(cards.locator(".ro")).toHaveText(["問いの一", "問いの二", "問いの四", "問いの三", "問いの五"]);
  const tag = i => cards.nth(i).locator(".qof");
  await expect(tag(0)).toHaveCount(0);
  await expect(tag(1)).toHaveText("Q1 に従属");
  await expect(tag(2)).toHaveText("Q1 に従属・型: 原因");
  await expect(tag(3)).toHaveText("型: 目的");
  await expect(tag(4)).toHaveText("Q3 に従属");
  await expect(cards.nth(2)).toContainText("答えている命題: P2");
  // 書く欄（解決、著者の自覚、理由）は、これまでどおり、問題の番号で保存される
  expect(await done(page, 8)).toBe(false);
  for (const id of ["Q1", "Q2", "Q3", "Q4"]) await ruleItem(page, 8).locator(`button[data-p="solved.${id}.s"][data-val="解決した"]`).click();
  await ruleItem(page, 8).locator('button[data-p="solved.Q5.s"][data-val="一部"]').click();
  expect(await done(page, 8), "一部は、著者の自覚を選ぶまで済みでない").toBe(false);
  await ruleItem(page, 8).locator('button[data-p="solved.Q5.aware"][data-val="分からない"]').click();
  await ruleItem(page, 8).getByRole("textbox", { name: "Q4 をそう見た理由", exact: true }).fill("テスト用の理由");
  expect(await done(page, 8)).toBe(true);
  expect((await current(page)).v.solved).toEqual({ Q1: { s: "解決した" }, Q2: { s: "解決した" }, Q3: { s: "解決した" }, Q4: { s: "解決した", why: "テスト用の理由" }, Q5: { s: "一部", aware: "分からない" } });
  // 規則4で型を選ぶと、カードに出る。文を打つと、その場でカードの文が変わる
  await qType(page, 0).selectOption("種類");
  await expect(tag(0)).toHaveText("型: 種類");
  await qField(page, 4).click(); await page.keyboard.press("End"); await page.keyboard.type("の続き");
  await expect(cards.locator(".ro")).toHaveText(["問いの一", "問いの二", "問いの四", "問いの三", "問いの五の続き"]);
  await expect(qField(page, 4)).toBeFocused();
  // 従属する問いを足して文を打つと、その場で、主な問いのカードの次に出る
  await addSub(page, "Q3").click();
  await page.keyboard.type("足した問い");
  await expect(cards.locator(".id")).toHaveText(["Q1", "Q2", "Q4", "Q3", "Q5", "Q6"]);
  await expect(tag(5)).toHaveText("Q3 に従属");
});

test("Markdown: 従属する問いは、主な問いの下に字下げして出る。「（主な問い）」「（Q1 に従属）」は残り、選んだ型が行に出る。文が空の問題は出ない", async ({ page }) => {
  const book = base();
  book.v.qs[3].type = "原因"; book.v.qs[2].type = "目的";
  book.v.qs.push({ id: "Q6", t: "", parent: "Q1", type: "条件" });
  await setup(page, book);
  expect(await mdRule(page, 4)).toEqual(["  - Q1 問いの一（主な問い）", "    - Q2 問いの二（Q1 に従属）", "    - Q4 問いの四（Q1 に従属）〔型: 原因〕", "  - Q3 問いの三（主な問い）〔型: 目的〕", "    - Q5 問いの五（Q3 に従属）"]);
  // 規則8の行は、これまでどおり（保存の並びの順、字下げなし）
  expect((await mdRule(page, 8)).map(l => l.replace(/ → .*/, ""))).toEqual(["  - Q1 問いの一", "  - Q2 問いの二", "  - Q3 問いの三", "  - Q4 問いの四", "  - Q5 問いの五"]);
});

test("Markdown と再読み込みの往復: 型と並びを変えたあと、Markdown を読み込み直しても、再読み込みしても、状態と表示が同じ", async ({ page }) => {
  await setup(page);
  await qType(page, 0).selectOption("原因");
  await qType(page, 4).selectOption("関係");
  await btn(page, "up", 3).click();
  await addSub(page, "Q3").click();
  await page.keyboard.type("足した問い");
  const before = await current(page), shown = await rows(page), md = await markdown(page);
  expect(before.v.qs).toEqual([{ id: "Q1", t: "問いの一", parent: "", type: "原因" }, { id: "Q4", t: "問いの四", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" },
    { id: "Q5", t: "問いの五", parent: "Q3", type: "関係" }, { id: "Q6", t: "足した問い", parent: "Q3" }]);
  expect(shown).toEqual([["Q1", "主"], ["Q4", "従"], ["Q2", "従"], ["Q3", "主"], ["Q5", "従"], ["Q6", "従"]]);
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect(await current(page)).toEqual(before);
  expect(await rows(page)).toEqual(shown);
  await expect(qType(page, 4)).toHaveValue("関係");
  // 型を選び直したり、選んで外したりしても、状態は元と同じ（外した問題に、type のキーは残らない）
  const seen = watch(page, () => false);
  await qType(page, 0).selectOption("");
  await qType(page, 0).selectOption("原因");
  await qType(page, 2).selectOption("目的");
  await qType(page, 2).selectOption("");
  expect(await current(page)).toEqual(before);
  expect("type" in (await current(page)).v.qs[2]).toBe(false);
  // 同じ中身の Markdown を読み込んでも、確認は出ない。読み込みが画面に反映される（描き直される）まで待ってから見る
  // （確認が出ると、watch がやめるので、読み込まれず、描き直されない。そのときは、この待ちが時間切れで落ちる）
  await untilRedrawn(page, async () => {
    await page.click("#btnImport");
    await page.locator("#formImport textarea").fill(md);
    await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
    await page.locator("#dlgImport").waitFor({ state: "hidden" });
  });
  expect(seen, "確認は出ない").toEqual([]);
  expect(await current(page)).toEqual(before);
  expect(await markdown(page)).toBe(md);
});

test("見張り: 前に保存された空の型（\"type\": \"\"）は、未選択として、そのまま読める。キーのない同じ本を読み込んでも、確認は出ない", async ({ page }) => {
  const book = base();
  book.v.qs[1].type = ""; book.v.qs[2].type = "原因";
  await setup(page, book);
  expect(await current(page), "読み込んだ値は、書き直さない").toEqual(book);
  await expect(qType(page, 1)).toHaveValue("");
  await expect(qField(page, 1)).toHaveAttribute("placeholder", PH);
  await expect(ruleItem(page, 8).locator(".card").nth(1).locator(".qof")).toHaveText("Q1 に従属");
  expect((await mdRule(page, 4))[1]).toBe("    - Q2 問いの二（Q1 に従属）");
  const seen = watch(page, () => false);
  const same = base(); same.v.qs[2].type = "原因";
  await importState(page, same);
  expect(seen, "確認は出ない").toEqual([]);
  expect(await current(page)).toEqual(same);
});

test("本の種類や問いの型が、想定しない値（constructor、__proto__、toString、数、配列）の state を読み込んでも、エラーが出ず、規則4の欄が出る。再読み込みのあとも出る", async ({ page }) => {
  await openTool(page);
  const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => { dialogs.push(d.type() + ": " + d.message()); d.accept(); });
  const odd = ["constructor", "__proto__", "toString", "hasOwnProperty", 5, ["理論書"], { a: 1 }];
  for (const [n, x] of odd.entries()) {
    const book = base({ kind: x }); book.id = "t-questions-odd-" + n; book.meta.title = "想定しない値 " + n;
    book.v.qs.forEach(o => { o.type = x; });
    const check = async when => {
      await expect(page.locator("#bookSel option:checked"), when).toHaveText(book.meta.title);
      expect(await rows(page), when + ": 規則4の行").toEqual([["Q1", "主"], ["Q2", "従"], ["Q4", "従"], ["Q3", "主"], ["Q5", "従"]]);
      // 本の種類が、理論書でも実践書でもないので、型の一覧は両方。保存されている値は、文字として末尾に出て、選ばれたまま
      expect(await qType(page, 0).locator("option").evaluateAll(os => os.map(o => o.value)), when + ": 型の一覧").toEqual([""].concat(BOTH, [String(x)]));
      await expect(qType(page, 0)).toHaveValue(String(x));
      await expect(qField(page, 0), when + ": 書き出しの例は、未選択のときと同じ").toHaveAttribute("placeholder", PH);
      await expect(ruleItem(page, 8).locator(".card")).toHaveCount(5);
      expect(await current(page), when + ": 読み込んだ値は変えない").toEqual(book);
    };
    await importState(page, book);
    await check("読み込んだあと（" + JSON.stringify(x) + "）");
    await ruleItem(page, 4).locator('button[data-a="help"]').click();
    const help = ruleItem(page, 4).locator(".help").first();
    await expect(help).toContainText("理論書の問いの型: " + THEORY.join("、") + "（「〜はあるか」「〜はどんな種類のものか」「なぜ〜か」）。実践書の問いの型: " + PRACTICE.join("、") + "（");
    await expect(help).not.toContainText("function");
    expect(typeof (await markdown(page))).toBe("string");
    await page.reload();
    await page.locator("#app section").first().waitFor();
    await check("再読み込みのあと（" + JSON.stringify(x) + "）");
  }
  expect(errors, "ページのエラー").toEqual([]);
  expect(dialogs, "「読み込めなかった」などのダイアログ").toEqual([]);
});

test("「×」: 従属する問いのある主な問いを消すとき、確認の文に、従属する問いが主な問いになることが出る。消すと、従属する問いは残り、主な問いになる", async ({ page }) => {
  await setup(page, base({ solved: { Q1: { s: "解決した", aware: "", why: "" } } }));
  let ok = false; const seen = watch(page, () => ok);
  await btn(page, "del", 0).click();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toBe("Q1「問いの一」を消す。規則8に書いた、この問題の解決と理由も消える。従属する問い（Q2、Q4）は消えずに残り、主な問いになる。");
  expect(await ids(page), "やめたら、何も変わらない").toEqual(["Q1", "Q2", "Q3", "Q4", "Q5"]);
  // 従属する問いを消すとき、従属する問いのない主な問いを消すときは、これまでの文のまま
  await btn(page, "del", 1).click();
  await expect.poll(() => seen.length).toBe(2);
  expect(seen[1]).toBe("Q2「問いの二」を消す。規則8に書いた、この問題の解決と理由も消える。");
  ok = true;
  await btn(page, "del", 0).click();
  await expect.poll(() => ids(page)).toEqual(["Q2", "Q3", "Q4", "Q5"]);
  expect(await rows(page)).toEqual([["Q2", "主"], ["Q3", "主"], ["Q5", "従"], ["Q4", "主"]]);
  const b = await current(page);
  expect(b.v.qs.map(o => o.parent), "従属先の値は変えない").toEqual(["Q1", "", "Q1", "Q3"]);
  expect(b.v.props.map(o => o.q), "消した問題への「答える問題」は外れる（これまでどおり）").toEqual(["", "Q4"]);
  expect(b.v.solved).toEqual({});
  expect(await mdRule(page, 4)).toEqual(["  - Q2 問いの二（主な問い）", "  - Q3 問いの三（主な問い）", "    - Q5 問いの五（Q3 に従属）", "  - Q4 問いの四（主な問い）"]);
});

test("「×」: 足しただけの従属する問い（文も型もない）は、確認なしで消える。型だけを選んだ行は、確認が出る", async ({ page }) => {
  await setup(page);
  const seen = watch(page, () => false);
  await addSub(page, "Q1").click();
  expect((await current(page)).v.qs[5]).toEqual({ id: "Q6", t: "", parent: "Q1" });
  await btn(page, "del", 5).click();
  await expect.poll(() => ids(page)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5"]);
  expect(seen).toEqual([]);
  await addSub(page, "Q1").click();
  await qType(page, 5).selectOption("原因");
  await btn(page, "del", 5).click();
  await expect.poll(() => seen.length).toBe(1);
  expect(await ids(page)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q7"]);
});

test("キーボードで「×」を押すと、表示の並びで次の行（なければ前の行）の「×」にフォーカスが移る。続けて押しても、離れた行は消えない", async ({ page }) => {
  await setup(page);
  page.on("dialog", d => d.accept());
  // Q2（保存の並びの2番目）を消す。表示で次の行は Q4（保存の並びでは、Q3 の次）
  await btn(page, "del", 1).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => ids(page)).toEqual(["Q1", "Q3", "Q4", "Q5"]);
  expect(await active(page)).toMatchObject({ tag: "BUTTON", a: "del", p: "qs", i: "2" });
  // 続けて押すと、Q4 が消える。表示で次の行は Q3
  await page.keyboard.press("Enter");
  await expect.poll(() => ids(page)).toEqual(["Q1", "Q3", "Q5"]);
  expect(await active(page)).toMatchObject({ tag: "BUTTON", a: "del", p: "qs", i: "1" });
  // 表示で最後の行（Q5）を消すと、前の行（Q3）の「×」
  await btn(page, "del", 2).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => ids(page)).toEqual(["Q1", "Q3"]);
  expect(await active(page)).toMatchObject({ tag: "BUTTON", a: "del", p: "qs", i: "1" });
  // マウスで押したあとは、どの「×」にも置かない
  await btn(page, "del", 0).click();
  await expect.poll(() => ids(page)).toEqual(["Q3"]);
  expect((await active(page)).a).toBeUndefined();
});

test("Enter: 問いの文で押すと、同じ並びの次の行の文へ進む。並びの最後では、同じ並びの行を足す（主な問いの並びなら主な問い、従属する問いの並びなら同じ主な問いの従属する問い）", async ({ page }) => {
  await setup(page);
  // 主な問い Q1 → 次の主な問い Q3（保存の並びで隣の Q2 でも、表示で隣の Q2 でもない）
  await qField(page, 0).focus();
  await page.keyboard.press("Enter");
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.2.t" });
  // 最後の主な問い Q3 → 主な問いを足す
  await page.keyboard.press("Enter");
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.5.t" });
  expect((await current(page)).v.qs[5]).toEqual({ id: "Q6", t: "", parent: "" });
  // 従属する問い Q2 → 同じ主な問いの次の従属する問い Q4（型のプルダウンにも、保存の並びで隣の Q3 にも進まない）
  await qField(page, 1).focus();
  await page.keyboard.press("Enter");
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.3.t" });
  // Q1 の最後の従属する問い Q4 → Q1 に従属する問いを足す
  await page.keyboard.press("Enter");
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.6.t" });
  expect((await current(page)).v.qs[6]).toEqual({ id: "Q7", t: "", parent: "Q1" });
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q4", "従"], ["Q7", "従"], ["Q3", "主"], ["Q5", "従"], ["Q6", "主"]]);
  // Q3 のただ1つの従属する問い Q5 → Q3 に従属する問いを足す
  await qField(page, 4).focus();
  await page.keyboard.press("Enter");
  expect(await active(page)).toMatchObject({ tag: "TEXTAREA", p: "qs.7.t" });
  expect((await current(page)).v.qs[7]).toEqual({ id: "Q8", t: "", parent: "Q3" });
  // 文に改行は入らない
  expect((await current(page)).v.qs.map(o => o.t)).toEqual(["問いの一", "問いの二", "問いの三", "問いの四", "問いの五", "", "", ""]);
});

test("名前: 文の欄は「Q1 の問い」、型のプルダウンは「Q1 の問いの型」。規則4の中で、欄の名前は重ならない", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 4);
  for (const [i, id] of [[0, "Q1"], [1, "Q2"], [2, "Q3"], [3, "Q4"], [4, "Q5"]]) {
    await expect(qField(page, i)).toHaveAttribute("aria-label", id + " の問い");
    await expect(qType(page, i)).toHaveAttribute("aria-label", id + " の問いの型");
    await expect(item.getByRole("textbox", { name: id + " の問い", exact: true })).toHaveCount(1);
    await expect(item.getByRole("combobox", { name: id + " の問いの型", exact: true })).toHaveCount(1);
  }
  const names = await item.locator("input, textarea, select").evaluateAll(els => els.map(el => el.getAttribute("aria-label")));
  expect(names.filter(n => !n), "名前のない欄").toEqual([]);
  expect(new Set(names).size, "名前が重ならない").toBe(names.length);
  for (const name of ["上へ", "下へ"]) await expect(item.getByRole("button", { name, exact: true })).toHaveCount(3);
  await expect(item.getByRole("button", { name: "消す", exact: true })).toHaveCount(5);
});

test("読み込んだ番号と型は、文字として出る（行を足すボタンのラベル、確認の文、規則8のカード、Markdown）", async ({ page }) => {
  const Q1 = "Q1\"><b class=\"e2e-x\">&amp;", Q2 = "Q2<i>'";
  const book = base({ qs: [{ id: Q1, t: "問いの一", parent: "", type: "<u>型</u>" }, { id: Q2, t: "問いの二", parent: Q1 }], props: [] });
  await setup(page, book);
  const item = ruleItem(page, 4);
  await expect(item.locator(".e2e-x, i, u")).toHaveCount(0);
  await expect(ruleItem(page, 8).locator(".e2e-x, i, u")).toHaveCount(0);
  await expect(item.locator('button[data-a="push"]').first()).toHaveText("＋ " + Q1 + " に従属する問い");
  await expect(item.locator('button[data-a="push"]').first()).toHaveAttribute("data-parent", Q1);
  await expect(item.locator(".qrow .rule")).toHaveText([Q1, Q2]);
  await expect(qType(page, 0)).toHaveValue("<u>型</u>");
  await expect(ruleItem(page, 8).locator(".card .qof")).toHaveText(["型: <u>型</u>", Q1 + " に従属"]);
  expect(await mdRule(page, 4)).toEqual(["  - " + Q1 + " 問いの一（主な問い）〔型: <u>型</u>〕", "    - " + Q2 + " 問いの二（" + Q1 + " に従属）"]);
  const seen = watch(page, () => false);
  await btn(page, "del", 0).click();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toBe(Q1 + "「問いの一」を消す。規則8に書いた、この問題の解決と理由も消える。従属する問い（" + Q2 + "）は消えずに残り、主な問いになる。");
  expect(await current(page)).toEqual(book);
  // 足した行の従属先は、読み込んだ番号そのまま
  await item.locator('button[data-a="push"]').first().click();
  expect((await current(page)).v.qs[2].parent).toBe(Q1);
  expect(await rows(page)).toEqual([[Q1, "主"], [Q2, "従"], [(await current(page)).v.qs[2].id, "従"]]);
});

test("「？」の説明文: 型の一覧が、プルダウンと同じ語にそろっている。章の中の規則の引用は、そのまま", async ({ page }) => {
  await setup(page, base({ kind: "まだ分からない" }));
  const item = ruleItem(page, 4);
  await item.locator('button[data-a="help"]').click();
  const help = item.locator(".help").first();
  await expect(help).toContainText("章の中の規則: 著者の問題としている点は何であるかを知る。");
  await expect(help).toContainText("理論書の問いの型: " + THEORY.join("、") + "（");
  await expect(help).toContainText("実践書の問いの型: " + PRACTICE.join("、") + "（");
  await expect(help).toContainText("主な問い");
  await expect(help).toContainText("従属する問い");
  await expect(help).not.toContainText("プルダウン");
  await ruleItem(page, 1).locator('button[data-p="kind"][data-val="理論書"]').click();
  await expect(help).toContainText("理論書の問いの型: " + THEORY.join("、") + "（");
  await expect(help).not.toContainText("実践書の問いの型");
});

test("2つのタブ: 片方のタブで足した従属する問いと、選んだ型は、もう一方のタブの、同じ主な問いの下に出る。入力中の欄は、そのまま", async ({ page, context }) => {
  await setup(page);
  const pageB = await context.newPage();
  await openTool(pageB);
  await expect(pageB.locator("#bookSel option:checked")).toHaveText("問いのテスト");
  const synced = async () => { const read = p => p.evaluate(() => localStorage.getItem("dokusho-memo.v2"));
    await expect.poll(async () => (await read(page)) === (await read(pageB))).toBe(true); };
  await synced();
  // B は、Q5（保存の並びの5番目）の文を入力中
  await qField(pageB, 4).click(); await pageB.keyboard.press("End"); await pageB.keyboard.type("B");
  await synced();
  await addSub(page, "Q1").click();
  await page.keyboard.type("A で足した問い");
  await qType(page, 1).selectOption("結果");
  await btn(page, "up", 3).click();
  await synced();
  await expect.poll(() => rows(pageB)).toEqual([["Q1", "主"], ["Q4", "従"], ["Q2", "従"], ["Q6", "従"], ["Q3", "主"], ["Q5", "従"]]);
  await expect(qField(pageB, 4)).toBeFocused();
  await expect(qField(pageB, 4)).toHaveValue("問いの五B");
  await pageB.keyboard.type("C");
  await synced();
  const want = [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q4", t: "問いの四", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1", type: "結果" },
    { id: "Q5", t: "問いの五BC", parent: "Q3" }, { id: "Q6", t: "A で足した問い", parent: "Q1" }];
  expect((await current(pageB)).v.qs).toEqual(want);
  await expect.poll(async () => (await current(page)).v.qs).toEqual(want);
  await expect(qType(pageB, 3)).toHaveValue("結果");
  await expect(qField(page, 4)).toHaveValue("問いの五BC");
});

test("サンプルの本: 3つの問題に型が入っていて、規則4と規則8に出る。件数と、従属の関係は変わらない", async ({ page }) => {
  await openTool(page);
  const sample = loadWindowJs("sample.js").SAMPLES[0];
  expect(sample.v.qs.map(o => [o.id, o.parent])).toEqual([["Q1", ""], ["Q2", "Q1"], ["Q3", ""]]);
  for (const o of sample.v.qs) expect(PRACTICE, o.id + " の型は、実践書の型").toContain(o.type);
  expect(await rows(page)).toEqual([["Q1", "主"], ["Q2", "従"], ["Q3", "主"]]);
  for (const [i, o] of sample.v.qs.entries()) await expect(qType(page, i)).toHaveValue(o.type);
  await expect(ruleItem(page, 8).locator(".card .qof")).toHaveText(["型: " + sample.v.qs[0].type, "Q1 に従属・型: " + sample.v.qs[1].type, "型: " + sample.v.qs[2].type]);
  expect(await done(page, 4)).toBe(true);
  expect(await done(page, 8)).toBe(true);
});

test.describe("390px の幅", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("規則4と規則8が、横にはみ出さない。文の欄が狭くなりすぎず、型のプルダウンと「↑」「↓」「×」が重ならず、押せる大きさである", async ({ page }) => {
    const book = base({ kind: "" });
    book.v.qs[0].t = "長い問いの文。".repeat(12); book.v.qs[3].t = "長い問いの文。".repeat(12);
    book.v.qs[3].type = "どちらがより良いか"; book.v.qs[4].type = "目的";
    await setup(page, book);
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    const item = ruleItem(page, 4), box = await item.boundingBox();
    for (let i = 0; i < 5; i++) {
      const row = qField(page, i).locator("xpath=.."), t = await qField(page, i).boundingBox(), s = await qType(page, i).boundingBox();
      expect(t.width, "文の欄の幅 " + i).toBeGreaterThanOrEqual(220);
      const parts = [t, s];
      for (const b of await row.locator("button").all()) { const r = await b.boundingBox(); parts.push(r);
        expect(Math.min(r.width, r.height), "ボタンの大きさ " + i).toBeGreaterThanOrEqual(32); }
      expect(s.height, "プルダウンの高さ " + i).toBeGreaterThanOrEqual(30);
      for (const r of parts) { expect(r.x).toBeGreaterThanOrEqual(box.x - 0.5); expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 0.5); }
      // 部品どうしが重ならない
      for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
        const p = parts[a], q = parts[b], apart = p.x + p.width <= q.x + 0.5 || q.x + q.width <= p.x + 0.5 || p.y + p.height <= q.y + 0.5 || q.y + q.height <= p.y + 0.5;
        expect(apart, "行 " + i + " の部品 " + a + " と " + b + " が重ならない").toBe(true);
      }
    }
    // 長い文は、折り返して全部見える
    expect(await qField(page, 3).evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    // 行を足しても、型を選んでも、はみ出さない
    await addSub(page, "Q3").click();
    await qType(page, 5).selectOption("どちらがより良いか");
    await addMain(page).click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await ruleItem(page, 8).evaluate(el => el.scrollIntoView());
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // 主な問い Q1 の文を打って空にすると、従属する問いが主な問いの並びへ動く。動いた行の長い文の欄も、高さが内容に合ったまま（欠けない）
    await qField(page, 0).click(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("Backspace");
    expect((await rows(page)).map(r => r[1]).slice(0, 3)).toEqual(["主", "主", "主"]);
    await expect(qField(page, 3)).toHaveValue(book.v.qs[3].t);
    expect(await qField(page, 3).evaluate(el => [el.scrollHeight - el.clientHeight <= 1, el.clientHeight > 60])).toEqual([true, true]);
    expect(await qField(page, 0).evaluate(el => el.clientHeight)).toBeLessThan(60);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
