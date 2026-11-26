// ── Penulis .docx minimal (tanpa library) ─────────────────────────────────
// zip STORE + WordprocessingML. Dipakai untuk unduh kuis & materi sebagai Word.
// Blok: {type:"p", text, bold} · {type:"img", png, w, h} · {type:"table", header, rows}

const DOCX_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function docxCrc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = DOCX_CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{name, data: Uint8Array}] → Blob zip (tanpa kompresi, cukup untuk Word)
function docxZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = docxCrc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
    ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)],
    { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

const dxEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Teks dengan baris baru → <w:br/>
function dxRuns(text, bold) {
  return String(text ?? "").split("\n").map((line, i) =>
    (i ? "<w:r><w:br/></w:r>" : "") +
    `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${dxEsc(line)}</w:t></w:r>`
  ).join("");
}

function dxCell(text, bold) { return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${dxRuns(text, bold)}</w:p></w:tc>`; }

function dxTable(header, rows) {
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("");
  const head = `<w:tr>${header.map((h) => dxCell(h, true)).join("")}</w:tr>`;
  const body = rows.map((r) => `<w:tr>${r.map((c) => dxCell(c, false)).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>${head}${body}</w:tbl>`;
}

// Gambar → PNG (Word tidak membaca webp/bmp dsb.). Kembali null kalau browser tidak bisa membaca gambar.
async function docxPngFromBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    const out = await new Promise((ok) => c.toBlob(ok, "image/png"));
    if (!out) return null;
    return { png: new Uint8Array(await out.arrayBuffer()), w: bmp.width, h: bmp.height };
  } catch {
    return null;
  }
}

async function buildDocx(blocks) {
  const EMU_PX = 9525, MAX_W = 5486400; // lebar maks ±6 inci
  const enc = (s) => new TextEncoder().encode(s);
  const files = [];
  let body = "", rels = "", imgN = 0;
  for (const b of blocks) {
    if (b.type === "p") {
      body += `<w:p>${dxRuns(b.text, b.bold)}</w:p>`;
    } else if (b.type === "table") {
      body += dxTable(b.header, b.rows);
    } else if (b.type === "img") {
      imgN++;
      const s = Math.min(1, MAX_W / (b.w * EMU_PX));
      const cx = Math.round(b.w * EMU_PX * s), cy = Math.round(b.h * EMU_PX * s);
      rels += `<Relationship Id="rIdImg${imgN}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imgN}.png"/>`;
      files.push({ name: `word/media/image${imgN}.png`, data: b.png });
      body += `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imgN}" name="Gambar ${imgN}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imgN}" name="image${imgN}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${imgN}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    }
  }
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
  files.unshift(
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rootRels) },
    { name: "word/_rels/document.xml.rels", data: enc(docRels) },
    { name: "word/document.xml", data: enc(docXml) },
  );
  return docxZip(files);
}
