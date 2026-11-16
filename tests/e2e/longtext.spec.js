// 仕様: 命題の文、部分の概要、根拠、問題の文は、長くても、入力欄の中で折り返して全部見える（issue #63）。
// 欄の高さは、内容に合わせて伸び縮みする。保存される値に、改行は入らない（Enter は改行にならず、issue #65 の決まりどおりに働く。貼り付けた文の改行は、空白になる）。
// ほかの欄（用語、ページ、場所、名前など）は、1行の欄のまま。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current, loadWindowJs } = require("./helpers");

const SAMPLE = loadWindowJs("sample.js").SAMPLES[0];
const LONG = "あいうえおかきくけこ".repeat(6); // 60字
/* 対象の4つの欄: [data-p, それがある規則, aria-label, placeholder] */
const FIELDS = [["props.0.t", 6, "P1 の命題", "命題を自分の言葉で"], ["parts.0.sum", 3, "S1 の概要", "この部分が言っていること"], ["props.0.grounds.0.t", 7, "P1 の根拠 1", "根拠として挙げていること"], ["qs.0.t", 4, "Q1 の問い", "著者が答えようとしている問い"]];
function base(over) {
  const part = (id, t, to) => ({ id, t, role: "問題を示す", to, link: to ? "を受けて進める" : "", sum: "概要 " + id, rel: "受け持つ所 " + id, subs: [] });
  const prop = (id, sup) => ({ id, t: "テスト用の命題 " + id, loc: "1章", sup, q: "", grounds: [{ t: "根拠A", kind: "" }, { t: "根拠B", kind: "" }], arg: "", judge: "", why: "", self: "" });
  const b = { id: "t-long", meta: { title: "長い文のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 3, Q: 2, P: 3 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", subject: "テスト", unity: { what: "学問", claim: "学べ" }, unityA: { what: "学問", claim: "学べ" },
      parts: [part("S1", "第1部", ""), part("S2", "第2部", "S1"), part("S3", "第3部", "S2")],
      qs: [{ id: "Q1", t: "問いの一", parent: "" }, { id: "Q2", t: "問いの二", parent: "" }],
      props: [prop("P1", "main"), prop("P2", "P1"), prop("P3", "P2")] } };
  Object.assign(b.v, over || {});
  return b;
}
async function setup(page, book) {
  await openTool(page);
  book = book || base();
  await importState(page, book);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose || "");
}
const field = (page, p, r) => ruleItem(page, r).locator('[data-p="' + p + '"]');
/* 欄の中身が、欄の中に全部見えているか。fits: 縦にも横にも、隠れた分がない。lines: 中身の行数。h: 欄の高さ */
const view = loc => loc.evaluate(el => { const cs = getComputedStyle(el), pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), r = el.getBoundingClientRect();
  return { fits: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1, lines: Math.round((el.scrollHeight - pad) / parseFloat(cs.lineHeight)), h: r.height, top: r.top, value: el.value }; });
/* 中身がちょうど収まる高さ（余分に高くない）か */
const snug = loc => loc.evaluate(el => { const h = el.style.height; el.style.height = "0px"; const need = el.scrollHeight + el.offsetHeight - el.clientHeight; el.style.height = h; return Math.abs(el.getBoundingClientRect().height - need) <= 2; });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const ONE = 39.5; // 1行の欄の高さ（これまでの input と同じ）

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(w + "px の幅", () => {
    test.use({ viewport: { width: w, height: h } });
    const text = w === 390 ? LONG : LONG.repeat(2);

    test("issue の手順: サンプルの本の規則6の P1 の文が、欄の中に全部見えている（" + w + "px）", async ({ page }) => {
      await openTool(page);
      const p1 = field(page, "props.0.t", 6);
      await expect(p1).toHaveValue(SAMPLE.v.props[0].t);
      const v = await view(p1);
      expect(v.fits, "P1 の文（" + SAMPLE.v.props[0].t.length + "字）が、欄の中に全部見えている").toBe(true);
      // サンプルの、対象の欄は全部、中身が見えている
      const all = await page.locator("#app textarea.flow").evaluateAll(els => els.map(el => [el.dataset.p, el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1]));
      expect(all.length).toBeGreaterThan(10);
      expect(all.filter(o => !o[1]), "中身が隠れている欄").toEqual([]);
      expect(await overflow(page)).toBe(0);
    });

    test("命題の文、部分の概要、根拠、問題の文に長い文を打つと、欄の中で折り返して全部見える。値に改行は入らず、ページは横にはみ出さない（" + w + "px）", async ({ page }) => {
      await setup(page);
      for (const [p, r, name, ph] of FIELDS) {
        const f = field(page, p, r);
        // 欄の名前、placeholder、data-p は、これまでと同じ
        await expect(f).toHaveAttribute("aria-label", name);
        await expect(f).toHaveAttribute("placeholder", ph);
        await expect(page.getByRole("textbox", { name, exact: true }).first()).toBeVisible();
        expect(Math.abs((await view(f)).h - ONE), p + ": 1行に収まる文のときの高さは、これまでの1行の欄と同じ").toBeLessThanOrEqual(0.5);
        await f.click();
        await f.fill("");
        const before = await view(f);
        await page.keyboard.type(text);
        const v = await view(f);
        expect(v.value).toBe(text);
        expect(v.fits, p + ": 打った文が、欄の中に全部見えている").toBe(true);
        expect(v.lines, p + ": 折り返している").toBeGreaterThan(1);
        expect(await snug(f), p + ": 高さは、中身にちょうど合う").toBe(true);
        expect(Math.abs(v.top - before.top), p + ": 打っているあいだ、欄の上端は動かない").toBeLessThanOrEqual(1);
        expect(await overflow(page), p + ": 横にはみ出した幅").toBe(0);
        // 消していくと、高さは戻る
        await f.fill("短い文");
        expect(Math.abs((await view(f)).h - ONE), p + ": 短くすると、1行の高さに戻る").toBeLessThanOrEqual(0.5);
        await f.fill(text);
      }
      const b = await current(page);
      const saved = [b.v.props[0].t, b.v.parts[0].sum, b.v.props[0].grounds[0].t, b.v.qs[0].t];
      expect(saved).toEqual([text, text, text, text]);
      expect(JSON.stringify(b)).not.toMatch(/\\n|\\r/);
      // 開き直しても、全部見えている
      await page.reload(); await page.locator("#app section").first().waitFor();
      for (const [p, r] of FIELDS) { const v = await view(field(page, p, r)); expect(v.fits, p + ": 開き直したあと").toBe(true); expect(v.lines).toBeGreaterThan(1); }
      expect(await overflow(page)).toBe(0);
    });
  });
}

test("Enter は改行にならず、これまでの決まり（#65）どおりに進む。Shift+Enter でも改行は入らない。押したままでも進まない", async ({ page }) => {
  await setup(page);
  const before = await current(page);
  const at = () => page.evaluate(() => { const el = document.activeElement, sec = el.closest("section"); return [el.dataset.p || "", sec ? sec.id : ""]; });
  // 命題: 文 → 場所 → 次の行の文
  await field(page, "props.0.t", 6).focus();
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["props.0.loc", "sec-a2"]);
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["props.1.t", "sec-a2"]);
  await page.keyboard.press("Shift+Enter");
  expect(await at()).toEqual(["props.1.loc", "sec-a2"]);
  // 部分: 名前 → 概要 → 受け持つ所 → 次の行の名前
  await ruleItem(page, 3).locator('[data-p="parts.0.t"]').focus();
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["parts.0.sum", "sec-a1"]);
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["parts.0.rel", "sec-a1"]);
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["parts.1.t", "sec-a1"]);
  // 問題と根拠: 次の行へ
  await field(page, "qs.0.t", 4).focus();
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["qs.1.t", "sec-a1"]);
  await field(page, "props.0.grounds.0.t", 7).focus();
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["props.0.grounds.1.t", "sec-a2"]);
  // 押したまま（キーリピート）では、進まない
  await field(page, "props.0.t", 6).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  expect(await at()).toEqual(["props.0.loc", "sec-a2"]);
  expect(await current(page), "ここまで、値は変わらず、行も足されない").toEqual(before);
  // 最後の行の最後の欄で押すと、行が足される（問題、根拠）
  await field(page, "qs.1.t", 4).focus();
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["qs.2.t", "sec-a1"]);
  await field(page, "props.0.grounds.1.t", 7).focus();
  await page.keyboard.press("Enter");
  expect(await at()).toEqual(["props.0.grounds.2.t", "sec-a2"]);
  const b = await current(page);
  expect([b.v.qs.length, b.v.props[0].grounds.length]).toEqual([3, 3]);
  expect(JSON.stringify(b)).not.toMatch(/\\n|\\r/);
});

test("かな漢字変換を確定する Enter では、改行も入らず、次の欄へも進まない", async ({ page }) => {
  await setup(page);
  const f = field(page, "props.0.t", 6);
  await f.click();
  await f.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "かくてい", selectionStart: 4, selectionEnd: 4 });
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Process", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send("Input.insertText", { text: "確定" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await expect(f).toHaveValue("テスト用の命題 P1確定");
  await expect(f).toBeFocused();
  // 確定の Enter の keydown（isComposing、または keyCode が 229）は、止めない
  for (const init of [{ isComposing: true }, { isComposing: false, keyCode: 229 }]) {
    expect(await f.evaluate((el, init) => { const e = new KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, init)); el.dispatchEvent(e); return [e.defaultPrevented, document.activeElement === el]; }, init)).toEqual([false, true]);
  }
  expect((await current(page)).v.props[0].t).toBe("テスト用の命題 P1確定");
});

test("改行のある文を貼り付けても、値に改行は入らない（空白になる）。カーソルは、貼った文のあとにある", async ({ page }) => {
  await setup(page);
  for (const [p, r] of FIELDS) {
    const f = field(page, p, r);
    await f.fill("前後");
    await f.click();
    await f.evaluate(el => el.setSelectionRange(1, 1));
    await page.keyboard.insertText("1行目\n2行目\n3行目"); // 貼り付けと同じく、改行ごと入る
    await expect(f, p).toHaveValue("前1行目 2行目 3行目後");
    expect(await f.evaluate(el => [el.selectionStart, el.selectionEnd]), p + ": カーソルの位置").toEqual([12, 12]);
    await page.keyboard.type("x");
    await expect(f).toHaveValue("前1行目 2行目 3行目x後");
  }
  const b = await current(page);
  expect([b.v.props[0].t, b.v.parts[0].sum, b.v.props[0].grounds[0].t, b.v.qs[0].t]).toEqual(Array(4).fill("前1行目 2行目 3行目x後"));
  expect(JSON.stringify(b)).not.toMatch(/\\n|\\r/);
  // クリップボードからの貼り付け（改行が CR+LF の文）でも、同じ
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("貼った1行目\r\n貼った2行目\n"));
  const q = field(page, "qs.1.t", 4);
  await q.fill("");
  await q.focus();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(q).toHaveValue("貼った1行目 貼った2行目 ");
  expect((await current(page)).v.qs[1].t).toBe("貼った1行目 貼った2行目 ");
  // 保存する Markdown の、命題の行は1行のまま
  const md = await page.evaluate(() => window.__dokusho.toMarkdown(window.__dokusho.current()));
  expect(md).toContain("  - P1 前1行目 2行目 3行目x後（中心の主張）");
});

test("見張り: 「この本を読む目的」などの、もとからの複数行の欄は、これまでどおり改行でき、つまみで広げられる。ほかの1行の欄は input のまま", async ({ page }) => {
  await setup(page);
  const ta = page.locator('#app textarea[data-p="purpose"]');
  await ta.fill("1行目");
  await ta.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("2行目");
  expect((await current(page)).v.purpose).toBe("1行目\n2行目");
  expect(await ta.evaluate(el => getComputedStyle(el).resize)).toBe("vertical");
  for (const p of ["parts.0.t", "parts.0.rel", "props.0.loc", "props.0.arg", "subject", "unityA.what", "restate.s"])
    expect(await page.locator('#app [data-p="' + p + '"]').first().evaluate(el => el.tagName), p).toBe("INPUT");
  // 対象の4つの欄は、つまみでは広げない（高さは、内容に合わせて決まる）
  for (const [p, r] of FIELDS) expect(await field(page, p, r).evaluate(el => [el.tagName, getComputedStyle(el).resize])).toEqual(["TEXTAREA", "none"]);
});

test.describe("390px の幅で、入力中でない欄の高さ", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("読み込み、行の並べ替え、行の削除で行がずれても、それぞれの欄の高さが、その行の内容に合う", async ({ page }) => {
    const book = base();
    book.v.parts[1].sum = LONG; book.v.props[1].t = LONG; book.v.qs[1].t = LONG; book.v.props[0].grounds[1].t = LONG;
    await setup(page, book);
    page.on("dialog", d => d.accept());
    /* 欄ごとの [行数が2行以上か, 中身が全部見えているか, 高さが中身にちょうど合うか] */
    const state = async (ps, r) => { const out = []; for (const p of ps) { const f = field(page, p, r), v = await view(f); out.push([v.lines > 1, v.fits, await snug(f)]); } return out; };
    const SHORT = [false, true, true], TALL = [true, true, true];
    // 読み込んだ直後
    expect(await state(["parts.0.sum", "parts.1.sum", "parts.2.sum"], 3)).toEqual([SHORT, TALL, SHORT]);
    expect(await state(["props.0.t", "props.1.t", "props.2.t"], 6)).toEqual([SHORT, TALL, SHORT]);
    expect(await state(["qs.0.t", "qs.1.t"], 4)).toEqual([SHORT, TALL]);
    expect(await state(["props.0.grounds.0.t", "props.0.grounds.1.t"], 7)).toEqual([SHORT, TALL]);
    // 並べ替え: S2 を上へ
    await ruleItem(page, 3).locator('button[data-a="up"][data-p="parts"][data-i="1"]').click();
    expect(await state(["parts.0.sum", "parts.1.sum", "parts.2.sum"], 3)).toEqual([TALL, SHORT, SHORT]);
    // 削除: 先頭の行を消すと、長い文の行が上へずれる
    await ruleItem(page, 6).locator('button[data-a="del"][data-p="props"][data-i="0"]').click();
    expect(await state(["props.0.t", "props.1.t"], 6)).toEqual([TALL, SHORT]);
    await ruleItem(page, 4).locator('button[data-a="del"][data-p="qs"][data-i="0"]').click();
    expect(await state(["qs.0.t"], 4)).toEqual([TALL]);
    // 根拠: 先頭の根拠を消す（P2 が1行目になっている）
    await field(page, "props.0.grounds.1.t", 7).fill(LONG);
    await ruleItem(page, 7).locator('button[data-a="del"][data-p="props.0.grounds"][data-i="0"]').click();
    expect(await state(["props.0.grounds.0.t"], 7)).toEqual([TALL]);
    expect(await overflow(page)).toBe(0);
  });

  test("ほかの欄に打って画面が書き換わっても（#53）、入力中でない欄の高さは内容に合ったまま。入力中の欄は同じ部品のまま、縦の位置が動かない", async ({ page }) => {
    const book = base();
    book.v.props[0].t = LONG; book.v.parts[0].sum = LONG;
    await setup(page, book);
    const p0 = field(page, "props.0.t", 6), h0 = (await view(p0)).h;
    // 下の行の命題に打つ
    const p2 = field(page, "props.2.t", 6);
    await p2.click();
    await p2.evaluate(el => { el.__same = true; el.setSelectionRange(3, 3); });
    const top = (await view(p2)).top;
    await page.keyboard.type(LONG);
    const v2 = await view(p2);
    expect([v2.fits, v2.lines > 1]).toEqual([true, true]);
    expect(Math.abs(v2.top - top), "入力中の欄の上端").toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => { const el = document.activeElement; return [el.__same === true, el.dataset.p, el.selectionStart]; })).toEqual([true, "props.2.t", 63]);
    expect((await view(p0)).h, "入力中でない、上の行の欄の高さ").toBe(h0);
    expect([(await view(p0)).fits, await snug(p0)]).toEqual([true, true]);
    // 規則3の名前（1行の欄）に打っても、同じ行の概要の高さは内容に合ったまま
    const sum = field(page, "parts.0.sum", 3), hs = (await view(sum)).h;
    await ruleItem(page, 3).locator('[data-p="parts.0.t"]').fill("書き直した名前");
    expect((await view(sum)).h).toBe(hs);
    expect([(await view(sum)).fits, await snug(sum)]).toEqual([true, true]);
  });

  test("ページの末尾まで動かした状態で、最後の欄に打っても消しても、画面の縦の位置が飛ばない", async ({ page }) => {
    await setup(page, base({ judge: "分析読書へ進む" }));
    const f = field(page, "props.2.grounds.1.t", 7);
    await f.click();
    await f.fill(LONG.repeat(2));
    await f.evaluate(el => el.scrollIntoView({ block: "center" }));
    const y = await page.evaluate(() => window.scrollY), top = (await view(f)).top;
    await f.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
    await page.keyboard.type("あ");
    await page.keyboard.press("Backspace");
    expect(await page.evaluate(() => window.scrollY), "画面の縦の位置").toBe(y);
    expect(Math.abs((await view(f)).top - top)).toBeLessThanOrEqual(1);
  });
});

test("画面の幅を変えると、欄の高さが、新しい幅での折り返しに合う", async ({ page }) => {
  const book = base(); book.v.props[0].t = LONG.slice(0, 30);
  await setup(page, book);
  const f = field(page, "props.0.t", 6);
  expect((await view(f)).lines, "1280px では1行").toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => { const v = await view(f); return [v.lines > 1, v.fits]; }, "折り返して、全部見えている").toEqual([true, true]);
  expect(await snug(f)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await view(f)).h).toBeLessThanOrEqual(ONE + 0.5);
  expect((await view(f)).fits).toBe(true);
});

test("読み込んだ値に HTML の記号や </textarea> があっても、文字として欄に出るだけ", async ({ page }) => {
  const evil = '</textarea><img src=x onerror="__xss=1"> & "引用" <b>';
  const book = base(); book.v.props[0].t = evil; book.v.parts[0].sum = evil; book.v.qs[0].t = evil; book.v.props[0].grounds[0].t = evil;
  await setup(page, book);
  for (const [p, r] of FIELDS) await expect(field(page, p, r)).toHaveValue(evil);
  expect(await page.evaluate(() => [window.__xss, document.querySelectorAll("#app img").length])).toEqual([undefined, 0]);
  await field(page, "props.0.t", 6).click();
  await page.keyboard.type("x");
  expect(await page.evaluate(() => [window.__xss, document.querySelectorAll("#app img").length])).toEqual([undefined, 0]);
});
