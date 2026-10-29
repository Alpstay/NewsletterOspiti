// Lettura di un'esportazione tabellare (.xlsx o .csv) senza dipendenze, identica in Node e nel browser.
// Restituisce le righe del primo foglio come testo; le date Excel restano numeri di serie.

export type Tabella = string[][];
/** Decompressione «deflate raw» (Node: zlib.inflateRawSync; browser: DecompressionStream). */
export type Inflate = (dati: Uint8Array) => Promise<Uint8Array>;

const u16 = (b: Uint8Array, p: number): number => b[p] | (b[p + 1] << 8);
const u32 = (b: Uint8Array, p: number): number => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const utf8 = new TextDecoder("utf-8");

async function voci(buf: Uint8Array, inflate: Inflate): Promise<Map<string, string>> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("il file non è un .xlsx valido");
  const n = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error("file .xlsx danneggiato");
    const metodo = u16(buf, p + 10);
    const compresso = u32(buf, p + 20);
    const lNome = u16(buf, p + 28);
    const lExtra = u16(buf, p + 30);
    const lComm = u16(buf, p + 32);
    const locale = u32(buf, p + 42);
    const nome = utf8.decode(buf.subarray(p + 46, p + 46 + lNome));
    p += 46 + lNome + lExtra + lComm;
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(nome)) continue;
    const inizio = locale + 30 + u16(buf, locale + 26) + u16(buf, locale + 28);
    const dati = buf.subarray(inizio, inizio + compresso);
    if (metodo !== 0 && metodo !== 8) throw new Error(`compressione non supportata nel file .xlsx (${metodo})`);
    out.set(nome, utf8.decode(metodo === 0 ? dati : await inflate(dati)));
  }
  return out;
}

const unescape = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
const testi = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");

function colonna(ref: string): number {
  let n = 0;
  for (const c of /^[A-Z]+/.exec(ref)?.[0] ?? "A") n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export async function leggiXlsx(buf: Uint8Array, inflate: Inflate): Promise<Tabella> {
  const z = await voci(buf, inflate);
  const stringhe = [...(z.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => testi(m[1]));
  const wb = z.get("xl/workbook.xml") ?? "";
  const rels = z.get("xl/_rels/workbook.xml.rels") ?? "";
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const rel = rid ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`)) : undefined;
  const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : undefined;
  const percorso = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : "xl/worksheets/sheet1.xml";
  const foglio = z.get(percorso) ?? z.get("xl/worksheets/sheet1.xml");
  if (!foglio) throw new Error("primo foglio non trovato nel file .xlsx");
  const righe: Tabella = [];
  for (const r of foglio.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const riga: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = c[1];
      const corpo = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attr)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(attr)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let val = "";
      if (tipo === "s" && v !== undefined) val = stringhe[Number(v)] ?? "";
      else if (tipo === "inlineStr") val = testi(corpo);
      else if (v !== undefined) val = unescape(v);
      riga[ref ? colonna(ref) : riga.length] = val.trim();
    }
    righe.push(Array.from(riga, (x) => x ?? ""));
  }
  return righe;
}

export function leggiCsv(testo: string): Tabella {
  const t = testo.replace(/^﻿/, "");
  const primaRiga = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", ",", "\t"].sort((a, b) => primaRiga.split(b).length - primaRiga.split(a).length)[0];
  const righe: Tabella = [];
  let riga: string[] = [];
  let campo = "";
  let virgolette = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (virgolette) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') virgolette = false;
      else campo += ch;
    } else if (ch === '"') virgolette = true;
    else if (ch === sep) {
      riga.push(campo.trim());
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      riga.push(campo.trim());
      righe.push(riga);
      riga = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || riga.length) {
    riga.push(campo.trim());
    righe.push(riga);
  }
  return righe.filter((r) => r.some((c) => c !== ""));
}

/** Legge un file dal nome e dai byte: .xlsx (o qualunque ZIP) come Excel, il resto come CSV in UTF-8. */
export async function leggiTabella(nome: string, buf: Uint8Array, inflate: Inflate): Promise<Tabella> {
  if (/\.xls$/i.test(nome)) throw new Error(`${nome}: il vecchio formato .xls non è supportato, salva il file come .xlsx`);
  if (/\.xlsx$/i.test(nome) || (buf[0] === 0x50 && buf[1] === 0x4b)) return leggiXlsx(buf, inflate);
  return leggiCsv(utf8.decode(buf));
}

/** Decompressione nel browser. */
export const inflateBrowser: Inflate = async (dati) => {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Blob([dati as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
};
