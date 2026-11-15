// Bandingkan js/ dan css/ di web dengan salinan www di repo Android.
// Hanya lapor, tidak mengubah file. Dari folder Soalin: node scripts/check-android-drift.cjs
const fs = require("node:fs");
const path = require("node:path");

const DIRS = ["js", "css"];
const WWW = path.join("app", "src", "main", "assets", "www");
const ANDROID = [
  path.join("..", "Soalin-Regular-Android", WWW),
  path.join("..", "Soalin-Premium-Android", WWW),
];

function listFiles(base) {
  const out = [];
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  };
  for (const d of DIRS) {
    const dir = path.join(base, d);
    if (fs.existsSync(dir)) walk(dir);
  }
  return out.sort();
}

function compare(webRoot, androidWww) {
  const web = new Set(listFiles(webRoot));
  const and = new Set(listFiles(androidWww));
  const res = { identik: [], beda: [], hanyaWeb: [], hanyaAndroid: [] };
  for (const f of web) {
    if (!and.has(f)) res.hanyaWeb.push(f);
    else if (fs.readFileSync(path.join(webRoot, f)).equals(fs.readFileSync(path.join(androidWww, f)))) res.identik.push(f);
    else res.beda.push(f);
  }
  for (const f of and) if (!web.has(f)) res.hanyaAndroid.push(f);
  return res;
}

module.exports = { compare };

if (require.main === module) {
  const webRoot = path.join(__dirname, "..");
  for (const dir of ANDROID) {
    const abs = path.resolve(webRoot, dir);
    if (!fs.existsSync(abs)) {
      console.log(`${dir}: tidak ditemukan`);
      continue;
    }
    const r = compare(webRoot, abs);
    console.log(`${dir}\n  identik ${r.identik.length}, beda ${r.beda.length}, hanya di web ${r.hanyaWeb.length}, hanya di Android ${r.hanyaAndroid.length}`);
    for (const f of r.beda) console.log(`  beda: ${f}`);
    for (const f of r.hanyaAndroid) console.log(`  hanya di Android: ${f}`);
  }
}
