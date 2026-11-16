// 仕様: ボタンやプルダウンを操作しても、フォーカスが失われない（issue #54）。
// 操作はキーボードで行う（部品にフォーカスを置いて、Space、Enter、文字のキーを押す）。
// 操作のあと、同じ働きの部品（描き直したあとの、タグと data-* が同じ部品）にフォーカスがあること、
// 画面の縦の位置が変わらないこと、次の Tab が隣の部品へ進むこと、続けて操作できることを確かめる。
// プルダウンは、文字のキーで選択肢を選ぶ（矢印キーは OS によって、選択肢の一覧を開く働きになるので使わない）。
const { test, expect } = require("@playwright/test");
const { BOOKLIST, openTool, importState, ruleItem, current } = require("./helpers");

function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "", subs: ["区分A", "区分B"] });
  const prop = (id, sup) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q: "Q1", grounds: [{ t: "根拠A", kind: "" }, { t: "根拠B", kind: "" }], arg: "", judge: "", why: "", self: "" });
  const b = { id: "t-focus", meta: { title: "フォーカスが残るテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 3, P: 3 }, purpose: "テスト用の目的", budget: "1時間", judge: "分析読書へ進む", kind: "理論書", subject: "テスト", unity: { what: "学問", claim: "学べ" },
      terms: ["用語A", "用語B", "用語C"].map(w => ({ w, m: "意味", p: "1", g: false })),
      points: ["要点A", "要点B", "要点C"], unclear: ["分からない語A"],
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1"), part("S3", "第3部", "S2")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "" }, { id: "Q3", t: "問いの三", parent: "" }],
      props: [prop("P1", "main"), prop("P2", "P1"), prop("P3", "P2")], restate: { s: "つまり", ex: "たとえば" } } };
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
/* いまフォーカスのある部品。タグと data-* と、それがある section */
const active = page => page.evaluate(() => { const el = document.activeElement, sec = el.closest("section");
  return { tag: el.tagName, data: Object.assign({}, el.dataset), sec: sec ? sec.id : "" }; });
/* フォーカスが、タグと data-* がこのとおりの部品にある（sec を渡したら、その section の中にある） */
async function expectFocus(page, tag, data, sec) {
  const a = await active(page);
  expect({ tag: a.tag, data: a.data }, "フォーカスのある部品").toEqual({ tag, data });
  if (sec) expect(a.sec, "フォーカスのある部品がある section").toBe(sec);
}
const scrollY = page => page.evaluate(() => window.scrollY);
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* 部品にフォーカスを置く。置いたあとの画面の縦の位置を返す */
async function put(page, loc) {
  await loc.focus();
  await expect(loc).toBeFocused();
  return scrollY(page);
}
/* キーを押す。フォーカスが tag と data の部品にあり、画面の縦の位置が y のままであることを確かめる */
async function press(page, key, y, tag, data, sec) {
  await page.keyboard.press(key);
  await expectFocus(page, tag, data, sec);
  expect(await scrollY(page), "画面の縦の位置").toBe(y);
}
/* Tab を1回押すと、いまの部品の次に Tab が止まる部品へ進む（ページの先頭に飛ばない） */
async function tabGoesNext(page) {
  const found = await page.evaluate(() => {
    const root = document.querySelector("dialog[open]") || document;
    const stops = [...root.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].filter(o => !o.disabled && o.tabIndex >= 0 && o.getClientRects().length);
    const next = stops[stops.indexOf(document.activeElement) + 1];
    if (!stops.includes(document.activeElement) || !next) return false;
    next.__next = true; return true;
  });
  expect(found, "いまフォーカスのある部品と、その次に Tab が止まる部品が見つかる").toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.__next === true), "Tab で次の部品に進む").toBe(true);
}
const BTN = "BUTTON", SEL = "SELECT";

test("サンプルの本: 規則9の P3 の「賛成」を Space で押しても、フォーカスが残り、次の Tab は隣の「反対」へ進む", async ({ page }) => {
  await openTool(page);
  const data = { a: "set", p: "props.2.judge", val: "賛成" };
  const btn = page.locator('button[data-a="set"][data-p="props.2.judge"][data-val="賛成"]');
  const y = await put(page, btn);
  expect(y, "規則9は、ページの先頭より下にある").toBeGreaterThan(1000);
  const was = (await current(page)).v.props[2].judge;
  await press(page, "Space", y, BTN, data);
  expect((await current(page)).v.props[2].judge).toBe(was === "賛成" ? "" : "賛成");
  // 続けて押せる（選ぶ、外す、を繰り返す）
  await press(page, "Space", y, BTN, data);
  await press(page, "Enter", y, BTN, data);
  expect((await current(page)).v.props[2].judge).toBe(was === "賛成" ? "" : "賛成");
  await tabGoesNext(page);
  await expectFocus(page, BTN, { a: "set", p: "props.2.judge", val: "反対" });
  expect(await scrollY(page), "Tab のあとも、ページの先頭に戻らない").toBe(y);
});

test("選択のボタン（かける時間、理論書の種類、根拠の種類、それは真実か）を Enter や Space で押しても、フォーカスが残る", async ({ page }) => {
  await setup(page);
  for (const [p, val, key] of [["budget", "3時間", "Enter"], ["ksub", "科学", "Space"], ["props.1.grounds.0.kind", "理屈", "Enter"], ["stance", "判断保留", "Space"]]) {
    const data = { a: "set", p, val };
    const y = await put(page, page.locator(`button[data-a="set"][data-p="${p}"][data-val="${val}"]`));
    await press(page, key, y, BTN, data);
    expect(await page.evaluate(() => document.activeElement.className), p + " が選ばれた見た目になる").toContain("on");
    expect(p.split(".").reduce((o, k) => o[k], (await current(page)).v)).toBe(val);
    // 続けて押せる（外す、選び直す）
    await press(page, key, y, BTN, data);
    await press(page, key, y, BTN, data);
    expect(p.split(".").reduce((o, k) => o[k], (await current(page)).v)).toBe(val);
    await tabGoesNext(page);
  }
});

test("「判定」を変えて、下の section が出入りしても、押したボタンにフォーカスが残る", async ({ page }) => {
  await setup(page);
  await expect(page.locator("#sec-a1")).toBeVisible();
  const y = await put(page, page.locator('button[data-a="set"][data-p="judge"][data-val="表面読みへ進む"]'));
  await press(page, "Space", y, BTN, { a: "set", p: "judge", val: "表面読みへ進む" });
  await expect(page.locator("#sec-a1")).toHaveCount(0);
  await tabGoesNext(page);
  await expectFocus(page, BTN, { a: "set", p: "judge", val: "分析読書へ進む" });
  await press(page, "Enter", y, BTN, { a: "set", p: "judge", val: "分析読書へ進む" });
  await expect(page.locator("#sec-a1")).toBeVisible();
});

test("同じ選択のボタンが2か所に出る欄（下読みと規則1の「本の種類」）では、押した側にフォーカスが残る", async ({ page }) => {
  await setup(page);
  const data = { a: "set", p: "kind", val: "文学" };
  const y = await put(page, ruleItem(page, 1).locator('button[data-a="set"][data-p="kind"][data-val="文学"]'));
  await press(page, "Space", y, BTN, data, "sec-a1");
  await press(page, "Space", y, BTN, data, "sec-a1");
  const y2 = await put(page, page.locator('#sec-shitayomi button[data-a="set"][data-p="kind"][data-val="文学"]'));
  await press(page, "Enter", y2, BTN, data, "sec-shitayomi");
});

test("「？」を Enter で押すと、説明が開いても閉じても、フォーカスが残る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 1), data = { a: "help", id: "kind@1" };
  const y = await put(page, item.locator('button[data-a="help"]'));
  await press(page, "Enter", y, BTN, data);
  await expect(item.locator(".help").first()).toContainText("章の中の規則");
  await press(page, "Enter", y, BTN, data);
  await expect(item).not.toContainText("章の中の規則");
  await press(page, "Space", y, BTN, data);
  await expect(item.locator(".help").first()).toContainText("章の中の規則");
  await tabGoesNext(page);
});

test("「やらない」を Space で押しても、フォーカスが残る。戻すときも残る", async ({ page }) => {
  await setup(page);
  const item = ruleItem(page, 3), data = { a: "skip", r: "3" };
  const y = await put(page, item.locator('button[data-a="skip"]'));
  await press(page, "Space", y, BTN, data);
  await expect(item).toHaveClass(/skipped/);
  expect((await current(page)).skip["3"]).toBe(true);
  await tabGoesNext(page);
  await expectFocus(page, BTN, { a: "help", id: "parts@3" });
  await page.keyboard.press("Shift+Tab");
  await press(page, "Space", y, BTN, data);
  await expect(item).not.toHaveClass(/skipped/);
  await press(page, "Enter", y, BTN, data);
  await expect(item).toHaveClass(/skipped/);
});

test("「この本にはない」「やらない」（欄の代わりのボタン）と、用語集に入れる語のボタンを押しても、フォーカスが残る", async ({ page }) => {
  await setup(page);
  for (const [a, p] of [["alt", "s1"], ["alt", "unclear"], ["alt", "action"], ["flip", "terms.1.g"]]) {
    const data = { a, p };
    const y = await put(page, page.locator(`button[data-a="${a}"][data-p="${p}"]`));
    await press(page, "Space", y, BTN, data);
    expect(await page.evaluate(() => document.activeElement.className), p + " が選ばれた見た目になる").toContain("on");
    await press(page, "Enter", y, BTN, data);
    await press(page, "Space", y, BTN, data);
    await tabGoesNext(page);
  }
  expect((await current(page)).v.terms[1].g).toBe(true);
});

test("「↓」「↑」を押すと、動かした行の同じ向きのボタンにフォーカスが残る。端で動かなかったときも残る", async ({ page }) => {
  await setup(page);
  const ids = () => ruleItem(page, 3).locator(".prow > .id").allInnerTexts();
  const y = await put(page, page.locator('button[data-a="down"][data-p="parts"][data-i="0"]'));
  await press(page, "Space", y, BTN, { a: "down", p: "parts", i: "1" });
  expect(await ids()).toEqual(["S2", "S1", "S3"]);
  // 2回目は、動かした行が画面の下へ出る。フォーカスのある「↓」が見える所まで、画面が動く（issue #75）
  await page.keyboard.press("Space");
  await expectFocus(page, BTN, { a: "down", p: "parts", i: "2" });
  const y1 = await scrollY(page);
  expect(y1, "画面の縦の位置（下へ動く）").toBeGreaterThan(y);
  expect(await page.evaluate(() => document.activeElement.getBoundingClientRect().bottom <= window.innerHeight), "フォーカスのある「↓」が、画面の中にある").toBe(true);
  expect(await ids()).toEqual(["S2", "S3", "S1"]);
  // いちばん下では動かない。フォーカスは同じボタンに残る
  await press(page, "Enter", y1, BTN, { a: "down", p: "parts", i: "2" });
  expect(await ids()).toEqual(["S2", "S3", "S1"]);
  await tabGoesNext(page);
  await expectFocus(page, BTN, { a: "del", p: "parts", i: "2" });
  const y2 = await put(page, page.locator('button[data-a="up"][data-p="parts"][data-i="2"]'));
  await press(page, "Enter", y2, BTN, { a: "up", p: "parts", i: "1" });
  await press(page, "Enter", y2, BTN, { a: "up", p: "parts", i: "0" });
  expect(await ids()).toEqual(["S1", "S2", "S3"]);
  await press(page, "Space", y2, BTN, { a: "up", p: "parts", i: "0" });
  expect(await ids()).toEqual(["S1", "S2", "S3"]);
  await tabGoesNext(page);
  await expectFocus(page, BTN, { a: "down", p: "parts", i: "0" });
});

test("「×」で行を消すと、次の行の「×」、次がなければ前の行の「×」、行がなくなれば「足す」にフォーカスがある", async ({ page }) => {
  await setup(page);
  const item = page.locator("#sec-hyomen .item").first();
  // 3行のまん中を消す → 次の行（同じ位置に来る）の「×」
  const y = await put(page, item.locator('button[data-a="del"][data-i="1"]'));
  await press(page, "Space", y, BTN, { a: "del", p: "points", i: "1" });
  expect((await current(page)).v.points).toEqual(["要点A", "要点C"]);
  // 末尾を消す → 前の行の「×」
  await press(page, "Space", y, BTN, { a: "del", p: "points", i: "0" });
  expect((await current(page)).v.points).toEqual(["要点A"]);
  // 最後の1行を消す → 「足す」
  await press(page, "Enter", y, BTN, { a: "push", p: "points", tpl: "str" });
  expect((await current(page)).v.points).toEqual([]);
  await tabGoesNext(page);
});

test("命題、根拠、下位の区分、問題の「×」でも、近くの「×」か「足す」にフォーカスがある", async ({ page }) => {
  page.on("dialog", d => d.accept()); // 中身のある命題・部分・問題を消す前の確認（#61）を受ける
  await setup(page);
  // 根拠（命題 P2 のカードの中）
  let y = await put(page, page.locator('button[data-a="del"][data-p="props.1.grounds"][data-i="0"]'));
  await press(page, "Enter", y, BTN, { a: "del", p: "props.1.grounds", i: "0" });
  await press(page, "Enter", y, BTN, { a: "push", p: "props.1.grounds", tpl: "ground" });
  // 下位の区分（部分 S2 の中）
  y = await put(page, page.locator('button[data-a="del"][data-p="parts.1.subs"][data-i="1"]'));
  await press(page, "Space", y, BTN, { a: "del", p: "parts.1.subs", i: "0" });
  await press(page, "Space", y, BTN, { a: "push", p: "parts.1.subs", tpl: "str" });
  // 問題
  y = await put(page, page.locator('button[data-a="del"][data-p="qs"][data-i="2"]'));
  await press(page, "Space", y, BTN, { a: "del", p: "qs", i: "1" });
  expect((await current(page)).v.qs.map(o => o.id)).toEqual(["Q1", "Q2"]);
  // 命題。先頭から続けて全部消す
  y = await put(page, page.locator('button[data-a="del"][data-p="props"][data-i="0"]'));
  await press(page, "Enter", y, BTN, { a: "del", p: "props", i: "0" });
  expect((await current(page)).v.props.map(o => o.id)).toEqual(["P2", "P3"]);
  await press(page, "Enter", y, BTN, { a: "del", p: "props", i: "0" });
  await press(page, "Enter", y, BTN, { a: "push", p: "props", tpl: "prop" });
  expect((await current(page)).v.props).toEqual([]);
  await tabGoesNext(page);
});

test("用語の欄は2か所に出る。規則5の側で「×」を押したら、規則5の側の「×」にフォーカスがある", async ({ page }) => {
  await setup(page);
  const y = await put(page, ruleItem(page, 5).locator('button[data-a="del"][data-i="1"]'));
  await press(page, "Space", y, BTN, { a: "del", p: "terms", i: "1" }, "sec-a2");
  expect((await current(page)).v.terms.map(t => t.w)).toEqual(["用語A", "用語C"]);
  await press(page, "Space", y, BTN, { a: "del", p: "terms", i: "0" }, "sec-a2");
  await press(page, "Space", y, BTN, { a: "push", p: "terms", tpl: "term" }, "sec-a2");
  // 下読みの側で押したら、下読みの側に残る
  await page.keyboard.press("Enter");
  await expect(ruleItem(page, 5).locator('input[data-p="terms.0.w"]')).toBeFocused();
  const y2 = await put(page, page.locator('#sec-shitayomi button[data-a="del"][data-p="terms"]'));
  await press(page, "Enter", y2, BTN, { a: "push", p: "terms", tpl: "term" }, "sec-shitayomi");
});

/* チェックアウトはページの末尾にある。ページが短くなったときは、その分だけ上がる（それより上には動かない） */
async function pressAtEnd(page, key, tag, data) {
  const y = await scrollY(page);
  await page.keyboard.press(key);
  await expectFocus(page, tag, data);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(await scrollY(page), "画面の縦の位置").toBe(Math.min(y, max));
  await expect(page.locator(":focus")).toBeInViewport();
}

test("「読了にする」「読了を取り消す」を押すと、入れ替わったあとのボタンにフォーカスがある", async ({ page }) => {
  const b = base({ judge: "やめる", meaning: "テスト用の意義" });
  await setup(page, b);
  await put(page, page.locator('button[data-a="finish"]'));
  await pressAtEnd(page, "Enter", BTN, { a: "unfinish" });
  expect((await current(page)).meta.finished).not.toBe("");
  await expect(page.locator("#finish")).toContainText("読了: ");
  await pressAtEnd(page, "Enter", BTN, { a: "finish" });
  expect((await current(page)).meta.finished).toBe("");
  await pressAtEnd(page, "Space", BTN, { a: "unfinish" });
  await tabGoesNext(page);
  await expectFocus(page, BTN, { a: "save" });
});

test("「読了を取り消す」を押して「読了にする」が押せない状態になったら、隣の「Obsidian に保存」にフォーカスがある", async ({ page }) => {
  const b = base({ judge: "やめる", meaning: "" }); b.meta.finished = "2026-11-15";
  await setup(page, b);
  await put(page, page.locator('button[data-a="unfinish"]'));
  await pressAtEnd(page, "Enter", BTN, { a: "save" });
  await expect(page.locator('button[data-a="finish"]')).toBeDisabled();
});

test("プルダウンを文字のキーで変えても、フォーカスが残り、続けて別の選択肢に変えられる", async ({ page }) => {
  await setup(page);
  // 命題 P1 の「答える問題」。Q を押すたびに、Q で始まる次の選択肢へ移る
  const q = () => current(page).then(b => b.v.props[0].q);
  const y = await put(page, page.locator('select[data-p="props.0.q"]'));
  await press(page, "Q", y, SEL, { p: "props.0.q" });
  expect(await q()).toBe("Q2");
  await expect(page.locator('select[data-p="props.0.q"]')).toHaveValue("Q2");
  await press(page, "Q", y, SEL, { p: "props.0.q" });
  expect(await q()).toBe("Q3");
  await press(page, "Q", y, SEL, { p: "props.0.q" });
  expect(await q()).toBe("Q1");
  await tabGoesNext(page);
  // 命題 P3 の「位置づけ」
  const y2 = await put(page, page.locator('select[data-p="props.2.sup"]'));
  await press(page, "P", y2, SEL, { p: "props.2.sup" });
  expect((await current(page)).v.props[2].sup).toBe("P1");
  await press(page, "P", y2, SEL, { p: "props.2.sup" });
  expect((await current(page)).v.props[2].sup).toBe("P2");
  // 問題 Q2 の「従属」
  const y3 = await put(page, page.locator('select[data-p="qs.1.parent"]'));
  await press(page, "Q", y3, SEL, { p: "qs.1.parent" });
  expect((await current(page)).v.qs[1].parent).toBe("Q1");
  await press(page, "Q", y3, SEL, { p: "qs.1.parent" });
  expect((await current(page)).v.qs[1].parent).toBe("Q3");
});

test("部分の「どの部分と」を変えて、隣に「どうつながる」のプルダウンが出ても、変えたプルダウンにフォーカスが残る", async ({ page }) => {
  await setup(page);
  await expect(page.locator('select[data-p="parts.0.link"]')).toHaveCount(0);
  const y = await put(page, page.locator('select[data-p="parts.0.to"]'));
  await press(page, "S", y, SEL, { p: "parts.0.to" });
  expect((await current(page)).v.parts[0].to).toBe("S2");
  await expect(page.locator('select[data-p="parts.0.link"]')).toBeVisible();
  await press(page, "S", y, SEL, { p: "parts.0.to" });
  expect((await current(page)).v.parts[0].to).toBe("S3");
  await tabGoesNext(page);
  await expectFocus(page, SEL, { p: "parts.0.link" });
});

test("マウスで選択のボタンを押したときも、押したボタンにフォーカスが残る", async ({ page }) => {
  await setup(page);
  const btn = page.locator('button[data-a="set"][data-p="props.0.judge"][data-val="反対"]');
  await btn.scrollIntoViewIfNeeded();
  const y = await scrollY(page);
  await btn.click();
  await expectFocus(page, BTN, { a: "set", p: "props.0.judge", val: "反対" });
  expect(await scrollY(page)).toBe(y);
  await tabGoesNext(page);
});

test("いままでどおり: 「足す」を押すと、足した行の最初の欄にフォーカスが移る。フォーカスが画面の外側（本の選択）にあるときは、動かない", async ({ page }) => {
  await setup(page);
  await put(page, page.locator('button[data-a="push"][data-p="points"]'));
  await page.keyboard.press("Enter");
  await expect(page.locator('input[data-p="points.3"]')).toBeFocused();
  // 欄の中の Enter でも、行が足されて、足した行に移る
  await page.keyboard.press("Enter");
  await expect(page.locator('input[data-p="points.4"]')).toBeFocused();
  await page.locator("#bookSel").focus();
  await page.evaluate(() => document.querySelector('button[data-a="set"][data-p="budget"][data-val="30分"]').click());
  expect((await current(page)).v.budget).toBe("30分");
  await expect(page.locator("#bookSel")).toBeFocused();
});

/* 「本を足す」の表。表の中のスクロールの位置 */
const tableScroll = page => page.evaluate(() => { const el = document.getElementById("pickHits"); return { top: el.scrollTop, left: el.scrollLeft }; });

test("「本を足す」の表で、行を Enter で選ぶと、その行にフォーカスが残り、表の中のスクロールの位置も変わらない", async ({ page }) => {
  await openTool(page);
  await page.click("#btnNew");
  const rows = page.locator("#pickHits tbody tr");
  await expect(rows).toHaveCount(BOOKLIST.length);
  const row = rows.nth(30), no = await row.getAttribute("data-no");
  await row.focus();
  await expect(row).toBeFocused();
  const sc = await tableScroll(page);
  expect(sc.top, "30行目は、表の中をスクロールした先にある").toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expectFocus(page, "TR", { no });
  expect(await page.evaluate(() => document.activeElement.className)).toContain("sel");
  await expect(page.locator('#formBook input[name="booklist_no"]')).toHaveValue(no);
  expect(await tableScroll(page)).toEqual(sc);
  // 続けて、次の行を選ぶ
  await tabGoesNext(page);
  const no2 = await rows.nth(31).getAttribute("data-no");
  await expectFocus(page, "TR", { no: no2 });
  await page.keyboard.press("Enter");
  await expectFocus(page, "TR", { no: no2 });
  await expect(page.locator('#formBook input[name="booklist_no"]')).toHaveValue(no2);
  await page.keyboard.press("Enter");
  await expectFocus(page, "TR", { no: no2 });
  expect(await tableScroll(page)).toEqual(sc);
});

test("「本を足す」の表で、見出しの並べ替えのボタンを押しても、同じ列の見出しのボタンにフォーカスが残る", async ({ page }) => {
  await openTool(page);
  await page.click("#btnNew");
  await expect(page.locator("#pickHits tbody tr")).toHaveCount(BOOKLIST.length);
  await page.locator("#pickHits").evaluate(el => { el.scrollTop = 300; });
  const sc = await tableScroll(page);
  expect(sc.top).toBe(300);
  const head = page.locator('#pickHits thead button[data-col="priority"]');
  await head.focus();
  await expect(head).toBeFocused();
  await page.keyboard.press("Enter");
  await expectFocus(page, BTN, { col: "priority" });
  await expect(head).toHaveText("優先 ▼");
  expect(await tableScroll(page)).toEqual(sc);
  await page.keyboard.press("Space");
  await expectFocus(page, BTN, { col: "priority" });
  await expect(head).toHaveText("優先 ▲");
  await page.keyboard.press("Enter");
  await expectFocus(page, BTN, { col: "priority" });
  await expect(head).toHaveText("優先 ▼");
  expect(await tableScroll(page)).toEqual(sc);
  await tabGoesNext(page);
  await expectFocus(page, BTN, { col: "extscore" });
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("390px の幅でも、ボタン、プルダウン、「×」、「↓」の操作のあとにフォーカスが残り、横にはみ出さない", async ({ page }) => {
    await setup(page);
    let y = await put(page, page.locator('button[data-a="set"][data-p="props.2.judge"][data-val="賛成"]'));
    await press(page, "Space", y, BTN, { a: "set", p: "props.2.judge", val: "賛成" });
    await press(page, "Space", y, BTN, { a: "set", p: "props.2.judge", val: "賛成" });
    await tabGoesNext(page);
    expect(await scrollY(page), "Tab のあとも、ページの先頭に戻らない").toBe(y);
    y = await put(page, ruleItem(page, 9).locator('button[data-a="help"]'));
    await press(page, "Enter", y, BTN, { a: "help", id: "restate@9" });
    y = await put(page, page.locator('select[data-p="props.0.q"]'));
    await press(page, "Q", y, SEL, { p: "props.0.q" });
    await press(page, "Q", y, SEL, { p: "props.0.q" });
    expect((await current(page)).v.props[0].q).toBe("Q3");
    y = await put(page, page.locator('button[data-a="down"][data-p="parts"][data-i="0"]'));
    // この幅では、動かした行が画面の下へ出る。フォーカスのある「↓」が見える所まで、画面が動く（issue #75）
    for (const i of ["1", "2"]) {
      await page.keyboard.press("Space");
      await expectFocus(page, BTN, { a: "down", p: "parts", i });
      expect(await scrollY(page), "画面の縦の位置（下へ動く）").toBeGreaterThan(y);
      expect(await page.evaluate(() => document.activeElement.getBoundingClientRect().bottom <= window.innerHeight), "フォーカスのある「↓」が、画面の中にある").toBe(true);
      y = await scrollY(page);
    }
    y = await put(page, page.locator('button[data-a="del"][data-p="points"][data-i="2"]'));
    await press(page, "Enter", y, BTN, { a: "del", p: "points", i: "1" });
    await press(page, "Enter", y, BTN, { a: "del", p: "points", i: "0" });
    await press(page, "Enter", y, BTN, { a: "push", p: "points", tpl: "str" });
    await tabGoesNext(page);
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });

  test("390px の幅でも、「本を足す」の表で行を選んだあと、見出しを押したあとに、フォーカスが残り、横にはみ出さない", async ({ page }) => {
    await openTool(page);
    await page.click("#btnNew");
    const rows = page.locator("#pickHits tbody tr");
    await expect(rows).toHaveCount(BOOKLIST.length);
    const row = rows.nth(12), no = await row.getAttribute("data-no");
    await row.focus();
    const sc = await tableScroll(page);
    await page.keyboard.press("Enter");
    await expectFocus(page, "TR", { no });
    await page.keyboard.press("Enter");
    await expectFocus(page, "TR", { no });
    expect(await tableScroll(page)).toEqual(sc);
    await tabGoesNext(page);
    const head = page.locator('#pickHits thead button[data-col="title"]');
    await head.focus();
    const sc2 = await tableScroll(page);
    await page.keyboard.press("Enter");
    await expectFocus(page, BTN, { col: "title" });
    await page.keyboard.press("Enter");
    await expectFocus(page, BTN, { col: "title" });
    expect(await tableScroll(page)).toEqual(sc2);
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});

test.describe("タッチの端末（iPhone など）", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("タッチの端末では、プルダウンを変えたあと、そのプルダウンにフォーカスを置き直さない。値は変わり、画面の縦の位置は動かない。ボタンには残る", async ({ page }) => {
    await setup(page);
    expect(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches), "この設定は、主な入力がタッチの端末として扱われる").toBe(true);
    const y = await put(page, page.locator('select[data-p="props.0.q"]'));
    await page.keyboard.press("Q");
    expect((await current(page)).v.props[0].q).toBe("Q2");
    await expect(page.locator('select[data-p="props.0.q"]')).toHaveValue("Q2");
    expect((await active(page)).tag, "フォーカスのある部品（プルダウンには置き直さない）").not.toBe("SELECT");
    expect(await scrollY(page), "画面の縦の位置").toBe(y);
    // 続けて変えられる（置き直さないので、もう一度プルダウンに入る）
    await put(page, page.locator('select[data-p="props.0.q"]'));
    await page.keyboard.press("Q");
    expect((await current(page)).v.props[0].q).toBe("Q3");
    expect((await active(page)).tag, "フォーカスのある部品（プルダウンには置き直さない）").not.toBe("SELECT");
    expect(await scrollY(page), "画面の縦の位置").toBe(y);
    // ボタンの置き直しは、タッチの端末でもそのまま
    const y2 = await put(page, page.locator('button[data-a="set"][data-p="props.2.judge"][data-val="賛成"]'));
    await press(page, "Space", y2, BTN, { a: "set", p: "props.2.judge", val: "賛成" });
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});

/* キーを押したままにする。2回目からの keydown は、キーリピート（repeat）になる */
async function hold(page, key, times) {
  for (let i = 0; i < times; i++) await page.keyboard.down(key);
  await page.keyboard.up(key);
}

test.describe("押したまま、マウスのあとのキー（審査の指摘）", () => {
  test("「×」で Enter を押したままにしても、消えるのは1行だけ（命題と、要点の一覧）", async ({ page }) => {
    page.on("dialog", d => d.accept()); // 中身のある命題・部分・問題を消す前の確認（#61）を受ける
    await setup(page);
    await put(page, page.locator('button[data-a="del"][data-p="props"][data-i="0"]'));
    await hold(page, "Enter", 8);
    await expectFocus(page, BTN, { a: "del", p: "props", i: "0" });
    expect((await current(page)).v.props.map(o => o.id), "残った命題").toEqual(["P2", "P3"]);
    await put(page, page.locator('button[data-a="del"][data-p="points"][data-i="0"]'));
    await hold(page, "Enter", 8);
    await expectFocus(page, BTN, { a: "del", p: "points", i: "0" });
    expect((await current(page)).v.points, "残った要点").toEqual(["要点B", "要点C"]);
    // 離してから押し直すと、次の1行が消える（続けて消す働きは、いままでどおり）
    await page.keyboard.press("Enter");
    expect((await current(page)).v.points).toEqual(["要点C"]);
    // Space の押したままも、1行だけ
    await hold(page, "Space", 8);
    expect((await current(page)).v.points).toEqual([]);
    await expectFocus(page, BTN, { a: "push", p: "points", tpl: "str" });
    expect((await current(page)).v.props.map(o => o.id)).toEqual(["P2", "P3"]);
  });

  test("サンプルの本: 規則6の P1 の「×」で Enter を押したままにしても、P2 から後ろの命題は残る", async ({ page }) => {
    page.on("dialog", d => d.accept()); // 中身のある命題・部分・問題を消す前の確認（#61）を受ける
    await openTool(page);
    const ids = (await current(page)).v.props.map(o => o.id);
    expect(ids.length, "サンプルの命題の数").toBeGreaterThan(2);
    await put(page, page.locator('button[data-a="del"][data-p="props"][data-i="0"]'));
    await hold(page, "Enter", 8);
    expect((await current(page)).v.props.map(o => o.id)).toEqual(ids.slice(1));
  });

  test("選択のボタン、「やらない」、「？」、「↓」は、Enter を押したままにしても、1回だけ働く", async ({ page }) => {
    await setup(page);
    await put(page, page.locator('button[data-a="set"][data-p="budget"][data-val="3時間"]'));
    await hold(page, "Enter", 4);
    await expectFocus(page, BTN, { a: "set", p: "budget", val: "3時間" });
    expect((await current(page)).v.budget, "1回だけ切り替わる").toBe("3時間");
    await hold(page, "Space", 4);
    expect((await current(page)).v.budget, "Space の押したままも、1回だけ").toBe("");
    await put(page, ruleItem(page, 3).locator('button[data-a="skip"]'));
    await hold(page, "Enter", 4);
    expect((await current(page)).skip["3"]).toBe(true);
    await hold(page, "Enter", 4);
    expect((await current(page)).skip["3"]).toBe(false);
    await put(page, ruleItem(page, 1).locator('button[data-a="help"]'));
    await hold(page, "Enter", 4);
    await expect(ruleItem(page, 1).locator(".help").first()).toContainText("章の中の規則");
    await put(page, page.locator('button[data-a="down"][data-p="parts"][data-i="0"]'));
    await hold(page, "Enter", 4);
    await expect(ruleItem(page, 3).locator(".prow > .id")).toHaveText(["S2", "S1", "S3"]);
    await expectFocus(page, BTN, { a: "down", p: "parts", i: "1" });
  });

  test("「本を足す」の表でも、Enter を押したままにして働くのは1回だけ（見出しの並べ替え、行の選択）", async ({ page }) => {
    const asked = [];
    page.on("request", r => { if (r.url().startsWith("https://api.openbd.jp/")) asked.push(r.url()); });
    await openTool(page);
    await page.click("#btnNew");
    const rows = page.locator("#pickHits tbody tr");
    await expect(rows).toHaveCount(BOOKLIST.length);
    const head = page.locator('#pickHits thead button[data-col="title"]');
    await head.focus();
    await expect(head).toBeFocused();
    await hold(page, "Enter", 4);
    await expectFocus(page, BTN, { col: "title" });
    await expect(head, "並べ替えは1回だけ（向きが反転しない）").toHaveText("書名 ▼");
    // 行の選択。書誌を取りに行くのは1回だけ
    const k = BOOKLIST.find(b => /^97[89]\d{10}$/.test(String(b.isbn).replace(/\D/g, "")));
    const row = page.locator(`#pickHits tbody tr[data-no="${k.no}"]`);
    await row.focus();
    await expect(row).toBeFocused();
    await hold(page, "Enter", 4);
    await expectFocus(page, "TR", { no: String(k.no) });
    await expect(page.locator('#formBook input[name="booklist_no"]')).toHaveValue(String(k.no));
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(asked.length, "openBD に書誌を取りに行った回数").toBe(1);
  });

  test("マウスで「×」を押したあとは、どの「×」にもフォーカスを置かない。続く Space と Enter で、別の行が消えない", async ({ page }) => {
    page.on("dialog", d => d.accept()); // 中身のある命題・部分・問題を消す前の確認（#61）を受ける
    await setup(page);
    // 命題 P2 の「×」
    await page.locator('button[data-a="del"][data-p="props"][data-i="1"]').click();
    expect((await current(page)).v.props.map(o => o.id)).toEqual(["P1", "P3"]);
    expect((await active(page)).data.a, "フォーカスのある部品は「×」ではない").not.toBe("del");
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    expect((await current(page)).v.props.map(o => o.id), "残った命題").toEqual(["P1", "P3"]);
    // 要点の一覧
    await page.locator('button[data-a="del"][data-p="points"][data-i="0"]').click();
    expect((await active(page)).data.a, "フォーカスのある部品は「×」ではない").not.toBe("del");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    expect((await current(page)).v.points, "残った要点").toEqual(["要点B", "要点C"]);
    // マウスでほかのボタンを押したときの置き直しは、いままでどおり
    await page.locator('button[data-a="set"][data-p="budget"][data-val="30分"]').click();
    await expectFocus(page, BTN, { a: "set", p: "budget", val: "30分" });
    // キーボードで「×」を押したときも、いままでどおり（次の行の「×」）
    const y = await put(page, page.locator('button[data-a="del"][data-p="points"][data-i="0"]'));
    await press(page, "Enter", y, BTN, { a: "del", p: "points", i: "0" });
    expect((await current(page)).v.points).toEqual(["要点C"]);
  });

  test("選択肢が日本語だけのプルダウン（部分の「役割」「どうつながる」）を変えても、フォーカスが残る", async ({ page }) => {
    await setup(page);
    for (const [p, val] of [["parts.1.role", "主張を述べる"], ["parts.1.link", "と対比する"]]) {
      const loc = page.locator(`select[data-p="${p}"]`);
      const y = await put(page, loc);
      await loc.selectOption(val);
      await expectFocus(page, SEL, { p });
      await expect(page.locator(`select[data-p="${p}"]`)).toHaveValue(val);
      expect(p.split(".").reduce((o, k) => o[k], (await current(page)).v)).toBe(val);
      expect(await scrollY(page), "画面の縦の位置").toBe(y);
      await tabGoesNext(page);
    }
  });
});
