// 仕様: 表面読みの「何がどのように詳しく述べられているか」を、1行に「何が」と「どのように」の2欄の組で書ける（issue #71）。
// 1行 = 「何が」1つと「どのように」1つの組。行を足すと、組が1つ増える。保存の形は、v.points が組（{ what, how }）の一覧。
// 前の形（v.points が文の一覧）の読書メモは、文が「何が」に入り、「どのように」は空になる。
const { test, expect } = require("@playwright/test");
const { openTool, addManualBook, importState, current, loadWindowJs } = require("./helpers");

const LABEL = "何がどのように詳しく述べられているか";
const ADD = "＋ 述べられていたこと";
const KEY = "dokusho-memo.v2";
const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
/* 前の形（main の形）: v.points が文の一覧 */
function oldBook(over) {
  const b = { id: "t-hyomen-old", meta: { title: "前の形の表面読み", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { purpose: "テスト用の目的", judge: "表面読みへ進む", points: ["テスト用の要点 1", "テスト用の要点 2"], unclear: ["テスト用の箇所"] } };
  Object.assign(b.v, over || {});
  return b;
}
const pair = (what, how) => ({ what, how: how || "" });
const hyomen = page => page.locator("#sec-hyomen .item").first();
const rows = page => hyomen(page).locator(".pair");
const what = (page, i) => hyomen(page).locator('[data-p="points.' + i + '.what"]');
const how = (page, i) => hyomen(page).locator('[data-p="points.' + i + '.how"]');
/* 画面に出ている組。[行の番号, 「何が」の値, 「どのように」の値] の一覧 */
const shown = page => rows(page).evaluateAll(els => els.map(el => [el.querySelector(".no").textContent, el.querySelector('[data-p$=".what"]').value, el.querySelector('[data-p$=".how"]').value]));
const points = async page => (await current(page)).v.points;
const markdown = page => page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* チェックアウトの「4つの問いへの答え」の2番目 */
const second = page => page.locator("#sec-checkout dl.sum dd").nth(1);
async function newBook(page) {
  await openTool(page);
  await addManualBook(page, { title: "表面読みのテスト" });
  await page.locator("#app textarea[data-p='purpose']").fill("テスト用の目的");
  await page.locator('#sec-shitayomi button[data-p="judge"][data-val="表面読みへ進む"]').click();
  await expect(page.locator("#sec-hyomen")).toBeVisible();
}
/* 「＋ 述べられていたこと」を押して、組を1つ書く */
async function addPair(page, w, h) {
  const n = await rows(page).count();
  await hyomen(page).getByRole("button", { name: ADD, exact: true }).click();
  await expect(rows(page)).toHaveCount(n + 1);
  await what(page, n).fill(w);
  if (h != null) await how(page, n).fill(h);
}
/* 「読み込む」に貼って、反映されるまで待つ */
async function paste(page, text, wait) {
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(text);
  await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  await wait();
}

test("ラベルは訳書の第2問の文言。行を足すと、「何が」と「どのように」の2欄の組が1つ増え、行の頭に番号が出る", async ({ page }) => {
  await newBook(page);
  const it = hyomen(page);
  await expect(it.locator(".label .grow")).toHaveText(LABEL);
  await expect(rows(page)).toHaveCount(0);
  await expect(it.locator('button[data-a="push"]')).toHaveText([ADD]);
  await it.getByRole("button", { name: ADD, exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(what(page, 0), "足した組の「何が」にフォーカスが移る").toBeFocused();
  // 1行の中に、番号、「何が」の見出しと欄、「どのように」の見出しと欄、「×」が、この順にある
  const parts = await rows(page).first().evaluate(el => [...el.querySelectorAll(".no, .cap, [data-p], button")].map(o => o.matches(".no, .cap") ? o.textContent : o.dataset.a ? o.dataset.a + ":" + o.dataset.p + ":" + o.dataset.i : o.dataset.p));
  expect(parts).toEqual(["1", "何が", "points.0.what", "どのように", "points.0.how", "del:points:0"]);
  expect(await points(page)).toEqual([pair("")]);
  await it.getByRole("button", { name: ADD, exact: true }).click();
  await it.getByRole("button", { name: ADD, exact: true }).click();
  expect((await shown(page)).map(r => r[0]), "行の番号").toEqual(["1", "2", "3"]);
  expect(await points(page)).toEqual([pair(""), pair(""), pair("")]);
  // 説明文
  await it.locator('button[data-a="help"]').click();
  const help = it.locator(".help").first();
  await expect(help).toContainText("止まらずに最後まで読んでから");
  await expect(help).not.toContainText("3つ");
  await expect(help).not.toContainText("仮の答え");
  await expect(page.locator("#app")).not.toContainText("何がどのように述べられていたか");
  // 前の作り（2つの別々の一覧）のボタンは、もうない
  await expect(page.locator("#app")).not.toContainText("＋ 考えや主張");
  await expect(page.locator("#app")).not.toContainText("＋ 理由や根拠");
});

test("広い画面では、1行に「何が」と「どのように」の欄が横に並ぶ", async ({ page }) => {
  await newBook(page);
  await addPair(page, "テスト用の主張 1", "テスト用の理由 1");
  await addPair(page, "テスト用の主張 2", "テスト用の理由 2");
  for (const i of [0, 1]) {
    const a = await what(page, i).boundingBox(), b = await how(page, i).boundingBox(), x = await rows(page).nth(i).locator('button[data-a="del"]').boundingBox();
    expect(Math.abs(a.y - b.y), "行 " + (i + 1) + ": 2つの欄の上端がそろう").toBeLessThan(2);
    expect(b.x, "行 " + (i + 1) + ": 「どのように」は「何が」の右").toBeGreaterThan(a.x + a.width);
    expect(x.x, "行 " + (i + 1) + ": 「×」は右端").toBeGreaterThan(b.x + b.width - 1);
    expect(a.width, "「何が」の欄の幅").toBeGreaterThan(180);
    expect(b.width, "「どのように」の欄の幅").toBeGreaterThan(180);
  }
  const y0 = (await what(page, 0).boundingBox()).y, y1 = (await what(page, 1).boundingBox()).y;
  expect(y1, "2行目は1行目の下").toBeGreaterThan(y0 + 20);
});

test("行を消しても、足しても、再読み込みしても、「何が」と「どのように」の組がずれない", async ({ page }) => {
  await newBook(page);
  for (let i = 1; i <= 5; i++) await addPair(page, "テスト用の主張 " + i, i === 3 ? null : "テスト用の理由 " + i);
  const P = i => pair("テスト用の主張 " + i, i === 3 ? "" : "テスト用の理由 " + i);
  expect(await points(page)).toEqual([1, 2, 3, 4, 5].map(P));
  expect(await shown(page)).toEqual([1, 2, 3, 4, 5].map((i, k) => [String(k + 1), P(i).what, P(i).how]));
  // 2行目を消す: 3行目から後ろが繰り上がる。「どのように」が空の組（3）のせいで、後ろの組がずれることはない
  await hyomen(page).locator('button[data-a="del"][data-p="points"][data-i="1"]').click();
  expect(await points(page)).toEqual([1, 3, 4, 5].map(P));
  expect(await shown(page)).toEqual([1, 3, 4, 5].map((i, k) => [String(k + 1), P(i).what, P(i).how]));
  await hyomen(page).locator('button[data-a="del"][data-p="points"][data-i="0"]').click();
  await addPair(page, "テスト用の主張 6", "テスト用の理由 6");
  const want = [P(3), P(4), P(5), pair("テスト用の主張 6", "テスト用の理由 6")];
  expect(await points(page)).toEqual(want);
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect(await shown(page)).toEqual(want.map((o, k) => [String(k + 1), o.what, o.how]));
  expect(await points(page)).toEqual(want);
  // 「×」は確かめる文を出さずに消える（行の数に上限もない）
  for (let i = 7; i <= 9; i++) await addPair(page, "テスト用の主張 " + i);
  await expect(rows(page)).toHaveCount(7);
});

test("保存する Markdown に、組ごとにひとまとまりで出る。保存した Markdown を読み込み直すと、同じ組に戻る", async ({ page }) => {
  await newBook(page);
  await addPair(page, "テスト用の主張 1", "テスト用の理由 1");
  await addPair(page, "テスト用の主張 2");
  await addPair(page, "", "");
  await addPair(page, "", "テスト用の理由だけ");
  await addPair(page, "テスト用の主張 5", "テスト用の理由 5");
  const md = await markdown(page);
  expect(md).toContain("- " + LABEL + ":\n  - 何が: テスト用の主張 1\n    - どのように: テスト用の理由 1\n  - 何が: テスト用の主張 2\n  - 何が:\n    - どのように: テスト用の理由だけ\n  - 何が: テスト用の主張 5\n    - どのように: テスト用の理由 5\n- 分からなかった所:");
  expect(md).not.toContain("pointsHow");
  const before = await current(page);
  await what(page, 0).fill("書き換えた");
  await how(page, 4).fill("書き換えた");
  page.once("dialog", d => d.accept()); // 同じ本を置き換える確認（issue #59）
  await paste(page, md, () => expect(what(page, 0)).toHaveValue("テスト用の主張 1"));
  expect(await current(page)).toEqual(before);
  expect(await shown(page)).toEqual(before.v.points.map((o, k) => [String(k + 1), o.what, o.how]));
  expect(await markdown(page)).toBe(md);
});

test("チェックアウトの「4つの問いへの答え」の2番目に、組ごとに「何が」と「どのように」が対応して出る。打ったその場で変わる", async ({ page }) => {
  await newBook(page);
  await expect(second(page)).toHaveText("まだ書いていない");
  await addPair(page, "テスト用の主張 1", "テスト用の理由 1");
  await addPair(page, "テスト用の主張 2");
  await addPair(page, "", "");
  await expect(second(page)).toHaveText("1 何が: テスト用の主張 1\n  どのように: テスト用の理由 1\n2 何が: テスト用の主張 2");
  // 欄に打つと、欄を離れなくても変わる。入力中の欄は、同じ部品のまま
  const el = how(page, 1);
  await el.click();
  await el.evaluate(o => { o.__same = true; });
  await page.keyboard.type("riyuu");
  await expect(second(page)).toHaveText("1 何が: テスト用の主張 1\n  どのように: テスト用の理由 1\n2 何が: テスト用の主張 2\n  どのように: riyuu");
  expect(await page.evaluate(() => document.activeElement.__same === true && document.activeElement.dataset.p), "入力中の欄").toBe("points.1.how");
});

test("進み具合の「表面読み」と読了の条件は、「何が」の書かれた組が1つ以上あれば済み。「どのように」だけでは済みにならない", async ({ page }) => {
  await newBook(page);
  const prog = page.locator("#prog"), todo = page.locator("#finish .todo");
  await expect(prog).toContainText("表面読み 未");
  await expect(todo).toContainText(LABEL);
  await addPair(page, "", "テスト用の理由 1");
  await expect(prog, "「どのように」だけでは済みにならない").toContainText("表面読み 未");
  await expect(todo).toContainText(LABEL);
  await what(page, 0).fill("テスト用の主張 1");
  await expect(prog).toContainText("表面読み 済");
  await expect(todo).not.toContainText(LABEL);
  await how(page, 0).fill("");
  await expect(prog, "「どのように」が空でも済み").toContainText("表面読み 済");
  await what(page, 0).fill("   ");
  await expect(prog, "「何が」が空白だけでは済みにならない").toContainText("表面読み 未");
});

test("前の形（v.points が文の一覧）の読書メモを読み込むと、前の要点が「何が」に入り、「どのように」は空になる。何度読み込んでも同じ", async ({ page }) => {
  await openTool(page);
  const old = oldBook();
  await importState(page, old);
  const want = [pair("テスト用の要点 1"), pair("テスト用の要点 2")];
  expect(await shown(page)).toEqual([["1", "テスト用の要点 1", ""], ["2", "テスト用の要点 2", ""]]);
  expect(await points(page)).toEqual(want);
  await expect(page.locator("#prog")).toContainText("表面読み 済");
  const b = await current(page);
  expect(Object.assign({}, b, { v: Object.assign({}, b.v, { points: old.v.points }) }), "要点のほかは、何も変わらない").toEqual(old);
  expect(await markdown(page)).toContain("- " + LABEL + ":\n  - 何が: テスト用の要点 1\n  - 何が: テスト用の要点 2\n- 分からなかった所:");
  await expect(second(page)).toHaveText("1 何が: テスト用の要点 1\n2 何が: テスト用の要点 2");
  // 「どのように」を書ける
  await how(page, 1).fill("テスト用の理由 2");
  expect(await points(page)).toEqual([pair("テスト用の要点 1"), pair("テスト用の要点 2", "テスト用の理由 2")]);
  // 直した本を読み込み直しても、同じになる（2回目の変換で変わらない）
  const once = await current(page);
  await importState(page, once);
  expect(await current(page)).toEqual(once);
});

test("文と組が混ざった一覧も、空の文も、組に直る。「どのように」の別の一覧（v.pointsHow）が残っていても、壊れず、画面にも Markdown にも出ない", async ({ page }) => {
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await openTool(page);
  await importState(page, oldBook({ points: ["テスト用の要点 1", { what: "テスト用の主張 2", how: "テスト用の理由 2" }, "", { what: "テスト用の主張 4" }, null], pointsHow: ["出てはいけない文"] }));
  expect(await shown(page)).toEqual([["1", "テスト用の要点 1", ""], ["2", "テスト用の主張 2", "テスト用の理由 2"], ["3", "", ""], ["4", "テスト用の主張 4", ""], ["5", "", ""]]);
  const v = (await current(page)).v;
  expect(v.points).toEqual([pair("テスト用の要点 1"), pair("テスト用の主張 2", "テスト用の理由 2"), pair(""), { what: "テスト用の主張 4" }, pair("")]);
  expect(v.pointsHow, "v.pointsHow は持たない").toBeUndefined();
  await expect(page.locator("#app")).not.toContainText("出てはいけない文");
  expect(await page.locator("#app input, #app textarea").evaluateAll(els => els.filter(el => el.value === "出てはいけない文").length)).toBe(0);
  const md = await markdown(page);
  expect(md).not.toContain("出てはいけない文");
  expect(md).toContain("  - 何が: テスト用の要点 1\n  - 何が: テスト用の主張 2\n    - どのように: テスト用の理由 2\n  - 何が: テスト用の主張 4\n- 分からなかった所:");
  // 書けて、消せる
  await how(page, 3).fill("テスト用の理由 4");
  await hyomen(page).locator('button[data-a="del"][data-p="points"][data-i="2"]').click();
  expect((await points(page)).map(o => [o.what, o.how])).toEqual([["テスト用の要点 1", ""], ["テスト用の主張 2", "テスト用の理由 2"], ["テスト用の主張 4", "テスト用の理由 4"], ["", ""]]);
  expect(errs, "捕まえられなかった例外").toEqual([]);
});

test("ブラウザに残っている前の形の状態も、開くと直り、前の要点が「何が」に入る", async ({ page }) => {
  const old = oldBook({ pointsHow: ["出てはいけない文"] });
  await page.addInitScript(([key, book]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ books: [book], current: book.id })); }, [KEY, old]);
  await openTool(page);
  await expect(page.locator("#bookSel option:checked")).toHaveText(old.meta.title);
  expect(await shown(page)).toEqual([["1", "テスト用の要点 1", ""], ["2", "テスト用の要点 2", ""]]);
  expect(await points(page)).toEqual([pair("テスト用の要点 1"), pair("テスト用の要点 2")]);
  expect((await current(page)).v.pointsHow).toBeUndefined();
  await expect(page.locator("#prog")).toContainText("表面読み 済");
  // 書くと、新しい形でブラウザに残る
  await how(page, 0).fill("テスト用の理由 1");
  const stored = await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).books.find(b => b.id === id).v, [KEY, old.id]);
  expect(stored.points).toEqual([pair("テスト用の要点 1", "テスト用の理由 1"), pair("テスト用の要点 2")]);
  expect(stored.pointsHow).toBeUndefined();
});

test("欄に、行の番号と何の欄かが分かる名前（aria-label）があり、項目の中で重ならない。行は、名前のあるまとまり（group）", async ({ page }) => {
  await openTool(page);
  await importState(page, oldBook());
  const names = await hyomen(page).locator("input, textarea").evaluateAll(els => els.map(el => [el.dataset.p, el.getAttribute("aria-label")]));
  expect(names).toEqual([["points.0.what", "述べられていたこと 1 の「何が」"], ["points.0.how", "述べられていたこと 1 の「どのように」"], ["points.1.what", "述べられていたこと 2 の「何が」"], ["points.1.how", "述べられていたこと 2 の「どのように」"]]);
  expect(new Set(names.map(n => n[1])).size, "名前が重ならない").toBe(4);
  await expect(page.getByRole("textbox", { name: "述べられていたこと 2 の「何が」", exact: true })).toHaveValue("テスト用の要点 2");
  await expect(hyomen(page).getByRole("group", { name: "述べられていたこと 2", exact: true }).locator("[data-p]").first()).toHaveValue("テスト用の要点 2");
  // 行を消すと、番号と名前が詰まる
  await hyomen(page).locator('button[data-a="del"][data-p="points"][data-i="0"]').click();
  await expect(page.getByRole("textbox", { name: "述べられていたこと 1 の「何が」", exact: true })).toHaveValue("テスト用の要点 2");
  await expect(rows(page).locator(".no")).toHaveText(["1"]);
});

test("Enter: 「何が」→ 同じ行の「どのように」→ 次の行の「何が」。最後の行の「どのように」では、組が1つ足される。値に改行は入らない", async ({ page }) => {
  await openTool(page);
  await importState(page, oldBook());
  const at = () => page.evaluate(() => document.activeElement.dataset.p);
  const before = await current(page);
  await what(page, 0).focus();
  for (const p of ["points.0.how", "points.1.what", "points.1.how"]) { await page.keyboard.press("Enter"); expect(await at()).toBe(p); }
  expect(await current(page), "ここまで、何も足されず、何も変わらない").toEqual(before);
  await page.keyboard.press("Enter");
  expect(await at()).toBe("points.2.what");
  expect(await points(page)).toEqual([pair("テスト用の要点 1"), pair("テスト用の要点 2"), pair("")]);
  // 押したまま: 進むのも、足されるのも、1回だけ
  await how(page, 2).focus();
  for (let i = 0; i < 8; i++) await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  expect(await at()).toBe("points.3.what");
  await expect(rows(page)).toHaveCount(4);
  // かな漢字変換を確定する Enter では、何も起きない
  const res = await what(page, 3).evaluate(el => [{ isComposing: true }, { isComposing: false, keyCode: 229 }].map(init => { const e = new KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, init)); el.dispatchEvent(e); return [e.defaultPrevented, document.activeElement === el]; }));
  expect(res).toEqual([[false, true], [false, true]]);
  await expect(rows(page)).toHaveCount(4);
  // 貼り付けた文の改行は、空白になる
  await what(page, 3).fill("1行目\n2行目");
  expect((await points(page))[3].what).toBe("1行目 2行目");
});

test("長い文は、欄の中で折り返して全部見える。書いた文に記号や HTML があっても、文字として出るだけ", async ({ page }) => {
  await newBook(page);
  const long = "テスト用の長い主張。".repeat(12), evil = '<img src=x onerror="__xss=1"> | # ``` & "引用"';
  await addPair(page, long, evil);
  for (const el of [what(page, 0), how(page, 0)]) expect(await el.evaluate(o => o.scrollHeight <= o.clientHeight + 1 && o.scrollWidth <= o.clientWidth + 1), "欄の中に、隠れた文がない").toBe(true);
  expect((await what(page, 0).boundingBox()).height, "長い文の欄は、1行の欄より高い").toBeGreaterThan((await how(page, 0).boundingBox()).height + 10);
  await expect(second(page)).toHaveText("1 何が: " + long + "\n  どのように: " + evil);
  await page.evaluate(() => new Promise(done => { const i = new Image(); i.onerror = done; i.src = "x"; }));
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.evaluate(() => document.querySelectorAll("#app img").length)).toBe(0);
  const before = await current(page), saved = await markdown(page);
  await how(page, 0).fill("書き換えた");
  page.once("dialog", d => d.accept());
  await paste(page, saved, () => expect(how(page, 0)).toHaveValue(evil));
  expect(await current(page)).toEqual(before);
});

test("2つのタブ: 片方が「何が」を、もう片方が同じ行の「どのように」を書いても、両方残る", async ({ page, context }) => {
  await openTool(page);
  await importState(page, oldBook());
  const pageB = await context.newPage();
  await openTool(pageB);
  await expect(pageB.locator("#bookSel option:checked")).toHaveText("前の形の表面読み");
  /* 操作するタブを切り替える前に、どのタブからも同じ保存が読めるまで待つ */
  const synced = async () => { const read = p => p.evaluate(k => JSON.stringify([localStorage.getItem(k), localStorage.getItem(k + ".cuts")]), KEY);
    await expect.poll(async () => new Set(await Promise.all([page, pageB].map(read))).size).toBe(1); };
  await synced();
  await what(page, 1).fill("A で書いた主張");
  await synced();
  await how(pageB, 1).fill("B で書いた理由");
  await synced();
  await how(page, 0).fill("A で書いた理由");
  await synced();
  await expect(how(page, 1), "A の画面にも、B の書いた「どのように」が出る").toHaveValue("B で書いた理由");
  await expect(what(pageB, 1)).toHaveValue("A で書いた主張");
  const want = [pair("テスト用の要点 1", "A で書いた理由"), pair("A で書いた主張", "B で書いた理由")];
  expect(await points(page)).toEqual(want);
  await pageB.reload();
  await pageB.locator("#app section").first().waitFor();
  expect(await points(pageB)).toEqual(want);
  expect(await shown(pageB)).toEqual(want.map((o, k) => [String(k + 1), o.what, o.how]));
});

test("「読み込む」の確認（issue #59）: 前の形と直した形、空の組を足しただけの違いは「同じ本」として扱い、確認しない。「どのように」が違えば確認する", async ({ page }) => {
  await openTool(page);
  await importState(page, oldBook());
  const asked = []; let answer = true;
  page.on("dialog", d => { asked.push(d.message()); answer ? d.accept() : d.dismiss(); });
  const F = "```";
  // 前の形のまま、もう一度読み込む。直した形に、空の組を足して読み込む
  await importState(page, oldBook());
  await importState(page, oldBook({ points: [pair("テスト用の要点 1"), pair(""), pair("テスト用の要点 2"), pair("")] }));
  expect(asked, "確認は出ない").toEqual([]);
  expect((await points(page)).length).toBe(4);
  // 「どのように」が違う本は、確認する。やめると、今の内容が残る
  answer = false;
  await paste(page, F + "state\n" + JSON.stringify(oldBook({ points: [pair("テスト用の要点 1", "違う理由"), pair("テスト用の要点 2")] })) + "\n" + F, () => expect.poll(() => asked.length).toBe(1));
  expect(asked[0]).toContain("中身が違う");
  await expect(page.locator("#dlgImport")).toBeHidden();
  expect((await points(page)).map(o => o.how)).toEqual(["", "", "", ""]);
});

test("サンプルの本は、3つの組のどれにも「何が」と「どのように」が入っている。命題があるので、2番目の答えには命題が出る", async ({ page }) => {
  await openTool(page);
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  expect(SAMPLE.v.points.length).toBe(3);
  for (const o of SAMPLE.v.points) { expect(Object.keys(o).sort()).toEqual(["how", "what"]); expect(o.what.trim()).not.toBe(""); expect(o.how.trim()).not.toBe(""); }
  expect(SAMPLE.v.pointsHow).toBeUndefined();
  expect(await shown(page)).toEqual(SAMPLE.v.points.map((o, k) => [String(k + 1), o.what, o.how]));
  await expect(second(page)).toContainText("P1 ");
  await expect(second(page)).not.toContainText("どのように:");
  const md = await markdown(page);
  for (const o of SAMPLE.v.points) expect(md).toContain("\n  - 何が: " + o.what + "\n    - どのように: " + o.how + "\n");
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅では、「何が」と「どのように」の欄が縦に重なり、長い文も全部読めて、横にはみ出さない", async ({ page }) => {
    await openTool(page);
    await importState(page, oldBook({ points: [{ what: "テスト用の主張 1", how: "テスト用の理由 1" }, { what: "あ".repeat(80), how: "い".repeat(80) }] }));
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    const boxes = [];
    for (const i of [0, 1]) {
      const a = await what(page, i).boundingBox(), b = await how(page, i).boundingBox();
      expect(b.y, "行 " + (i + 1) + ": 「どのように」は「何が」の下").toBeGreaterThanOrEqual(a.y + a.height);
      expect(Math.abs(a.x - b.x), "行 " + (i + 1) + ": 2つの欄の左端がそろう").toBeLessThan(2);
      expect(a.width, "欄の幅").toBeGreaterThan(200);
      for (const el of [what(page, i), how(page, i)]) expect(await el.evaluate(o => o.scrollHeight <= o.clientHeight + 1 && o.scrollWidth <= o.clientWidth + 1), "欄の中に、隠れた文がない").toBe(true);
    }
    for (const loc of await hyomen(page).locator('[data-p^="points."], button[data-a="push"], button[data-a="del"]').all()) {
      const b = await loc.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
      expect(b.height, "高さ").toBeGreaterThanOrEqual(24);
      boxes.push(b);
    }
    const hit = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    expect(boxes.filter((a, i) => boxes.some((b, j) => j > i && hit(a, b))).length, "重なっている部品の数").toBe(0);
    // 見出し（「何が」「どのように」）と、行を足すボタンのラベルが、1行に収まる
    for (const loc of await hyomen(page).locator('.pair .cap, button[data-a="push"]').all()) {
      const n = await loc.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map(c => Math.round(c.top))).size; });
      expect(n, "「" + (await loc.textContent()) + "」の行の数").toBe(1);
    }
    await addPair(page, "テスト用の主張 3", "テスト用の理由 3");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Enter で、同じ行の「どのように」へ進む
    await what(page, 2).focus();
    await page.keyboard.press("Enter");
    await expect(how(page, 2)).toBeFocused();
  });
});
