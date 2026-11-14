// 仕様: 前の形（規則11まで）で保存した読書メモを読み込むと、新しい形（規則15まで）に直る。
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { openTool, importState, ruleItem, current } = require("./helpers");

const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/old-format-sample.json"), "utf8"));

test("前の形のサンプルを読み込むと、判定・反論の理由・解決が新しい欄に移る", async ({ page }) => {
  await openTool(page);
  const old = JSON.parse(JSON.stringify(OLD)); old.id = "old-sample"; old.meta.title = "前の形のサンプル";
  await importState(page, old);
  const b = await current(page);
  const ps = b.v.props;
  // 判定と根拠はそのまま
  expect(ps.map(p => p.judge)).toEqual(OLD.v.props.map(p => p.judge));
  expect(ps.map(p => p.why)).toEqual(OLD.v.props.map(p => p.why));
  // 反論の理由（4択）は、規則12〜15の欄に移り、obj は残らない
  const p4 = ps.find(p => p.id === "P4"), o4 = OLD.v.props.find(p => p.id === "P4");
  expect(o4.obj.length).toBeGreaterThan(0);
  const MAP = { "知識が不足している": "k12", "知識に誤りがある": "k13", "論理性に欠ける": "k14", "分析が不完全である": "k15" };
  for (const o of o4.obj) expect(p4[MAP[o]], o + " が移る").toBeTruthy();
  expect(ps.every(p => p.obj === undefined)).toBe(true);
  // 解決は { s, why, aware } になる
  for (const [q, s] of Object.entries(OLD.v.solved)) expect(b.v.solved[q].s).toBe(s);
  // 下読みの統一は残り、規則2の答えは確かめ済みならその写しになる
  expect(b.v.unity).toEqual(OLD.v.unity);
  expect(b.v.unityA).toEqual(OLD.v.unity);
  // 進み具合は15を分母にし、新しく増えた欄（命題の場所など）はまだ済みでない
  await expect(page.locator("#prog")).toContainText(/分析読書 \d+\/15/);
  const d = await page.evaluate(() => window.__dokusho.done());
  expect(d[6], "命題の場所はまだない").toBe(false);
  await expect(ruleItem(page, 9).locator('button[data-p="props.0.judge"][data-val="' + OLD.v.props[0].judge + '"]')).toHaveClass(/on/);
});

test("直した本を保存して読み込み直しても、同じになる（2回目の変換で変わらない）", async ({ page }) => {
  await openTool(page);
  const old = JSON.parse(JSON.stringify(OLD)); old.id = "old-sample-2";
  await importState(page, old);
  const once = await current(page);
  await importState(page, once);
  expect(await current(page)).toEqual(once);
});
