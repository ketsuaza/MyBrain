// 仕様: 分析読書の各規則の欄が、まとめと章の中の規則が求めることを満たす（専門家の評価の改善案1〜10）。
// 済みかどうかは window.__dokusho.done()（規則番号 → 済み）で見る。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current, shot } = require("./helpers");

function base(over) {
  const b = { id: "t-analytic", meta: { title: "分析のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 2, Q: 2, P: 3 }, judge: "分析読書へ進む", kind: "理論書", unity: { what: "学問", claim: "学べ" }, unclear: ["難しい語X"],
      parts: [{ id: "S1", t: "第1部", role: "問題を示す", to: "", link: "" }, { id: "S2", t: "第2部", role: "主張を述べる", to: "S1", link: "を受けて進める" }],
      qs: [{ id: "Q1", t: "問いの一" }, { id: "Q2", t: "問いの二" }],
      props: [{ id: "P1", t: "中心の命題", sup: "main", q: "Q1", grounds: [] }, { id: "P2", t: "支える命題", sup: "P1", q: "Q1", grounds: [] }, { id: "P3", t: "もう一つ支える命題", sup: "P2", q: "", grounds: [] }] } };
  return Object.assign(b, over || {});
}
const done = page => page.evaluate(() => window.__dokusho.done());
async function setup(page, over) { await openTool(page); await importState(page, base(over)); }
const fillP = (page, p, v) => page.locator(`[data-p="${p}"]`).first().fill(v);
const chip = (page, p, val) => page.locator(`#sec-a1 button[data-p="${p}"][data-val="${val}"], #sec-a2 button[data-p="${p}"][data-val="${val}"], #sec-a3 button[data-p="${p}"][data-val="${val}"], #sec-a4 button[data-p="${p}"][data-val="${val}"]`).click();

test("規則1: 「まだ分からない」では済みにならず、理論書は歴史・科学・哲学を選ぶ。文学と実践書の注意は出ない（issue #73）", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 1);
  await fillP(page, "subject", "教育");
  await chip(page, "kind", "まだ分からない");
  expect((await done(page))[1]).toBe(false);
  await chip(page, "kind", "理論書");
  for (const s of ["歴史", "科学", "哲学"]) await expect(item.locator(`button[data-p="ksub"][data-val="${s}"]`)).toBeVisible();
  expect((await done(page))[1], "下位の区分を選ぶまでは済みでない").toBe(false);
  await chip(page, "ksub", "哲学");
  expect((await done(page))[1]).toBe(true);
  await chip(page, "kind", "文学");
  await expect(item.locator('button[data-p="kind"][data-val="文学"]')).toHaveAttribute("aria-pressed", "true");
  await expect(item).not.toContainText("文学には、分析読書の規則がそのままは当てはまらない");
  await chip(page, "kind", "実践書");
  await expect(item.locator('button[data-p="kind"][data-val="実践書"]')).toHaveAttribute("aria-pressed", "true");
  await expect(item).not.toContainText("著者は読者に何をさせたいか");
  await expect(ruleItem(page, 4)).not.toContainText("著者は読者に何をさせたいか");
});

test("規則2: 下読みの答えとは別に持ち、規則3を埋めるまでは確かめられない", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 2);
  await expect(item.locator('input[data-p="unityA.what"]')).toHaveValue("学問");
  await fillP(page, "unityA.claim", "実学を学べ");
  expect((await current(page)).v.unity.claim, "下読みの仮の答えは残る").toBe("学べ");
  const ok = item.locator('button[data-p="unity2"][data-val="このままでよい"]');
  await expect(ok).toBeDisabled();
  await expect(item).toContainText("規則3を埋めてから");
  for (const i of [0, 1]) await fillP(page, `parts.${i}.sum`, "この部分の要約");
  await ruleItem(page, 3).locator('select[data-p="parts.0.role"]').selectOption("問題を示す"); // 描き直す
  await expect(ok).toBeEnabled();
  await ok.click();
  expect((await done(page))[2]).toBe(true);
});

test("規則3: 部分ごとに概要が要り、統一の文のどこを受け持つかと、下位の区分を書ける", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 3);
  expect((await done(page))[3], "概要がないうちは済みでない").toBe(false);
  for (const i of [0, 1]) { await fillP(page, `parts.${i}.sum`, `S${i + 1} の概要`); await fillP(page, `parts.${i}.rel`, "統一の「学べ」"); }
  await item.locator('button[data-a="push"][data-p="parts.0.subs"]').click();
  await fillP(page, "parts.0.subs.0", "第1部の第1区分");
  expect((await done(page))[3]).toBe(true);
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("S1 第1部 — 問題を示す");
  expect(md).toContain("概要: S1 の概要");
  expect(md).toContain("統一の「学べ」");
  expect(md).toContain("    - 第1部の第1区分");
  await shot(page, "10-rule3-outline", item);
});

test("規則4: 主な問いと従属する問いを分け、主な問いがないと済みにならない。問いの型が説明に出る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 4);
  await expect(item.locator('select[data-p="qs.1.parent"] option[value="Q1"]')).toHaveText("Q1 に従属");
  await item.locator('select[data-p="qs.1.parent"]').selectOption("Q1");
  expect((await done(page))[4]).toBe(true);
  await item.locator('select[data-p="qs.1.parent"]').selectOption("");
  await item.locator('select[data-p="qs.0.parent"]').selectOption("Q2");
  await item.locator('select[data-p="qs.1.parent"]').selectOption("Q1");
  expect((await done(page))[4], "主な問いがない").toBe(false);
  await item.locator('button[data-a="help"]').click();
  await expect(item.locator(".help").first()).toContainText("存在、種類、原因、目的、結果、特性、関係");
});

test("規則5・6: 表面読みの分からなかった所が出て、命題には文の場所が要る", async ({ page }) => {
  await setup(page);
  await expect(ruleItem(page, 5)).toContainText("難しい語X");
  await expect(ruleItem(page, 6)).toContainText("難しい語X");
  expect((await done(page))[6], "場所がないうちは済みでない").toBe(false);
  for (const i of [0, 1, 2]) await fillP(page, `props.${i}.loc`, "第" + (i + 1) + "章");
  expect((await done(page))[6]).toBe(true);
  await ruleItem(page, 6).locator('button[data-a="help"]').click();
  await expect(ruleItem(page, 6).locator(".help").first()).toContainText("自分の言葉で");
});

test("規則7: 中心の主張から根拠までの連なりが見え、根拠の種類に仮定と根拠なしがあり、中心の主張には論証の一言が要る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 7);
  await expect(item.locator(".chain")).toContainText("P1 中心の命題");
  await expect(item.locator(".chain")).toContainText("← P2 支える命題");
  await expect(item.locator(".chain")).toContainText("← P3 もう一つ支える命題");
  for (const i of [0, 1, 2]) {
    await item.locator(`button[data-a="push"][data-p="props.${i}.grounds"]`).click();
    await fillP(page, `props.${i}.grounds.0.t`, "根拠");
  }
  for (const k of ["仮定としている", "自明としている", "根拠を示していない"]) await expect(item.locator(`button[data-p="props.0.grounds.0.kind"][data-val="${k}"]`)).toBeVisible();
  for (const i of [0, 1, 2]) await chip(page, `props.${i}.grounds.0.kind`, i ? "理屈" : "仮定としている");
  expect((await done(page))[7], "中心の主張の一言がない").toBe(false);
  await fillP(page, "props.0.arg", "P3 だから P2、P2 だから P1");
  expect((await done(page))[7]).toBe(true);
  await expect(item.locator(".chain")).toContainText("（仮定としている）根拠");
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("P1 中心の命題（中心の主張）: P3 だから P2、P2 だから P1");
  expect(md).toMatch(/← P2 支える命題/);
  await shot(page, "11-rule7-chain", item);
});

test("規則8: 未解決と一部には、著者の自覚を選ぶ。答えている命題が出て、新しい問題を書ける", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 8);
  await expect(item.locator(".card").first()).toContainText("答えている命題: P1、P2");
  await chip(page, "solved.Q1.s", "解決した");
  await chip(page, "solved.Q2.s", "未解決");
  expect((await done(page))[8], "自覚を選ぶまで済みでない").toBe(false);
  await chip(page, "solved.Q2.aware", "自覚している");
  await fillP(page, "solved.Q2.why", "最終章で、残る問題として挙げている");
  expect((await done(page))[8]).toBe(true);
  await fillP(page, "newq", "新しく生じた問い");
  await item.locator('button[data-a="help"]').click();
  await expect(item.locator(".help").first()).toContainText("答えが正しいかどうかは、第三段階で");
});

test("規則9: 規則1〜8の済み具合が出て、言い直しと例を書くまでは賛否を選べない", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 9);
  await expect(item.locator(".status")).toContainText("規則1");
  await expect(item.locator(".status")).toContainText("規則8");
  await expect(item.locator('button[data-p="props.0.judge"]')).toHaveCount(0);
  await expect(item).toContainText("言い直しと例を書いてから");
  await fillP(page, "restate.s", "つまり");
  await fillP(page, "restate.ex", "たとえば");
  await item.locator('input[data-p="restate.ex"]').blur();
  await page.locator("#sec-a1 select").first().selectOption({ index: 0 }); // 描き直す
  await expect(item.locator('button[data-p="props.0.judge"][data-val="賛成"]')).toBeVisible();
});

test("規則10〜15: 反対には自分の側の誤りの検討と規則12〜14のどれかが、判断保留には規則15が、どの判断にも根拠が要る", async ({ page }) => {
  await setup(page, { });
  const b = base(); b.v.restate = { s: "つまり", ex: "たとえば" };
  await importState(page, b);
  await chip(page, "props.0.judge", "賛成");
  await chip(page, "props.1.judge", "反対");
  await chip(page, "props.2.judge", "判断保留");
  let d = await done(page);
  expect(d[9]).toBe(true);
  expect(d[10], "反対の命題に自分の側の検討がない").toBe(false);
  expect(d[11], "根拠がない").toBe(false);
  expect(d[12]).toBe(false); expect(d[15]).toBe(false);
  await fillP(page, "props.1.self", "自分が誤っているとしたら、前提の読み違い");
  for (const i of [0, 1, 2]) await fillP(page, `props.${i}.why`, "根拠");
  await fillP(page, "props.1.k13", "1569年まで今川氏は続いた");
  d = await done(page);
  expect(d[10]).toBe(true); expect(d[11]).toBe(true);
  for (const r of [12, 13, 14]) expect(d[r], `規則${r}: 反対の命題に12〜14のどれかがある`).toBe(true);
  expect(d[15], "判断保留の命題に規則15がない").toBe(false);
  await expect(ruleItem(page, 15)).toContainText("P3");
  await expect(ruleItem(page, 12)).not.toContainText("P1 中心の命題"); // 反対でない命題は出ない
  await fillP(page, "props.2.k15", "第3部の説明が足りない");
  expect((await done(page))[15]).toBe(true);
  await shot(page, "12-critique", page.locator("#sec-a4"));
});

test("チェックアウト: 点検読書で終える本には賛否を求めず、「まだ判断しない」と書く", async ({ page }) => {
  await setup(page);
  const b = base(); b.v.judge = "点検読書で終える"; b.id = "t-inspect";
  await importState(page, b);
  await expect(page.locator('#sec-checkout button[data-p="stance"]')).toHaveCount(0);
  await expect(page.locator("#sec-checkout")).toContainText("まだ判断しない");
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("- それは真実か: まだ判断しない（分析読書をしていない）");
});
