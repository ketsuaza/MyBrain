// 仕様: 文を消した命題や部分への参照は、画面でも Markdown でも、未選択として扱う（issue #58）。
// 文を空にするだけで、「×」では消さない。保存された値は残るので、相手の文を書き直すと、参照が元どおり出る。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "", subs: [] });
  const prop = (id, sup, q) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q, grounds: [], arg: "", judge: "", why: "", self: "", k12: "", k13: "", k14: "", k15: "" });
  const b = { id: "t-refs", meta: { title: "参照のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 3, P: 3 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", unity: { what: "学問", claim: "学べ" },
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1"), part("S3", "第3部", "S2")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "Q1" }, { id: "Q3", t: "問いの三", parent: "Q1" }],
      props: [prop("P1", "main", "Q1"), prop("P2", "P1", "Q2"), prop("P3", "P2", "Q1")] } };
  Object.assign(b.v, over || {});
  return b;
}
/* 読み込んだ本が画面に出るまで待つ（importState は今の本の id だけを待つ） */
async function setup(page, book) {
  await openTool(page);
  book = book || base();
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose);
}
const markdown = page => page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
/* 規則 r が「済み」か */
const done = (page, r) => page.evaluate(r => window.__dokusho.done()[r], r);
/* Markdown の、規則 r の欄の行（次の欄の手前まで） */
async function mdRule(page, r) {
  const ls = (await markdown(page)).split("\n"), i = ls.findIndex(l => l.startsWith("- 規則" + r + " "));
  const out = []; for (let j = i + 1; j < ls.length && /^\s+\S/.test(ls[j]); j++) out.push(ls[j].trim());
  return out;
}
/* 欄の文を、キーボードで全部消す／書き直す（入力のたびの描き直しを通る）。欄にはフォーカスが残る */
async function retype(page, loc, text) {
  await loc.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  if (text) await page.keyboard.type(text);
  await expect(loc).toHaveValue(text);
  await expect(loc).toBeFocused();
}
async function reopen(page) {
  await page.reload();
  await page.locator("#app section").first().waitFor();
  await expect(page.locator("#bookSel option:checked")).toContainText("参照のテスト");
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("命題: 支える相手の文を空にすると、位置づけが未選択に見え、Markdown に参照が出ず、規則6の「済み」が外れる。書き直すと元に戻る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 6), sup = item.locator('select[data-p="props.2.sup"]'), p2 = item.locator('[data-p="props.1.t"]');
  const full = ["- P1 テスト用の命題 P1（中心の主張）〔Q1 に答える〕［1章］", "- P2 テスト用の命題 P2（P1 を支える）〔Q2 に答える〕［1章］", "- P3 テスト用の命題 P3（P2 を支える）〔Q1 に答える〕［1章］"];
  const emptied = [full[0], "- P3 テスト用の命題 P3〔Q1 に答える〕［1章］"];
  const expectEmptied = async when => {
    await expect(sup, when + ": 位置づけのプルダウン").toHaveValue("");
    await expect(sup.locator("option:checked")).toHaveText("選ぶ");
    expect(await mdRule(page, 6), when + ": Markdown の規則6").toEqual(emptied);
    expect(await done(page, 6), when + ": 規則6が済みか").toBe(false);
    // 連なりの図でも、P3 は P2 の下にぶら下がらない
    await expect(ruleItem(page, 7).locator(".chain > div")).toHaveText(["P1 テスト用の命題 P1（中心の主張）", "P3 テスト用の命題 P3"]);
    expect(await mdRule(page, 7), when + ": Markdown の規則7").toEqual(["- P1 テスト用の命題 P1（中心の主張）", "- P3 テスト用の命題 P3"]);
    expect((await current(page)).v.props[2].sup, when + ": 保存された値は残る").toBe("P2");
  };
  const expectFull = async when => {
    await expect(sup, when + ": 位置づけのプルダウン").toHaveValue("P2");
    expect(await mdRule(page, 6), when + ": Markdown の規則6").toEqual(full);
    expect(await done(page, 6), when + ": 規則6が済みか").toBe(true);
    await expect(ruleItem(page, 7).locator(".chain > div")).toHaveText(["P1 テスト用の命題 P1（中心の主張）", "← P2 テスト用の命題 P2", "← P3 テスト用の命題 P3"]);
  };
  await expectFull("はじめ");
  const before = await page.locator("#prog").innerText();
  await retype(page, p2, "");
  await expectEmptied("P2 の文を空にしたあと");
  expect(await page.locator("#prog").innerText(), "進み具合の数が変わる").not.toBe(before);
  await reopen(page);
  await expectEmptied("開き直したあと");
  await retype(page, p2, "テスト用の命題 P2");
  await expectFull("P2 の文を書き直したあと");
  expect(await page.locator("#prog").innerText()).toBe(before);
  await reopen(page);
  await expectFull("書き直して、開き直したあと");
});

test("部分: つながる相手の名前を空にすると、「どの部分と」が未選択に見え、Markdown に参照が出ず、規則3の「済み」が外れる。書き直すと元に戻る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 3), to = item.locator('select[data-p="parts.2.to"]'), link = item.locator('select[data-p="parts.2.link"]'), s2 = item.locator('input[data-p="parts.1.t"]');
  const full = ["- S1 第1部 — 問題を示す", "概要: 概要 S1", "- S2 第2部 — 問題を示す（S1 を受けて進める）", "概要: 概要 S2", "- S3 第3部 — 問題を示す（S2 を受けて進める）", "概要: 概要 S3"];
  const emptied = ["- S1 第1部 — 問題を示す", "概要: 概要 S1", "- S3 第3部 — 問題を示す", "概要: 概要 S3"];
  const expectEmptied = async when => {
    await expect(to, when + ": 「どの部分と」のプルダウン").toHaveValue("");
    await expect(to.locator("option:checked")).toHaveText("どの部分と");
    await expect(link, when + ": 「どうつながる」のプルダウンは出ない").toHaveCount(0);
    expect(await mdRule(page, 3), when + ": Markdown の規則3").toEqual(emptied);
    expect(await done(page, 3), when + ": 規則3が済みか").toBe(false);
    await expect(ruleItem(page, 2).getByRole("button", { name: "このままでよい" }), when + ": 規則2のボタンは押せない").toBeDisabled();
    const p = (await current(page)).v.parts[2];
    expect([p.to, p.link], when + ": 保存された値は残る").toEqual(["S2", "を受けて進める"]);
  };
  const expectFull = async when => {
    await expect(to, when + ": 「どの部分と」のプルダウン").toHaveValue("S2");
    await expect(link, when + ": 「どうつながる」のプルダウン").toHaveValue("を受けて進める");
    expect(await mdRule(page, 3), when + ": Markdown の規則3").toEqual(full);
    expect(await done(page, 3), when + ": 規則3が済みか").toBe(true);
    await expect(ruleItem(page, 2).getByRole("button", { name: "このままでよい" })).toBeEnabled();
  };
  await expectFull("はじめ");
  await retype(page, s2, "");
  await expectEmptied("S2 の名前を空にしたあと");
  await reopen(page);
  await expectEmptied("開き直したあと");
  await retype(page, s2, "第2部");
  await expectFull("S2 の名前を書き直したあと");
  await reopen(page);
  await expectFull("書き直して、開き直したあと");
  // 相手を選び直すと、選び直した相手が出る（保存された値は、選び直したものに変わる）
  await retype(page, s2, "");
  await to.selectOption("S1");
  await expect(item.locator('select[data-p="parts.2.link"]')).toHaveValue("を受けて進める");
  expect(await mdRule(page, 3)).toEqual(["- S1 第1部 — 問題を示す", "概要: 概要 S1", "- S3 第3部 — 問題を示す（S1 を受けて進める）", "概要: 概要 S3"]);
  expect(await done(page, 3)).toBe(true);
});

test("問題: 文を空にした問題への「答える問題」と「従属」も、未選択として扱う。書き直すと元に戻る", async ({ page }) => {
  await setup(page);
  const q1 = ruleItem(page, 4).locator('[data-p="qs.0.t"]'), ans = ruleItem(page, 6).locator('select[data-p="props.0.q"]');
  // 主か従かは、規則4の行の並びに出る（#77。従属先のプルダウンはない）
  const shown = () => ruleItem(page, 4).locator(".qrow").evaluateAll(els => els.map(el => el.querySelector(".rule").textContent + (el.classList.contains("sub") ? " 従" : " 主")));
  const expectFull = async when => {
    expect(await shown(), when + ": 規則4の並び").toEqual(["Q1 主", "Q2 従", "Q3 従"]);
    await expect(ans, when + ": 答える問題のプルダウン").toHaveValue("Q1");
    expect(await mdRule(page, 4), when + ": Markdown の規則4").toEqual(["- Q1 問いの一（主な問い）", "- Q2 問いの二（Q1 に従属）", "- Q3 問いの三（Q1 に従属）"]);
    expect((await mdRule(page, 6))[0], when + ": Markdown の規則6").toBe("- P1 テスト用の命題 P1（中心の主張）〔Q1 に答える〕［1章］");
    expect(await done(page, 4), when + ": 規則4が済みか").toBe(true);
  };
  await expectFull("はじめ");
  await retype(page, q1, "");
  const expectEmptied = async when => {
    expect(await shown(), when + ": 規則4の並び").toEqual(["Q1 主", "Q2 主", "Q3 主"]);
    await expect(ans, when + ": 答える問題のプルダウン").toHaveValue("");
    await expect(ans.locator("option:checked")).toHaveText("なし");
    expect(await mdRule(page, 4), when + ": Markdown の規則4").toEqual(["- Q2 問いの二（主な問い）", "- Q3 問いの三（主な問い）"]);
    expect(await mdRule(page, 6), when + ": Markdown の規則6").toEqual(["- P1 テスト用の命題 P1（中心の主張）［1章］", "- P2 テスト用の命題 P2（P1 を支える）〔Q2 に答える〕［1章］", "- P3 テスト用の命題 P3（P2 を支える）［1章］"]);
    // 画面では、残った問題はどちらも「主な問い」に見える。規則4の「済み」も、それに合う
    expect(await done(page, 4), when + ": 規則4が済みか").toBe(true);
    const b = await current(page);
    expect([b.v.qs[1].parent, b.v.qs[2].parent, b.v.props[0].q, b.v.props[2].q], when + ": 保存された値は残る").toEqual(["Q1", "Q1", "Q1", "Q1"]);
  };
  await expectEmptied("Q1 の文を空にしたあと");
  await reopen(page);
  await expectEmptied("開き直したあと");
  await retype(page, q1, "問いの一");
  await expectFull("Q1 の文を書き直したあと");
  await reopen(page);
  await expectFull("書き直して、開き直したあと");
});

test("読み込んだ読書メモで、相手の文が空の参照や、相手のいない参照があっても、Markdown には出ない", async ({ page }) => {
  const b = base();
  b.v.props[1].t = ""; b.v.parts[1].t = ""; b.v.qs[0].t = "";
  b.v.props.push(Object.assign({}, b.v.props[0], { id: "P4", t: "テスト用の命題 P4", sup: "P9", q: "Q9" }), Object.assign({}, b.v.props[0], { id: "P5", t: "テスト用の命題 P5", sup: "P5", q: "" }), Object.assign({}, b.v.props[0], { id: "P6", t: "テスト用の命題 P6", sup: "none", q: "" }));
  await setup(page, b);
  expect(await mdRule(page, 6)).toEqual(["- P1 テスト用の命題 P1（中心の主張）［1章］", "- P3 テスト用の命題 P3［1章］", "- P4 テスト用の命題 P4［1章］", "- P5 テスト用の命題 P5［1章］", "- P6 テスト用の命題 P6（つながり不明）［1章］"]);
  expect(await mdRule(page, 3)).toEqual(["- S1 第1部 — 問題を示す", "概要: 概要 S1", "- S3 第3部 — 問題を示す", "概要: 概要 S3"]);
  expect(await mdRule(page, 4)).toEqual(["- Q2 問いの二（主な問い）", "- Q3 問いの三（主な問い）"]);
  for (const i of [2, 3, 4]) await expect(ruleItem(page, 6).locator(`select[data-p="props.${i}.sup"]`)).toHaveValue("");
  await expect(ruleItem(page, 6).locator('select[data-p="props.5.sup"]')).toHaveValue("none");
  expect(await done(page, 6)).toBe(false);
  const v = (await current(page)).v;
  expect([v.props, v.parts, v.qs], "読み込んだ命題・部分・問題の値は変えない").toEqual([b.v.props, b.v.parts, b.v.qs]);
});

test("これまでどおり: 「×」で消したときは、参照を外す（命題、部分、問題）", async ({ page }) => {
  page.on("dialog", d => d.accept()); // 中身のある命題・部分・問題を消す前の確認（#61）を受ける
  await setup(page);
  await ruleItem(page, 6).locator('button[data-a="del"][data-p="props"][data-i="1"]').click();
  await ruleItem(page, 3).locator('button[data-a="del"][data-p="parts"][data-i="1"]').click();
  await ruleItem(page, 4).locator('button[data-a="del"][data-p="qs"][data-i="0"]').click();
  const v = (await current(page)).v;
  expect(v.props.map(p => [p.id, p.sup, p.q])).toEqual([["P1", "main", ""], ["P3", "", ""]]);
  expect(v.parts.map(o => [o.id, o.to, o.link])).toEqual([["S1", "", ""], ["S3", "", ""]]);
  // 問題の「×」は、ほかの問題の「従属」の値を外さない（これまでどおり）。消えた問題への従属は、未選択（主な問い）として出る
  expect(v.qs.map(o => [o.id, o.parent])).toEqual([["Q2", "Q1"], ["Q3", "Q1"]]);
  expect(await mdRule(page, 6)).toEqual(["- P1 テスト用の命題 P1（中心の主張）［1章］", "- P3 テスト用の命題 P3［1章］"]);
  expect(await mdRule(page, 4)).toEqual(["- Q2 問いの二（主な問い）", "- Q3 問いの三（主な問い）"]);
  await expect(ruleItem(page, 6).locator('select[data-p="props.1.sup"]')).toHaveValue("");
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、相手の文を空にすると未選択に見え、書き直すと戻り、横にはみ出さない", async ({ page }) => {
    await setup(page);
    const s2 = ruleItem(page, 3).locator('input[data-p="parts.1.t"]'), to = ruleItem(page, 3).locator('select[data-p="parts.2.to"]'), link = ruleItem(page, 3).locator('select[data-p="parts.2.link"]');
    await retype(page, s2, "");
    await expect(to).toHaveValue("");
    await expect(link).toHaveCount(0);
    expect(await mdRule(page, 3)).not.toContain("- S3 第3部 — 問題を示す（S2 を受けて進める）");
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    await retype(page, s2, "第2部");
    await expect(to).toHaveValue("S2");
    await expect(link).toHaveValue("を受けて進める");
    expect(await mdRule(page, 3)).toContain("- S3 第3部 — 問題を示す（S2 を受けて進める）");
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
