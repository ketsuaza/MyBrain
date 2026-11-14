// 仕様1: ブックリストの JSON のすべての本が表示され、どの列でも並べ替えられる。
const { test, expect } = require("@playwright/test");
const { BOOKLIST, openTool, shot } = require("./helpers");

const GRADE = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5 };
const STATUS = { "いま読んでる": 0, "読みたい": 1, "積読": 2, "読み終わった": 3 };
/* 表の列（左から）と、値の比べ方。first は最初に押したときの並び（良い・新しい・先が上） */
const COLUMNS = [
  ["no", "num"], ["書名", "text"], ["状況", "status"], ["重", "grade"], ["難", "grade"], ["名", "grade"], ["原", "grade"],
  ["優先", "num"], ["外部", "num"], ["ブクログ", "num"], ["読メ", "num"], ["Amazon", "num"],
];
function key(kind, s) {
  if (s === "なし" || s === "") return null;
  if (kind === "num") return -Number(s);
  if (kind === "grade") return GRADE[s] ?? null;
  if (kind === "status") return STATUS[s] ?? null;
  return s.replace("追加済み", "");
}
/* 値のある行は昇順（dir=-1 なら降順）に並び、値のない行は末尾にまとまっている */
function assertSorted(kind, cells, dir) {
  const keys = cells.map(c => key(kind, c));
  const firstNull = keys.indexOf(null);
  if (firstNull >= 0) expect(keys.slice(firstNull).every(k => k === null), "値のない本は末尾にまとまる").toBe(true);
  const vals = firstNull >= 0 ? keys.slice(0, firstNull) : keys;
  for (let i = 1; i < vals.length; i++) {
    const r = kind === "text" ? vals[i - 1].localeCompare(vals[i], "ja") : vals[i - 1] - vals[i];
    expect(r * dir, `${i} 行目の並び`).toBeLessThanOrEqual(0);
  }
}

test("ブックリストの全件が表に出て、件数が JSON の長さと等しい", async ({ page }) => {
  await openTool(page);
  await page.click("#btnNew");
  const rows = page.locator("#pickHits tbody tr");
  await expect(rows).toHaveCount(BOOKLIST.length);
  await expect(page.locator("#pickCount")).toHaveText(`${BOOKLIST.length}件 / 全${BOOKLIST.length}件`);
  // JSON のすべての no が、表に1回ずつ出ている
  const nos = await rows.evaluateAll(trs => trs.map(tr => tr.dataset.no));
  expect(nos.slice().sort()).toEqual(BOOKLIST.map(b => String(b.no)).sort());
  await shot(page, "01-booklist-default");
});

for (const [i, [label, kind]] of COLUMNS.entries()) {
  test(`列「${label}」で並べ替えられ、押し直すと逆になり、件数は変わらない`, async ({ page }) => {
    await openTool(page);
    await page.click("#btnNew");
    const head = page.locator("#pickHits thead th button").nth(i);
    const cells = () => page.locator(`#pickHits tbody tr td:nth-child(${i + 1})`).allInnerTexts();
    // 既定の並びが「状況」なので、その列だけは1回目で逆になる
    const clicks = label === "状況" ? [-1, 1] : [1, -1];
    for (const dir of clicks) {
      await head.click();
      await expect(page.locator("#pickHits tbody tr")).toHaveCount(BOOKLIST.length);
      assertSorted(kind, (await cells()).map(s => s.trim()), dir);
    }
    if (label === "優先") await shot(page, "02-booklist-sorted-priority");
  });
}
