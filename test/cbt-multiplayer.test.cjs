// Tes mode CBT multiplayer: menjalankan kode asli js/ di sandbox (tanpa browser/Firebase).
// Jalankan dari folder repo: node --test test/cbt-multiplayer.test.cjs
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "js");
const writes = [];
const doc = {
  addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, createElement() { return {}; }, head: { appendChild() {} },
  body: { classList: { contains() { return false; }, add() {}, remove() {} } }, fonts: null,
};
const ctx = {
  console, document: doc, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  confirm: () => true, render: () => {}, Date, Math, JSON, Set, Map, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener() {}, navigator: {}, writes,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["core.js", "state.js", "icons.js", "render-cbt.js", "multiplayer.js", "render-multiplayer.js"]) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
}
// Database palsu: mencatat semua tulisan. Room dianggap belum ada (get -> exists false).
vm.runInContext(`mpDb = function () { return { ref(p) { return {
  set(v) { writes.push(["set", p, v]); return Promise.resolve(); },
  update(u) { writes.push(["update", u]); return Promise.resolve(); },
  remove() { return Promise.resolve(); },
  get() { return Promise.resolve({ exists: () => false, val: () => null }); },
  on() {}, off() {}, }; } }; };`, ctx);
const run = (code) => vm.runInContext(code, ctx);
after(() => run("if (mpTickHandle) clearInterval(mpTickHandle)"));

// Ruang CBT 3 soal: u1 belum selesai, u2 sudah selesai.
const setRoom = (extra = {}) => run(`mpRoom = {
  meta: { count: 3, cbt: true, cbtSec: 600, timerSeconds: 0, difficulty: "cbt", title: "Paket" },
  state: { phase: "playing", currentIdx: 0, startedAt: Date.now() },
  questions: [{ question: "Q1", options: { A: "a", B: "b" } }, { question: "Q2", options: { A: "a", B: "b" } }, { question: "Q3", options: { A: "a", B: "b" } }],
  players: { u1: { name: "Andi" }, u2: { name: "Budi", done: true } }, reveal: {}, answers: {}, ...${JSON.stringify(extra)} };
  mpUid = "u1"; mpIsHost = false; mpScreen = "room"; mpRoomCode = "ABCD"; mpMyAnswers = {}; mpCbtIdx = 0; mpReviewIdx = null;`);

test("sisa waktu CBT = total paket", () => {
  setRoom(); const r = run("mpRemaining()");
  assert.ok(r > 599000 && r <= 600000, `got ${r}`);
});
test("waktu paket CBT habis -> 0", () => {
  setRoom({ state: { phase: "playing", currentIdx: 0, startedAt: Date.now() - 700000 } });
  assert.strictEqual(run("mpRemaining()"), 0);
});
test("lobi CBT: tanpa timer (null)", () => {
  setRoom({ state: { phase: "lobby", currentIdx: 0 } });
  assert.strictEqual(run("mpRemaining()"), null);
});
test("mode timer per soal tetap berjalan (30 dtk)", () => {
  run(`mpRoom = { meta: { count: 1, cbt: false, cbtSec: 0, timerSeconds: 30, difficulty: "normal" },
    state: { phase: "playing", currentIdx: 0, startedAt: Date.now() }, questions: [{ question: "x", options: { A: "a" } }], players: {}, reveal: {}, answers: {} }; mpRoomCode = "ABCD";`);
  const r = run("mpRemaining()"); assert.ok(r > 29000 && r <= 30000, `got ${r}`);
});
test("tampilan pemain: 3 nomor soal, tombol Selesai, timer", () => {
  setRoom(); const h = run("renderMpCbtPlaying()");
  assert.strictEqual((h.match(/class="cbtNum/g) || []).length, 3);
  assert.ok(h.includes('data-mp-act="cbtdone"'));
  assert.ok(h.includes("mpTimer"));
});
test("pemain sudah Selesai: opsi terkunci, tanpa tombol Selesai", () => {
  setRoom({ players: { u1: { name: "Andi", done: true } } });
  const h = run("renderMpCbtPlaying()");
  assert.ok(!h.includes('data-mp-act="cbtdone"'));
  assert.ok(h.includes("disabled"));
});
test("jawaban CBT boleh diganti sampai Selesai, lalu terkunci", () => {
  setRoom(); const before = writes.length;
  run("mpCbtIdx = 1; mpAnswer('B')"); run("mpAnswer('A')");
  const sets = writes.slice(before).filter((w) => w[0] === "set").map((w) => [w[1], w[2]]);
  assert.deepStrictEqual(sets, [["rooms/ABCD/answers/1/u1", "B"], ["rooms/ABCD/answers/1/u1", "A"]]);
  assert.strictEqual(run("mpMyAnswers[1]"), "A");
  setRoom({ players: { u1: { name: "Andi", done: true } } }); const n = writes.length;
  run("mpCbtIdx = 0; mpAnswer('A')");
  assert.strictEqual(writes.length, n, "tidak boleh menulis setelah Selesai");
});
test("host CBT: ringkasan pemain dan tombol Akhiri", () => {
  setRoom(); run("mpIsHost = true; mpUid = 'host'; mpRoom.answers = { 0: { u1: 'A' } };");
  const h = run("renderMpCbtPlaying()");
  assert.ok(h.includes('data-mp-act="cbtend"') && h.includes("1/3") && h.includes("pemain selesai"));
});
test("semua pemain selesai: host menulis reveal semua soal dan phase ended", () => {
  setRoom(); run("mpIsHost = true; mpLocalQs = [{answer:'A'},{answer:'B'},{answer:'C'}]; mpRoom.players.u1.done = true;");
  const n = writes.length; run("mpHostEndCbt()");
  const u = writes[n][1];
  assert.strictEqual(u["rooms/ABCD/state/phase"], "ended");
  assert.deepStrictEqual([0, 1, 2].map((i) => u[`rooms/ABCD/reveal/${i}`].answer), ["A", "B", "C"]);
});
test("mpAllDone: hanya true jika semua pemain sudah selesai", () => {
  setRoom(); assert.strictEqual(run("mpAllDone()"), false);
  run("mpRoom.players.u1.done = true"); assert.strictEqual(run("mpAllDone()"), true);
});
test("layar akhir pemain: skor dan daftar tinjauan semua soal", () => {
  setRoom({ state: { phase: "ended", currentIdx: 0 }, reveal: { 0: { answer: "A" }, 1: { answer: "B" }, 2: { answer: "C" } } });
  run("mpMyAnswers = { 0: 'A', 1: 'x' }");
  const h = run("renderMpEnded()");
  assert.ok(h.includes("1/3"));
  assert.strictEqual((h.match(/class="trvItem/g) || []).length, 3);
  run("mpReviewIdx = 1");
  assert.ok(run("renderMpEnded()").includes("Meninjau soal 2"));
});
test("picker host: pilih CBT menampilkan batas waktu", () => {
  setRoom(); run("mpDiff = 'cbt'");
  const h = run("renderMpJoin()");
  assert.ok(h.includes('data-diff="cbt"') && h.includes("Batas waktu satu paket"));
});
test("label mode CBT untuk pemain", () => {
  assert.ok(run("mpModeLabel({ difficulty: 'cbt', cbt: true, cbtSec: 7200, count: 3 })").includes("2 jam"));
});
test("buat room CBT menyimpan batas waktu total dan timerSeconds 0", async () => {
  ctx.firebase = { database: Object.assign(function () {}, { ServerValue: { TIMESTAMP: 1 } }) };
  run(`mpInit = async () => {};
    activePackage = { id: "p1", title: "Paket" };
    allQuestions = [{ question: "A", options: { A: "x" }, answer: "A" }, { question: "B", options: { A: "x" }, answer: "A" }];
    mpDiff = "cbt"; cbtTimeLimitSec = 1800; mpUid = "host"; mpShuffle = false;`);
  const n = writes.length;
  await run("mpCreateRoom()");
  const update = writes.slice(n).find((w) => w[0] === "update")[1];
  const metaKey = Object.keys(update).find((k) => k.endsWith("/meta"));
  const meta = update[metaKey];
  assert.strictEqual(meta.cbt, true);
  assert.strictEqual(meta.cbtSec, 1800);
  assert.strictEqual(meta.timerSeconds, 0);
  assert.strictEqual(meta.difficulty, "cbt");
});
