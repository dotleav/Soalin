// Tes pembanding drift. Jalankan dari folder repo: node --test test/check-android-drift.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { compare } = require("../scripts/check-android-drift.cjs");

test("compare memisahkan identik, beda, dan file yang hanya ada di satu sisi", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drift-"));
  const web = path.join(tmp, "web");
  const and = path.join(tmp, "and");
  const put = (root, rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  put(web, "js/a.js", "1"); put(and, "js/a.js", "1");
  put(web, "js/b.js", "1"); put(and, "js/b.js", "2");
  put(web, "css/c.css", "x");
  put(and, "js/d.js", "y");
  const r = compare(web, and);
  assert.deepEqual(r.identik, ["js/a.js"]);
  assert.deepEqual(r.beda, ["js/b.js"]);
  assert.deepEqual(r.hanyaWeb, ["css/c.css"]);
  assert.deepEqual(r.hanyaAndroid, ["js/d.js"]);
});
