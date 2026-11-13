// Tes indeks kuis custom (boot cepat): IndexedDB dipalsukan, kode asli js/state.js dijalankan.
// Jalankan dari folder repo: node --test test/custom-index.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "js");
const store = new Map();
const gets = [];
const ctx = {
  console, store, gets, structuredClone, Date, Math, JSON, Set, Map, Promise, setTimeout, clearTimeout,
  setInterval, clearInterval, confirm: () => true, render: () => {}, addEventListener() {}, navigator: {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  document: {
    addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
    querySelectorAll() { return []; }, createElement() { return {}; }, head: { appendChild() {} },
    body: { classList: { contains() { return false; }, add() {}, remove() {} } }, fonts: null,
  },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["core.js", "state.js"]) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
// IndexedDB palsu: mencatat setiap kunci yang dibaca.
vm.runInContext(`
  if (typeof clearCustomProgress === "undefined") clearCustomProgress = () => {};
  idb = async function (mode, run) {
    return run({
      get(k) { gets.push(k); return store.get(k); },
      getAllKeys() { return [...store.keys()]; },
      put(v, k) { store.set(k, structuredClone(v)); return k; },
      delete(k) { store.delete(k); },
    });
  };`, ctx);
const run = (code) => vm.runInContext(code, ctx);

// 40 kuis format lama, masing-masing dengan 4 "gambar" besar.
function seedLegacy(n = 40) {
  store.clear();
  for (let i = 0; i < n; i++) {
    store.set("cq:q" + i, {
      id: "q" + i, title: "Kuis " + i, savedAt: 1000 + i,
      questions: [0, 1, 2].map((k) => ({ question: "Q" + k, options: { A: "a" }, answer: "A", questionImages: [0] })),
      blobs: Array.from({ length: 4 }, () => ({ big: "x".repeat(2000) })),
    });
  }
}

test("boot pertama (instal lama): migrasi membangun indeks dan semua kuis terdaftar", async () => {
  seedLegacy(); gets.length = 0;
  await run("loadCustom()");
  assert.ok(store.has("cqindex"), "indeks ditulis");
  const list = run("customQuizzes");
  assert.equal(list.length, 40);
  assert.equal(list[0].count, 3, "jumlah soal tersimpan di indeks");
  assert.equal("blobs" in list[0] || "questions" in list[0], false, "indeks tanpa isi kuis");
  assert.equal(list[0].savedAt >= list[1].savedAt, true, "urut terbaru dulu");
});

test("boot berikutnya: hanya membaca indeks, tidak membaca satu pun kuis", async () => {
  seedLegacy(); await run("loadCustom()"); // migrasi sekali
  gets.length = 0;
  await run("loadCustom()");
  assert.deepEqual(gets, ["cqindex"]);
  assert.equal(run("customQuizzes.length"), 40);
});

test("membuka satu kuis hanya membaca satu record", async () => {
  seedLegacy(); await run("loadCustom()"); gets.length = 0;
  const rec = await run("loadCustomFull('q5')");
  assert.deepEqual(gets, ["cq:q5"]);
  assert.equal(rec.questions.length, 3);
  assert.equal(rec.blobs.length, 4);
});

test("prepareCustomQs(null) aman (kuis hilang di IndexedDB)", () => {
  assert.equal(run("Array.isArray(prepareCustomQs(null)) && prepareCustomQs(null).length === 0"), true);
});

test("menghapus kuis memperbarui indeks dan menghapus record", async () => {
  seedLegacy(); await run("loadCustom()");
  await run("deleteCustom('q5')");
  assert.equal(store.has("cq:q5"), false);
  const idx = store.get("cqindex");
  assert.equal(idx.length, 39);
  assert.equal(idx.some((m) => m.id === "q5"), false);
});

test("kuis yang gagal disimpan tidak masuk indeks (hanya ada di sesi)", async () => {
  seedLegacy(); await run("loadCustom()");
  run("customQuizzes.unshift({ id: 'tmp', title: 'T', count: 1, savedAt: 9e12, key: 'cq:tmp', transient: true })");
  await run("saveCustomIndex()");
  assert.equal(store.get("cqindex").some((m) => m.id === "tmp"), false);
});
