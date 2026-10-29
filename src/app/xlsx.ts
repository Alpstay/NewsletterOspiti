// Generatore .xlsx minimo e senza dipendenze: un archivio ZIP (senza compressione) con fogli in XML.
// Intestazione in grassetto e bloccata, filtro automatico, date vere (gg/mm/aaaa), larghezze colonne.

export type TipoColonna = "testo" | "data" | "numero";
export type Cella = string | number | null;

export interface Colonna {
  readonly titolo: string;
  readonly larghezza: number;
  readonly tipo: TipoColonna;
}

export interface Foglio {
  readonly nome: string;
  readonly colonne: readonly Colonna[];
  readonly righe: readonly (readonly Cella[])[];
}

// ───────────── XML ─────────────

const xml = (s: string): string =>
  s
    // caratteri di controllo non ammessi in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colonnaLettere(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Numero di serie Excel di una data AAAA-MM-GG (sistema 1900). */
export function serialeData(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** Nome di foglio valido: massimo 31 caratteri, senza []:*?/\ e unico. */
export function nomeFoglio(nome: string, usati: Set<string>): string {
  const base = (nome.replace(/[[\]:*?/\\]/g, " ").trim() || "Foglio").slice(0, 31);
  let n = base;
  for (let i = 2; usati.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  usati.add(n.toLowerCase());
  return n;
}

function sheetXml(f: Foglio): string {
  const ultimaCol = colonnaLettere(Math.max(0, f.colonne.length - 1));
  const righe: string[] = [];
  const intest = f.colonne.map((c, i) => `<c r="${colonnaLettere(i)}1" t="inlineStr" s="1"><is><t>${xml(c.titolo)}</t></is></c>`).join("");
  righe.push(`<row r="1">${intest}</row>`);
  f.righe.forEach((r, ri) => {
    const n = ri + 2;
    const celle = f.colonne
      .map((c, ci) => {
        const v = r[ci];
        const ref = `${colonnaLettere(ci)}${n}`;
        if (v === null || v === undefined || v === "") return "";
        if (c.tipo === "data" && typeof v === "string") {
          const s = serialeData(v);
          if (s !== null) return `<c r="${ref}" s="2"><v>${s}</v></c>`;
        }
        if (c.tipo === "numero" && typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
      })
      .join("");
    righe.push(`<row r="${n}">${celle}</row>`);
  });
  const cols = f.colonne.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.larghezza}" customWidth="1"/>`).join("");
  const ultimaRiga = Math.max(1, f.righe.length + 1);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${righe.join("")}</sheetData>` +
    `<autoFilter ref="A1:${ultimaCol}${ultimaRiga}"/>` +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF3EBDD"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ───────────── ZIP (metodo «store») ─────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: readonly { name: string; data: Uint8Array }[], at: Date): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const dosTime = ((at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2)) & 0xffff;
  const dosDate = (((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()) & 0xffff;
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomi in UTF-8
    local.setUint16(8, 0, true); // store
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true);
    cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cenSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((s, p) => s + p.length, 0);
  const outBuf = new Uint8Array(total);
  let p = 0;
  for (const a of all) {
    outBuf.set(a, p);
    p += a.length;
  }
  return outBuf;
}

/** Cartella di lavoro .xlsx con uno o più fogli. */
export function creaXlsx(fogli: readonly Foglio[], at: Date = new Date()): Uint8Array<ArrayBuffer> {
  if (!fogli.length) throw new Error("serve almeno un foglio");
  const enc = new TextEncoder();
  const usati = new Set<string>();
  const nomi = fogli.map((f) => nomeFoglio(f.nome, usati));
  const sheets = fogli.map((f, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(f)) }));
  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    fogli.map((_f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const wb =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${nomi.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    `<definedNames>${nomi
      .map((n, i) => {
        const f = fogli[i];
        const ref = `'${n.replace(/'/g, "''")}'!$A$1:$${colonnaLettere(Math.max(0, f.colonne.length - 1))}$${Math.max(1, f.righe.length + 1)}`;
        return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(ref)}</definedName>`;
      })
      .join("")}</definedNames>` +
    `</workbook>`;
  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    fogli.map((_f, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
  return zip(
    [
      { name: "[Content_Types].xml", data: enc.encode(ct) },
      { name: "_rels/.rels", data: enc.encode(rels) },
      { name: "xl/workbook.xml", data: enc.encode(wb) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
      { name: "xl/styles.xml", data: enc.encode(STYLES) },
      ...sheets,
    ],
    at,
  );
}
