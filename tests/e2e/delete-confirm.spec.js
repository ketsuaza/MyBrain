// 仕様: 中身のある命題・部分・問題の「×」を押すと、消す前に確認が出る（issue #61）。
// 「やめる」を選ぶと、何も消えない。何も書いていない行（足したばかりの行）は、確認なしで消える。用語、根拠、区分、表面読みの行は、これまでどおり確認なし。
// フォーカスの決まり（issue #54、#75）は変わらない: キーボードで受けたあとは次の行の「×」、やめたあとは押した「×」、マウスで受けたあとはどこにも置かない。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current, loadWindowJs } = require("./helpers");

const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "", subs: ["区分A"] });
  const prop = (id, sup) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q: "Q1", grounds: [{ t: "根拠A", kind: "" }], arg: "", judge: "", why: "", self: "" });
  const b = { id: "t-delconfirm", meta: { title: "消す前の確認のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 3, P: 3 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", subject: "テスト", unity: { what: "学問", claim: "学べ" },
      terms: ["用語A", "用語B"].map(w => ({ w, m: "意味", p: "1", g: false })), points: ["要点A", "要点B"], unclear: ["分からない語A"],
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1"), part("S3", "第3部", "S2")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "" }, { id: "Q3", t: "問いの三", parent: "" }],
      solved: { Q2: { s: "一部", aware: "自覚している", why: "テスト用の理由" } },
      props: [prop("P1", "main"), prop("P2", "P1"), prop("P3", "P2")], restate: { s: "つまり", ex: "たとえば" } } };
  Object.assign(b.v, over || {});
  return b;
}
async function setup(page, book) {
  await openTool(page);
  book = book || base();
  await importState(page, book);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose || "");
}
/* 出た確認を集め、answer() の答えで閉じる（true は受ける、false はやめる） */
function watch(page, answer) {
  const seen = [];
  page.on("dialog", d => { seen.push({ type: d.type(), text: d.message() }); if (answer()) d.accept(); else d.dismiss(); });
  return seen;
}
const x = (page, p, i) => page.locator('#app button[data-a="del"][data-p="' + p + '"][data-i="' + i + '"]').first();
const ids = async (page, k) => (await current(page)).v[k].map(o => o.id);
const active = page => page.evaluate(() => { const el = document.activeElement; return { tag: el.tagName, a: el.dataset.a, p: el.dataset.p, i: el.dataset.i }; });
const scrollY = page => page.evaluate(() => window.scrollY);

test("issue の手順: サンプルの本の規則6の P1 の「×」を押すと、確認が出る。やめると、規則7、規則9〜15の P1 の内容も残る", async ({ page }) => {
  await openTool(page);
  let ok = false; const seen = watch(page, () => ok);
  const before = await current(page), raw = await page.evaluate(() => localStorage.getItem("dokusho-memo.v2"));
  const p1 = before.v.props[0];
  await ruleItem(page, 6).locator('button[data-a="del"][data-p="props"][data-i="0"]').click();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0].type).toBe("confirm");
  expect(seen[0].text, "確認の文に、番号と命題の文が入る").toContain(p1.id + "「" + p1.t + "」");
  expect(await current(page), "やめたので、何も変わらない").toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem("dokusho-memo.v2"))).toBe(raw);
  await expect(ruleItem(page, 6).locator('[data-p="props.0.t"]')).toHaveValue(p1.t);
  await expect(ruleItem(page, 7).locator(".card").first()).toContainText(p1.t);
  // 受けると、P1 が消え、P1 を支えていた命題の位置づけが空になる（これまでどおり）
  ok = true;
  await ruleItem(page, 6).locator('button[data-a="del"][data-p="props"][data-i="0"]').click();
  await expect.poll(() => ids(page, "props")).toEqual(before.v.props.slice(1).map(p => p.id));
  expect(seen.length).toBe(2);
  expect((await current(page)).v.props.some(p => p.sup === p1.id)).toBe(false);
});

test("命題、部分、問題のどれでも、中身のある行は確認が出て、やめると消えない。受けると、その行だけが消える", async ({ page }) => {
  await setup(page);
  let ok = false; const seen = watch(page, () => ok);
  const before = await current(page);
  for (const [k, i, id, text] of [["props", 1, "P2", "テスト用の命題 P2"], ["parts", 1, "S2", "第2部"], ["qs", 1, "Q2", "問いの二"]]) {
    seen.length = 0; ok = false;
    await x(page, k, i).click();
    await expect.poll(() => seen.length, k).toBe(1);
    expect(seen[0].text).toContain(id + "「" + text + "」");
    expect(await current(page), k + ": やめると変わらない").toEqual(before);
  }
  ok = true;
  for (const [k, i, rest] of [["props", 1, ["P1", "P3"]], ["parts", 1, ["S1", "S3"]], ["qs", 1, ["Q1", "Q3"]]]) {
    seen.length = 0;
    await x(page, k, i).click();
    await expect.poll(() => ids(page, k)).toEqual(rest);
    expect(seen.length, k + ": 確認は1回").toBe(1);
  }
  const after = await current(page);
  // 消した行を指していた参照は、これまでどおり空になる
  expect(after.v.props.find(p => p.id === "P3").sup).toBe("");
  expect(after.v.parts.find(o => o.id === "S3")).toMatchObject({ to: "", link: "" });
  expect(after.v.solved.Q2).toBeUndefined();
});

test("何も書いていない行（足したばかりの行）は、確認なしで消える。部分の「どの部分と」の初期値だけでは、中身として扱わない", async ({ page }) => {
  await setup(page);
  const seen = watch(page, () => false);
  for (const [k, n] of [["props", 3], ["parts", 3], ["qs", 3]]) {
    // 規則4には、「＋ 主な問い」のほかに、主な問いごとの「＋ Q1 に従属する問い」（data-parent つき）がある（#77）。ここでは「＋ 主な問い」を押す
    await page.locator('#app button[data-a="push"][data-p="' + k + '"]:not([data-parent])').click();
    await expect.poll(async () => (await current(page)).v[k].length).toBe(n + 1);
    if (k === "parts") expect((await current(page)).v.parts[3].to, "足した部分には、前の部分が初期値で入っている").toBe("S3");
    await x(page, k, n).click();
    await expect.poll(async () => (await current(page)).v[k].length, k).toBe(n);
  }
  expect(seen, "確認は出ない").toEqual([]);
});

test("文が空でも、ほかに書いたり選んだりした値が1つでもあれば、確認が出る", async ({ page }) => {
  const blankP = (id, over) => Object.assign({ id, t: "", loc: "", sup: "", q: "", grounds: [], arg: "", judge: "", why: "", self: "", k12: "", k13: "", k14: "", k15: "" }, over);
  const blankS = (id, over) => Object.assign({ id, t: "", role: "", to: "", link: "", sum: "", rel: "", subs: [] }, over);
  const props = [{ loc: "1章" }, { sup: "main" }, { q: "Q1" }, { grounds: [{ t: "根拠", kind: "" }] }, { grounds: [{ t: "", kind: "理屈" }] }, { arg: "論証" }, { judge: "反対" }, { why: "理由" }, { self: "検討" }, { k12: "a" }, { k13: "a" }, { k14: "a" }, { k15: "a" }];
  const parts = [{ role: "まとめる" }, { to: "none" }, { link: "と並ぶ" }, { sum: "概要" }, { rel: "受け持つ所" }, { subs: ["", "区分"] }];
  const book = base({ props: props.map((o, i) => blankP("P" + (i + 1), o)).concat([blankP("P90", { grounds: [{ t: "", kind: "" }] })]),
    parts: parts.map((o, i) => blankS("S" + (i + 1), o)).concat([blankS("S90", { to: "S1", subs: ["", " "] })]),
    // 問題の従属先は、行を足す場所で決まる値になった（#77）ので、中身には数えない。利用者が選ぶ値は、型（type）
    qs: [{ id: "Q1", t: "", parent: "", type: "原因" }, { id: "Q2", t: "", parent: "" }, { id: "Q3", t: "", parent: "" }, { id: "Q4", t: "", parent: "" }, { id: "Q5", t: "", parent: "" }, { id: "Q9", t: "問いの九", parent: "" }],
    solved: { Q2: { s: "未解決", aware: "", why: "" }, Q3: { s: "", aware: "", why: "理由" }, Q4: { s: "", aware: "分からない", why: "" }, Q5: { s: "", aware: "", why: "" } } });
  await setup(page, book);
  const seen = watch(page, () => false);
  const before = await current(page);
  const want = { props: props.length, parts: parts.length, qs: 4 };
  for (const k of ["props", "parts", "qs"]) {
    for (let i = 0; i < before.v[k].length; i++) {
      if (before.v[k][i].id === "Q9") continue;
      seen.length = 0;
      await x(page, k, i).click();
      if (i < want[k]) await expect.poll(() => seen.length, k + " の " + before.v[k][i].id + " には確認が出る").toBe(1);
    }
  }
  // ここまで、やめ続けた。中身のない行（空の根拠の行だけの命題、初期値と空の区分だけの部分、規則8が空の問題）だけが消えている
  await expect.poll(() => ids(page, "props")).toEqual(before.v.props.slice(0, -1).map(o => o.id));
  expect(await ids(page, "parts")).toEqual(before.v.parts.slice(0, -1).map(o => o.id));
  expect(await ids(page, "qs")).toEqual(["Q1", "Q2", "Q3", "Q4", "Q9"]);
});

test("見張り: 用語、根拠、区分、表面読み、分からなかった所の行は、書いてあっても、これまでどおり確認なしで消える", async ({ page }) => {
  await setup(page);
  const seen = watch(page, () => false);
  for (const [p, key] of [["terms", v => v.terms], ["props.0.grounds", v => v.props[0].grounds], ["parts.0.subs", v => v.parts[0].subs], ["points", v => v.points], ["unclear", v => v.unclear]]) {
    const n = key((await current(page)).v).length;
    await x(page, p, 0).click();
    await expect.poll(async () => key((await current(page)).v).length, p).toBe(n - 1);
  }
  expect(seen).toEqual([]);
});

test("キーボードで「×」を押して確認を受けると、次の行の「×」にフォーカスがある。やめると、押した「×」にフォーカスが残り、画面は動かない", async ({ page }) => {
  await setup(page);
  let ok = false; const seen = watch(page, () => ok);
  for (const [k, key] of [["props", "Enter"], ["parts", " "], ["qs", "Enter"]]) {
    ok = false; seen.length = 0;
    const b = x(page, k, 0);
    await b.focus();
    await b.evaluate(el => { el.__same = true; });
    const y = await scrollY(page), before = await current(page);
    await page.keyboard.press(key);
    await expect.poll(() => seen.length, k).toBe(1);
    expect(await current(page)).toEqual(before);
    expect(await page.evaluate(() => document.activeElement.__same === true), k + ": やめたあと、押した「×」が同じ部品のままフォーカスを持つ").toBe(true);
    expect(await scrollY(page)).toBe(y);
    // 受けると、先頭の行が消え、同じ位置に来た次の行の「×」にフォーカスがある
    ok = true;
    await page.keyboard.press(key);
    await expect.poll(async () => (await ids(page, k)).length, k).toBe(2);
    expect(seen.length, k + ": 確認は、押すたびに1回").toBe(2);
    expect(await active(page)).toEqual({ tag: "BUTTON", a: "del", p: k, i: "0" });
    expect(await scrollY(page), k + ": フォーカスのある部品が見えているので、画面は動かない").toBe(y);
  }
});

test("「×」で Enter を押したままにしても、確認は1回だけ出て、消えるのは1行だけ。やめたときは、1行も消えない", async ({ page }) => {
  await setup(page);
  let ok = true; const seen = watch(page, () => ok);
  await x(page, "props", 0).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.down("Enter"); // 2回目からは、押したまま（repeat）
  await page.keyboard.up("Enter");
  await expect.poll(() => ids(page, "props")).toEqual(["P2", "P3"]);
  expect(seen.length, "確認は1回だけ").toBe(1);
  expect(await active(page)).toEqual({ tag: "BUTTON", a: "del", p: "props", i: "0" });
  // やめたあとに押したままにしても、確認は増えず、消えない
  ok = false; seen.length = 0;
  for (let i = 0; i < 5; i++) await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect.poll(() => seen.length).toBe(1);
  expect(await ids(page, "props")).toEqual(["P2", "P3"]);
  expect(await active(page)).toEqual({ tag: "BUTTON", a: "del", p: "props", i: "0" });
});

test("マウスで「×」を押して確認を受けたあとは、どの「×」にもフォーカスを置かない。続く Space と Enter で、別の行が消えず、確認も出ない", async ({ page }) => {
  await setup(page);
  const seen = watch(page, () => true);
  await x(page, "props", 0).click();
  await expect.poll(() => ids(page, "props")).toEqual(["P2", "P3"]);
  expect((await active(page)).a, "「×」にフォーカスがない").toBeUndefined();
  await page.keyboard.press(" ");
  await page.keyboard.press("Enter");
  expect(await ids(page, "props")).toEqual(["P2", "P3"]);
  expect(seen.length).toBe(1);
});

test("見出しのすぐ下の、末尾の部分の「×」を Enter で押して確認を受けると、前の行の「×」にフォーカスが移り、見出しの下に見えている（#75）", async ({ page }) => {
  await openTool(page);
  const seen = watch(page, () => true);
  const last = SAMPLE.v.parts.length - 1;
  const b = ruleItem(page, 3).locator('button[data-a="del"][data-p="parts"][data-i="' + last + '"]');
  await b.evaluate(el => { window.scrollBy(0, el.getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom - 8); el.focus({ preventScroll: true }); });
  await expect(b).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => ids(page, "parts")).toEqual(SAMPLE.v.parts.slice(0, -1).map(o => o.id));
  expect(seen.length).toBe(1);
  const w = await page.evaluate(() => { const el = document.activeElement, r = el.getBoundingClientRect();
    return { a: el.dataset.a, p: el.dataset.p, i: el.dataset.i, top: r.top, bottom: r.bottom, head: document.querySelector("header").getBoundingClientRect().bottom, vh: window.innerHeight }; });
  expect({ a: w.a, p: w.p, i: w.i }).toEqual({ a: "del", p: "parts", i: String(last - 1) });
  expect(w.top, "フォーカスのある「×」が、見出しの下に見えている").toBeGreaterThanOrEqual(w.head);
  expect(w.bottom).toBeLessThanOrEqual(w.vh);
});

test("確認の文には、読み込んだ文がそのまま入り、画面には HTML として出ない", async ({ page }) => {
  const evil = '<img src=x onerror="__xss=1"> & "引用"';
  const book = base(); book.v.props[0].t = evil;
  await setup(page, book);
  const seen = watch(page, () => false);
  await x(page, "props", 0).click();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0].text).toContain("P1「" + evil + "」");
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、中身のある命題の「×」には確認が出て、やめると消えず、横にはみ出さない", async ({ page }) => {
    await setup(page);
    let ok = false; const seen = watch(page, () => ok);
    await x(page, "props", 0).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(await ids(page, "props")).toEqual(["P1", "P2", "P3"]);
    ok = true;
    await x(page, "props", 0).click();
    await expect.poll(() => ids(page, "props")).toEqual(["P2", "P3"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
