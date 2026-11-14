// ガードのスクリプトと pre-commit フックの仕様。一時的な git リポジトリに今のデータを写して、コミットを試す。
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const FILES = ["book_principles.json", "docs/factcheck.js", "docs/sample.js", "scripts/guard-data.js", ".githooks/pre-commit"];

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q"); git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t"); git("config", "core.hooksPath", ".githooks");
  for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
  fs.chmodSync(path.join(dir, ".githooks/pre-commit"), 0o755);
  git("add", "-A"); git("commit", "-q", "-m", "base");
  const commit = () => { git("add", "-A"); return spawnSync("git", ["commit", "-q", "-m", "change"], { cwd: dir, encoding: "utf8" }); };
  const read = f => fs.readFileSync(path.join(dir, f), "utf8");
  const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  return { dir, commit, read, write };
}
const books = r => JSON.parse(r.read("book_principles.json"));
const writeBooks = (r, d) => r.write("book_principles.json", JSON.stringify(d, null, 1));

test("変えずに（または本を足して）コミットすると通る", () => {
  const r = repo(); const d = books(r);
  writeBooks(r, d.concat([Object.assign({}, d[0], { no: "999" })]));
  assert.strictEqual(r.commit().status, 0);
});
test("factcheck.js を空にすると止まる", () => {
  const r = repo(); r.write("docs/factcheck.js", "");
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /factcheck\.js: 空になった/);
});
test("factcheck.js の中身が {} になると止まる", () => {
  const r = repo(); r.write("docs/factcheck.js", "window.FACTCHECK = {};\n");
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /本が 0 件になった/);
});
test("book_principles.json が [] になると止まる", () => {
  const r = repo(); r.write("book_principles.json", "[]");
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /book_principles\.json: 本が 0 件/);
});
test("本が 10% を超えて減ると止まる（250 → 224 冊）", () => {
  const r = repo(); const d = books(r); writeBooks(r, d.slice(0, Math.floor(d.length * 0.896)));
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /に減った/);
});
test("ちょうど 10% の減少は通る（250 → 225 冊）", () => {
  const r = repo(); const d = books(r); writeBooks(r, d.slice(0, Math.ceil(d.length * 0.9)));
  assert.strictEqual(r.commit().status, 0);
});
test("factcheck.js の命題が 10% を超えて減ると止まる", () => {
  const r = repo(); const src = r.read("docs/factcheck.js");
  const fc = (() => { const w = {}; new Function("window", src)(w); return w.FACTCHECK; })();
  const b = Object.values(fc)[0]; delete b.props[Object.keys(b.props)[0]];
  r.write("docs/factcheck.js", "window.FACTCHECK = " + JSON.stringify(fc, null, 1) + ";\n");
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /命題が/);
});
test("壊れた JSON は止まる", () => {
  const r = repo(); r.write("book_principles.json", "[{");
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /読めない/);
});
test("sample.js を消すと止まる", () => {
  const r = repo(); fs.unlinkSync(path.join(r.dir, "docs/sample.js"));
  const res = r.commit(); assert.strictEqual(res.status, 1); assert.match(res.stderr, /sample\.js: ファイルが消えた/);
});
