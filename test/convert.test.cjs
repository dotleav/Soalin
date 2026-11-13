// Tes parser soal (js/convert.js). Jalankan dari folder repo: node --test test/convert.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const conv = fs.readFileSync(path.join(ROOT, "js/convert.js"), "utf8");
const hl = fs.readFileSync(path.join(ROOT, "js/highlight.js"), "utf8");

// Fungsi parser ada di dalam convertDocx, jadi potongan sumbernya diambil lalu dijalankan.
function extract(startMarker, endMarker) {
  const a = conv.indexOf(startMarker), b = conv.indexOf(endMarker);
  assert.ok(a >= 0 && b > a, `marker tidak ketemu: ${startMarker}`);
  return conv.slice(a, b);
}

const parsePart1 = new Function(
  `${hl}\nconst OPT_LETTERS = ["A", "B", "C", "D", "E"];\n` +
  `${extract("  function parseOptionBody(raw) {", "  // ── Bagian 2:")}\nreturn parsePart1;`
)();

const parsePart3 = new Function(`
  const blobs = [];
  const flat = (bl) => bl.flatMap((b) => (b.tbl ? b.tbl.flat().flatMap(flat) : [b]));
  const paraLines = (b) => b.segs.map((s) => ({ text: s.text.trim(), images: [], isHeading: false, isListItem: false }));
  ${extract("  function parsePart3(tables, startingQNumber) {", "  const normal = parsePart1")}
  return parsePart3;
`)();

const L = (text) => ({ text, images: [], isHeading: false, isListItem: false });
const cell = (t) => [{ segs: [{ text: t, imgs: [] }] }];

test("opsi dengan { tanpa } tidak menelan soal berikutnya", () => {
  const q = parsePart1([
    L("1. Soal pertama"), L("A. a"), L("B. Pilihan {penjelasan"), L("2. Soal berikutnya"),
    L("A. x"), L("B. y"), L("C. z"), L("Kunci: A"),
  ]);
  assert.equal(q.length, 2);
  assert.equal(q[1].question, "Soal berikutnya");
});

test("penjelasan yang ditutup di baris berikutnya tetap utuh", () => {
  const q = parsePart1([L("1. Soal"), L("A. a {penjelasan"), L("lanjutan penjelasan}"), L("B. b"), L("Kunci: B")]);
  assert.equal(q.length, 1);
  assert.equal(q[0].optionExplanations.A, "penjelasan lanjutan penjelasan");
});

test("tabel isian dengan 2 kolom tidak membuat konversi gagal", () => {
  const r = parsePart3([[[cell("1"), cell("Apa itu sindrom X?")]]]);
  assert.equal(r.length, 1);
  assert.equal(r[0].question, "Apa itu sindrom X?");
});
