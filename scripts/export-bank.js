// Ekspor paket soal lokal ke folder soalin-bank (JSON + gambar).
// Usage: node scripts/export-bank.js ../soalin-bank
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/export-bank.js <folder soalin-bank>");
  process.exit(1);
}
const BANK = path.resolve(arg);

const { packages } = await import(pathToFileURL(path.join(ROOT, "data", "manifest.js")).href);

fs.mkdirSync(path.join(BANK, "packages"), { recursive: true });

const index = [];
for (const p of packages) {
  const src = path.join(ROOT, p.file);
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP ${p.id} (file tidak ada: ${p.file})`);
    continue;
  }
  const mod = await import(pathToFileURL(src).href);
  const questions = Array.isArray(mod.questions) ? mod.questions : [];
  const rel = `packages/${p.id}.json`;
  fs.writeFileSync(
    path.join(BANK, rel),
    JSON.stringify({ id: p.id, title: p.title, category: p.category, questions })
  );
  index.push({ id: p.id, title: p.title, category: p.category, count: questions.length, file: rel });
  console.log(`  ${p.id} (${questions.length} soal)`);
}

fs.writeFileSync(
  path.join(BANK, "index.json"),
  JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), packages: index }, null, 2)
);

// Gambar: salin images/packages ke bank (sekali saja, atau setiap ada gambar baru).
const imgSrc = path.join(ROOT, "images", "packages");
if (fs.existsSync(imgSrc)) {
  fs.cpSync(imgSrc, path.join(BANK, "images", "packages"), { recursive: true });
  console.log("  gambar disalin ke images/packages");
}

console.log(`\n${index.length} paket diekspor ke ${BANK}`);
