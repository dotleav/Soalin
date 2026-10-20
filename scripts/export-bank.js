// Ekspor paket soal lokal ke folder soalin-bank (JSON + gambar).
// Usage: node scripts/export-bank.js ../soalin-bank [--tier reguler|premium]
//   Tier default: reguler. Index bank digabung, jadi paket tier lain tidak ikut hilang.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const tierAt = args.indexOf("--tier");
const TIER = tierAt >= 0 ? args[tierAt + 1] : "reguler";
const skip = new Set(tierAt >= 0 ? [tierAt, tierAt + 1] : []);
const arg = args.find((a, i) => !skip.has(i));
if (!arg || !TIER || !/^[a-z]+$/.test(TIER)) {
  console.error("Usage: node scripts/export-bank.js <folder soalin-bank> [--tier reguler|premium]");
  process.exit(1);
}
const BANK = path.resolve(arg);

// Reguler memakai nama lama (packages/<id>.json) supaya bank yang sudah ada tetap cocok.
// Tier lain diberi prefix supaya id yang sama di tier berbeda tidak bentrok.
const slugOf = (id) => (TIER === "reguler" ? id : `${TIER}__${id}`);

// Ganti prefix gambar "images/packages/<id>/" jadi "images/packages/<slug>/".
function remapImages(v, from, to) {
  if (typeof v === "string") return v.startsWith(from) ? to + v.slice(from.length) : v;
  if (Array.isArray(v)) return v.map((x) => remapImages(x, from, to));
  if (v && typeof v === "object") {
    const o = {};
    for (const k in v) o[k] = remapImages(v[k], from, to);
    return o;
  }
  return v;
}

const { packages } = await import(pathToFileURL(path.join(ROOT, "data", "manifest.js")).href);
fs.mkdirSync(path.join(BANK, "packages"), { recursive: true });

const entries = [];
for (const p of packages) {
  const src = path.join(ROOT, p.file);
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP ${p.id} (file tidak ada: ${p.file})`);
    continue;
  }
  const mod = await import(pathToFileURL(src).href);
  const slug = slugOf(p.id);
  let questions = Array.isArray(mod.questions) ? mod.questions : [];
  if (slug !== p.id) questions = remapImages(questions, `images/packages/${p.id}/`, `images/packages/${slug}/`);

  const rel = `packages/${slug}.json`;
  fs.writeFileSync(path.join(BANK, rel), JSON.stringify({ id: slug, tier: TIER, title: p.title, category: p.category, questions }));
  entries.push({ id: slug, tier: TIER, title: p.title, category: p.category, count: questions.length, file: rel });

  const imgSrc = path.join(ROOT, "images", "packages", p.id);
  if (fs.existsSync(imgSrc)) {
    fs.cpSync(imgSrc, path.join(BANK, "images", "packages", slug), { recursive: true });
  }
  console.log(`  ${slug} (${questions.length} soal)`);
}

// Gabungkan dengan index lama: entri tier ini yang diekspor ulang diganti, sisanya dibiarkan.
const indexPath = path.join(BANK, "index.json");
let prev = [];
if (fs.existsSync(indexPath)) {
  try {
    prev = JSON.parse(fs.readFileSync(indexPath, "utf-8")).packages || [];
  } catch {
    console.warn("  index.json lama tidak terbaca, ditimpa.");
  }
}
const keep = prev.filter((e) => !entries.some((n) => n.id === e.id && (e.tier || "reguler") === TIER));
const all = [...keep, ...entries].sort(
  (a, b) => (a.category || "").localeCompare(b.category || "") || (a.title || "").localeCompare(b.title || "")
);
fs.writeFileSync(indexPath, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), packages: all }, null, 2));

console.log(`\n${entries.length} paket tier "${TIER}" diekspor ke ${BANK} (total di index: ${all.length})`);
