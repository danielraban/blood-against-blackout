import { inflateSync } from "node:zlib";

// Reads the text operators out of a simple FlateDecode PDF. Identity-H fonts
// are mapped through each font's ToUnicode cmap, in content-stream order.
export function extractPdfText(pdf: Buffer) {
  const source = pdf.toString("latin1");
  const objects = pdfObjects(source);
  const fonts = unicodeMaps(objects);
  const pages = [...objects.entries()]
    .filter(([, body]) => /\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body))
    .map(([, body]) => contentIds(body))
    .flat();
  return pages
    .map((id) => pageText(objects.get(id) ?? "", fonts))
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pdfObjects(source: string) {
  const objects = new Map<number, string>();
  for (const match of source.matchAll(/(\d+)\s+0\s+obj\s*([\s\S]*?)\s*endobj/g)) {
    objects.set(Number(match[1]), match[2] ?? "");
  }
  return objects;
}

function contentIds(page: string) {
  const array = page.match(/\/Contents\s*\[([^\]]+)\]/);
  const single = page.match(/\/Contents\s+(\d+)\s+0\s+R/);
  const raw = array?.[1] ?? (single ? `${single[1]} 0 R` : "");
  return [...raw.matchAll(/(\d+)\s+0\s+R/g)].map((match) => Number(match[1]));
}

function unicodeMaps(objects: Map<number, string>) {
  const fonts = new Map<number, Map<string, number>>();
  for (const [id, body] of objects) {
    const toUnicode = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!toUnicode) continue;
    const target = objects.get(Number(toUnicode[1]));
    if (target) fonts.set(id, cmap(target));
  }
  return fonts;
}

function cmap(body: string) {
  const decoded = streamBytes(body).toString("latin1");
  const map = new Map<string, number>();
  for (const block of decoded.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const line of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      let dest = parseInt(line[3] ?? "", 16);
      const start = parseInt(line[1] ?? "", 16);
      const end = parseInt(line[2] ?? "", 16);
      for (let code = start; code <= end; code += 1, dest += 1) {
        map.set(code.toString(16).toUpperCase().padStart(4, "0"), dest);
      }
    }
  }
  for (const block of decoded.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const line of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set((line[1] ?? "").toUpperCase().padStart(4, "0"), parseInt(line[2] ?? "", 16));
    }
  }
  return map;
}

function pageText(body: string, fonts: Map<number, Map<string, number>>) {
  const data = streamBytes(body).toString("latin1");
  let font: number | null = null;
  let text = "";
  for (const token of data.matchAll(/\/(F\d+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g)) {
    if (token[1]) {
      font = Number(token[1].slice(1));
      continue;
    }
    text += decodeHex(token[2] ?? "", fonts.get(font ?? -1));
  }
  return text.replace(/[ \t]+/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHex(hex: string, map: Map<string, number> | undefined) {
  const clean = hex.replace(/\s+/g, "").toUpperCase();
  const width = clean.length > 0 && clean.length % 4 === 0 ? 4 : 2;
  let out = "";
  for (let index = 0; index < clean.length; index += width) {
    const key = clean.slice(index, index + width).padStart(4, "0");
    const code = map?.get(key);
    if (code != null) out += String.fromCodePoint(code);
  }
  return out;
}

function streamBytes(body: string) {
  const match = body.match(/stream\r?\n([\s\S]*?)endstream/);
  if (!match) return Buffer.alloc(0);
  const raw = Buffer.from(match[1] ?? "", "latin1");
  if (!/FlateDecode/.test(body)) return raw;
  try {
    return inflateSync(raw);
  } catch {
    return raw;
  }
}
