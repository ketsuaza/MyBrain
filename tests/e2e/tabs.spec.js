// 仕様: 同じブラウザの2つのタブで開いていても、片方の入力がもう一方の入力を消さない（issue #60）。
// 同じコンテキストに2つのページ（タブ A とタブ B）を開いて確かめる。ほかのタブが保存した内容は、もう一方のタブに取り込まれる。
// 同じ欄を両方で書いたときは、あとから書いたほうが残る。入力中の欄（フォーカス、カーソル、かな漢字変換の途中）は壊さない。
const { test, expect } = require("@playwright/test");
const { openTool, importState, addManualBook, current } = require("./helpers");

const KEY = "dokusho-memo.v2";
function base(id, title, over) {
  const b = { id, meta: { title, author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 2, Q: 2, P: 3 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", unity: { what: "学問", claim: "学べ" }, terms: [{ w: "用語A", m: "意味A", p: "1", g: false }, { w: "用語B", m: "意味B", p: "2", g: false }],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }], points: ["要点A", "要点B"],
      props: [{ id: "P1", t: "テスト用の命題1", sup: "main", q: "", grounds: [] }, { id: "P2", t: "テスト用の命題2", sup: "", q: "", grounds: [] }, { id: "P3", t: "テスト用の命題3", sup: "", q: "", grounds: [] }], memo: "" } };
  Object.assign(b.v, over || {});
  return b;
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const storedBook = async (page, id) => (await stored(page)).books.find(b => b.id === id);
const f = (page, p) => page.locator('#sec-checkin [data-p="' + p + '"], #sec-shitayomi [data-p="' + p + '"], #sec-a2 [data-p="' + p + '"], #sec-checkout [data-p="' + p + '"]').first();
async function reload(page) { await page.reload(); await page.locator("#app section").first().waitFor(); }
/* タブ A で本 X（と、渡したほかの本）を読み込んでから、タブ B を開く。2つのタブは、どちらも本 X を開いている */
async function twoTabs(page, context, others) {
  await openTool(page);
  for (const b of others || []) await importState(page, b);
  await importState(page, base("t-tabs-x", "タブのテスト X"));
  const pageB = await context.newPage();
  await openTool(pageB);
  await expect(pageB.locator("#bookSel option:checked")).toHaveText("タブのテスト X");
  return pageB;
}
/* ほかのタブの保存が、このタブに届かない状態にする（届く前に入力した場合を確かめるため）。開く前に呼ぶ */
const deaf = page => page.addInitScript(() => window.addEventListener("storage", e => e.stopImmediatePropagation(), true));

test("issue の手順: A で「この本を読む目的」を、B で「自由メモ」を書く。A を再読み込みしても、両方残っている", async ({ page, context }) => {
  await openTool(page);
  const pageB = await context.newPage();
  await openTool(pageB);
  const id = (await current(page)).id;
  await f(page, "purpose").fill("A で書いた目的");
  await f(pageB, "memo").fill("B で書いたメモ");
  await reload(page);
  await expect(f(page, "purpose"), "A で書いた目的が残っている").toHaveValue("A で書いた目的");
  await expect(f(page, "memo")).toHaveValue("B で書いたメモ");
  expect((await storedBook(page, id)).v).toMatchObject({ purpose: "A で書いた目的", memo: "B で書いたメモ" });
  await reload(pageB);
  await expect(f(pageB, "purpose")).toHaveValue("A で書いた目的");
  await expect(f(pageB, "memo")).toHaveValue("B で書いたメモ");
});

test("別の欄: 同じ一覧の別の行（命題、用語、要点）に、交互に書いても、両方残る。再読み込みしなくても、もう一方のタブの画面に出る", async ({ page, context }) => {
  const pageB = await twoTabs(page, context);
  await f(page, "props.0.t").fill("A で書いた命題");
  await f(pageB, "props.1.t").fill("B で書いた命題");
  await f(page, "terms.0.m").fill("A で書いた意味");
  await f(pageB, "terms.1.m").fill("B で書いた意味");
  await f(pageB, "purpose").fill("B で書いた目的");
  await f(page, "memo").fill("A で書いたメモ");
  // 再読み込みしなくても、もう一方の画面に出ている（命題の文を使う、規則7の欄にも出る）
  await expect(f(page, "props.1.t")).toHaveValue("B で書いた命題");
  await expect(f(pageB, "props.0.t")).toHaveValue("A で書いた命題");
  await expect(f(page, "purpose")).toHaveValue("B で書いた目的");
  await expect(f(pageB, "memo")).toHaveValue("A で書いたメモ");
  await expect(pageB.locator("#sec-a2 .chain")).toContainText("A で書いた命題");
  for (const p of [page, pageB]) {
    await reload(p);
    const v = (await current(p)).v;
    expect(v.props.map(o => o.t)).toEqual(["A で書いた命題", "B で書いた命題", "テスト用の命題3"]);
    expect(v.terms.map(o => o.m)).toEqual(["A で書いた意味", "B で書いた意味"]);
    expect([v.purpose, v.memo]).toEqual(["B で書いた目的", "A で書いたメモ"]);
  }
});

test("別の本: A は本 X、B は本 Y を開いて書く。両方の入力が残り、それぞれのタブは自分の本を開いたまま", async ({ page, context }) => {
  const pageB = await twoTabs(page, context, [base("t-tabs-y", "タブのテスト Y")]);
  await pageB.selectOption("#bookSel", "t-tabs-y");
  await expect.poll(async () => (await current(pageB)).id).toBe("t-tabs-y");
  await f(page, "purpose").fill("A が X に書いた目的");
  await f(pageB, "purpose").fill("B が Y に書いた目的");
  await f(page, "memo").fill("A が X に書いたメモ");
  // それぞれのタブは、自分の本を開いたまま
  await expect(page.locator("#bookSel option:checked")).toHaveText("タブのテスト X");
  await expect(pageB.locator("#bookSel option:checked")).toHaveText("タブのテスト Y");
  await expect(f(page, "purpose")).toHaveValue("A が X に書いた目的");
  await expect(f(pageB, "purpose")).toHaveValue("B が Y に書いた目的");
  expect((await current(page)).id).toBe("t-tabs-x");
  expect((await current(pageB)).id).toBe("t-tabs-y");
  await reload(page);
  expect((await storedBook(page, "t-tabs-x")).v).toMatchObject({ purpose: "A が X に書いた目的", memo: "A が X に書いたメモ" });
  expect((await storedBook(page, "t-tabs-y")).v.purpose).toBe("B が Y に書いた目的");
});

test("片方のタブで本を足しても、読み込んでも、消しても、もう片方のタブの入力がそれを打ち消さない", async ({ page, context }) => {
  const pageB = await twoTabs(page, context, [base("t-tabs-y", "タブのテスト Y")]);
  // A で本を足す。B は、開いている本に書く
  await addManualBook(page, { title: "A で足した本" });
  const added = (await current(page)).id;
  await expect(pageB.locator("#bookSel option", { hasText: "A で足した本" }), "B の本の一覧にも出る").toHaveCount(1);
  await expect(pageB.locator("#bookSel option:checked"), "B は、自分の本を開いたまま").toHaveText("タブのテスト X");
  await f(pageB, "memo").fill("B のメモ 1");
  expect((await stored(page)).books.map(b => b.id), "足した本は残る").toContain(added);
  // A で本を読み込む
  await importState(page, base("t-tabs-z", "タブのテスト Z"));
  await f(pageB, "memo").fill("B のメモ 2");
  expect((await stored(page)).books.map(b => b.id)).toEqual(expect.arrayContaining([added, "t-tabs-z", "t-tabs-x", "t-tabs-y"]));
  // A で本 Y を消す（書誌の「この本を一覧から消す」）
  page.on("dialog", d => d.accept());
  await page.selectOption("#bookSel", "t-tabs-y");
  await expect.poll(async () => (await current(page)).id).toBe("t-tabs-y");
  await page.click("#btnEdit");
  await page.click("#btnDelete");
  await expect(page.locator("#bookSel option", { hasText: "タブのテスト Y" })).toHaveCount(0);
  await expect(pageB.locator("#bookSel option", { hasText: "タブのテスト Y" }), "B の本の一覧からも消える").toHaveCount(0);
  await f(pageB, "memo").fill("B のメモ 3");
  const ids = (await stored(page)).books.map(b => b.id);
  expect(ids, "消した本は、戻ってこない").not.toContain("t-tabs-y");
  expect(ids).toEqual(expect.arrayContaining([added, "t-tabs-z", "t-tabs-x"]));
  expect((await storedBook(page, "t-tabs-x")).v.memo).toBe("B のメモ 3");
  // B が開いている本を A で消すと、B は残っている本を開く
  await page.selectOption("#bookSel", "t-tabs-x");
  await expect.poll(async () => (await current(page)).id).toBe("t-tabs-x");
  await page.click("#btnEdit");
  await page.click("#btnDelete");
  await expect(pageB.locator("#bookSel option", { hasText: "タブのテスト X" })).toHaveCount(0);
  await expect.poll(async () => (await current(pageB)).id).not.toBe("t-tabs-x");
  await reload(pageB);
  expect((await stored(pageB)).books.map(b => b.id)).not.toContain("t-tabs-x");
});

test("同じ欄を2つのタブで書いたときは、あとから書いたほうが残り、先に書いたタブの画面にも出る", async ({ page, context }) => {
  const pageB = await twoTabs(page, context);
  await f(page, "purpose").fill("A が先に書いた");
  await expect(f(pageB, "purpose")).toHaveValue("A が先に書いた");
  await f(pageB, "purpose").fill("B があとから書いた");
  await expect(f(page, "purpose"), "先に書いたタブの欄にも、あとから書いた内容が出る").toHaveValue("B があとから書いた");
  await reload(page);
  await expect(f(page, "purpose")).toHaveValue("B があとから書いた");
  expect((await storedBook(page, "t-tabs-x")).v.purpose).toBe("B があとから書いた");
});

test("入力中の欄は壊れない: ほかのタブの保存を取り込んでも、同じ部品のまま、フォーカスとカーソルの位置が変わらない", async ({ page, context }) => {
  const pageB = await twoTabs(page, context);
  const a = f(page, "props.1.t");
  await a.click();
  await a.evaluate(el => { el.__same = true; el.setSelectionRange(3, 3); });
  const top = await a.evaluate(el => el.getBoundingClientRect().top);
  // B で、A の入力中の欄より上にある欄と、同じ一覧の別の行に書く。行も足す
  await f(pageB, "purpose").fill("B で書いた目的\n2行目\n3行目");
  await f(pageB, "props.0.t").fill("B で書いた命題");
  await pageB.locator('#app button[data-a="push"][data-p="props"]').click();
  await expect(f(page, "props.0.t")).toHaveValue("B で書いた命題");
  await expect(page.locator('#sec-a2 [data-p="props.3.t"]')).toHaveCount(1);
  const st = await page.evaluate(() => { const el = document.activeElement; return { same: el.__same === true, p: el.dataset.p, value: el.value, start: el.selectionStart, end: el.selectionEnd, top: el.getBoundingClientRect().top }; });
  expect({ same: st.same, p: st.p, value: st.value, start: st.start, end: st.end }).toEqual({ same: true, p: "props.1.t", value: "テスト用の命題2", start: 3, end: 3 });
  expect(Math.abs(st.top - top), "入力中の欄の、画面の中の縦の位置").toBeLessThanOrEqual(1);
  // そのまま打つと、カーソルの位置に入る
  await page.keyboard.type("ab");
  await expect(a).toHaveValue("テストab用の命題2");
  await reload(pageB);
  expect((await current(pageB)).v.props.map(o => o.t)).toEqual(["B で書いた命題", "テストab用の命題2", "テスト用の命題3", ""]);
});

test("かな漢字変換の途中でも、ほかのタブの保存を取り込んで、変換は続けられる", async ({ page, context }) => {
  const pageB = await twoTabs(page, context);
  const a = f(page, "memo");
  await a.click();
  await a.evaluate(el => { el.__same = true; });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "へんかん", selectionStart: 4, selectionEnd: 4 });
  await expect(a).toHaveValue("へんかん");
  await f(pageB, "purpose").fill("B で書いた目的");
  await expect(f(page, "purpose")).toHaveValue("B で書いた目的");
  // 変換の途中の文字は、そのまま続けられる
  await cdp.send("Input.imeSetComposition", { text: "へんかんちゅう", selectionStart: 7, selectionEnd: 7 });
  await cdp.send("Input.insertText", { text: "変換中" });
  await expect(a).toHaveValue("変換中");
  expect(await page.evaluate(() => document.activeElement.__same === true && document.activeElement.dataset.p)).toBe("memo");
  await reload(pageB);
  expect((await current(pageB)).v).toMatchObject({ memo: "変換中", purpose: "B で書いた目的" });
});

test("ほかのタブの保存が届く前に入力しても、両方残る（保存の直前にも取り込む）", async ({ page, context }) => {
  await deaf(page);
  const pageB = await twoTabs(page, context);
  // B の入力は、A には届かない。A の画面は古いまま
  await f(pageB, "memo").fill("B で書いたメモ");
  await f(pageB, "props.0.t").fill("B で書いた命題");
  await expect.poll(async () => (await storedBook(page, "t-tabs-x")).v.memo).toBe("B で書いたメモ");
  await expect(f(page, "memo")).toHaveValue("");
  // A で入力すると、B の入力を取り込んでから保存する。A の画面も最新になる
  const a = f(page, "props.1.t");
  await a.click();
  await a.evaluate(el => { el.__same = true; el.setSelectionRange(3, 3); });
  await page.keyboard.type("a");
  await expect(f(page, "memo")).toHaveValue("B で書いたメモ");
  await expect(f(page, "props.0.t")).toHaveValue("B で書いた命題");
  expect(await page.evaluate(() => { const el = document.activeElement; return [el.__same === true, el.value, el.selectionStart]; })).toEqual([true, "テストa用の命題2", 4]);
  // ボタンの操作でも、同じ
  await f(pageB, "purpose").fill("B で書いた目的");
  await expect.poll(async () => (await storedBook(page, "t-tabs-x")).v.purpose).toBe("B で書いた目的");
  await page.locator('#sec-checkin button[data-p="budget"][data-val="1時間"]').click();
  await expect(f(page, "purpose")).toHaveValue("B で書いた目的");
  await reload(page);
  expect((await current(page)).v).toMatchObject({ memo: "B で書いたメモ", purpose: "B で書いた目的", budget: "1時間" });
  expect((await current(page)).v.props.map(o => o.t)).toEqual(["B で書いた命題", "テストa用の命題2", "テスト用の命題3"]);
});

test("ほかのタブが上の行を消したことが届く前に入力しても、打った文字は、打った行に入る。続けて打っても、同じ行に入る", async ({ page, context }) => {
  await deaf(page);
  const pageB = await twoTabs(page, context);
  pageB.on("dialog", d => d.accept());
  await pageB.locator('#sec-a2 button[data-a="del"][data-p="props"][data-i="0"]').click();
  await expect.poll(async () => (await storedBook(page, "t-tabs-x")).v.props.map(o => o.id)).toEqual(["P2", "P3"]);
  // A の画面には、まだ P1 がある。P2 の欄（2行目）に打つ
  const a = page.locator('#sec-a2 [data-p="props.1.t"]');
  await expect(a).toHaveValue("テスト用の命題2");
  await a.click();
  await page.keyboard.type("x");
  await expect.poll(async () => (await current(page)).v.props.map(o => [o.id, o.t])).toEqual([["P2", "テスト用の命題2x"], ["P3", "テスト用の命題3"]]);
  // 画面も、P2 が1行目になっている。続けて打った文字も、P2 に入る
  await expect(page.locator('#sec-a2 [data-p="props.0.t"]')).toHaveValue("テスト用の命題2x");
  await page.keyboard.type("y");
  await expect.poll(async () => (await storedBook(page, "t-tabs-x")).v.props.map(o => [o.id, o.t])).toEqual([["P2", "テスト用の命題2xy"], ["P3", "テスト用の命題3"]]);
});

test("ほかのタブの保存を取り込んでも、広げた欄の高さ、開いた説明、ボタンのフォーカス、画面の縦の位置は変わらない", async ({ page, context }) => {
  const pageB = await twoTabs(page, context);
  const purpose = f(page, "purpose");
  await page.locator('#sec-shitayomi button[data-a="help"]').first().click();
  const h0 = (await purpose.boundingBox()).height;
  await purpose.evaluate((el, h) => { el.style.height = h + "px"; }, h0 + 120); // つまみを引いて広げたのと同じ
  const btn = page.locator('#sec-a2 button[data-a="del"][data-p="props"][data-i="1"]');
  await btn.focus();
  const y = await page.evaluate(() => window.scrollY);
  await f(pageB, "props.0.t").fill("B で書いた命題");
  await f(pageB, "memo").fill("B で書いたメモ");
  await expect(f(page, "memo")).toHaveValue("B で書いたメモ");
  await expect(f(page, "props.0.t")).toHaveValue("B で書いた命題");
  expect((await purpose.boundingBox()).height, "広げた欄の高さ").toBe(h0 + 120);
  await expect(page.locator('#sec-shitayomi button[data-a="help"]').first()).toHaveAttribute("aria-expanded", "true");
  await expect(btn).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  // プルダウンにフォーカスがあるときも、同じ働きのプルダウンに残る
  const sel = page.locator('#sec-a2 select[data-p="props.1.sup"]');
  await sel.focus();
  await f(pageB, "props.0.t").fill("B で書き直した命題");
  await expect(f(page, "props.0.t")).toHaveValue("B で書き直した命題");
  await expect(sel).toBeFocused();
});

test("「本を足す」を開いたままでも、ほかのタブの保存を取り込み、書誌の欄に入れた文字は残る", async ({ page, context }) => {
  const pageB = await twoTabs(page, context);
  await page.click("#btnNew");
  await page.locator('#formBook input[name="title"]').fill("A で足す本");
  await f(pageB, "memo").fill("B で書いたメモ");
  await expect.poll(async () => (await current(page)).v.memo).toBe("B で書いたメモ");
  await expect(page.locator("#dlgBook")).toBeVisible();
  await expect(page.locator('#formBook input[name="title"]')).toHaveValue("A で足す本");
  await page.locator("#formBook").getByRole("button", { name: "決定" }).click();
  await expect(page.locator("#bookSel option:checked")).toHaveText("A で足す本");
  await expect(pageB.locator("#bookSel option", { hasText: "A で足す本" })).toHaveCount(1);
  expect((await storedBook(page, "t-tabs-x")).v.memo).toBe("B で書いたメモ");
});

test("見張り: タブが1つのときの保存の形は変わらない（books、current、seen、sort のほかにキーを足さない）", async ({ page }) => {
  await openTool(page);
  await importState(page, base("t-tabs-x", "タブのテスト X"));
  await f(page, "purpose").fill("書いた目的");
  const s = await stored(page);
  expect(Object.keys(s).sort()).toEqual(["books", "current", "seen"]);
  expect(s.current).toBe("t-tabs-x");
  expect(s.books[0]).toEqual(await current(page));
});

test("ブラウザに保存できないときの動きは変わらない（入力はタブの中に残り、保存できない旨が出る。ほかのタブの保存で止まらない）", async ({ page, context }) => {
  // 書き込みだけができない場合
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error("quota"); }; });
  await openTool(page);
  await f(page, "purpose").fill("保存できないタブの目的");
  await page.locator('#sec-checkin button[data-p="budget"][data-val="1時間"]').click();
  await expect(page.locator("#finish")).toContainText("このブラウザでは入力を保存できない");
  expect((await current(page)).v).toMatchObject({ purpose: "保存できないタブの目的", budget: "1時間" });
  expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBeNull();
  // ほかのタブが保存しても、このタブの入力は残り、ほかのタブの入力も取り込まれる
  const pageB = await context.newPage();
  await openTool(pageB);
  await f(pageB, "memo").fill("B で書いたメモ");
  await expect(f(page, "memo")).toHaveValue("B で書いたメモ");
  await expect(f(page, "purpose")).toHaveValue("保存できないタブの目的");
  await f(page, "meaning").fill("保存できないタブの意義");
  expect((await current(page)).v).toMatchObject({ purpose: "保存できないタブの目的", budget: "1時間", memo: "B で書いたメモ", meaning: "保存できないタブの意義" });
  // 読むこともできない場合
  const pageC = await context.newPage();
  await pageC.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error("denied"); }; Storage.prototype.setItem = () => { throw new Error("denied"); }; });
  await openTool(pageC);
  await f(pageC, "purpose").fill("読めないタブの目的");
  await expect(pageC.locator("#finish")).toContainText("このブラウザでは入力を保存できない");
  expect((await current(pageC)).v.purpose).toBe("読めないタブの目的");
});

test("ほかのタブの保存が届く前に「読み込む」を使っても、確認（#59）は、ブラウザにある最新の内容と比べて出る。やめると、ほかのタブの入力が残る", async ({ page, context }) => {
  await deaf(page);
  const pageB = await twoTabs(page, context);
  const copied = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current())); // A が開いたときの内容
  await f(pageB, "memo").fill("B で書いたメモ");
  await expect.poll(async () => (await storedBook(page, "t-tabs-x")).v.memo).toBe("B で書いたメモ");
  await expect(f(page, "memo"), "A の画面は、まだ古い").toHaveValue("");
  let ok = false; const seen = [];
  page.on("dialog", d => { seen.push(d.type()); if (ok) d.accept(); else d.dismiss(); });
  const paste = async () => {
    await page.click("#btnImport");
    await page.locator("#formImport textarea").fill(copied);
    await page.evaluate(() => { window.__closed = new Promise(done => document.getElementById("dlgImport").addEventListener("close", done, { once: true })); });
    await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
    await page.evaluate(() => window.__closed);
  };
  // A の画面の内容とは同じでも、ブラウザにある内容（B の入力が入っている）とは違うので、確認が出る
  await paste();
  expect(seen).toEqual(["confirm"]);
  await expect(f(page, "memo"), "やめたあと、A の画面にも B の入力が出る").toHaveValue("B で書いたメモ");
  expect((await storedBook(page, "t-tabs-x")).v.memo).toBe("B で書いたメモ");
  // 受けると、貼った内容に置き換わる
  ok = true;
  await paste();
  expect(seen).toEqual(["confirm", "confirm"]);
  await expect(f(page, "memo")).toHaveValue("");
  expect((await storedBook(page, "t-tabs-x")).v.memo).toBe("");
  await expect(f(pageB, "memo"), "B の画面にも、読み込んだ内容が出る").toHaveValue("");
});

test("ほかのタブが長い文を書くと、こちらのタブの欄の高さも内容に合う（#63）。入力中の欄は、画面の同じ位置に残る", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageB = await twoTabs(page, context);
  const a = f(page, "props.2.t");
  await a.click();
  await a.evaluate(el => { el.__same = true; el.setSelectionRange(2, 2); });
  const top = await a.evaluate(el => el.getBoundingClientRect().top);
  const long = "あいうえおかきくけこ".repeat(6);
  await f(pageB, "props.0.t").fill(long);
  const p0 = f(page, "props.0.t");
  await expect(p0).toHaveValue(long);
  expect(await p0.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.clientHeight > 60), "取り込んだ長い文が、欄の中に全部見えている").toBe(true);
  const st = await page.evaluate(() => { const el = document.activeElement; return { same: el.__same === true, start: el.selectionStart, top: el.getBoundingClientRect().top }; });
  expect({ same: st.same, start: st.start }).toEqual({ same: true, start: 2 });
  expect(Math.abs(st.top - top), "入力中の欄の、画面の中の縦の位置").toBeLessThanOrEqual(1);
  // 短く書き直すと、高さも戻る
  await f(pageB, "props.0.t").fill("短い文");
  await expect(p0).toHaveValue("短い文");
  expect(await p0.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
  expect(Math.abs((await a.evaluate(el => el.getBoundingClientRect().top)) - top)).toBeLessThanOrEqual(1);
});

/* ---------- 番号のない一覧（用語、要点、根拠）で、片方が行を足しただけのとき（審査の指摘） ----------
   2つのタブとも、ほかのタブの保存が届かない状態にして、保存の直前の取り込みだけで確かめる */
async function twoDeafTabs(page, context) {
  await deaf(page);
  await openTool(page);
  const book = base("t-tabs-x", "タブのテスト X");
  book.v.judge = "分析読書へ進む"; book.v.props[0].grounds = [{ t: "根拠A", kind: "" }, { t: "根拠B", kind: "" }];
  await importState(page, book);
  const pageB = await context.newPage();
  await deaf(pageB);
  await openTool(pageB);
  await expect(pageB.locator("#bookSel option:checked")).toHaveText("タブのテスト X");
  return pageB;
}
const push = (page, sec, p) => page.locator("#" + sec + ' button[data-a="push"][data-p="' + p + '"]').click();
const g = (page, sec, p) => page.locator("#" + sec + ' [data-p="' + p + '"]');
const storedV = async page => (await storedBook(page, "t-tabs-x")).v;

test("審査の再現: B が用語2の意味を書き、A が用語を1行足して書く。保存が届いていなくても、両方残る", async ({ page, context }) => {
  const pageB = await twoDeafTabs(page, context);
  await f(pageB, "terms.1.m").fill("B で書いた意味");
  await expect(f(page, "terms.1.m"), "A の画面は、まだ古い").toHaveValue("意味B");
  await push(page, "sec-shitayomi", "terms");
  await page.keyboard.type("A で足した用語");
  expect((await storedV(page)).terms.map(t => [t.w, t.m])).toEqual([["用語A", "意味A"], ["用語B", "B で書いた意味"], ["A で足した用語", ""]]);
  await expect(f(page, "terms.1.m"), "A の画面にも、B の入力が出る").toHaveValue("B で書いた意味");
  // 逆向き: 足した側の保存があとから届いていない B が、既存の行に書く
  await f(pageB, "terms.0.m").fill("B で書いた意味 2");
  expect((await storedV(page)).terms.map(t => [t.w, t.m])).toEqual([["用語A", "B で書いた意味 2"], ["用語B", "B で書いた意味"], ["A で足した用語", ""]]);
  await expect(f(pageB, "terms.2.w")).toHaveValue("A で足した用語");
});

test("逆向き: B が用語を1行足して書き、A が既存の行に書く。要点（文字の一覧）と根拠でも、両方残る", async ({ page, context }) => {
  const pageB = await twoDeafTabs(page, context);
  await push(pageB, "sec-shitayomi", "terms");
  await pageB.keyboard.type("B で足した用語");
  await f(page, "terms.0.m").fill("A で書いた意味");
  expect((await storedV(page)).terms.map(t => [t.w, t.m])).toEqual([["用語A", "A で書いた意味"], ["用語B", "意味B"], ["B で足した用語", ""]]);
  // 要点: B が既存の行に書き、A が足す。続けて、A が既存の行に書き、B が足す
  await g(pageB, "sec-hyomen", "points.1").fill("B で書いた要点");
  await push(page, "sec-hyomen", "points");
  await page.keyboard.type("A で足した要点");
  expect((await storedV(page)).points).toEqual(["要点A", "B で書いた要点", "A で足した要点"]);
  await g(page, "sec-hyomen", "points.0").fill("A で書いた要点");
  await push(pageB, "sec-hyomen", "points");
  await pageB.keyboard.type("B で足した要点");
  expect((await storedV(page)).points).toEqual(["A で書いた要点", "B で書いた要点", "A で足した要点", "B で足した要点"]);
  // 根拠: B が既存の行に書き、A が足す
  await g(pageB, "sec-a2", "props.0.grounds.0.t").fill("B で書いた根拠");
  await push(page, "sec-a2", "props.0.grounds");
  await page.keyboard.type("A で足した根拠");
  expect((await storedV(page)).props[0].grounds.map(o => o.t)).toEqual(["B で書いた根拠", "根拠B", "A で足した根拠"]);
});

test("両方のタブが同じ一覧に行を足したときは、両方の行が残る（ほかのタブの分、このタブの分の順）。足した行に続けて打った文字は、自分の行に入る", async ({ page, context }) => {
  const pageB = await twoDeafTabs(page, context);
  await push(pageB, "sec-shitayomi", "terms");
  await pageB.keyboard.type("B で足した用語");
  await f(pageB, "terms.0.m").fill("B で書いた意味");
  await push(page, "sec-shitayomi", "terms");
  await page.keyboard.type("A で足した用語");
  expect((await storedV(page)).terms.map(t => [t.w, t.m])).toEqual([["用語A", "B で書いた意味"], ["用語B", "意味B"], ["B で足した用語", ""], ["A で足した用語", ""]]);
  // A のフォーカスは、A が足した行にある。続けて打っても、A の行に入る
  expect(await page.evaluate(() => [document.activeElement.dataset.p, document.activeElement.value])).toEqual(["terms.3.w", "A で足した用語"]);
  await page.keyboard.type("!");
  // B が、自分の足した行に続けて打っても、B の行に入る
  await f(pageB, "terms.2.w").focus();
  await pageB.keyboard.press("End");
  await pageB.keyboard.type("?");
  expect((await storedV(page)).terms.map(t => t.w)).toEqual(["用語A", "用語B", "B で足した用語?", "A で足した用語!"]);
  // 文字の一覧（要点）でも同じ
  await push(pageB, "sec-hyomen", "points");
  await pageB.keyboard.type("B で足した要点");
  await push(page, "sec-hyomen", "points");
  await page.keyboard.type("A で足した要点");
  expect(await page.evaluate(() => [document.activeElement.dataset.p, document.activeElement.value])).toEqual(["points.3", "A で足した要点"]);
  await page.keyboard.type("!");
  expect((await storedV(page)).points).toEqual(["要点A", "要点B", "B で足した要点", "A で足した要点!"]);
});

test("見張り: 片方が途中の行を消したとき（消してから足したときも）は、これまでどおり、あとから書いたタブの一覧が残り、入力が別の行に混ざらない", async ({ page, context }) => {
  const pageB = await twoDeafTabs(page, context);
  // B が先頭の用語を消す。A（まだ知らない）が、用語2の意味を書く
  await pageB.locator('#sec-shitayomi button[data-a="del"][data-p="terms"][data-i="0"]').click();
  await expect.poll(async () => (await storedV(page)).terms.map(t => t.w)).toEqual(["用語B"]);
  await f(page, "terms.1.m").fill("A で書いた意味");
  expect((await storedV(page)).terms.map(t => [t.w, t.m])).toEqual([["用語A", "意味A"], ["用語B", "A で書いた意味"]]);
  // B が先頭の要点を消して、2行足す（行の数は増えているが、行の位置がずれている）。A が、要点2に書く
  await pageB.locator('#sec-hyomen button[data-a="del"][data-p="points"][data-i="0"]').click();
  for (const t of ["B で足した要点 1", "B で足した要点 2"]) { await push(pageB, "sec-hyomen", "points"); await pageB.keyboard.type(t); }
  await expect.poll(async () => (await storedV(page)).points).toEqual(["要点B", "B で足した要点 1", "B で足した要点 2"]);
  await g(page, "sec-hyomen", "points.1").fill("A で書いた要点");
  expect((await storedV(page)).points, "A の一覧がそのまま残る（B の行に、A の入力が混ざらない）").toEqual(["要点A", "A で書いた要点"]);
});
