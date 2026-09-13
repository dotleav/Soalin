// scripts/generate-audio-manifest.js
// Scan folder audio/benar/ dan audio/salah/, tulis daftarnya ke
// audio/manifest.js. File di kedua folder itu BEBAS namanya — ga perlu
// diawali "benar"/"salah" atau dinomori urut, tinggal taruh di folder
// yang bener lalu jalankan ulang script ini:
//     npm run audio-manifest
// index.html baca window.AUDIO_MANIFEST dari audio/manifest.js pas app
// dibuka, jadi ga ada tebak-tebakan nama file / nomor bolong lagi.

import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac"]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const audioDir = path.join(projectRoot, "audio");
const manifestPath = path.join(audioDir, "manifest.js");

function listAudioFiles(folderName) {
  const dir = path.join(audioDir, folderName);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    console.warn(`[audio-manifest] Folder ga ketemu: audio/${folderName}/ (dianggap kosong)`);
    return [];
  }
  return entries
    .filter((e) => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "id"));
}

const benar = listAudioFiles("benar");
const salah = listAudioFiles("salah");

const output = `// File ini di-GENERATE OTOMATIS oleh scripts/generate-audio-manifest.js
// JANGAN diedit manual — tiap kali nambah/hapus/rename file di
// audio/benar/ atau audio/salah/, jalankan ulang: npm run audio-manifest
window.AUDIO_MANIFEST = ${JSON.stringify({ benar, salah }, null, 2)};
`;

writeFileSync(manifestPath, output, "utf8");

console.log(`[audio-manifest] audio/benar/: ${benar.length} file`);
console.log(`[audio-manifest] audio/salah/: ${salah.length} file`);
console.log(`[audio-manifest] Ditulis ke audio/manifest.js`);
