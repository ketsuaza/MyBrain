// 仕様: 規則3の部分を足して消してから足し直すと、番号は残っている部分の最大の番号の次になる（消した番号の分だけ数え上がらない）。
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

const book = () => ({ id: "t-partnum", meta: { title: "部分の番号のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "2026-11-15", finished: "" }, skip: {},
  v: { purpose: "テスト用の目的", judge: "分析読書へ進む", kind: "理論書", subject: "テスト", unity: { what: "学問", claim: "学べ" }, parts: [] } });
const partIds = async page => (await current(page)).v.parts.map(o => o.id);

test("部分を足して消して足し直すと、S1 に戻る。途中の番号を消したときは、最大の番号の次になる", async ({ page }) => {
  await openTool(page);
  await importState(page, book());
  const add = () => ruleItem(page, 3).locator('button[data-a="push"][data-p="parts"]').click();
  const del = i => ruleItem(page, 3).locator('button[data-a="del"][data-p="parts"][data-i="' + i + '"]').click();
  await add(); expect(await partIds(page)).toEqual(["S1"]);
  await del(0); expect(await partIds(page)).toEqual([]);
  await add(); expect(await partIds(page), "全部消したあとの追加は S1").toEqual(["S1"]);
  await add(); await add(); expect(await partIds(page)).toEqual(["S1", "S2", "S3"]);
  await del(2); await add(); expect(await partIds(page), "末尾を消したあとの追加は、その番号").toEqual(["S1", "S2", "S3"]);
  await del(0); await add(); expect(await partIds(page), "途中を消したあとの追加は、最大の次（重ならない）").toEqual(["S2", "S3", "S4"]);
});
