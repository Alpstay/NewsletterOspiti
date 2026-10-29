// Lettura di un'esportazione tabellare (.xlsx o .csv) senza dipendenze: restituisce le righe del primo foglio
// come testo. Le date Excel restano numeri di serie: le converte chi conosce il significato della colonna.

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export type Tabella = string[][];

// ───────────── ZIP ─────────────

function voci(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("il file non è un .xlsx valido (archivio ZIP non riconosciuto)");
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("indice ZIP danneggiato");
    const metodo = buf.readUInt16LE(p + 10);
    const compresso = buf.readUInt32LE(p + 20);
    const lNome = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComm = buf.readUInt16LE(p + 32);
    const locale = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lNome);
    const inizio = locale + 30 + buf.readUInt16LE(locale + 26) + buf.readUInt16LE(locale + 28);
    const dati = buf.subarray(inizio, inizio + compresso);
    out.set(nome, metodo === 0 ? dati : metodo === 8 ? inflateRawSync(dati) : Buffer.alloc(0));
    p += 46 + lNome + lExtra + lComm;
  }
  return out;
}

// ───────────── XLSX ─────────────

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
  const lettere = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const c of lettere) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function leggiXlsx(buf: Buffer): Tabella {
  const z = voci(buf);
  const shared = z.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const stringhe = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => testi(m[1]));
  const wb = z.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = z.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  const percorso = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : "xl/worksheets/sheet1.xml";
  const foglio = (z.get(percorso) ?? z.get("xl/worksheets/sheet1.xml"))?.toString("utf8");
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

// ───────────── CSV ─────────────

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

export function leggiTabella(percorso: string): Tabella {
  const buf = readFileSync(percorso);
  if (/\.xlsx$/i.test(percorso) || (buf[0] === 0x50 && buf[1] === 0x4b)) return leggiXlsx(buf);
  if (/\.xls$/i.test(percorso)) throw new Error("il vecchio formato .xls non è supportato: salva il file come .xlsx o .csv");
  return leggiCsv(buf.toString("utf8"));
}
