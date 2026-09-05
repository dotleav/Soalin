// scripts/delete-package.js
// Hapus paket soal: bersihin folder data/packages/<id> + images/packages/<id>
// SEKALIGUS hapus entry-nya dari data/manifest.js.
//
// Kenapa perlu script ini: hapus folder paket doang TIDAK CUKUP, karena
// index.html cuma baca data/manifest.js buat nampilin daftar paket di menu
// "Pilih Paket Soal" — dia gak ngecek folder-nya masih ada apa engga. Kalau
// foldernya dihapus manual tapi entry manifest-nya gak ikut dihapus, paket
// itu tetep nongol di menu (dan bakal error/kosong kalau dibuka).
//
// PAKAI:
//   node scripts/delete-package.js
//       -> tampilin daftar semua paket + kategori (mode lihat-lihat aja)
//
//   node scripts/delete-package.js --delete <id1>,<id2>,...
//       -> hapus paket-paket itu (folder + entry manifest)
//
//   node scripts/delete-package.js --json
//       -> output manifest dalam JSON mentah (dipakai delete.ps1 / GUI)
//
// Id paket bisa dilihat dari daftar di atas, atau dari field "id" di
// data/manifest.js.

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const manifestPath = path.join(projectRoot, "data", "manifest.js");

async function loadManifest() {
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const mod = await import(pathToFileURL(manifestPath).href + `?t=${Date.now()}`);
    return Array.isArray(mod.packages) ? mod.packages : [];
  } catch (e) {
    console.error("Gagal baca data/manifest.js:", e.message);
    return [];
  }
}

function writeManifest(packages) {
  packages.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  const manifestContent = `// File ini DIBUAT/DIKELOLA OTOMATIS oleh scripts/convert-docx.js.
// Berisi daftar semua "paket soal" (hasil konversi docx per kategori).
// Jangan diedit manual kecuali kamu tahu apa yang kamu lakukan — bisa
// dihapus/ditimpa lagi saat konversi berikutnya jalan untuk paket yang sama.

export const packages = ${JSON.stringify(packages, null, 2)};
`;
  fs.writeFileSync(manifestPath, manifestContent, "utf-8");
}

function rimraf(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

const packageDataDir = (id) => path.join(projectRoot, "data", "packages", id);
const packageImagesDir = (id) => path.join(projectRoot, "images", "packages", id);

async function main() {
  const args = process.argv.slice(2);
  const packages = await loadManifest();

  // ── Mode --json: output mentah buat dikonsumsi GUI (delete.ps1) ──────────
  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(packages));
    return;
  }

  const deleteFlagIdx = args.indexOf("--delete");

  // ── Mode lihat-lihat (tanpa argumen) ──────────────────────────────────────
  if (deleteFlagIdx === -1) {
    if (packages.length === 0) {
      console.log("Belum ada paket terdaftar di data/manifest.js.");
      return;
    }
    console.log("Daftar paket soal terdaftar (dari data/manifest.js):\n");
    const byCategory = {};
    for (const p of packages) (byCategory[p.category] ||= []).push(p);

    for (const [cat, list] of Object.entries(byCategory)) {
      console.log(`## ${cat}`);
      for (const p of list) {
        const folderAda = fs.existsSync(packageDataDir(p.id));
        const tandaHantu = folderAda ? "" : "   ⚠ HANTU — folder data-nya sudah tidak ada, tapi masih tampil di app";
        console.log(`  - ${p.title}  (${p.count} soal)${tandaHantu}`);
        console.log(`      id: ${p.id}`);
      }
      console.log("");
    }
    console.log("Cara hapus:");
    console.log("  node scripts/delete-package.js --delete <id1>,<id2>,...");
    console.log("Atau jalankan delete.bat buat pilih lewat tampilan (GUI), lebih gampang.");
    return;
  }

  // ── Mode hapus ─────────────────────────────────────────────────────────
  const idsArg = args[deleteFlagIdx + 1] || "";
  const idsToDelete = idsArg.split(",").map((s) => s.trim()).filter(Boolean);
  if (idsToDelete.length === 0) {
    console.error("Tidak ada id paket yang dikasih setelah --delete.");
    process.exit(1);
  }

  let remaining = packages;
  let deletedCount = 0;
  for (const id of idsToDelete) {
    const found = remaining.find((p) => p.id === id);
    if (!found) {
      console.log(`- (lewat) id tidak ada di manifest: ${id}`);
      continue;
    }
    const dataRemoved = rimraf(packageDataDir(id));
    const imagesRemoved = rimraf(packageImagesDir(id));
    remaining = remaining.filter((p) => p.id !== id);
    deletedCount++;
    console.log(`✓ Dihapus: [${found.category}] ${found.title}`);
    console.log(`    data/packages/${id}   -> ${dataRemoved ? "dihapus" : "sudah tidak ada"}`);
    console.log(`    images/packages/${id} -> ${imagesRemoved ? "dihapus" : "sudah tidak ada"}`);
  }

  writeManifest(remaining);
  console.log(`\nSelesai. ${deletedCount} paket dihapus. Sisa terdaftar di manifest: ${remaining.length} paket.`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
