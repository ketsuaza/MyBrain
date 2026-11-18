// 仕様: 下読みの「何についての本か」の欄から離れたときに、その答えを規則2の欄へ写す（issue #74）。
// 条件はこれまでと同じ（判定が「分析読書へ進む」、規則2の答えがまだない、下読みの2つの空所が両方埋まっている）。打っている途中では写さない。
// フォーカスが移った先の部品は作り直さず、押そうとしたボタンのクリックも失われない。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

function base(over) {
  const b = { id: "t-unitycopy", meta: { title: "写すタイミングのテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
    v: { _n: { S: 1, Q: 0, P: 0 }, purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", terms: [{ w: "用語A", m: "", p: "", g: false }],
      parts: [{ id: "S1", t: "第1部", role: "問題を示す", to: "", link: "", sum: "", rel: "", subs: [] }] } };
  Object.assign(b.v, over || {});
  return b;
}
async function setup(page, over) {
  await openTool(page);
  const book = base(over);
  await importState(page, book);
  await expect(page.locator("#bookSel option:checked")).toContainText(book.meta.title);
  await expect(page.locator("#app textarea[data-p='purpose']")).toHaveValue(book.v.purpose);
}
const what = page => page.locator('#sec-shitayomi input[data-p="unity.what"]');
const claim = page => page.locator('#sec-shitayomi input[data-p="unity.claim"]');
const whatA = page => ruleItem(page, 2).locator('input[data-p="unityA.what"]');
const claimA = page => ruleItem(page, 2).locator('input[data-p="unityA.claim"]');
/* 欄を押して、キーボードで1文字ずつ打つ */
async function type(page, loc, text) {
  await loc.click();
  await expect(loc).toBeFocused();
  await page.keyboard.type(text);
}
/* 規則2の欄が、まだ空（写されていない） */
async function expectNotCopied(page, when) {
  await expect(whatA(page), when).toHaveValue("");
  await expect(claimA(page), when).toHaveValue("");
  expect((await current(page)).v.unityA, when + ": 規則2の答え").toBeUndefined();
}
async function expectCopied(page, w, c) {
  await expect(whatA(page)).toHaveValue(w);
  await expect(claimA(page)).toHaveValue(c);
  expect((await current(page)).v.unityA).toEqual({ what: w, claim: c });
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("下読みの2つの欄を打って埋め、Tab で欄から離れると、規則2の欄に写る。打っている途中では写らない", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "学問");
  await expectNotCopied(page, "1つ目を打ったあと");
  await page.keyboard.press("Tab"); // 2つ目の欄へ移る（まだ空）
  await expect(claim(page)).toBeFocused();
  await expectNotCopied(page, "2つの欄のあいだを移っただけ");
  await page.keyboard.type("学べ");
  await expectNotCopied(page, "2つ目を打っている途中");
  await expect(ruleItem(page, 2)).toContainText("下読みの答え: 学問 について、学べ と言っている本");
  await page.keyboard.press("Tab"); // 欄から離れる
  await expectCopied(page, "学問", "学べ");
  // 再読み込みしても、写したものが残る
  await page.reload();
  await page.locator("#app section").first().waitFor();
  await expectCopied(page, "学問", "学べ");
});

test("2つの欄のあいだを行き来しているあいだは、両方埋まっていても写らない。2つの欄の外へ出たときに、直したあとの文が写る", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "がくもｎ");
  await page.keyboard.press("Tab");
  await page.keyboard.type("学べ");
  await page.keyboard.press("Shift+Tab"); // 1つ目へ戻って直す
  await expect(what(page)).toBeFocused();
  await expectNotCopied(page, "2つの欄のあいだを戻ったとき");
  await what(page).fill("学問");
  await expectNotCopied(page, "直している途中");
  await what(page).blur();
  await expectCopied(page, "学問", "学べ");
});

test("片方が空のまま離れても写らない。判定が「分析読書へ進む」でない本でも写らない", async ({ page }) => {
  await setup(page);
  await type(page, claim(page), "学べ");
  await claim(page).blur();
  await expectNotCopied(page, "1つ目が空");
  await type(page, what(page), "   ");
  await what(page).blur();
  await expectNotCopied(page, "1つ目が空白だけ");
  // 表面読みまでの本
  await page.locator('#sec-shitayomi button[data-p="judge"][data-val="表面読みへ進む"]').click();
  await what(page).fill("学問");
  await what(page).blur();
  expect((await current(page)).v.unityA, "分析読書に進んでいない本では写さない").toBeUndefined();
  // 分析読書へ進むと、これまでどおり、ボタンを押したときに写る
  await page.locator('#sec-shitayomi button[data-p="judge"][data-val="分析読書へ進む"]').click();
  await expectCopied(page, "学問", "学べ");
});

test("規則2の答えがすでにある本では、下読みの欄を書き換えて離れても、規則2の欄は変わらない", async ({ page }) => {
  await setup(page, { unity: { what: "学問", claim: "学べ" }, unityA: { what: "学問", claim: "実学を学べ" } });
  await claim(page).fill("学ぶな");
  await claim(page).blur();
  await expectCopied(page, "学問", "実学を学べ");
  expect((await current(page)).v.unity).toEqual({ what: "学問", claim: "学ぶな" });
});

test("欄から離れて次の欄を押したとき、押した欄は同じ部品のままで、そのまま打てる", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "学問");
  await type(page, claim(page), "学べ");
  // 次に、用語の欄を押す
  const term = page.locator('#sec-shitayomi input[data-p="terms.0.m"]');
  await term.evaluate(el => { el.__same = true; });
  await term.click();
  await expectCopied(page, "学問", "学べ");
  expect(await page.evaluate(() => document.activeElement.__same === true && document.activeElement.dataset.p), "押した欄が、同じ部品のままフォーカスを持つ").toBe("terms.0.m");
  await page.keyboard.type("imi");
  expect((await current(page)).v.terms[0].m).toBe("imi");
});

test("欄から離れて、規則2の欄へ直接移ったとき、その欄は同じ部品のままで、写った文が入り、続けて打てる", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "学問");
  await type(page, claim(page), "学べ");
  await claimA(page).evaluate(el => { el.__same = true; });
  await claimA(page).focus();
  await expect(claimA(page)).toBeFocused();
  await expectCopied(page, "学問", "学べ");
  expect(await page.evaluate(() => document.activeElement.__same === true), "移った先の欄は、同じ部品のまま").toBe(true);
  await claimA(page).evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.type("!");
  expect((await current(page)).v.unityA).toEqual({ what: "学問", claim: "学べ!" });
  expect((await current(page)).v.unity, "下読みの答えは変わらない").toEqual({ what: "学問", claim: "学べ" });
});

test("欄から離れてボタンをマウスで押したとき、押したボタンは作り直されず、クリックが1回で効く。規則2の欄にも写る", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "学問");
  await type(page, claim(page), "学べ");
  // 押そうとしているボタンに印を付け、クリックが届いた部品を記録する
  const btn = page.locator('#sec-shitayomi button[data-p="kind"][data-val="実践書"]'); // 下読みの欄のすぐ上にあり、画面に出ている
  await btn.evaluate(el => { el.__same = true; window.__clicks = []; document.addEventListener("click", e => window.__clicks.push(e.target.__same === true), true); });
  const box = await btn.boundingBox(), head = await page.locator("header").boundingBox();
  expect(box.y, "押すボタンが、固定の見出しより下に出ている").toBeGreaterThan(head.y + head.height);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); // ここでフォーカスが外れ、画面が書き換わる
  await expect(whatA(page)).toHaveValue("学問");
  expect(await btn.evaluate(el => el.__same === true), "押している途中のボタンは、同じ部品のまま").toBe(true);
  await page.mouse.up();
  expect(await page.evaluate(() => window.__clicks), "クリックは、印を付けたボタンに1回届く").toEqual([true]);
  expect((await current(page)).v.kind).toBe("実践書");
  await expectCopied(page, "学問", "学べ");
  // 規則の「やらない」、行を足すボタンでも、1回で効く
  await claim(page).click();
  await ruleItem(page, 3).getByRole("button", { name: "＋ 部分", exact: true }).click();
  expect((await current(page)).v.parts.length).toBe(2);
});

test("欄から離れてプルダウンへ移ったとき、プルダウンは同じ部品のままで、フォーカスがある。画面の縦の位置は変わらない", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "学問");
  await type(page, claim(page), "学べ");
  const role = ruleItem(page, 3).locator('select[data-p="parts.0.role"]');
  await role.evaluate(el => { el.__same = true; });
  const y = await page.evaluate(() => window.scrollY), top = await claim(page).evaluate(el => el.getBoundingClientRect().top);
  await role.evaluate(el => el.focus({ preventScroll: true }));
  await expectCopied(page, "学問", "学べ");
  expect(await page.evaluate(() => document.activeElement.__same === true && document.activeElement.dataset.p), "プルダウンは、同じ部品のままフォーカスを持つ").toBe("parts.0.role");
  expect(await page.evaluate(() => window.scrollY), "画面の縦の位置").toBe(y);
  expect(await claim(page).evaluate(el => el.getBoundingClientRect().top), "下読みの欄の位置").toBe(top);
});

test("これまでどおり: ボタンやプルダウンを操作したときにも写る。写したあとに下読みを書き換えても、規則2の欄は変わらない", async ({ page }) => {
  await setup(page, { unity: { what: "学問", claim: "学べ" } });
  // 読み込んだときに、もう写っている
  await expectCopied(page, "学問", "学べ");
  await claim(page).fill("学ぶな");
  await claim(page).blur();
  await expectCopied(page, "学問", "学べ");
  await expect(ruleItem(page, 2)).toContainText("下読みの答え: 学問 について、学ぶな と言っている本");
});

test("写したあとの画面は、同じ内容を開き直して描いた画面と同じになる", async ({ page }) => {
  await setup(page);
  await type(page, what(page), "学問");
  await type(page, claim(page), "学べ");
  await claim(page).blur();
  await expectCopied(page, "学問", "学べ");
  /* 画面の中身を、欄の今の値と、プルダウンの今の選択を書き込んだ形で取り出す */
  const snap = () => page.evaluate(() => {
    const app = document.getElementById("app"), copy = app.cloneNode(true);
    const live = app.querySelectorAll("input, textarea, select"), dup = copy.querySelectorAll("input, textarea, select");
    live.forEach((el, i) => { const d = dup[i];
      if (el.tagName === "SELECT") [...d.options].forEach((o, k) => { el.options[k].selected ? o.setAttribute("selected", "") : o.removeAttribute("selected"); });
      else if (el.tagName === "TEXTAREA") d.textContent = el.value;
      else d.setAttribute("value", el.value); });
    return { html: copy.innerHTML, prog: document.getElementById("prog").innerHTML };
  });
  const live = await snap();
  await page.reload();
  await page.locator("#app section").first().waitFor();
  expect(await snap()).toEqual(live);
});

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("390px の幅でも、欄から離れると規則2の欄に写り、押したボタンが1回で効き、横にはみ出さない", async ({ page }) => {
    await setup(page);
    await type(page, what(page), "学問");
    await type(page, claim(page), "学べ");
    await expectNotCopied(page, "打っている途中");
    await page.keyboard.press("Tab");
    await expectCopied(page, "学問", "学べ");
    await page.locator('#sec-shitayomi button[data-p="kind"][data-val="実践書"]').click();
    expect((await current(page)).v.kind).toBe("実践書");
    await expectCopied(page, "学問", "学べ");
    expect(await overflow(page), "横にはみ出した幅（px）").toBeLessThanOrEqual(0);
  });
});
