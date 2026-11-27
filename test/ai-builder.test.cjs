// Uji logika rekonstruksi & kuota materi (js/ai-builder.js). Jalankan: node --test test/ai-builder.test.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const src = fs.readFileSync(path.join(__dirname, "..", "js", "ai-builder.js"), "utf8");

function fnSrc(name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`fungsi ${name} tidak ditemukan`);
  const from = src.lastIndexOf("\n", at) + 1;
  const to = src.indexOf("\n}\n", at) + 3;
  return src.slice(from, to);
}
const constSrc = [...src.matchAll(/^const (RECON_\w+|GEN_CAP|QSTART|AI_SYS_JSON) = [^\n]*$/gm)].map((m) => m[0]).join("\n");
const FNS = ["aiJson", "chunkLines", "splitQuestionBlocks", "groupBlocks", "poolRun", "reconBatchOnce", "reconRun", "materiPlan", "materiRun"];

// Muat fungsi asli dari file dalam konteks terisolasi; aiCall & reconPrompt dibuat palsu.
function load(aiCallStub) {
  const code = [
    constSrc,
    ...FNS.map(fnSrc),
    `function reconPrompt(chunk, nos) { return "NOS:" + nos.join(",") + "\\n" + chunk; }`,
    `({ splitQuestionBlocks, groupBlocks, poolRun, reconRun, materiPlan })`,
  ].join("\n");
  return vm.runInNewContext(code, { aiCall: aiCallStub });
}
// Salin objek dari konteks vm ke realm tes agar assert.deepEqual tidak tersandung prototipe.
const J = (x) => JSON.parse(JSON.stringify(x));

test("pemecahan blok: soal utuh dengan opsi, kunci, dan heading di atasnya", () => {
  const api = load(async () => "");
  const blocks = api.splitQuestionBlocks(["Bagian 1", "1. Q1", "A. x", "Kunci: A", "2. Q2", "A. y", "3 | soal tabel | jawaban"]);
  assert.deepEqual(J(blocks.map((b) => b.no)), [1, 2, 3]);
  assert.deepEqual(J(blocks[0].lines), ["Bagian 1", "1. Q1", "A. x", "Kunci: A"]);
});

test("kelompok soal tidak melebihi batas soal maupun karakter", () => {
  const api = load(async () => "");
  const blocks = Array.from({ length: 20 }, (_, i) => ({ no: i + 1, lines: [`${i + 1}. ${"x".repeat(50)}`] }));
  const groups = api.groupBlocks(blocks);
  assert.ok(groups.every((g) => g.length <= 8));
  assert.equal(groups.flat().length, 20);
});

test("rekonstruksi: semua nomor kembali; yang gagal diulang; yang tetap gagal jadi rusak, bukan hilang", async () => {
  const calls = [];
  const lines = ["Bagian 1"];
  for (let n = 1; n <= 12; n++) {
    lines.push(`${n}. Soal ${n} teks`, "A. a", "B. b", "Kunci: A");
    if (n === 3) lines.push("[[IMG:0]]");
  }
  const stub = async (sys, user) => {
    const nos = user.match(/^NOS:([\d,]+)\n/)[1].split(",").map(Number);
    calls.push(nos);
    const seen5 = calls.filter((c) => c.includes(5)).length;
    const soal = [], isian = [];
    for (const n of nos) {
      if (n === 7) continue;                      // selalu gagal
      if (n === 5 && seen5 === 1) continue;       // gagal sekali, pulih saat diulang
      if (n >= 10) isian.push({ no: n, soal: `Isian ${n}`, jawaban: `Jawaban ${n}` });
      else soal.push({ no: n, stem: `Soal ${n} teks`, opsi: { A: "a", B: "b" }, kunci: "A", penjelasan: "" });
    }
    return JSON.stringify({ soal, isian });
  };
  const api = load(stub);
  const res = await api.reconRun({ lines }, () => {});

  assert.ok(calls.every((c) => c.length <= 8), "tiap panggilan maksimal 8 soal");
  const got = [...new Set([...res.soal, ...res.isian].map((s) => Number(s.no)))].sort((a, b) => a - b);
  assert.deepEqual(got, Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(res.leftover, 1);
  const bad = res.soal.find((s) => Number(s.no) === 7);
  assert.equal(bad.rusak, true);
  assert.match(bad.stem, /Soal 7 teks/);
  assert.match(bad.stem, /A\. a/);
  assert.ok(calls.some((c) => c.length === 2 && c.includes(5) && c.includes(7)), "nomor 5 & 7 diulang");
});

test("semua panggilan AI gagal → error terlihat, bukan kuis kosong diam-diam", async () => {
  const api = load(async () => { throw new Error("AI tidak merespons (500)."); });
  await assert.rejects(api.reconRun({ lines: ["1. x", "A. a", "2. y", "A. b"] }, () => {}), /AI tidak merespons/);
});

test("kuota materi: tepat 30 soal, tersebar dari awal sampai akhir", () => {
  const api = load(async () => "");
  const plan = api.materiPlan(Array.from({ length: 40 }, (_, i) => i), 30);
  assert.equal(plan.length, 30);
  assert.equal(plan.reduce((a, p) => a + p.q, 0), 30);
  assert.equal(plan[0].c, 0);
  assert.equal(plan[29].c, 38);
  assert.equal(api.materiPlan(Array(3).fill(0), 30).reduce((a, p) => a + p.q, 0), 30);
  assert.equal(api.materiPlan([], 30).length, 0);
});

test("panggilan paralel dibatasi sesuai limit", async () => {
  const api = load(async () => "");
  let active = 0, peak = 0;
  await api.poolRun(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  assert.equal(peak, 3);
});
