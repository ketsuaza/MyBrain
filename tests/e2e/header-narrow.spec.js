// 仕様: 幅の狭い画面（620px 以下）では、固定の見出しを本の選択の行だけにする（issue #64）。
// 進み具合の行は固定せず、ページと一緒に流れる。固定される見出しの高さは 100px 以下。フォーカスした欄は、見出しに隠れない。1280px の見た目は変わらない。
const { test, expect } = require("@playwright/test");
const { openTool, ruleItem } = require("./helpers");

/* 見出し（header）と、進み具合の行（#prog）の、画面の中の位置 */
const boxes = page => page.evaluate(() => { const r = el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height }; };
  const head = document.querySelector("header"), prog = document.getElementById("prog");
  return { head: r(head), prog: r(prog), y: window.scrollY, vh: window.innerHeight, text: prog.textContent }; });
/* 進み具合の行が、見出しと一緒に画面の上に固定されているか（下へスクロールした状態で見る）。固定されていなければ、画面の外へ流れている */
const progFixed = async page => { const b = await boxes(page); if (b.y < 500 || b.head.top !== 0) throw new Error("下へスクロールしてから見る");
  return b.prog.top >= 0 && b.prog.bottom <= b.head.bottom ? true : b.prog.bottom < 0 ? false : "見出しの下にはみ出している"; };
/* 画面の点 (x, y) にある部品が、見出しの中か */
const coveredByHead = (page, x, y) => page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest("header"); }, [x, y]);
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* フォーカスのある部品が、見出しの下から画面の下端までに全部入っていて、その中心に、その部品自身が見えている（上に何も重なっていない） */
async function expectFocusSeen(page, what) {
  const r = await page.evaluate(() => { const el = document.activeElement, b = el.getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { p: el.dataset.a || el.dataset.p || el.id || el.tagName, top: b.top, bottom: b.bottom, head: document.querySelector("header").getBoundingClientRect().bottom, vh: window.innerHeight, seen: at === el || el.contains(at) }; });
  expect(r.top, what + ": 「" + r.p + "」の上端が、固定の見出しの下端（" + r.head + "px）より下").toBeGreaterThanOrEqual(r.head);
  expect(r.bottom, what + ": 「" + r.p + "」の下端が、画面の中").toBeLessThanOrEqual(r.vh);
  expect(r.seen, what + ": 「" + r.p + "」の上に、何も重なっていない").toBe(true);
  return r;
}

test.describe("iPhone の幅（390px）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("issue の手順: 下へスクロールすると、本の選択の行だけが画面の上に残り、進み具合の行はページと一緒に流れる。見出しの高さは 100px 以下", async ({ page }) => {
    await openTool(page);
    // 先頭では、本の選択の行のすぐ下に、進み具合の行が見えている
    let b = await boxes(page);
    expect(b.head.height, "固定される見出しの高さ").toBeLessThanOrEqual(100);
    expect(b.text).toContain("分析読書");
    expect(b.prog.top, "進み具合の行は、見出しのすぐ下").toBeGreaterThanOrEqual(b.head.bottom - 1);
    expect(b.prog.top - b.head.bottom).toBeLessThanOrEqual(16);
    await expect(page.locator("#prog")).toBeVisible();
    // 下へスクロールする
    await page.evaluate(() => window.scrollTo(0, 2000));
    b = await boxes(page);
    expect(b.y).toBe(2000);
    expect(b.head.top, "見出しは、画面の上に固定されている").toBe(0);
    expect(b.head.height).toBeLessThanOrEqual(100);
    expect(b.prog.bottom, "進み具合の行は、ページと一緒に画面の外へ流れている").toBeLessThan(0);
    // 見出しの中に、本の選択と3つのボタンが、これまでの文字のまま見えている
    for (const id of ["bookSel", "btnEdit", "btnNew", "btnImport"]) {
      const r = await page.locator("#" + id).boundingBox();
      expect(r.y, id).toBeGreaterThanOrEqual(0); expect(r.y + r.height, id).toBeLessThanOrEqual(b.head.bottom);
      expect(r.x, id).toBeGreaterThanOrEqual(0); expect(r.x + r.width, id).toBeLessThanOrEqual(390);
      expect(r.height, id + " の高さ").toBeGreaterThanOrEqual(30);
    }
    expect(await page.locator("header button").allInnerTexts()).toEqual(["書誌", "本を足す", "読み込む"]);
    // 見出しのすぐ下は、もう見出しではない（進み具合の行が、固定の部分として残っていない）
    expect(await coveredByHead(page, 195, b.head.bottom - 3)).toBe(true);
    expect(await coveredByHead(page, 195, b.head.bottom + 3)).toBe(false);
    expect(await coveredByHead(page, 195, 140), "これまで見出しが占めていた高さ（167px）の中").toBe(false);
    expect(await overflow(page)).toBe(0);
  });

  test("進み具合の行は、固定されていなくても、操作に合わせて変わる", async ({ page }) => {
    await openTool(page);
    await expect(page.locator("#prog")).toContainText("深さ 分析");
    await page.locator('#sec-shitayomi button[data-p="judge"][data-val="点検読書で終える"]').click();
    await expect(page.locator("#prog")).toContainText("深さ 点検");
    await expect(page.locator("#prog")).not.toContainText("分析読書");
    await page.locator("#app textarea[data-p='s1']").fill("");
    await expect(page.locator("#prog")).toContainText("下読み 5/6");
    await page.evaluate(() => window.scrollTo(0, 1500));
    expect(await progFixed(page)).toBe(false);
    // 流れたあとも、進み具合は変わり続ける。先頭へ戻ると、最新の内容が見える
    await page.locator("#app textarea[data-p='s2']").fill("");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("#prog")).toContainText("下読み 4/6");
    await expect(page.locator("#prog")).toBeInViewport();
  });

  test("フォーカスした欄は、見出しに隠れない: 下から上へ Shift+Tab でたどっても、欄へ飛んでも、見出しの下に見えている", async ({ page }) => {
    await openTool(page);
    await page.locator("#app textarea[data-p='memo']").focus();
    for (let i = 0; i < 40; i++) { await page.keyboard.press("Shift+Tab"); await expectFocusSeen(page, "Shift+Tab " + (i + 1) + "回目"); }
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // 欄の上端を画面の上端に合わせる動かし方でも、見出しの下に来る（scroll-padding-top）。余白は、見出しの高さより少し大きいだけ
    for (const sel of ['#sec-a2 [data-p="props.1.loc"]', '#sec-a1 [data-p="parts.1.t"]', "#app textarea[data-p='meaning']"]) {
      const f = page.locator(sel).first();
      await f.evaluate(el => { window.scrollTo(0, document.documentElement.scrollHeight); el.scrollIntoView({ block: "start" }); el.focus({ preventScroll: true }); });
      const r = await expectFocusSeen(page, sel);
      expect(r.top - r.head, sel + ": 見出しの下端からの間").toBeLessThanOrEqual(24);
    }
  });

  test("キーボードで「↑」「×」を押したあとの「隠れたら動かす」（#75）は、新しい見出しの高さで働く", async ({ page }) => {
    await openTool(page);
    page.on("dialog", d => d.accept());
    const up = ruleItem(page, 3).locator('button[data-a="up"][data-p="parts"][data-i="3"]');
    await up.evaluate(el => { window.scrollBy(0, el.getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom - 8); el.focus({ preventScroll: true }); });
    await expect(up).toBeFocused();
    const y = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    let r = await expectFocusSeen(page, "動かした行の「↑」");
    expect(r.p).toBe("up");
    expect(r.top - r.head, "動かす量は最小限（見出しのすぐ下）").toBeLessThanOrEqual(8);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(y);
    // 見出しの下に見えている「×」を押したときは、画面は動かない
    const del = ruleItem(page, 4).locator('button[data-a="del"][data-p="qs"][data-i="0"]');
    await del.evaluate(el => { window.scrollBy(0, el.getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom - 40); el.focus({ preventScroll: true }); });
    const y2 = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    r = await expectFocusSeen(page, "次の行の「×」");
    expect(await page.evaluate(() => window.scrollY)).toBe(y2);
  });
});

test.describe("幅の境目（620px）", () => {
  for (const [w, narrow] of [[620, true], [621, false]]) {
    test(w + "px では、進み具合の行は" + (narrow ? "固定されない" : "これまでどおり、見出しと一緒に固定される"), async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openTool(page);
      await page.evaluate(() => window.scrollTo(0, 1500));
      expect(await progFixed(page)).toBe(!narrow);
      expect(await overflow(page)).toBe(0);
    });
  }
});

test("見張り: 1280px の見た目は変わらない。見出しは本の選択の行と進み具合の行で、高さ 87.8px のまま固定される", async ({ page }) => {
  await openTool(page);
  let b = await boxes(page);
  expect(Math.round(b.head.height * 10) / 10).toBe(87.8);
  expect(Math.round(b.prog.top * 10) / 10).toBe(55.5);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop)).toBe("96px");
  const sel = await page.locator("#bookSel").boundingBox();
  expect([sel.x, Math.round(sel.y * 10) / 10, sel.width, sel.height]).toEqual([266, 12.3, 490, 31]);
  await page.evaluate(() => window.scrollTo(0, 2000));
  b = await boxes(page);
  expect(await progFixed(page)).toBe(true);
  expect(Math.round(b.prog.top * 10) / 10, "固定されたあとも、本の選択の行の下").toBe(55.5);
});

test("画面の幅を変えると、進み具合の行は、狭い幅では見出しの外へ、広い幅では見出しの中へ移る。入力中の欄とフォーカスは変わらない", async ({ page }) => {
  await openTool(page);
  const f = page.locator("#app textarea[data-p='purpose']");
  await f.click();
  await f.evaluate(el => { el.__same = true; });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await boxes(page)).head.height).toBeLessThanOrEqual(100);
  await page.keyboard.type("あ");
  expect(await page.evaluate(() => document.activeElement.__same === true)).toBe(true);
  await expect(page.locator("#prog")).toContainText("深さ 分析");
  await page.evaluate(() => window.scrollTo(0, 1500));
  expect(await progFixed(page)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => Math.round((await boxes(page)).head.height * 10) / 10).toBe(87.8);
  await page.evaluate(() => window.scrollTo(0, 1500));
  expect(await progFixed(page)).toBe(true);
  expect(await page.evaluate(() => document.activeElement.__same === true)).toBe(true);
});
