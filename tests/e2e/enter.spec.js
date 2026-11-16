// 仕様: 文字の欄の Enter は、同じ行の次の欄へ進み、一覧の最後の行の最後の欄でだけ、同じ並びの行を足す（issue #65）。
// 行の並びに属さない欄では何も足さない。押したまま（キーリピート）と、かな漢字変換を確定する Enter では、何も起きない。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "受け持つ所 " + id, subs: ["区分A", "区分B"] });
  const prop = (id, sup, judge) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q: "Q1", grounds: [{ t: "根拠A", kind: "" }, { t: "根拠B", kind: "" }], arg: "論証", judge, why: "理由", self: "自分の側", k12: "指摘12", k13: "", k14: "", k15: "指摘15" });
  const b = { id: "t-enter", meta: { title: "Enter のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 2, Q: 2, P: 3 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", subject: "テスト", unity: { what: "学問", claim: "学べ" }, unityA: { what: "学問", claim: "学べ" },
      terms: ["用語A", "用語B"].map(w => ({ w, m: "意味", p: "1", g: false })),
      points: ["要点A", "要点B"], pointsHow: ["根拠の要点A", "根拠の要点B"], unclear: ["分からない語A", "分からない語B"],
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "" }],
      solved: { Q1: { s: "一部", aware: "", why: "そう見た理由" } }, newq: "新しい問題",
      props: [prop("P1", "main", "反対"), prop("P2", "P1", "判断保留"), prop("P3", "P2", "賛成")], restate: { s: "つまり", ex: "たとえば" } } };
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
/* いまフォーカスのある部品の、data-p と、それがある section */
const at = page => page.evaluate(() => { const el = document.activeElement, sec = el.closest("section"); return { tag: el.tagName, p: el.dataset.p || "", sec: sec ? sec.id : "" }; });
/* root の中の欄 p にフォーカスを置く */
async function put(root, p) {
  const loc = root.locator('input[data-p="' + p + '"]');
  await loc.focus();
  await expect(loc).toBeFocused();
}
/* Enter を1回押す。フォーカスが、section sec の欄 p に移っている */
async function enterTo(page, p, sec) {
  await page.keyboard.press("Enter");
  expect(await at(page), "Enter のあとのフォーカス").toEqual({ tag: "INPUT", p, sec });
}
/* キーを押したままにする（最初の1回のあと、キーリピートが n 回起きる） */
async function hold(page, key, n) {
  for (let i = 0; i <= n; i++) await page.keyboard.down(key);
  await page.keyboard.up(key);
}
/* 行の数 */
const counts = b => ({ terms: b.v.terms.length, points: b.v.points.length, pointsHow: b.v.pointsHow.length, unclear: b.v.unclear.length, parts: b.v.parts.length, subs: b.v.parts.map(o => o.subs.length),
  qs: b.v.qs.length, props: b.v.props.length, grounds: b.v.props.map(o => o.grounds.length) });
const START = { terms: 2, points: 2, pointsHow: 2, unclear: 2, parts: 2, subs: [2, 2], qs: 2, props: 3, grounds: [2, 2, 2] };
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("用語: Enter で 言葉 → 意味 → ページ と進み、行は足されない。最後の行のページで押すと、用語が1行足される", async ({ page }) => {
  await setup(page);
  const before = await current(page), sec = page.locator("#sec-shitayomi");
  await put(sec, "terms.0.w");
  await enterTo(page, "terms.0.m", "sec-shitayomi");
  await enterTo(page, "terms.0.p", "sec-shitayomi");
  await enterTo(page, "terms.1.w", "sec-shitayomi"); // 最後の行でないので、次の行の最初の欄へ
  await enterTo(page, "terms.1.m", "sec-shitayomi");
  await enterTo(page, "terms.1.p", "sec-shitayomi");
  expect(await current(page), "ここまで、何も足されず、何も変わらない").toEqual(before);
  await enterTo(page, "terms.2.w", "sec-shitayomi"); // 最後の行の最後の欄
  const b = await current(page);
  expect(counts(b)).toEqual(Object.assign({}, START, { terms: 3 }));
  expect(b.v.terms[2]).toEqual({ w: "", m: "", p: "", g: false });
  // 規則5の側（同じ用語が出る）で押したら、規則5の側で進む
  await put(ruleItem(page, 5), "terms.2.w");
  await enterTo(page, "terms.2.m", "sec-a2");
  await enterTo(page, "terms.2.p", "sec-a2");
  await enterTo(page, "terms.3.w", "sec-a2");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { terms: 4 }));
});

test("命題: Enter で 文 → 重要な文の場所 と進み、最後の命題の場所で押すと、命題が1つ足される", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  await put(ruleItem(page, 6), "props.0.t");
  await enterTo(page, "props.0.loc", "sec-a2");
  await enterTo(page, "props.1.t", "sec-a2");
  await enterTo(page, "props.1.loc", "sec-a2");
  await enterTo(page, "props.2.t", "sec-a2");
  await enterTo(page, "props.2.loc", "sec-a2");
  expect(await current(page)).toEqual(before);
  await enterTo(page, "props.3.t", "sec-a2");
  const b = await current(page);
  expect(counts(b)).toEqual(Object.assign({}, START, { props: 4, grounds: [2, 2, 2, 0] }));
  expect(b.v.props[3].id).toBe("P4");
});

test("部分: Enter で 名前 → 概要 → 受け持つ所 と進み、最後の部分の受け持つ所で押すと、部分が1つ足される。区分は足されない", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  await put(ruleItem(page, 3), "parts.0.t");
  await enterTo(page, "parts.0.sum", "sec-a1");
  await enterTo(page, "parts.0.rel", "sec-a1");
  await enterTo(page, "parts.1.t", "sec-a1");
  await enterTo(page, "parts.1.sum", "sec-a1");
  await enterTo(page, "parts.1.rel", "sec-a1");
  expect(await current(page)).toEqual(before);
  await enterTo(page, "parts.2.t", "sec-a1");
  const b = await current(page);
  expect(counts(b)).toEqual(Object.assign({}, START, { parts: 3, subs: [2, 2, 0] }));
  expect(b.v.parts[2].id).toBe("S3");
});

test("部分の中の区分: Enter で次の区分へ進み、最後の区分で押すと、その部分に区分が足される（部分は足されない）", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  await put(ruleItem(page, 3), "parts.0.subs.0");
  await enterTo(page, "parts.0.subs.1", "sec-a1");
  expect(await current(page)).toEqual(before);
  await enterTo(page, "parts.0.subs.2", "sec-a1");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { subs: [3, 2] }));
  await put(ruleItem(page, 3), "parts.1.subs.1");
  await enterTo(page, "parts.1.subs.2", "sec-a1");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { subs: [3, 3] }));
});

test("問題と根拠: Enter で次の行へ進み、最後の行で押すと、同じ並び（問題、その命題の根拠）に1行足される", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  await put(ruleItem(page, 4), "qs.0.t");
  await enterTo(page, "qs.1.t", "sec-a1");
  expect(await current(page)).toEqual(before);
  await enterTo(page, "qs.2.t", "sec-a1");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { qs: 3 }));
  await put(ruleItem(page, 7), "props.1.grounds.0.t");
  await enterTo(page, "props.1.grounds.1.t", "sec-a2");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { qs: 3 }));
  await enterTo(page, "props.1.grounds.2.t", "sec-a2");
  expect(counts(await current(page)), "P2 にだけ根拠が足される").toEqual(Object.assign({}, START, { qs: 3, grounds: [2, 3, 2] }));
});

test("表面読みの2つの一覧と、分からなかった所: Enter で次の行へ進み、最後の行で押すと、その一覧に1行足される", async ({ page }) => {
  await setup(page);
  const sec = page.locator("#sec-hyomen"), before = await current(page);
  for (const k of ["points", "pointsHow", "unclear"]) {
    await put(sec, k + ".0");
    await enterTo(page, k + ".1", "sec-hyomen");
  }
  expect(await current(page)).toEqual(before);
  await put(sec, "points.1");
  await enterTo(page, "points.2", "sec-hyomen");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { points: 3 }));
  await put(sec, "pointsHow.1");
  await enterTo(page, "pointsHow.2", "sec-hyomen");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { points: 3, pointsHow: 3 }));
  await put(sec, "unclear.1");
  await enterTo(page, "unclear.2", "sec-hyomen");
  expect(counts(await current(page))).toEqual(Object.assign({}, START, { points: 3, pointsHow: 3, unclear: 3 }));
});

test("行の並びに属さない欄では、Enter で何も足されず、フォーカスも動かない", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  const fields = [["#sec-shitayomi", "unity.what"], ["#sec-shitayomi", "unity.claim"], ["#sec-a1", "subject"], ["#sec-a1", "unityA.what"], ["#sec-a1", "unityA.claim"],
    ["#sec-a2", "props.0.arg"], ["#sec-a2", "props.2.arg"], ["#sec-a2", "solved.Q1.why"], ["#sec-a2", "newq"], ["#sec-a3", "restate.s"], ["#sec-a3", "restate.ex"],
    ["#sec-a3", "props.0.self"], ["#sec-a3", "props.1.why"], ["#sec-a4", "props.0.k12"], ["#sec-a4", "props.0.k13"], ["#sec-a4", "props.0.k14"], ["#sec-a4", "props.1.k15"]];
  for (const [sec, p] of fields) {
    await put(page.locator(sec), p);
    await page.locator(sec + ' input[data-p="' + p + '"]').evaluate(el => { el.__same = true; });
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement.__same === true), p + " で Enter: フォーカスが同じ欄に残る").toBe(true);
    expect(await current(page), p + " で Enter: 何も足されず、何も変わらない").toEqual(before);
  }
});

test("Enter を押したままにしても、足されるのは1行だけ。次の欄へ進むのも1回だけ", async ({ page }) => {
  await setup(page);
  // 最後の行の最後の欄: 1行だけ足される
  for (const [root, p, to, sec, want] of [
    [page.locator("#sec-hyomen"), "points.1", "points.2", "sec-hyomen", { points: 3 }],
    [ruleItem(page, 4), "qs.1.t", "qs.2.t", "sec-a1", { points: 3, qs: 3 }],
    [page.locator("#sec-shitayomi"), "terms.1.p", "terms.2.w", "sec-shitayomi", { points: 3, qs: 3, terms: 3 }],
    [ruleItem(page, 7), "props.0.grounds.1.t", "props.0.grounds.2.t", "sec-a2", { points: 3, qs: 3, terms: 3, grounds: [3, 2, 2] }],
    [ruleItem(page, 3), "parts.1.subs.1", "parts.1.subs.2", "sec-a1", { points: 3, qs: 3, terms: 3, grounds: [3, 2, 2], subs: [2, 3] }],
  ]) {
    await put(root, p);
    await hold(page, "Enter", 8);
    expect(await at(page), p + " で押したまま").toEqual({ tag: "INPUT", p: to, sec });
    expect(counts(await current(page)), p + " で押したまま").toEqual(Object.assign({}, START, want));
  }
  // 行の途中の欄: 次の欄へ1回だけ進む（その先へは進まず、行も足されない）
  const before = await current(page);
  await put(ruleItem(page, 6), "props.0.t");
  await hold(page, "Enter", 8);
  expect(await at(page)).toEqual({ tag: "INPUT", p: "props.0.loc", sec: "sec-a2" });
  expect(await current(page)).toEqual(before);
  // 離してから押し直すと、また1回働く
  await page.keyboard.press("Enter");
  expect(await at(page)).toEqual({ tag: "INPUT", p: "props.1.t", sec: "sec-a2" });
});

test("かな漢字変換を確定する Enter では、何も起きない（isComposing のときも、keyCode が 229 のときも）", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  /* 変換を確定する Enter の keydown を、欄に送る。Safari は、確定の Enter で isComposing が false、keyCode が 229 になることがある */
  const send = (p, init) => page.locator('#sec-hyomen input[data-p="' + p + '"], #sec-shitayomi input[data-p="' + p + '"]').first().evaluate((el, init) => {
    el.focus(); el.__same = true;
    const e = new KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, init));
    el.dispatchEvent(e);
    return { prevented: e.defaultPrevented, same: document.activeElement.__same === true && document.activeElement === el };
  }, init);
  for (const p of ["points.1", "terms.0.w", "terms.1.p"]) {
    for (const init of [{ isComposing: true }, { isComposing: true, keyCode: 229 }, { isComposing: false, keyCode: 229 }]) {
      expect(await send(p, init), p + " で " + JSON.stringify(init)).toEqual({ prevented: false, same: true });
      expect(await current(page), p + " で " + JSON.stringify(init) + ": 何も足されない").toEqual(before);
    }
  }
  // ブラウザの口から、変換の途中の状態を入れて確かめる: 変換の途中の Enter（確定）では行が足されず、確定した文字が入る
  const inp = page.locator('#sec-hyomen input[data-p="points.1"]');
  await inp.click();
  await inp.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "かくてい", selectionStart: 4, selectionEnd: 4 });
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Process", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send("Input.insertText", { text: "確定" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await expect(inp).toHaveValue("要点B確定");
  await expect(inp).toBeFocused();
  expect((await current(page)).v.points).toEqual(["要点A", "要点B確定"]);
  // 確定したあとの、ふつうの Enter は働く
  await page.keyboard.press("Enter");
  expect(await at(page)).toEqual({ tag: "INPUT", p: "points.2", sec: "sec-hyomen" });
});

test("複数行の欄（この本を読む目的、自由メモ）の Enter は、これまでどおり改行になる", async ({ page }) => {
  await setup(page);
  const before = counts(await current(page));
  for (const p of ["purpose", "memo"]) {
    const ta = page.locator('#app textarea[data-p="' + p + '"]');
    await ta.fill("1行目");
    await ta.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("2行目");
    await expect(ta).toHaveValue("1行目\n2行目");
    await expect(ta).toBeFocused();
    expect((await current(page)).v[p]).toBe("1行目\n2行目");
  }
  expect(counts(await current(page))).toEqual(before);
});

test("Enter で足した行に、そのまま続けて書ける。ボタンの上の Enter は、これまでどおりそのボタンを押す", async ({ page }) => {
  await setup(page);
  await put(page.locator("#sec-shitayomi"), "terms.1.p");
  await page.keyboard.press("Enter");
  await page.keyboard.type("yougoC");
  await page.keyboard.press("Enter");
  await page.keyboard.type("imiC");
  await page.keyboard.press("Enter");
  await page.keyboard.type("12");
  expect((await current(page)).v.terms[2]).toEqual({ w: "yougoC", m: "imiC", p: "12", g: false });
  await expect(ruleItem(page, 5).locator('input[data-p="terms.2.m"]'), "規則5の側の同じ用語にも出る").toHaveValue("imiC");
  // 「＋ 命題」のボタンの上で Enter: 1つ足される
  await ruleItem(page, 6).locator('button[data-a="push"][data-p="props"]').focus();
  await page.keyboard.press("Enter");
  expect(await at(page)).toEqual({ tag: "INPUT", p: "props.3.t", sec: "sec-a2" });
  expect((await current(page)).v.props.length).toBe(4);
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、Enter で次の欄へ進み、進んだ先の欄が固定の見出しに隠れず、横にはみ出さない", async ({ page }) => {
    await setup(page);
    const visible = () => page.evaluate(() => { const b = document.activeElement.getBoundingClientRect(), head = document.querySelector("header").getBoundingClientRect().bottom; return b.top >= head - 1 && b.bottom <= window.innerHeight + 1; }); // 端数（1px 未満）のずれは見ない
    await put(ruleItem(page, 3), "parts.0.t");
    for (const p of ["parts.0.sum", "parts.0.rel", "parts.1.t", "parts.1.sum", "parts.1.rel", "parts.2.t"]) {
      await enterTo(page, p, "sec-a1");
      expect(await visible(), p + " が見えている").toBe(true);
    }
    await put(page.locator("#sec-shitayomi"), "terms.1.w");
    for (const p of ["terms.1.m", "terms.1.p", "terms.2.w"]) {
      await enterTo(page, p, "sec-shitayomi");
      expect(await visible(), p + " が見えている").toBe(true);
    }
    expect(counts(await current(page))).toEqual(Object.assign({}, START, { parts: 3, subs: [2, 2, 0], terms: 3 }));
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
