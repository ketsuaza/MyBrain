// 仕様: すべての入力欄に、読み上げられる名前がある（issue #55）。
// 名前は、aria-labelledby、aria-label、label との結びつきのどれかで決まる、空でない文字。placeholder と title は数えない。
// 選んで切り替えるボタンは aria-pressed で、「？」は aria-expanded で、いまの状態を伝える。見た目は変わらない。
const { test, expect } = require("@playwright/test");
const { BOOKLIST, openTool, importState, ruleItem, current } = require("./helpers");

/* 分析読書まで進めた本。どの規則の欄も出るように、部分・区分・問題・命題・根拠・判断を入れてある */
function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "", subs: ["区分A", "区分B"] });
  const prop = (id, sup, judge) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q: "Q1", grounds: [{ t: "根拠A", kind: "理屈" }, { t: "根拠B", kind: "" }], arg: "", judge, why: "", self: "", k12: "", k13: "", k14: "", k15: "" });
  const b = { id: "t-names", meta: { title: "名前のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 3, P: 3 }, purpose: "テスト用の目的", budget: "1時間", judge: "分析読書へ進む", kind: "理論書", ksub: "科学", subject: "テスト", unity: { what: "学問", claim: "学べ" },
      terms: ["用語A", "用語B", "用語C"].map((w, i) => ({ w, m: "意味", p: "1", g: i === 0 })),
      points: ["要点A", "要点B", "要点C"], unclear: ["分からない語A", "分からない語B"],
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1"), part("S3", "第3部", "S2")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "" }],
      solved: { Q1: { s: "一部", aware: "自覚している", why: "" }, Q2: { s: "解決した", aware: "", why: "" } },
      props: [prop("P1", "main", "賛成"), prop("P2", "P1", "反対"), prop("P3", "P2", "判断保留")], restate: { s: "つまり", ex: "たとえば" } } };
  Object.assign(b.v, over || {});
  return b;
}
/* 読み込んだ本が画面に出るまで待つ（importState は今の本の id だけを待つ） */
async function setup(page, book) {
  await openTool(page);
  book = book || base();
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose || "");
}
/* root の中の、目に見える input・textarea・select と、その名前。item は、その欄がある項目（.item）の番号 */
const fields = (page, root) => page.evaluate(sel => {
  const name = el => {
    const by = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map(id => (document.getElementById(id) || {}).textContent || "").join(" ").trim();
    if (by) return by;
    const al = (el.getAttribute("aria-label") || "").trim();
    if (al) return al;
    return [...(el.labels || [])].map(l => l.textContent).join(" ").replace(/\s+/g, " ").trim();
  };
  const top = document.querySelector(sel), items = [...document.querySelectorAll(".item")];
  return [...top.querySelectorAll("input, textarea, select")].filter(el => el.type !== "hidden" && el.getClientRects().length)
    .map(el => ({ tag: el.tagName, p: el.dataset.p || el.name || el.id || "", name: name(el), item: items.indexOf(el.closest(".item")) }));
}, root);
const unnamed = fs => fs.filter(f => !f.name).map(f => f.tag + " " + f.p);
/* 同じ項目の中で、同じ名前の欄 */
function dups(fs) {
  const seen = new Set(), out = [];
  fs.forEach(f => { const k = f.item + "|" + f.name; if (seen.has(k)) out.push(f.name + "（" + f.p + "）"); seen.add(k); });
  return out;
}
/* 選んで切り替えるボタンの、aria-pressed と見た目（選択中の色）が食い違っているもの */
const pressedMismatch = page => page.evaluate(() => [...document.querySelectorAll('#app button[data-a="set"], #app button[data-a="tog"], #app button[data-a="flip"], #app button[data-a="alt"], #app button[data-a="skip"]')]
  .filter(b => b.getAttribute("aria-pressed") !== String(b.classList.contains("on"))).map(b => b.textContent + " " + JSON.stringify(b.dataset) + " aria-pressed=" + b.getAttribute("aria-pressed")));
const toggles = page => page.locator('#app button[data-a="set"], #app button[data-a="tog"], #app button[data-a="flip"], #app button[data-a="alt"], #app button[data-a="skip"]');
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("サンプルの本の画面で、名前のない入力欄が0個。同じ項目の中に、同じ名前の欄がない", async ({ page }) => {
  await openTool(page);
  const fs = await fields(page, "body");
  expect(fs.length, "入力欄の数").toBeGreaterThan(100);
  expect(unnamed(fs), "名前のない入力欄").toEqual([]);
  expect(dups(fs), "同じ項目の中で、名前が重なる欄").toEqual([]);
});

test("3つのダイアログ（本を足す、書誌、読み込む）で、名前のない入力欄が0個", async ({ page }) => {
  await openTool(page);
  await page.click("#btnNew");
  await expect(page.locator("#pickHits tbody tr")).toHaveCount(BOOKLIST.length);
  let fs = await fields(page, "#dlgBook");
  expect(fs.length, "「本を足す」の入力欄の数").toBe(8);
  expect(unnamed(fs), "「本を足す」の、名前のない入力欄").toEqual([]);
  expect(dups(fs)).toEqual([]);
  await page.locator("#formBook").getByRole("button", { name: "やめる" }).click();
  await page.click("#btnEdit");
  await expect(page.locator("#dlgBook")).toBeVisible();
  fs = await fields(page, "#dlgBook");
  expect(fs.length, "「書誌」の入力欄の数").toBe(7);
  expect(unnamed(fs), "「書誌」の、名前のない入力欄").toEqual([]);
  await page.locator("#formBook").getByRole("button", { name: "やめる" }).click();
  await page.click("#btnImport");
  await expect(page.locator("#dlgImport")).toBeVisible();
  fs = await fields(page, "#dlgImport");
  expect(fs.length, "「読み込む」の入力欄の数").toBe(1);
  expect(unnamed(fs), "「読み込む」の、名前のない入力欄").toEqual([]);
  await expect(page.locator("#dlgImport").getByRole("textbox")).toHaveAccessibleName(/\S/);
});

test("分析読書まで進めた本でも、名前のない入力欄が0個。名前に、命題や部分の番号と欄の役目が入り、同じ項目の中で重ならない", async ({ page }) => {
  await setup(page);
  const fs = await fields(page, "body");
  expect(unnamed(fs), "名前のない入力欄").toEqual([]);
  expect(dups(fs), "同じ項目の中で、名前が重なる欄").toEqual([]);
  const nameOf = p => fs.filter(f => f.p === p).map(f => f.name);
  // 行や命題の番号が入る
  for (const [p, re] of [["props.0.t", /P1/], ["props.2.t", /P3/], ["props.1.sup", /P2/], ["props.1.q", /P2/], ["props.1.loc", /P2/], ["parts.1.t", /S2/], ["parts.1.role", /S2/], ["parts.1.to", /S2/], ["parts.1.link", /S2/],
    ["parts.1.sum", /S2/], ["parts.1.rel", /S2/], ["parts.2.subs.1", /S3.*2/], ["qs.2.t", /Q3/], ["qs.2.parent", /Q3/], ["points.1", /2/], ["unclear.0", /1/], ["terms.2.w", /3/], ["terms.2.m", /3/], ["terms.2.p", /3/],
    ["props.1.grounds.1.t", /P2.*2/], ["props.0.arg", /P1/], ["solved.Q1.why", /Q1/], ["props.1.self", /P2/], ["props.2.why", /P3/], ["props.1.k12", /P2.*12/], ["props.1.k14", /P2.*14/], ["props.2.k15", /P3.*15/]]) {
    const ns = nameOf(p);
    expect(ns.length, p + " の欄がある").toBeGreaterThan(0);
    for (const n of ns) expect(n, p + " の名前").toMatch(re);
  }
  // 画面のラベルが、そのまま名前になる欄
  expect(nameOf("purpose")).toEqual(["この本を読む目的"]);
  expect(nameOf("memo")).toEqual(["自由メモ"]);
  // 名前で欄を探せる
  await expect(page.getByRole("textbox", { name: "P2 の命題", exact: true })).toHaveValue("テスト用の命題 P2");
  await expect(page.getByRole("combobox", { name: "S2 の役割", exact: true })).toHaveValue("問題を示す");
  await expect(page.getByRole("textbox", { name: "用語 1 の意味", exact: true })).toHaveCount(2);
  // placeholder は残る
  await expect(page.locator('#sec-a2 input[data-p="props.0.t"]')).toHaveAttribute("placeholder", "命題を自分の言葉で");
});

test("選んで切り替えるボタンの aria-pressed が、選択の状態と合い、押すと変わる", async ({ page }) => {
  await setup(page);
  expect(await toggles(page).count(), "切り替えるボタンの数").toBeGreaterThan(60);
  expect(await pressedMismatch(page), "aria-pressed が見た目と食い違うボタン").toEqual([]);
  const pressed = sel => page.locator(sel).first().getAttribute("aria-pressed");
  // 1つを選ぶボタン（set）。選ぶと、同じ欄のほかのボタンは false になる
  const b1 = 'button[data-a="set"][data-p="budget"][data-val="1時間"]', b3 = 'button[data-a="set"][data-p="budget"][data-val="3時間"]';
  expect([await pressed(b1), await pressed(b3)]).toEqual(["true", "false"]);
  await page.locator(b3).click();
  await expect(page.locator(b3)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(b1)).toHaveAttribute("aria-pressed", "false");
  await page.locator(b3).click();
  await expect(page.locator(b3)).toHaveAttribute("aria-pressed", "false");
  // 「この本にはない」「なかった」「やらない」（alt）、用語集に入れる語（flip）、規則の「やらない」（skip）、規則2の「直した」
  for (const sel of ['button[data-a="alt"][data-p="s1"]', 'button[data-a="alt"][data-p="unclear"]', 'button[data-a="alt"][data-p="action"]', 'button[data-a="flip"][data-p="terms.1.g"]', 'button[data-a="skip"][data-r="7"]', 'button[data-a="set"][data-p="unity2"][data-val="直した"]']) {
    await expect(page.locator(sel), sel).toHaveAttribute("aria-pressed", "false");
    await page.locator(sel).click();
    await expect(page.locator(sel), sel).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(sel), sel).toHaveClass(/on/);
  }
  await expect(page.locator('button[data-a="flip"][data-p="terms.0.g"]')).toHaveAttribute("aria-pressed", "true");
  // 名前（見える文字）は変わらない。状態つきのボタンとして探せる
  await expect(page.locator("#sec-checkin").getByRole("button", { name: "1時間", exact: true, pressed: false })).toHaveCount(1);
  await expect(ruleItem(page, 9).getByRole("button", { name: "賛成", pressed: true })).toHaveCount(1);
  expect(await pressedMismatch(page), "aria-pressed が見た目と食い違うボタン").toEqual([]);
});

test("サンプルの本でも、aria-pressed が選択の状態と合う。文字を打って描き直したあとも合う", async ({ page }) => {
  await openTool(page);
  expect(await pressedMismatch(page)).toEqual([]);
  expect(await page.locator('#app button[aria-pressed="true"]').count(), "選択中のボタンの数").toBeGreaterThan(20);
  // 言い直しを消すと、命題ごとの賛否のボタンが引っ込み、書くと出る（入力のたびの描き直し）
  const ex = ruleItem(page, 9).locator('input[data-p="restate.ex"]');
  const was = await ex.inputValue();
  await ex.fill("");
  await expect(ruleItem(page, 9).locator('button[data-p$=".judge"]')).toHaveCount(0);
  await ex.pressSequentially(was || "たとえば");
  await expect(ruleItem(page, 9).locator('button[data-p$=".judge"]').first()).toBeVisible();
  expect(await pressedMismatch(page)).toEqual([]);
  expect(unnamed(await fields(page, "body"))).toEqual([]);
});

test("「？」の aria-expanded が、説明の開閉と合う", async ({ page }) => {
  await setup(page);
  const all = page.locator('#app button[data-a="help"]');
  expect(await all.count()).toBeGreaterThan(30);
  expect(await all.evaluateAll(bs => bs.filter(b => b.getAttribute("aria-expanded") !== "false").length), "開いていない「？」で、aria-expanded が false でないもの").toBe(0);
  const item = ruleItem(page, 1), q = item.locator('button[data-a="help"]');
  await q.click();
  await expect(item.locator(".help").first()).toContainText("章の中の規則");
  await expect(q).toHaveAttribute("aria-expanded", "true");
  await expect(item.getByRole("button", { name: "説明", expanded: true })).toHaveCount(1);
  expect(await all.evaluateAll(bs => bs.filter(b => b.getAttribute("aria-expanded") === "true").length), "開いている「？」の数").toBe(1);
  await q.click();
  await expect(item).not.toContainText("章の中の規則");
  await expect(q).toHaveAttribute("aria-expanded", "false");
});

test("名前や状態の属性は、見た目に効かない（属性を外しても、部品の大きさと位置が同じで、画面の文字に名前が出ない）", async ({ page }) => {
  await setup(page);
  const boxes = () => page.evaluate(() => [...document.querySelectorAll("#app input, #app textarea, #app select, #app button, #app .item, header *")].map(el => { const r = el.getBoundingClientRect(); return [el.tagName, r.left, r.top + window.scrollY, r.width, r.height].join(","); }));
  const before = await boxes();
  expect(before.length).toBeGreaterThan(300);
  expect(await page.locator("#app").innerText(), "画面の文字").not.toContain("P2 の命題");
  await page.evaluate(() => document.querySelectorAll("#app *").forEach(el => ["aria-label", "aria-pressed", "aria-expanded"].forEach(a => { if (!(a === "aria-label" && el.tagName === "BUTTON")) el.removeAttribute(a); })));
  expect(await boxes()).toEqual(before);
});

test("「この本にはない」「なかった」「やらない」の aria-pressed が、印（v._alt）と合う。隠れている欄を戻すと、内容と名前のある欄が出る", async ({ page }) => {
  // 印は v._alt に持ち、欄の内容は残っている形。s2 は、前の形（欄の値そのものが印）
  const b = base({ _alt: { s1: true, unclear: true, action: true }, s1: "テスト用の序文", s2: "__alt__", unclear: ["分からない語A", "分からない語B"], action: "テスト用のやること", s3: "テスト用の索引" });
  await setup(page, b);
  const btn = k => page.locator(`#app button[data-a="alt"][data-p="${k}"]`);
  const note = ruleItem(page, 5).locator(".note");
  // 印のある欄: ボタンは選択中で、欄は隠れている。印のない欄: 選択中でなく、欄が出ている
  for (const k of ["s1", "s2", "unclear", "action"]) {
    await expect(btn(k), k + " のボタン").toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`#app [data-p="${k}"], #app [data-p^="${k}."]`).and(page.locator("input, textarea")), k + " の欄は隠れている").toHaveCount(0);
  }
  await expect(btn("s3")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('#app textarea[data-p="s3"]')).toHaveValue("テスト用の索引");
  await expect(note, "「なかった」のあいだ、規則5に分からなかった所は出ない").toHaveCount(0);
  expect(await pressedMismatch(page), "aria-pressed が見た目と食い違うボタン").toEqual([]);
  let fs = await fields(page, "body");
  expect(unnamed(fs), "名前のない入力欄").toEqual([]);
  // キーボードで印を外す。フォーカスは押したボタンに残り、内容と名前のある欄が出る
  for (const [k, key] of [["s1", "Space"], ["unclear", "Enter"], ["action", "Space"]]) {
    await btn(k).focus();
    await page.keyboard.press(key);
    await expect(btn(k), k + " のボタン").toHaveAttribute("aria-pressed", "false");
    await expect(btn(k), k + " のボタンにフォーカスが残る").toBeFocused();
  }
  await expect(page.getByRole("textbox", { name: "表題と序文 — 著者が述べている本のねらい", exact: true })).toHaveValue("テスト用の序文");
  await expect(page.getByRole("textbox", { name: "分からなかった所 1", exact: true })).toHaveValue("分からない語A");
  await expect(page.getByRole("textbox", { name: "分からなかった所 2", exact: true })).toHaveValue("分からない語B");
  await expect(page.getByRole("textbox", { name: "やること", exact: true })).toHaveValue("テスト用のやること");
  await expect(note).toHaveText("表面読みで分からなかった所: 分からない語A / 分からない語B");
  fs = await fields(page, "body");
  expect(unnamed(fs), "名前のない入力欄").toEqual([]);
  expect(dups(fs), "同じ項目の中で、名前が重なる欄").toEqual([]);
  expect(await pressedMismatch(page)).toEqual([]);
  // 戻した欄に文字を打つと、それを使う欄（規則5）がその場で最新になる
  const u = page.getByRole("textbox", { name: "分からなかった所 1", exact: true });
  await u.click();
  await u.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.type("を直す");
  await expect(note).toHaveText("表面読みで分からなかった所: 分からない語Aを直す / 分からない語B");
  await expect(u).toBeFocused();
  await expect(btn("unclear")).toHaveAttribute("aria-pressed", "false");
  // 印を付け直すと、選択中になり、欄は隠れる。内容は残る
  await btn("unclear").focus();
  await page.keyboard.press("Space");
  await expect(btn("unclear")).toHaveAttribute("aria-pressed", "true");
  await expect(btn("unclear")).toBeFocused();
  await expect(note).toHaveCount(0);
  await expect(page.locator('#app input[data-p^="unclear."]')).toHaveCount(0);
  const v = (await current(page)).v;
  expect([v._alt, v.unclear, v.s1, v.s2]).toEqual([{ s2: true, unclear: true }, ["分からない語Aを直す", "分からない語B"], "テスト用の序文", ""]);
  expect(await pressedMismatch(page)).toEqual([]);
  expect(unnamed(await fields(page, "body"))).toEqual([]);
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px の幅でも、名前のない入力欄が0個で、aria-pressed と aria-expanded が状態と合い、横にはみ出さない", async ({ page }) => {
    await setup(page);
    const fs = await fields(page, "body");
    expect(unnamed(fs), "名前のない入力欄").toEqual([]);
    expect(dups(fs)).toEqual([]);
    expect(await pressedMismatch(page)).toEqual([]);
    const q = ruleItem(page, 6).locator('button[data-a="help"]');
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await page.click("#btnImport");
    expect(unnamed(await fields(page, "#dlgImport")), "「読み込む」の、名前のない入力欄").toEqual([]);
    await page.locator("#formImport").getByRole("button", { name: "やめる" }).click();
    await page.click("#btnNew");
    await expect(page.locator("#pickHits tbody tr")).toHaveCount(BOOKLIST.length);
    expect(unnamed(await fields(page, "#dlgBook")), "「本を足す」の、名前のない入力欄").toEqual([]);
    await page.locator("#formBook").getByRole("button", { name: "やめる" }).click();
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
