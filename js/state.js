// ── LocalStorage — Mode Latihan (persist across refresh & tab close) ──────
// Progres disimpan per-paket (namespaced by activePackage.id) supaya jawaban
// di satu paket soal tidak tercampur dengan paket lain.
function currentLsKey() {
  return activePackage ? `${LS_KEY_PREFIX}__${activePackage.id}` : LS_KEY_PREFIX;
}
function loadBiasa() {
  try {
    const raw = localStorage.getItem(currentLsKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "answersMap" in parsed) return parsed;
    return null;
  } catch { return null; }
}
function saveBiasa() {
  try {
    localStorage.setItem(currentLsKey(), JSON.stringify({
      shuffleOn: biasaShuffleOn,
      answersMap: biasaAnswersMap,
    }));
  } catch { /* quota exceeded — abaikan diam-diam */ }
}
function clearBiasa() {
  try { localStorage.removeItem(currentLsKey()); } catch { /* noop */ }
}

// ── State: paket soal / kategori ──────────────────────────────────────────
let packageManifest = []; // dari data/manifest.js, diisi scripts/convert-docx.js
let activePackage = null; // entry manifest yang lagi dipakai, atau null = mode lama (data/questions.js)
let pickerOpen = false; // true = layar pilih kategori/paket sedang ditampilkan
let themeMenuOpen = false; // true = pilihan "Mode UI" (Terang/Gelap/Persona 5) lagi kebuka
let expandedCategories = new Set();

// ── State: Custom Quiz — 1 slot, diingat di IndexedDB (docx dikonversi di browser) ──
const CUSTOM_ID = "custom-quiz";
let customQuiz = null; // { title, questions (gambar = index blob), blobs, savedAt } atau null
let customQs = []; // customQuiz.questions dgn index gambar diganti object URL — siap dimainkan
let customUrls = []; // object URL gambar kuis custom (di-revoke saat ganti/hapus)
let dropMsg = ""; // pesan status konversi/hapus di kartu Custom Quiz

// ── State ──────────────────────────────────────────────────────────────────
let quizMode = "biasa"; // "biasa" | "tentamen"
let headerHidden = false;

// Mode Latihan (biasa) — dipersist ke localStorage
let biasaLoaded = false;
let biasaShuffleOn = false;
let biasaAnswersMap = {}; // id soal -> huruf jawaban
let biasaVisibleCount = LOAD_BATCH;
let shuffleOrderCache = {}; // cache urutan acak, biar stabil selama sesi

// Mode Tentamen — ephemeral, tidak disimpan
let tentamenState = "setup"; // "setup" | "running" | "finished"
let tentamenShuffleOn = false;
let tentamenDifficulty = "normal";
let tentamenQuestions = [];
let tentamenAnswers = []; // array sejajar index: huruf | "skipped" | null
let currentIdx = 0;
let timeLeft = 0;
let qPhase = "answering"; // "answering" | "answered_manual" | "answered_timeout"
let tentamenTimerHandle = null;
let tentamenAdvanceHandle = null;
// Nge-track kombinasi state+soal yang terakhir kali di-render "baru pertama
// kali", supaya animasi quiz-fade-in cuma main sekali pas soal itu pertama
// muncul — BUKAN tiap kali render() dipanggil ulang gara-gara jawaban
// diklik. Ini akar dari "blink" tiap jawab: seluruh kartu soal fade-in
// ulang padahal soalnya sama, cuma status jawabannya yang berubah.
let tentamenFadeKey = null;

// ── Paket soal / kategori: manifest, load, switch ─────────────────────────
async function loadManifest() {
  try {
    const mod = await import("../data/manifest.js");
    packageManifest = Array.isArray(mod.packages) ? mod.packages : [];
  } catch {
    packageManifest = []; // belum pernah convert pakai kategori — tidak apa-apa
  }
}

async function loadLegacyQuestions() {
  try {
    const mod = await import("../data/questions.js");
    allQuestions = Array.isArray(mod.questions) ? mod.questions : [];
  } catch {
    allQuestions = [];
  }
}

// Reset semua state kuis (Latihan & Tentamen) saat ganti paket soal.
function resetQuizStateForNewPackage() {
  quizMode = "biasa";
  tentamenState = "setup";
  tentamenQuestions = [];
  tentamenAnswers = [];
  shuffleOrderCache = {};
  brokenRevealed.clear();
  brokenIdx = 0;
  stopTentamenTimerLoop();
}

async function selectPackage(pkg) {
  try {
    const mod = pkg.custom ? { questions: customQs } : await import(new URL(pkg.file, document.baseURI).href);
    allQuestions = Array.isArray(mod.questions) ? mod.questions : [];
  } catch {
    allQuestions = [];
  }
  activePackage = pkg;
  try { localStorage.setItem(ACTIVE_PKG_KEY, pkg.id); } catch { /* noop */ }
  resetQuizStateForNewPackage();
  initBiasa();
}

// ── Custom Quiz: 1 kuis dari .docx, diingat di IndexedDB ─────────────────
// Kuis TIDAK ditulis ke file/server. Satu slot di IndexedDB browser (gambar
// sebagai Blob apa adanya) — tetap ada sampai user ganti/hapus. Kalau
// IndexedDB gagal/diblokir, kuis tetap jalan di sesi ini, cuma tidak diingat.
let dbPromise;
function idb(mode, run) {
  dbPromise ??= new Promise((ok, no) => {
    const req = indexedDB.open("soalin-custom", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
  });
  return dbPromise.then((db) => new Promise((ok, no) => {
    const tx = db.transaction("kv", mode), rq = run(tx.objectStore("kv"));
    tx.oncomplete = () => ok(rq.result);
    tx.onerror = tx.onabort = () => no(tx.error);
  }));
}

const customPkg = () => customQuiz && { id: CUSTOM_ID, title: customQuiz.title, category: "Custom Quiz", custom: true };

function clearCustomProgress() {
  try { localStorage.removeItem(`${LS_KEY_PREFIX}__${CUSTOM_ID}`); } catch { /* noop */ }
}

// rec = { title, questions, blobs, savedAt } atau null (kosongkan slot)
function setCustom(rec) {
  const urls = rec ? rec.blobs.map((b) => b && URL.createObjectURL(b)) : [];
  const pick = (idxs) => idxs.map((i) => urls[i]);
  customUrls.forEach((u) => u && URL.revokeObjectURL(u));
  customUrls = urls;
  customQs = rec ? rec.questions.map((q) => ({ ...q, questionImages: pick(q.questionImages), explanationImages: pick(q.explanationImages) })) : [];
  customQuiz = rec;
}

async function loadCustom() {
  try {
    const rec = await idb("readonly", (st) => st.get("custom"));
    if (rec?.questions) setCustom(rec);
  } catch { /* rekaman rusak / IndexedDB diblokir → slot kosong */ }
}

// Seret-lepas / pilih .docx → konversi → langsung jadi kuis (menggantikan kuis custom lama).
async function handleDocx(fileList) {
  const file = [...fileList].find((f) => /\.docx$/i.test(f.name));
  if (!file) { pickerOpen = true; dropMsg = "⚠️ Pilih file Word berformat .docx."; render(); return; }
  if (customQuiz && !confirm(`Ganti kuis custom "${customQuiz.title}" dengan "${file.name}"?\nKuis lama dan progresnya akan dihapus.`)) { render(); return; }
  pickerOpen = true; // pesan (proses/gagal) harus kelihatan walau lagi di tengah kuis
  dropMsg = `⏳ Mengonversi ${file.name}…`;
  render();
  const t0 = performance.now();
  try {
    const { questions, blobs, stats } = await convertDocx(await file.arrayBuffer());
    if (!stats.normal && !stats.rusak && !stats.isian) throw new Error("Tidak ada soal terdeteksi. Format: 1. Soal / A. … E. / Kunci: X / Penjelasan: …");
    const rec = { title: file.name.replace(/\.docx$/i, ""), questions, blobs, savedAt: Date.now() };
    let saved = true;
    await idb("readwrite", (st) => st.put(rec, "custom")).catch(() => { saved = false; });
    setCustom(rec);
    clearCustomProgress(); // progres kuis lama ikut dibuang
    await selectPackage(customPkg());
    const skipped = stats.skippedExt.length ? ` ⚠️ Gambar .${stats.skippedExt.join(", .")} dilewati (browser tidak bisa menampilkan) — tempel ulang di Word sebagai PNG/JPG.` : "";
    dropMsg = `✅ ${stats.normal} soal${stats.rusak ? ` + ${stats.rusak} soal rusak` : ""}${stats.isian ? ` + ${stats.isian} soal isian` : ""}, ${stats.images} gambar — ${Math.round(performance.now() - t0)} ms.${skipped}${saved ? "" : " ⚠️ Gagal menyimpan ke browser — kuis hilang kalau tab ditutup."}`;
    pickerOpen = !!skipped || !saved; // ada peringatan → tetap di layar ini supaya terbaca
  } catch (e) {
    dropMsg = e instanceof ReferenceError ? "❌ Browser terlalu lama (butuh DecompressionStream). Pakai Chrome/Edge/Firefox/Safari terbaru." : `❌ ${e.message}`;
  }
  render();
}

async function deleteCustom() {
  if (!customQuiz || !confirm(`Hapus kuis custom "${customQuiz.title}"?\nProgresnya ikut hilang.`)) return;
  const wasActive = activePackage?.id === CUSTOM_ID;
  setCustom(null);
  clearCustomProgress();
  await idb("readwrite", (st) => st.delete("custom")).catch(() => {});
  if (wasActive) {
    allQuestions = [];
    activePackage = null;
    try { localStorage.removeItem(ACTIVE_PKG_KEY); } catch { /* noop */ }
    resetQuizStateForNewPackage();
  }
  dropMsg = "🗑️ Kuis custom dihapus.";
  pickerOpen = true;
  render();
}

// Seret-lepas di mana saja di halaman (preventDefault supaya browser tidak membuka file-nya).
let dragTimer;
addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("dragging");
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => document.body.classList.remove("dragging"), 120);
});
addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
  if (e.dataTransfer.files.length) handleDocx(e.dataTransfer.files);
});

// ── Init Mode Latihan dari localStorage ──────────────────────────────────
function initBiasa() {
  const saved = loadBiasa();
  // Selalu reset dulu ke default sebelum load — supaya kalau paket baru
  // belum pernah punya progres tersimpan, state paket sebelumnya (yang
  // masih ada di memory) tidak ikut kebawa / "bocor" ke paket baru.
  biasaShuffleOn = false;
  biasaAnswersMap = {};
  if (saved) {
    biasaShuffleOn = !!saved.shuffleOn;
    biasaAnswersMap = saved.answersMap || {};
  }
  biasaVisibleCount = LOAD_BATCH;
  biasaLoaded = true;
}
