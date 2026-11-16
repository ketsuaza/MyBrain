// 仕様: 表面読みの「何がどのように詳しく述べられているか」を、「何が」と「どのように」に分けて書ける（issue #71）。
// これまでの要点（v.points）は「何が」の側に残り、「どのように」は新しいキー（v.pointsHow）に持つ。前の形（v.pointsHow がない）の読書メモも、そのまま開ける。
const { test, expect } = require("@playwright/test");
const { openTool, addManualBook, importState, current, loadWindowJs } = require("./helpers");

const LABEL = "何がどのように詳しく述べられているか";
const WHAT = "何が（著者の主な考えと主張）", HOW = "どのように（それを支える理由や根拠）";
const KEY = "dokusho-memo.v2";
const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
/* 前の形: 「どのように」のキーがない */
function oldBook(over) {
  const b = { id: "t-hyomen-old", meta: { title: "前の形の表面読み", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { purpose: "テスト用の目的", judge: "表面読みへ進む", points: ["テスト用の要点 1", "テスト用の要点 2"], unclear: ["テスト用の箇所"] } };
  Object.assign(b.v, over || {});
  return b;
}
const hyomen = page => page.locator("#sec-hyomen .item").first();
const what = page => hyomen(page).locator('input[data-p^="points."]');
const how = page => hyomen(page).locator('input[data-p^="pointsHow."]');
const values = loc => loc.evaluateAll(els => els.map(el => el.value));
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
/* 一覧の「＋ …」を押して、1行書く */
async function addRow(page, name, rows, text) {
  const n = await rows.count();
  await hyomen(page).getByRole("button", { name, exact: true }).click();
  await expect(rows).toHaveCount(n + 1);
  await rows.nth(n).fill(text);
}

test("ラベルが訳書の第2問の文言になり、その下に「何が」と「どのように」の2つの欄がある。説明文に「3つまで」がない", async ({ page }) => {
  await newBook(page);
  const it = hyomen(page);
  await expect(it.locator(".label .grow")).toHaveText(LABEL);
  await expect(it).toContainText(WHAT);
  await expect(it).toContainText(HOW);
  await expect(it.getByRole("button", { name: "＋ 考えや主張", exact: true })).toHaveCount(1);
  await expect(it.getByRole("button", { name: "＋ 理由や根拠", exact: true })).toHaveCount(1);
  // 「何が」の欄が先、「どのように」の欄があと
  const order = await it.evaluate((el, [a, b]) => el.textContent.indexOf(a) < el.textContent.indexOf("＋ 考えや主張") && el.textContent.indexOf("＋ 考えや主張") < el.textContent.indexOf(b) && el.textContent.indexOf(b) < el.textContent.indexOf("＋ 理由や根拠"), [WHAT, HOW]);
  expect(order, "「何が」の見出し、その行を足すボタン、「どのように」の見出し、その行を足すボタンの順に並ぶ").toBe(true);
  await it.locator('button[data-a="help"]').click();
  const help = it.locator(".help").first();
  await expect(help).toContainText("止まらずに最後まで読んでから");
  await expect(help).toContainText("分かった範囲で");
  await expect(help).not.toContainText("3つ");
  await expect(page.locator("#app")).not.toContainText("何がどのように述べられていたか");
});

test("2つの欄に、それぞれ行を足して書ける。行の数に上限はない。「×」は、その欄の行だけを消す", async ({ page }) => {
  await newBook(page);
  for (let i = 1; i <= 6; i++) await addRow(page, "＋ 考えや主張", what(page), "テスト用の主張 " + i);
  for (let i = 1; i <= 4; i++) await addRow(page, "＋ 理由や根拠", how(page), "テスト用の根拠 " + i);
  expect(await values(what(page))).toEqual([1, 2, 3, 4, 5, 6].map(i => "テスト用の主張 " + i));
  expect(await values(how(page))).toEqual([1, 2, 3, 4].map(i => "テスト用の根拠 " + i));
  let b = await current(page);
  expect(b.v.points).toEqual([1, 2, 3, 4, 5, 6].map(i => "テスト用の主張 " + i));
  expect(b.v.pointsHow).toEqual([1, 2, 3, 4].map(i => "テスト用の根拠 " + i));
  await hyomen(page).locator('button[data-a="del"][data-p="pointsHow"][data-i="1"]').click();
  await hyomen(page).locator('button[data-a="del"][data-p="points"][data-i="0"]').click();
  b = await current(page);
  expect(b.v.points).toEqual([2, 3, 4, 5, 6].map(i => "テスト用の主張 " + i));
  expect(b.v.pointsHow).toEqual([1, 3, 4].map(i => "テスト用の根拠 " + i));
  expect(await values(what(page))).toEqual(b.v.points);
  expect(await values(how(page))).toEqual(b.v.pointsHow);
  // 再読み込みのあとも残る
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect(await values(what(page))).toEqual(b.v.points);
  expect(await values(how(page))).toEqual(b.v.pointsHow);
});

test("保存する Markdown と、チェックアウトの「4つの問いへの答え」の2番目に、2つとも出る。打ったその場で変わる", async ({ page }) => {
  await newBook(page);
  await expect(second(page)).toHaveText("まだ書いていない");
  await addRow(page, "＋ 考えや主張", what(page), "テスト用の主張 1");
  await addRow(page, "＋ 考えや主張", what(page), "テスト用の主張 2");
  await addRow(page, "＋ 理由や根拠", how(page), "テスト用の根拠 1");
  await expect(second(page)).toHaveText("何が:\nテスト用の主張 1\nテスト用の主張 2\nどのように:\nテスト用の根拠 1");
  const md = await markdown(page);
  expect(md).toContain("- " + LABEL + ":\n  - 何が:\n    - テスト用の主張 1\n    - テスト用の主張 2\n  - どのように:\n    - テスト用の根拠 1\n- 分からなかった所:");
  expect(md).not.toContain("何がどのように述べられていたか");
  // 欄に打つと、欄を離れなくても、2番目の答えが変わる。入力中の欄は、同じ部品のまま
  const last = how(page).nth(0);
  await last.click();
  await last.evaluate(el => { el.__same = true; el.setSelectionRange(el.value.length, el.value.length); });
  await page.keyboard.type("!");
  await expect(second(page)).toHaveText("何が:\nテスト用の主張 1\nテスト用の主張 2\nどのように:\nテスト用の根拠 1!");
  expect(await page.evaluate(() => document.activeElement.__same === true && document.activeElement.dataset.p), "入力中の欄").toBe("pointsHow.0");
  // 保存した Markdown を読み込み直すと、同じ状態に戻る
  const before = await current(page);
  const saved = await markdown(page);
  await last.fill("書き換えた");
  page.once("dialog", d => d.accept()); // 中身を変えた同じ本を置き換える前の確認（#59）を受ける
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(saved);
  await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  await expect(how(page).nth(0)).toHaveValue("テスト用の根拠 1!");
  expect(await current(page)).toEqual(before);
});

test("進み具合の「表面読み」と読了の条件は、「何が」に1行以上あれば済み。「どのように」だけでは済みにならない", async ({ page }) => {
  await newBook(page);
  const prog = page.locator("#prog"), todo = page.locator("#finish .todo");
  await expect(prog).toContainText("表面読み 未");
  await expect(todo).toContainText(LABEL);
  await addRow(page, "＋ 理由や根拠", how(page), "テスト用の根拠 1");
  await expect(prog, "「どのように」だけでは済みにならない").toContainText("表面読み 未");
  await expect(todo).toContainText(LABEL);
  await addRow(page, "＋ 考えや主張", what(page), "テスト用の主張 1");
  await expect(prog).toContainText("表面読み 済");
  await expect(todo).not.toContainText(LABEL);
  await how(page).nth(0).fill("");
  await expect(prog, "「どのように」が空でも済み").toContainText("表面読み 済");
  await expect(todo).not.toContainText(LABEL);
});

test("前の形（「どのように」のキーがない）の読書メモを読み込むと、これまでの要点が「何が」の側にそのまま出る", async ({ page }) => {
  await openTool(page);
  const old = oldBook();
  await importState(page, old);
  expect(await values(what(page))).toEqual(old.v.points);
  await expect(how(page)).toHaveCount(0);
  await expect(page.locator("#prog")).toContainText("表面読み 済");
  expect(await current(page), "読み込んだ内容は、何も失われない").toEqual(old);
  await expect(second(page)).toHaveText("何が:\nテスト用の要点 1\nテスト用の要点 2");
  expect(await markdown(page)).toContain("- " + LABEL + ":\n  - 何が:\n    - テスト用の要点 1\n    - テスト用の要点 2\n  - どのように:\n- 分からなかった所:");
  // 「どのように」に足して書ける。要点はそのまま
  await addRow(page, "＋ 理由や根拠", how(page), "テスト用の根拠 1");
  const b = await current(page);
  expect(b.v.points).toEqual(old.v.points);
  expect(b.v.pointsHow).toEqual(["テスト用の根拠 1"]);
});

test("ブラウザに残っている前の形の状態も、そのまま開けて、要点が「何が」の側に出る", async ({ page }) => {
  const old = oldBook();
  await page.addInitScript(([key, book]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ books: [book], current: book.id })); }, [KEY, old]);
  await openTool(page);
  await expect(page.locator("#bookSel option:checked")).toHaveText(old.meta.title);
  expect(await values(what(page))).toEqual(old.v.points);
  await expect(how(page)).toHaveCount(0);
  expect(await current(page)).toEqual(old);
});

test("2つの欄の入力欄に、何の欄かが分かる名前（aria-label）があり、項目の中で重ならない", async ({ page }) => {
  await openTool(page);
  await importState(page, oldBook({ pointsHow: ["テスト用の根拠 1", "テスト用の根拠 2"] }));
  const names = await hyomen(page).locator("input").evaluateAll(els => els.map(el => [el.dataset.p, el.getAttribute("aria-label")]));
  expect(names).toEqual([["points.0", WHAT + " 1"], ["points.1", WHAT + " 2"], ["pointsHow.0", HOW + " 1"], ["pointsHow.1", HOW + " 2"]]);
  await expect(page.getByRole("textbox", { name: HOW + " 2", exact: true })).toHaveValue("テスト用の根拠 2");
  // 2つの欄は、それぞれ名前のあるまとまり（group）になっている
  await expect(hyomen(page).getByRole("group", { name: WHAT, exact: true })).toHaveCount(1);
  await expect(hyomen(page).getByRole("group", { name: HOW, exact: true }).locator("input")).toHaveCount(2);
});

test("「何が」の欄で Enter を押すと、「何が」の側に行が足される（「どのように」には足されない）", async ({ page }) => {
  await openTool(page);
  await importState(page, oldBook({ pointsHow: ["テスト用の根拠 1"] }));
  await what(page).nth(1).click();
  await page.keyboard.press("Enter");
  await expect(what(page)).toHaveCount(3);
  await expect(what(page).nth(2)).toBeFocused();
  await expect(how(page)).toHaveCount(1);
  await how(page).nth(0).click();
  await page.keyboard.press("Enter");
  await expect(how(page)).toHaveCount(2);
  await expect(how(page).nth(1)).toBeFocused();
  await expect(what(page)).toHaveCount(3);
});

test("サンプルの本は、「どのように」にも1〜2行入っている。命題があるので、2番目の答えには命題が出る", async ({ page }) => {
  await openTool(page);
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  expect(SAMPLE.v.pointsHow.length).toBeGreaterThanOrEqual(1);
  expect(SAMPLE.v.pointsHow.length).toBeLessThanOrEqual(2);
  expect(await values(what(page))).toEqual(SAMPLE.v.points);
  expect(await values(how(page))).toEqual(SAMPLE.v.pointsHow);
  await expect(second(page)).toContainText("P1 ");
  await expect(second(page)).not.toContainText("どのように:");
  const md = await markdown(page);
  for (const l of SAMPLE.v.pointsHow) expect(md).toContain("\n    - " + l + "\n");
});

test("書いた文に記号や HTML があっても、文字として出るだけで、Markdown の末尾の state から読み込み直せる", async ({ page }) => {
  await newBook(page);
  const evil = '<img src=x onerror="__xss=1"> | # ``` & "引用"';
  await addRow(page, "＋ 考えや主張", what(page), evil);
  await addRow(page, "＋ 理由や根拠", how(page), evil);
  await expect(second(page)).toHaveText("何が:\n" + evil + "\nどのように:\n" + evil);
  await page.evaluate(() => new Promise(done => { const i = new Image(); i.onerror = done; i.src = "x"; }));
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.evaluate(() => document.querySelectorAll("#app img").length)).toBe(0);
  const before = await current(page), saved = await markdown(page);
  await how(page).nth(0).fill("書き換えた");
  page.once("dialog", d => d.accept()); // 中身を変えた同じ本を置き換える前の確認（#59）を受ける
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(saved);
  await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  await expect(how(page).nth(0)).toHaveValue(evil);
  expect(await current(page)).toEqual(before);
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、2つの欄が横にはみ出さず、欄とボタンが重ならず、押せる大きさで出ている", async ({ page }) => {
    await openTool(page);
    await importState(page, oldBook({ points: ["テスト用の要点 1", "あ".repeat(80)], pointsHow: ["テスト用の根拠 1", "い".repeat(80)] }));
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    const it = hyomen(page), boxes = [];
    for (const loc of await it.locator('input, button[data-a="push"], button[data-a="del"]').all()) {
      const b = await loc.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
      expect(b.height, "高さ").toBeGreaterThanOrEqual(24);
      boxes.push(b);
    }
    const hit = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    const overlaps = boxes.filter((a, i) => boxes.some((b, j) => j > i && hit(a, b))).length;
    expect(overlaps, "重なっている部品の数").toBe(0);
    // 見出しの文字が、1行に収まる
    for (const name of [WHAT, HOW]) {
      const h = await it.getByText(name, { exact: true }).evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map(c => Math.round(c.top))).size; });
      expect(h, "「" + name + "」の行の数").toBe(1);
    }
    await addRow(page, "＋ 理由や根拠", how(page), "テスト用の根拠 3");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
