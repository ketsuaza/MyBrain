// 仕様: 「読み込む」に貼った本と同じ本（同じ id）がブラウザにあり、中身が違うときだけ、置き換える前に確認が出る（issue #59）。
// 「やめる」を選ぶと、ブラウザの入力も、今の本も変わらない。中身が同じとき、ブラウザにない本のときは、確認なしで読み込む。
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openTool, importState, current } = require("./helpers");

const F = "```";
const TITLE = "確認のテスト <b>\"&'";
function base(over) {
  return { id: "t-confirm", meta: { title: TITLE, author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: Object.assign({ purpose: "テスト用の目的", budget: "1時間", judge: "点検読書で終える", kind: "理論書", unity: { what: "学問", claim: "学べ" }, memo: "テスト用のメモ" }, over || {}) };
}
const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/old-format-sample.json"), "utf8"));
const purpose = page => page.locator("#app textarea[data-p='purpose']");
const stored = page => page.evaluate(() => localStorage.getItem("dokusho-memo.v2"));
/* 出たダイアログ（確認とメッセージ）を集める。確認には answer で答える（true は受ける、false はやめる） */
function watch(page, answer) {
  const seen = [];
  page.on("dialog", d => { seen.push({ type: d.type(), text: d.message() }); if (answer) d.accept(); else d.dismiss(); });
  return seen;
}
/* 「読み込む」に text を貼って、読み込む。ダイアログを閉じたときの処理（close イベント。確認もこの中で出る）が終わるまで待つ */
async function paste(page, text, how) {
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill(text);
  await page.evaluate(() => { window.__closed = new Promise(done => document.getElementById("dlgImport").addEventListener("close", done, { once: true })); });
  if (how === "keyboard") await page.keyboard.press("Tab"); // 欄から「読み込む」のボタンへ
  if (how === "keyboard") await page.keyboard.press("Enter"); else await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
  await page.locator("#dlgImport").waitFor({ state: "hidden" });
  await page.evaluate(() => window.__closed);
}
const md = book => "# 見出し\n\n%%\n" + F + "state\n" + JSON.stringify(book) + "\n" + F + "\n%%\n";
/* 「Markdown をコピー」と同じ Markdown */
const markdownOf = page => page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));

test("issue の手順: 写したあとで書き換えた本に、写しを読み込むと、確認が出る。やめると、書き換えた内容が残る", async ({ page }) => {
  await openTool(page);
  await importState(page, base());
  const copied = await markdownOf(page);
  await purpose(page).fill("写したあとで書き換えた目的");
  const before = await current(page), raw = await stored(page);
  const seen = watch(page, false);
  await paste(page, copied);
  await expect.poll(() => seen.length, "確認が1回出る").toBe(1);
  expect(seen[0].type).toBe("confirm");
  expect(seen[0].text, "確認の文に、書名がそのまま入る").toContain("『" + TITLE + "』");
  // やめたので、画面も、状態も、ブラウザに残した内容も変わらない
  await expect(purpose(page)).toHaveValue("写したあとで書き換えた目的");
  expect(await current(page)).toEqual(before);
  expect(await stored(page)).toBe(raw);
  // やめたあと、フォーカスは「読み込む」のボタンに戻る
  await expect(page.locator("#btnImport")).toBeFocused();
  // 開き直しても、書き換えた内容が残っている
  await page.reload(); await page.locator("#app section").first().waitFor();
  await expect(purpose(page)).toHaveValue("写したあとで書き換えた目的");
  expect(seen.length).toBe(1);
});

test("確認を受けると、貼った内容に置き換わる", async ({ page }) => {
  await openTool(page);
  await importState(page, base());
  const copied = await markdownOf(page), first = await current(page);
  await purpose(page).fill("写したあとで書き換えた目的");
  const seen = watch(page, true);
  await paste(page, copied);
  await expect(purpose(page)).toHaveValue("テスト用の目的");
  expect(seen.map(d => d.type)).toEqual(["confirm"]);
  expect(await current(page)).toEqual(first);
  expect(JSON.parse(await stored(page)).books.find(b => b.id === "t-confirm").v.purpose).toBe("テスト用の目的");
});

test("キーボードだけで読み込んでも、確認が出て、やめると変わらず、受けると置き換わる", async ({ page }) => {
  await openTool(page);
  await importState(page, base());
  const copied = await markdownOf(page);
  await purpose(page).fill("書き換えた目的");
  let answer = false; const seen = [];
  page.on("dialog", d => { seen.push(d.type()); if (answer) d.accept(); else d.dismiss(); });
  await paste(page, copied, "keyboard");
  await expect.poll(() => seen.slice()).toEqual(["confirm"]);
  await expect(purpose(page)).toHaveValue("書き換えた目的");
  await expect(page.locator("#btnImport")).toBeFocused();
  // 続けて Enter を押すと、「読み込む」がもう一度開くだけで、何も読み込まれない
  await page.keyboard.press("Enter");
  await expect(page.locator("#dlgImport")).toBeVisible();
  await expect(page.locator("#formImport textarea")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(purpose(page)).toHaveValue("書き換えた目的");
  answer = true;
  await paste(page, copied, "keyboard");
  await expect(purpose(page)).toHaveValue("テスト用の目的");
  expect(seen).toEqual(["confirm", "confirm"]);
});

test("別の本を開いているときにやめると、今の本は変わらない。受けると、読み込んだ本が今の本になる", async ({ page }) => {
  await openTool(page);
  await importState(page, base());
  const other = base({ purpose: "別の本の目的" }); other.id = "t-confirm-other"; other.meta.title = "別の本";
  await importState(page, other);
  let answer = false; const seen = [];
  page.on("dialog", d => { seen.push(d.type()); if (answer) d.accept(); else d.dismiss(); });
  await paste(page, md(base({ purpose: "貼った目的" })));
  await expect.poll(() => seen.slice()).toEqual(["confirm"]);
  expect((await current(page)).id, "今の本は、別の本のまま").toBe("t-confirm-other");
  await expect(purpose(page)).toHaveValue("別の本の目的");
  await expect(page.locator("#bookSel option:checked")).toHaveText("別の本");
  expect(JSON.parse(await stored(page)).books.find(b => b.id === "t-confirm").v.purpose).toBe("テスト用の目的");
  answer = true;
  await paste(page, md(base({ purpose: "貼った目的" })));
  await expect(purpose(page)).toHaveValue("貼った目的");
  expect((await current(page)).id).toBe("t-confirm");
});

test("見張り: 中身が同じ本と、ブラウザにない本は、確認なしで読み込む", async ({ page }) => {
  await openTool(page);
  const seen = watch(page, false);
  // ブラウザにない本
  await paste(page, md(base()));
  await expect(purpose(page)).toHaveValue("テスト用の目的");
  const first = await current(page);
  // 別の本へ移ってから、同じ中身を読み込むと、確認なしで、その本が今の本になる
  await page.selectOption("#bookSel", { index: 1 });
  await expect.poll(async () => (await current(page)).id).not.toBe("t-confirm");
  await paste(page, md(base()));
  await expect.poll(async () => (await current(page)).id).toBe("t-confirm");
  await paste(page, await markdownOf(page));
  expect(await current(page)).toEqual(first);
  expect(seen, "確認もメッセージも出ない").toEqual([]);
});

test("形の違いだけでは、確認が出ない: 前の形の読書メモを、同じ内容のまま読み込み直す", async ({ page }) => {
  await openTool(page);
  const seen = watch(page, false);
  // 前の形（規則11まで。反論の理由が4択、解決が文字列）。開くと、規則2の欄に下読みの答えが写る
  const old = JSON.parse(JSON.stringify(OLD)); old.id = "t-confirm-old"; old.meta.title = "前の形の本";
  // 前の形（欄の値が "__alt__"、部分に id がない、規則2の答えがない）
  const older = { id: "t-confirm-older", meta: { title: "もっと前の形の本" }, v: { purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", s3: "__alt__", unclear: "__alt__", unity: { what: "学問", claim: "学べ" },
    parts: [{ t: "テスト用の部分 1", role: "", link: "", sum: "" }, { t: "テスト用の部分 2", role: "", link: "前を受けて進める", sum: "" }] } };
  for (const b of [old, older]) {
    await paste(page, md(b));
    await expect.poll(async () => (await current(page)).id).toBe(b.id);
    const once = await current(page);
    expect(once.v.unityA, "開いたときに、規則2の欄へ写っている").toEqual(b.v.unity);
    // 前の形のまま、もう一度。開き直してから、もう一度
    await paste(page, md(b));
    await page.reload(); await page.locator("#app section").first().waitFor();
    await paste(page, md(b));
    // キーの並びだけを変えたもの
    const turned = { skip: {}, v: Object.fromEntries(Object.entries(b.v).reverse()), meta: b.meta, id: b.id };
    await paste(page, md(turned));
    expect(seen, b.meta.title).toEqual([]);
    expect(await current(page)).toEqual(once);
  }
  // 中身を変えた前の形の読書メモには、確認が出る
  older.v.purpose = "書き換えた目的";
  await paste(page, md(older));
  await expect.poll(() => seen.map(d => d.type)).toEqual(["confirm"]);
  await expect(purpose(page)).toHaveValue("テスト用の目的");
});

test("形の違いだけでは、確認が出ない: 書いてから消した欄、足してから消した行、押してから戻したボタン", async ({ page }) => {
  await openTool(page);
  const book = base({ judge: "分析読書へ進む", unity2: "" }); book.id = "t-confirm-ana";
  await importState(page, book);
  const copied = md(book);
  const seen = watch(page, false);
  // 書いてから消す（値は "" で残る）
  await page.locator("#app textarea[data-p='meaning']").fill("いったん書いた");
  await page.locator("#app textarea[data-p='meaning']").fill("");
  // 行を足してから消す（番号を振るための数だけが進む）
  await page.locator('#app button[data-a="push"][data-p="props"]').click();
  await page.locator('#app button[data-a="del"][data-p="props"]').click();
  // 押してから戻す（印は false や空で残る）
  await page.locator('#app button[data-a="skip"][data-r="5"]').click();
  await page.locator('#app button[data-a="skip"][data-r="5"]').click();
  await page.locator('#app button[data-a="alt"][data-p="s3"]').click();
  await page.locator('#app button[data-a="alt"][data-p="s3"]').click();
  expect(await current(page)).not.toEqual(book);
  await paste(page, copied);
  expect(seen, "中身は同じなので、確認は出ない").toEqual([]);
  // 空白だけの違いは、中身の違いとして扱う
  await page.locator("#app textarea[data-p='meaning']").fill(" ");
  await paste(page, copied);
  await expect.poll(() => seen.map(d => d.type)).toEqual(["confirm"]);
});
