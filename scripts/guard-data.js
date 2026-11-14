#!/usr/bin/env node
/* データの消失を止めるガード。pre-commit から呼ぶ。
   コミットしようとしている版（git の index）を、HEAD の版と比べる。次のどれかで失敗（終了コード 1）にする。
   - ファイルが消えた、空になった、読めない
   - 件数が 0 になった
   - 件数が HEAD から 10% を超えて減った
   意図して大きく減らすときは、git commit --no-verify で通す。 */
"use strict";
const { execFileSync } = require("child_process");
const vm = require("vm");

const MAX_DROP = 0.10;
const windowVar = (src, name) => { const sb = { window: {} }; vm.runInNewContext(src, sb, { timeout: 1000 }); return sb.window[name]; };
const sumProps = list => list.reduce((a, x) => a + x, 0);
/* 対象と、件数の数え方。数え方は { 名前: 件数 } を返す */
const TARGETS = {
  "book_principles.json": src => { const d = JSON.parse(src); if (!Array.isArray(d)) throw new Error("配列ではない"); return { "本": d.length }; },
  "docs/factcheck.js": src => { const fc = windowVar(src, "FACTCHECK"); if (!fc || typeof fc !== "object") throw new Error("window.FACTCHECK がない");
    const books = Object.values(fc); return { "本": books.length, "命題": sumProps(books.map(b => Object.keys((b && b.props) || {}).length)) }; },
  "docs/sample.js": src => { const s = windowVar(src, "SAMPLES"); if (!Array.isArray(s)) throw new Error("window.SAMPLES が配列ではない");
    return { "サンプル": s.length, "命題": sumProps(s.map(b => ((b && b.v && b.v.props) || []).length)) }; },
};

function show(rev, file) {
  try { return execFileSync("git", ["show", rev + ":" + file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { return null; }
}

function check() {
  const errors = [], lines = [];
  for (const [file, count] of Object.entries(TARGETS)) {
    const base = show("HEAD", file), now = show("", file); // "" は index（コミットしようとしている版）
    if (now === null) { if (base !== null) errors.push(`${file}: ファイルが消えた`); continue; }
    if (!now.trim()) { errors.push(`${file}: 空になった`); continue; }
    let n; try { n = count(now); } catch (e) { errors.push(`${file}: 読めない（${e.message}）`); continue; }
    let b = null; if (base !== null) { try { b = count(base); } catch (e) { b = null; } }
    for (const [k, v] of Object.entries(n)) {
      const was = b ? b[k] : null;
      lines.push(`${file} の${k}: ${was == null ? "-" : was} → ${v}`);
      if (v === 0) errors.push(`${file}: ${k}が 0 件になった`);
      else if (was && (was - v) / was > MAX_DROP) errors.push(`${file}: ${k}が ${was} → ${v} 件に減った（${Math.round((was - v) / was * 1000) / 10}%。上限は ${MAX_DROP * 100}%）`);
    }
  }
  return { errors, lines };
}

if (require.main === module) {
  const { errors, lines } = check();
  if (process.argv.includes("-v")) lines.forEach(l => console.log(l));
  if (errors.length) {
    console.error("データのガード: コミットを止めた。");
    errors.forEach(e => console.error("  - " + e));
    console.error("意図した変更なら、git commit --no-verify で通す。");
    process.exit(1);
  }
}
module.exports = { check, TARGETS };
