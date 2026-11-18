// 仕様: これまで E2E の仕様がなかった、もとからの働きを見張る（issue #67）。動作は変えていないので、どれも直す前から通る。
// 再読み込みのあとも入力が残ること、サンプルの足され方、通信の失敗、ファクトチェックの結果がない本、file:// で開くこと、
// 読了、規則の「やらない」、本を消す、同じ ISBN の本、読み込めない文、「Markdown をコピー」、390px の幅のダイアログ、固定の見出し。
const path = require("path");
const { pathToFileURL } = require("url");
const { test, expect } = require("@playwright/test");
const { ROOT, BOOKLIST, loadWindowJs, openTool, addManualBook, importState, ruleItem, current, untilRedrawn } = require("./helpers");

const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
const KEY = "dokusho-memo.v2";
const titles = page => page.locator("#bookSel option").allInnerTexts();
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* ページで起きたエラー（捕まえられなかった例外と、コンソールの error）を集める */
function watchErrors(page) {
  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  return errs;
}
/* 再読み込みして、画面が出るまで待つ（通信の差し替えは、そのまま効く） */
async function reload(page) {
  await page.reload();
  await page.locator("#app section").first().waitFor();
}
/* 分析読書まで進めた、ファクトチェックの結果がない本 */
function anaBook(over) {
  const b = { id: "t-baseline", meta: { title: "見張りのテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 2, Q: 1, P: 2 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", unity: { what: "学問", claim: "学べ" },
      parts: [{ id: "S1", t: "第1部", role: "問題を示す", to: "", link: "", sum: "概要1", rel: "", subs: [] }, { id: "S2", t: "第2部", role: "主張を述べる", to: "S1", link: "を受けて進める", sum: "概要2", rel: "", subs: [] }],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }],
      props: [{ id: "P1", t: "テスト用の命題1", sup: "main", q: "Q1", grounds: [], judge: "賛成" }, { id: "P2", t: "テスト用の命題2", sup: "P1", q: "", grounds: [], judge: "" }],
      restate: { s: "つまり", ex: "たとえば" } } };
  Object.assign(b.v, over || {});
  return b;
}

test("再読み込みのあとも、入力が残る（文字の欄、選択、プルダウン、足した行）", async ({ page }) => {
  await openTool(page);
  await addManualBook(page, { title: "再読み込みのテスト" });
  await page.locator("#app textarea[data-p='purpose']").fill("テスト用の目的\n2行目");
  await page.locator('#sec-checkin button[data-p="budget"][data-val="1時間"]').click();
  await page.locator('#sec-shitayomi button[data-p="judge"][data-val="分析読書へ進む"]').click();
  const r3 = ruleItem(page, 3);
  await r3.locator('button[data-a="push"][data-p="parts"]').click();
  await r3.locator('input[data-p="parts.0.t"]').fill("テスト用の部分1");
  await r3.locator('select[data-p="parts.0.role"]').selectOption("方法を示す");
  const before = await current(page);
  await reload(page);
  await expect(page.locator("#bookSel option:checked")).toHaveText("再読み込みのテスト");
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("テスト用の目的\n2行目");
  await expect(page.locator('#sec-checkin button[data-p="budget"][data-val="1時間"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#sec-shitayomi button[data-p="judge"][data-val="分析読書へ進む"]')).toHaveAttribute("aria-pressed", "true");
  await expect(ruleItem(page, 3).locator('input[data-p="parts.0.t"]')).toHaveValue("テスト用の部分1");
  await expect(ruleItem(page, 3).locator('select[data-p="parts.0.role"]')).toHaveValue("方法を示す");
  expect(await current(page), "保存された内容が、再読み込みの前と同じ").toEqual(before);
});

test("サンプルは初めて見たときだけ足される。書き換えても、再読み込みで元に戻らず、2冊にならない", async ({ page }) => {
  await openTool(page);
  expect((await titles(page)).filter(t => t === SAMPLE.meta.title), "初めて開くと、サンプルが1冊ある").toHaveLength(1);
  await page.locator("#bookSel").selectOption(SAMPLE.id);
  await page.locator("#app textarea[data-p='purpose']").fill("サンプルを書き換えた");
  await reload(page);
  expect((await titles(page)).filter(t => t === SAMPLE.meta.title)).toHaveLength(1);
  await page.locator("#bookSel").selectOption(SAMPLE.id);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("サンプルを書き換えた");
});

test("消したサンプルは、再読み込みしても戻ってこない。まだ見ていないサンプルだけが足される", async ({ page }) => {
  await openTool(page);
  await addManualBook(page, { title: "残る本" });
  await page.locator("#bookSel").selectOption(SAMPLE.id);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(SAMPLE.v.purpose);
  page.on("dialog", d => d.accept());
  await page.click("#btnEdit");
  await untilRedrawn(page, async () => {
    await page.click("#btnDelete");
    await page.locator("#dlgBook").waitFor({ state: "hidden" });
  });
  expect(await titles(page)).not.toContain(SAMPLE.meta.title);
  await reload(page);
  expect(await titles(page), "消したサンプルは戻らない").not.toContain(SAMPLE.meta.title);
  // sample.js に2冊目が増えたとき: 見ていない2冊目だけが足される
  const second = JSON.parse(JSON.stringify(SAMPLE)); second.id = "sample-second"; second.meta.title = "【サンプル】2冊目";
  await page.route("**/sample.js*", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "window.SAMPLES = " + JSON.stringify([SAMPLE, second]) + ";" }));
  await reload(page);
  const ts = await titles(page);
  expect(ts.filter(t => t === "【サンプル】2冊目"), "見ていないサンプルは足される").toHaveLength(1);
  expect(ts, "消したサンプルは戻らない").not.toContain(SAMPLE.meta.title);
  await reload(page);
  expect((await titles(page)).filter(t => t === "【サンプル】2冊目"), "2回目からは足されない").toHaveLength(1);
});

for (const [name, fail] of [["エラーの応答（500）", r => r.fulfill({ status: 500, body: "error" })], ["通信の失敗", r => r.abort()]]) {
  test("ブックリストの取得が" + name + "でも、画面が出て、書誌を手で入れて本を足せる", async ({ page }) => {
    const errs = [];
    page.on("pageerror", e => errs.push(e.message));
    await page.route("https://raw.githubusercontent.com/**", fail);
    await page.route("https://api.openbd.jp/**", fail);
    await page.goto("index.html");
    await page.locator("#app section").first().waitFor();
    await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
    await page.click("#btnNew");
    await expect(page.locator("#pickHits")).toContainText("ブックリストを読めなかった");
    await expect(page.locator("#pickCount")).toHaveText("0件 / 全0件");
    await page.keyboard.press("Escape");
    await addManualBook(page, { title: "手で入れた本", author: "テストの著者" });
    await expect(page.locator("#bookSel option:checked")).toHaveText("手で入れた本");
    expect((await current(page)).meta).toMatchObject({ title: "手で入れた本", author: "テストの著者" });
    await page.locator("#app textarea[data-p='purpose']").fill("テスト用の目的");
    expect((await current(page)).v.purpose).toBe("テスト用の目的");
    expect(errs, "捕まえられなかった例外").toEqual([]);
  });

  test("openBD の取得が" + name + "でも、ブックリストから本を選んで足せる（著者などは空のまま）", async ({ page }) => {
    const errs = [];
    page.on("pageerror", e => errs.push(e.message));
    await page.route("https://raw.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BOOKLIST) }));
    await page.route("https://api.openbd.jp/**", fail);
    await page.goto("index.html");
    await page.locator("#app section").first().waitFor();
    const pick = BOOKLIST.find(b => /^97[89]\d{10}$/.test(String(b.isbn).replace(/\D/g, "")));
    await page.click("#btnNew");
    const asked = page.waitForRequest("https://api.openbd.jp/**");
    await page.locator('#pickHits tr[data-no="' + pick.no + '"]').click();
    await asked;
    await expect(page.locator('#formBook input[name="title"]')).toHaveValue(pick.title);
    await untilRedrawn(page, async () => {
      await page.locator("#formBook").getByRole("button", { name: "決定" }).click();
      await page.locator("#dlgBook").waitFor({ state: "hidden" });
    });
    await expect(page.locator("#bookSel option:checked")).toHaveText(pick.title);
    expect((await current(page)).meta).toMatchObject({ title: pick.title, isbn: String(pick.isbn), author: "", publisher: "" });
    expect(errs, "捕まえられなかった例外").toEqual([]);
  });
}

test("ファクトチェックの結果がない本でも、エラーにならず、規則9に命題と賛否のボタンが出る。コンソールにエラーが出ない", async ({ page }) => {
  const errs = watchErrors(page);
  await openTool(page);
  await importState(page, anaBook());
  const r9 = ruleItem(page, 9);
  await expect(r9.locator(".card")).toHaveCount(2);
  await expect(r9.locator(".fc"), "ファクトチェックの結果は出ない").toHaveCount(0);
  await expect(r9.locator('button[data-p="props.0.judge"][data-val="賛成"]')).toHaveAttribute("aria-pressed", "true");
  await r9.locator('button[data-p="props.1.judge"][data-val="反対"]').click();
  await page.locator("#sec-a2 [data-p='props.1.t']").fill("書き換えた命題");
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("  - P2 反対");
  expect(md).not.toContain("Agent のファクトチェック");
  // サンプルの本（結果がある）に切り替えても、エラーが出ない
  await page.locator("#bookSel").selectOption(SAMPLE.id);
  await expect(ruleItem(page, 9).locator(".fc").first()).toBeVisible();
  expect(errs, "ページで起きたエラー").toEqual([]);
});

test("factcheck.js を読めなくても、画面が出て、サンプルの命題にはファクトチェックの結果が出ないだけで済む", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.route("**/factcheck.js*", r => r.fulfill({ status: 404, body: "" }));
  await openTool(page);
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  await expect(ruleItem(page, 9).locator(".card")).toHaveCount(SAMPLE.v.props.length);
  await expect(ruleItem(page, 9).locator(".fc")).toHaveCount(0);
  expect(errs, "捕まえられなかった例外").toEqual([]);
});

test("file:// で開いても動く: サンプルとブックリストが出て、本を足して書け、再読み込みのあとも残る", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  // file:// のページからの取得は、別の出どころ（origin）への取得になる。GitHub と同じく、どこからでも読める応答を返す
  await page.route("https://raw.githubusercontent.com/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(BOOKLIST) }));
  await page.route("https://api.openbd.jp/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[null]" }));
  const url = pathToFileURL(path.join(ROOT, "docs", "index.html")).href;
  await page.goto(url);
  await page.locator("#app section").first().waitFor();
  expect(new URL(page.url()).protocol).toBe("file:");
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  await expect(ruleItem(page, 9).locator(".fc").first(), "factcheck.js が読めている").toBeVisible();
  await page.click("#btnNew");
  await expect(page.locator("#pickCount")).toHaveText(BOOKLIST.length + "件 / 全" + BOOKLIST.length + "件");
  await page.keyboard.press("Escape");
  await addManualBook(page, { title: "ファイルから開いた本" });
  await page.locator("#app textarea[data-p='purpose']").fill("テスト用の目的");
  await page.locator('#sec-shitayomi button[data-p="judge"][data-val="表面読みへ進む"]').click();
  await expect(page.locator("#sec-hyomen")).toBeVisible();
  await expect(page.locator("#app")).not.toContainText("このブラウザでは入力を保存できない");
  await page.goto(url);
  await page.locator("#app section").first().waitFor();
  await expect(page.locator("#bookSel option:checked")).toHaveText("ファイルから開いた本");
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("テスト用の目的");
  expect(errs, "捕まえられなかった例外").toEqual([]);
});

test("読了にする: 足りない項目があるうちは押せず、埋めると押せる。読了を取り消すと、元に戻る", async ({ page }) => {
  await openTool(page);
  await addManualBook(page, { title: "読了のテスト" });
  const fin = page.locator('#finish button[data-a="finish"]');
  await expect(fin).toBeDisabled();
  await expect(page.locator("#finish .todo")).toContainText("読了まで、あと");
  await page.locator("#app textarea[data-p='purpose']").fill("テスト用の目的");
  await page.locator('#sec-shitayomi button[data-p="judge"][data-val="やめる"]').click();
  await expect(fin, "「どんな意義があるか」がまだない").toBeDisabled();
  await page.locator("#app textarea[data-p='meaning']").fill("やめる理由");
  await expect(page.locator("#finish .done-msg")).toHaveText("読了にできる。");
  await expect(fin).toBeEnabled();
  await fin.click();
  await expect(page.locator("#finish .done-msg")).toContainText(/^読了: \d{4}-\d{2}-\d{2}（深さ: 点検）$/);
  await expect(page.locator("#bookSel option:checked")).toHaveText("✓ 読了のテスト");
  await expect(page.locator("#prog")).toContainText("読了");
  let b = await current(page);
  expect(b.meta.finished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  let md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("status: 読み終わった");
  expect(md).toContain("finished: " + b.meta.finished);
  await page.locator('#finish button[data-a="unfinish"]').click();
  await expect(page.locator("#finish .done-msg")).toHaveText("読了にできる。");
  await expect(page.locator("#bookSel option:checked")).toHaveText("読了のテスト");
  b = await current(page);
  expect(b.meta.finished).toBe("");
  expect(b.v.meaning, "書いた内容は残る").toBe("やめる理由");
  md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("status: いま読んでる");
});

test("規則の「やらない」: 欄が隠れ、進み具合と Markdown に「やらない」と出る。戻すと、書いた内容がそのまま出る", async ({ page }) => {
  await openTool(page);
  await importState(page, anaBook());
  const r3 = ruleItem(page, 3), skip = r3.locator('button[data-a="skip"]');
  await expect(skip).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#prog")).not.toContainText("やらない");
  const total = async () => (await page.locator("#prog").innerText()).match(/分析読書\s*(\d+)\/15/)[1];
  const doneBefore = await total();
  await skip.click();
  await expect(skip).toHaveAttribute("aria-pressed", "true");
  await expect(r3).toHaveClass(/skipped/);
  await expect(r3.locator('input[data-p="parts.0.t"]')).toBeHidden();
  await expect(page.locator("#prog")).toContainText("（やらない 1）");
  expect(Number(await total()), "やらない規則は、済みに数えない").toBe(Number(doneBefore) - 1);
  let md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toMatch(/^- 規則3 .*: やらない$/m);
  expect(md).not.toContain("S1 第1部");
  await skip.click();
  await expect(skip).toHaveAttribute("aria-pressed", "false");
  await expect(r3.locator('input[data-p="parts.0.t"]')).toBeVisible();
  await expect(r3.locator('input[data-p="parts.0.t"]')).toHaveValue("第1部");
  await expect(page.locator("#prog")).not.toContainText("やらない");
  md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("S1 第1部");
});

test("本を一覧から消す: 確かめる文でやめると残り、進めると消えて、残りの本が今の本になる。再読み込みしても戻らない", async ({ page }) => {
  await openTool(page);
  await addManualBook(page, { title: "消す本" });
  await page.locator("#app textarea[data-p='purpose']").fill("テスト用の目的");
  const asked = []; let answer = false;
  page.on("dialog", d => { asked.push(d.message()); answer ? d.accept() : d.dismiss(); });
  await page.click("#btnEdit");
  await expect(page.locator("#dlgBookTitle")).toHaveText("書誌");
  await page.click("#btnDelete");
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain("『消す本』を一覧から消す");
  await expect(page.locator("#dlgBook"), "やめたら、ダイアログは開いたまま").toBeVisible();
  expect(await titles(page)).toContain("消す本");
  answer = true;
  await untilRedrawn(page, async () => {
    await page.click("#btnDelete");
    await page.locator("#dlgBook").waitFor({ state: "hidden" });
  });
  expect(await titles(page)).toEqual([SAMPLE.meta.title]);
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(SAMPLE.v.purpose);
  await reload(page);
  expect(await titles(page)).toEqual([SAMPLE.meta.title]);
});

test("最後の1冊を消すと、「本を足す」への案内が出て、本を足すと元どおり使える", async ({ page }) => {
  await openTool(page);
  page.on("dialog", d => d.accept());
  await page.click("#btnEdit");
  await untilRedrawn(page, async () => {
    await page.click("#btnDelete");
    await page.locator("#dlgBook").waitFor({ state: "hidden" });
  });
  await expect(page.locator("#app .empty")).toHaveText("「本を足す」から、読む本を選ぶ。");
  await expect(page.locator("#bookSel option")).toHaveCount(0);
  await expect(page.locator("#prog")).toHaveText("");
  await addManualBook(page, { title: "足し直した本" });
  await expect(page.locator("#bookSel option:checked")).toHaveText("足し直した本");
  await expect(page.locator("#app textarea[data-p='purpose']")).toBeVisible();
});

test("同じ ISBN の本を足すと、2冊にならず、前からある本が今の本になる。書いた内容は残る", async ({ page }) => {
  await openTool(page);
  await addManualBook(page, { title: "同じ ISBN の本", isbn: "978-4-00-000001-7" });
  await page.locator("#app textarea[data-p='purpose']").fill("先に書いた目的");
  await page.locator("#bookSel").selectOption(SAMPLE.id);
  await expect(page.locator("#bookSel option:checked")).toHaveText(SAMPLE.meta.title);
  // ハイフンのない書き方でも、同じ本として扱う
  await addManualBook(page, { title: "あとから足した同じ本", isbn: "9784000000017" });
  await expect(page.locator("#bookSel option:checked")).toHaveText("同じ ISBN の本");
  expect(await titles(page)).toEqual(["同じ ISBN の本", SAMPLE.meta.title]);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("先に書いた目的");
  // ISBN のない本は、同じ書名でも別の本として足される
  await addManualBook(page, { title: "同じ ISBN の本" });
  expect((await titles(page)).filter(t => t === "同じ ISBN の本")).toHaveLength(2);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("");
});

test("読み込めない文を貼ると、「読み込めなかった」と出て、本の一覧も今の本の内容も変わらない", async ({ page }) => {
  await openTool(page);
  await importState(page, anaBook());
  const before = await current(page), list = await titles(page), stored = await page.evaluate(k => localStorage.getItem(k), KEY);
  const alerts = []; page.on("dialog", d => { alerts.push(d.message()); d.accept(); });
  for (const text of ["", "ただの文", "```state\n{ 壊れている\n```", "```state\n[1,2]\n```"]) {
    alerts.length = 0;
    await page.click("#btnImport");
    await page.locator("#formImport textarea").fill(text);
    await page.locator("#formImport").getByRole("button", { name: "読み込む" }).click();
    await expect.poll(() => alerts.length, "「" + text + "」を貼ったとき").toBe(1);
    expect(alerts[0]).toMatch(/^読み込めなかった: /);
    await expect(page.locator("#dlgImport")).toBeHidden();
  }
  expect(await current(page)).toEqual(before);
  expect(await titles(page)).toEqual(list);
  expect(await page.evaluate(k => localStorage.getItem(k), KEY), "ブラウザに残る状態").toBe(stored);
  // 「やめる」で閉じたときは、貼ってあっても読み込まない
  await page.click("#btnImport");
  await page.locator("#formImport textarea").fill("```state\n" + JSON.stringify(anaBook({ purpose: "読み込まれてはいけない" })) + "\n```");
  await page.locator("#formImport").getByRole("button", { name: "やめる" }).click();
  await expect(page.locator("#dlgImport")).toBeHidden();
  await page.click("#btnImport"); // 開き直すと、欄は空
  await expect(page.locator("#formImport textarea")).toHaveValue("");
  await page.keyboard.press("Escape");
  expect(await current(page)).toEqual(before);
});

test("「Markdown をコピー」で、保存するのと同じ Markdown がクリップボードに入り、「コピーした。」と出る", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTool(page);
  await importState(page, anaBook());
  await page.locator('button[data-a="copy"]').click();
  await expect(page.locator("#msg")).toHaveText("コピーした。");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current())));
  expect(copied).toContain("\n# 見張りのテスト\n");
  expect(copied).toContain("- この本を読む目的: テスト用の目的");
  // 「Obsidian に保存」で送る Markdown と同じ
  await page.evaluate(() => { window.__opened = []; window.__dokusho.openUri = u => window.__opened.push(u); });
  await page.locator('button[data-a="save"]').click();
  await expect(page.locator("#msg")).toHaveText("Obsidian に送った。");
  const [uri] = await page.evaluate(() => window.__opened);
  expect(new URL(uri).searchParams.get("content")).toBe(copied);
});

test("クリップボードに書けないときは、「コピーできなかった。」と出る", async ({ page }) => {
  await openTool(page);
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("denied")); });
  await page.locator('button[data-a="copy"]').click();
  await expect(page.locator("#msg")).toHaveText("コピーできなかった。");
});

/* フォーカスのある部品が、固定の見出しの下から画面の下端までに、全部入っている */
async function expectFocusVisible(page, what) {
  const r = await page.evaluate(() => { const el = document.activeElement, b = el.getBoundingClientRect();
    return { p: el.dataset.p || el.id || el.tagName, top: b.top, bottom: b.bottom, head: document.querySelector("header").getBoundingClientRect().bottom, vh: window.innerHeight }; });
  expect(r.top, what + ": 「" + r.p + "」の上端が、固定の見出しの下端（" + r.head + "px）より下").toBeGreaterThanOrEqual(r.head);
  expect(r.bottom, what + ": 「" + r.p + "」の下端が、画面の中").toBeLessThanOrEqual(r.vh);
}
/* 画面の下から上へ、Shift+Tab で欄をたどる。上へ戻るたびに、フォーカスした欄が見出しの下に隠れやすい */
async function walkBack(page, steps) {
  await page.locator("#app textarea[data-p='memo']").focus();
  await expectFocusVisible(page, "自由メモ");
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Shift+Tab");
    await expectFocusVisible(page, "Shift+Tab " + (i + 1) + "回目");
  }
  expect(await page.evaluate(() => window.scrollY), "たどったあと、画面は先頭より下にある（見出しが欄の上に重なりうる位置）").toBeGreaterThan(0);
}

test("固定の見出しに、フォーカスした欄が隠れない（Shift+Tab で上へ戻るとき、欄を押したとき）", async ({ page }) => {
  await openTool(page);
  await walkBack(page, 60);
  // 見出しのすぐ下に半分隠れた欄へ、Tab で入る
  const inp = ruleItem(page, 6).locator('input[data-p="props.1.loc"]');
  await inp.evaluate(el => { window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 40); });
  await inp.focus();
  await expectFocusVisible(page, "見出しの下に隠れていた欄");
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px の幅の「本を足す」: 欄とボタンが画面に収まり、ブックリストから選んでも、手で入れても足せる", async ({ page }) => {
    await openTool(page);
    await page.click("#btnNew");
    const dlg = page.locator("#dlgBook");
    await page.locator("#pickHits tbody tr").first().waitFor();
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    const box = await dlg.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height, "ダイアログの下端が画面の中").toBeLessThanOrEqual(844);
    for (const loc of await dlg.locator(".fields input, #pickQ, button.primary, button[value=cancel]").all()) {
      const b = await loc.boundingBox(), name = await loc.evaluate(el => el.name || el.id || el.textContent);
      expect(b.x, name + " の左端").toBeGreaterThanOrEqual(box.x);
      expect(b.x + b.width, name + " の右端").toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(b.y + b.height, name + " の下端").toBeLessThanOrEqual(box.y + box.height + 0.5);
      expect(b.height, name + " の高さ").toBeGreaterThanOrEqual(24);
    }
    const pick = BOOKLIST[0];
    await page.locator("#pickQ").fill(String(pick.title).slice(0, 6));
    await page.locator('#pickHits tr[data-no="' + pick.no + '"]').click();
    await expect(page.locator('#formBook input[name="title"]')).toHaveValue(pick.title);
    await untilRedrawn(page, async () => {
      await page.locator("#formBook").getByRole("button", { name: "決定" }).click();
      await dlg.waitFor({ state: "hidden" });
    });
    await expect(page.locator("#bookSel option:checked")).toHaveText(pick.title);
    await addManualBook(page, { title: "狭い画面で足した本" });
    await expect(page.locator("#bookSel option:checked")).toHaveText("狭い画面で足した本");
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });

  test("390px の幅の「読み込む」: 欄とボタンが画面に収まり、貼って読み込める", async ({ page }) => {
    await openTool(page);
    await page.click("#btnImport");
    const dlg = page.locator("#dlgImport"), box = await dlg.boundingBox();
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    for (const loc of await dlg.locator("textarea, button").all()) {
      const b = await loc.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(box.x);
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      expect(b.height).toBeGreaterThanOrEqual(24);
    }
    await page.keyboard.press("Escape");
    await importState(page, anaBook());
    await expect(page.locator("#bookSel option:checked")).toHaveText("見張りのテスト");
    await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue("テスト用の目的");
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });

  test("390px の幅でも、固定の見出しに、フォーカスした欄が隠れない", async ({ page }) => {
    await openTool(page);
    await walkBack(page, 60);
  });
});
