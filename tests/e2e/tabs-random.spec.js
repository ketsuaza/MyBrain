// 仕様: 2つのタブで、番号のない一覧（表面読みの組、分からなかった所、用語、根拠、区分）を、でたらめな順で操作しても、入力が消えたり、別の行に混ざったりしない（issue #60）。
// 2つのタブとも、ほかのタブの保存が届かない状態にして（storage イベントを止める）、保存の直前の取り込みだけで確かめる。操作の列は、種から決まる（同じ種なら同じ列）。
// - 行を消さない列: 既存の行に書く、末尾の空の行に書く、行を足す（ボタンと Enter。足して書く場合と、空のまま残す場合）。
//   どちらのタブが打った文字も、打った行の打った欄に残る（同じ行の同じ欄を両方が書いた場合だけ、片方がなくなってよい）。行は1つも減らず、まとまらない。
// - 行を消す操作を混ぜた列: 打った文字は、消えてもよいが、別の行や別の欄には入らない。
const { test, expect } = require("@playwright/test");
const { openTool } = require("./helpers");

const KEY = "dokusho-memo.v2";
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/* 一覧: ある section、data-p の頭、1行の中の欄、状態の中の場所、行から欄の値を取り出す方法 */
const LISTS = {
  points: { sec: "#sec-hyomen", base: "points", fields: [".what", ".how"], get: v => v.points, val: (r, f) => r[f.slice(1)] },
  unclear: { sec: "#sec-hyomen", base: "unclear", fields: [""], get: v => v.unclear, val: r => r },
  terms: { sec: "#sec-shitayomi", base: "terms", fields: [".w", ".m", ".p"], get: v => v.terms, val: (r, f) => r[f.slice(1)] },
  grounds: { sec: "#sec-a2", base: "props.0.grounds", fields: [".t"], get: v => v.props[0].grounds, val: r => r.t },
  subs: { sec: "#sec-a1", base: "parts.0.subs", fields: [""], get: v => v.parts[0].subs, val: r => r },
};
/* 打つ文字は、「タブの名前 + 通し番号 + ;」（a12; など）。もとの行の印は z0; 〜 z14; */
const TOK = /[abz]\d+;/g;
const Z = { points: [0, 1, 2], terms: [3, 4, 5], grounds: [6, 7, 8], subs: [9, 10, 11], unclear: [12, 13, 14] };
/* 始まりの本。行を消さない列では、空の行や同じ内容の行がある一覧、空の一覧、空の行だけの一覧のどれか。行を消す列では、どの行にも印を入れておく */
function book(mode, r) {
  const b = { id: "t-random", meta: { title: "でたらめな操作のテスト", author: "", publisher: "", published: "", isbn: "", booklist_no: "", started: "", finished: "" }, skip: {},
    v: { _n: { S: 1, Q: 0, P: 1 }, purpose: "", judge: "分析読書へ進む", kind: "理論書", unity: { what: "学問", claim: "学べ" }, unityA: { what: "学問", claim: "学べ" },
      parts: [{ id: "S1", t: "テスト用の部分", role: "", to: "", link: "", sum: "", rel: "", subs: [] }], props: [{ id: "P1", t: "テスト用の命題", loc: "", sup: "main", q: "", grounds: [], arg: "" }] } };
  const term = w => ({ w, m: "", p: "", g: false }), gr = t => ({ t, kind: "" }), pt = what => ({ what, how: "" }), z = name => Z[name].map(i => "z" + i + ";");
  if (mode === "del") { b.v.points = z("points").map(pt); b.v.unclear = z("unclear"); b.v.terms = z("terms").map(term); b.v.props[0].grounds = z("grounds").map(gr); b.v.parts[0].subs = z("subs"); return b; }
  const k = Math.floor(r() * 3);
  b.v.points = [[pt("同じ文"), pt(""), pt("同じ文")], [], [pt("")]][k]; b.v.unclear = [["同じ文", "", "同じ文", ""], [], ["", ""]][k]; b.v.terms = [[term("同じ語"), term(""), term("同じ語")], [], [term("")]][k];
  b.v.props[0].grounds = [[gr(""), gr("同じ文")], [], [gr("")]][k]; b.v.parts[0].subs = [["", ""], [], ["同じ文", "同じ文", ""]][k];
  return b;
}
async function openDeaf(context, init) {
  const page = await context.newPage();
  page.on("dialog", d => d.accept());
  await page.addInitScript(([key, init]) => { window.addEventListener("storage", e => e.stopImmediatePropagation(), true); if (!localStorage.getItem(key)) localStorage.setItem(key, init); }, [KEY, init]);
  await openTool(page);
  return page;
}
/* 片方のタブがブラウザに残した内容は、もう片方のタブ（別のプロセス）から読めるようになるまで、数ミリ秒かかることがある。
   操作の前に、どのタブからも同じ内容（入力と、行を消した印）が読めるまで待つ（人の操作では、この数ミリ秒のあいだに、もう片方のタブを操作することはない） */
async function synced(...pages) {
  const read = p => p.evaluate(k => JSON.stringify([localStorage.getItem(k), localStorage.getItem(k + ".cuts")]), KEY);
  await expect.poll(async () => new Set(await Promise.all(pages.map(read))).size, "どのタブからも、ブラウザに残した同じ内容が読める").toBe(1);
}
/* タブの画面に出ている、一覧の行（欄ごとの値） */
const domRows = (page, L) => page.evaluate(([sec, base, fields]) => { const out = [];
  document.querySelectorAll(sec + " input[data-p], " + sec + " textarea[data-p]").forEach(el => { const p = el.dataset.p; if (!p.startsWith(base + ".")) return;
    const m = /^(\d+)(.*)$/.exec(p.slice(base.length + 1)); if (m && fields.includes(m[2])) (out[+m[1]] = out[+m[1]] || {})[m[2]] = el.value; });
  return out; }, [L.sec, L.base, L.fields]);
/* 欄にフォーカスを置き、カーソルを末尾に置く */
const focusField = (page, L, i, f) => page.evaluate(([sec, p]) => { const el = [...document.querySelectorAll(sec + " input[data-p], " + sec + " textarea[data-p]")].find(o => o.dataset.p === p); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, [L.sec, L.base + "." + i + f]);

/* 種 seed の操作の列を nops 回行い、最後に両方のタブを保存し合ってから、破れた決まりの一覧を返す（空なら、破れていない） */
async function run(context, mode, seed, nops) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const b0 = book(mode, r), init = JSON.stringify({ books: [b0], current: b0.id, seen: [] });
  const tabs = { a: await openDeaf(context, init), b: await openDeaf(context, init) };
  for (const t of Object.values(tabs)) await t.selectOption("#bookSel", b0.id);
  const baseLen = {}, pushes = {}, writes = [], log = [], marks = new Set(mode === "del" ? Object.values(Z).flat().map(i => "z" + i + ";") : []); let n = 0;
  for (const k in LISTS) { baseLen[k] = LISTS[k].get(b0.v).length; pushes[k] = 0; }
  /* 行を見分ける名前。行を消さない列では、行の位置（どのタブでも、最後まで同じ）。行を消す列では、行の最初の欄にある印 */
  const keyOf = (name, value, i) => (mode === "add" ? "#" + i : ((value || "").match(TOK) || []).find(t => marks.has(t)) || null);
  for (let step = 0, tries = 0; step < nops && tries < nops * 4; tries++) {
    await synced(tabs.a, tabs.b);
    const who = pick(["a", "b"]), page = tabs[who], name = pick(Object.keys(LISTS)), L = LISTS[name], rows = await domRows(page, L), x = r(), tok = who + (n++) + ";";
    if (mode === "del" && x < 0.15 && rows.length) { const i = Math.floor(r() * rows.length);
      await page.locator(L.sec + ' button[data-a="del"][data-p="' + L.base + '"][data-i="' + i + '"]').first().click(); log.push(who + " 消す " + name + "[" + i + "]"); step++; continue; }
    if (x < 0.4 || !rows.length) { const enter = r() < 0.5 && rows.length > 0;
      if (enter) { await focusField(page, L, rows.length - 1, L.fields[L.fields.length - 1]); await page.keyboard.press("Enter"); }
      else await page.locator(L.sec + ' button[data-a="push"][data-p="' + L.base + '"]').first().click();
      const act = await page.evaluate(() => document.activeElement.dataset.p || ""), at = /^\.(\d+)/.exec(act.slice(L.base.length));
      if (!act.startsWith(L.base + ".") || !at) return { fails: ["足した行にフォーカスがない（" + act + "）"], log };
      pushes[name]++; step++;
      if (mode === "add" && r() < 0.5) { log.push(who + " 足す（空のまま） " + name + " " + act); continue; }
      await page.keyboard.type(tok); marks.add(tok);
      writes.push({ tok, who, name, field: L.fields[0], key: mode === "add" ? "#" + at[1] : tok }); log.push(who + " 足して書く " + name + " " + act + " " + tok); continue; }
    const cands = rows.map((row, i) => i).filter(i => keyOf(name, rows[i][L.fields[0]], i)); if (!cands.length) continue;
    const i = pick(cands), f = pick(L.fields), key = keyOf(name, rows[i][L.fields[0]], i);
    await focusField(page, L, i, f); await page.keyboard.type(tok);
    writes.push({ tok, who, name, field: f, key }); log.push(who + " 書く " + name + "[" + i + "]" + f + " " + tok + "（" + key + "）"); step++;
  }
  // 両方のタブが、互いの保存を取り込むまで、ほかの欄に書く
  for (const who of ["a", "b", "a", "b"]) { await synced(tabs.a, tabs.b); await tabs[who].locator("#app textarea[data-p='purpose']").focus(); await tabs[who].keyboard.type("."); }
  await synced(tabs.a, tabs.b);
  const disk = await tabs.a.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).books.find(b => b.id === id).v, [KEY, b0.id]);
  const shown = { a: await tabs.a.evaluate(() => window.__dokusho.current().v), b: await tabs.b.evaluate(() => window.__dokusho.current().v) };
  const fails = [];
  for (const name in LISTS) { const L = LISTS[name], rows = L.get(disk), ws = writes.filter(w => w.name === name);
    for (const who of ["a", "b"]) if (JSON.stringify(L.get(shown[who])) !== JSON.stringify(rows)) fails.push(name + ": タブ " + who + " の状態が、保存された内容と違う");
    const where = {}; rows.forEach((row, i) => L.fields.forEach(f => ((L.val(row, f) || "").match(TOK) || []).forEach(t => { (where[t] = where[t] || []).push([i, f]); })));
    for (const t in where) {
      if (t[0] === "z") { if (!Z[name].includes(+t.slice(1, -1)) || where[t].length > 1 || where[t][0][1] !== L.fields[0]) fails.push(name + ": もとの行の印 " + t + " が、別の所か2か所にある"); continue; }
      const w = ws.find(o => o.tok === t);
      if (!w) { fails.push(name + ": ほかの一覧に打った " + t + " が入っている"); continue; }
      if (where[t].length > 1) fails.push(name + ": " + t + " が2か所にある");
      for (const [i, f] of where[t]) { const key = keyOf(name, L.val(rows[i], L.fields[0]), i); if (key !== w.key || f !== w.field) fails.push(name + ": " + t + "（" + w.key + w.field + " に打った）が、別の行か欄 [" + i + "]" + f + "（" + key + "）にある"); } }
    if (mode !== "add") continue;
    if (rows.length !== baseLen[name] + pushes[name]) fails.push(name + ": 行の数が " + rows.length + "（もとの " + baseLen[name] + " 行 + 足した " + pushes[name] + " 行のはず）");
    for (const w of ws) if (!where[w.tok] && !ws.some(o => o.who !== w.who && o.key === w.key && o.field === w.field)) fails.push(name + ": " + w.who + " が " + w.key + w.field + " に打った " + w.tok + " がない");
  }
  return { fails, log };
}

for (const [mode, title] of [["add", "行を消さない列: どちらのタブの入力も、打った行の打った欄に残る"], ["del", "行を消す操作を混ぜた列: 入力が、別の行や欄に混ざらない"]]) {
  for (const seed of [1, 2, 3]) {
    test(title + "（種 " + seed + "）", async ({ context }) => {
      const { fails, log } = await run(context, mode, seed, 40);
      expect(fails, "破れた決まり。操作の列:\n" + log.join("\n")).toEqual([]);
    });
  }
}
