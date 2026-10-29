// Importazione di un pacchetto clienti da Slope (Excel o CSV, un file per casa): dalle righe ai soggiorni dello storico.
// Le colonne si riconoscono dal nome (italiano, inglese o tedesco), in qualunque ordine. Funziona in Node e nel browser.

import { CASE, addDays, addMonths, capitalizza, consensoUnito, emailEsclusa, normalizzaEmail } from "./model";
import type { Consenso, Contatto, Esclusi, Soggiorno } from "./types";

export type Campo = "email" | "nome" | "cognome" | "nominativo" | "lingua" | "nazione" | "arrivo" | "partenza" | "casa" | "nascita" | "soggiorni" | "consenso";

const SINONIMI: Record<Campo, readonly string[]> = {
  email: ["email", "e-mail", "e mail", "mail", "indirizzo email", "email principale", "primary email", "e-mail-adresse"],
  nome: ["nome", "first name", "firstname", "vorname", "nome ospite"],
  cognome: ["cognome", "last name", "lastname", "surname", "nachname", "cognome ospite"],
  nominativo: ["nominativo", "cliente", "ospite", "intestatario", "nome completo", "full name", "guest", "name"],
  lingua: ["lingua", "language", "sprache", "lingua ospite"],
  nazione: ["cittadinanza", "nazionalita", "nazione", "paese", "country", "citizenship", "nationality", "staatsangehorigkeit", "land"],
  arrivo: [
    "arrivo",
    "data arrivo",
    "check-in",
    "check in",
    "checkin",
    "dal",
    "arrival",
    "anreise",
    "inizio soggiorno",
    "ultimo soggiorno",
    "data ultimo soggiorno",
    "ultimo arrivo",
    "ultima visita",
    "last stay",
    "last arrival",
    "letzter aufenthalt",
  ],
  partenza: ["partenza", "data partenza", "check-out", "check out", "checkout", "al", "departure", "abreise", "fine soggiorno"],
  casa: ["struttura", "hotel", "casa", "property", "proprieta", "esercizio"],
  nascita: ["data di nascita", "nascita", "birth date", "birthdate", "data nascita", "geburtsdatum"],
  consenso: [
    "aut e-mail marketing",
    "aut email marketing",
    "autorizzazione e-mail marketing",
    "autorizzazione email marketing",
    "consenso marketing",
    "consenso newsletter",
    "newsletter",
    "marketing",
    "email marketing",
    "e-mail marketing",
    "marketing consent",
    "newsletter consent",
  ],
  soggiorni: ["soggiorni", "numero soggiorni", "n soggiorni", "n soggiorno", "visite", "numero visite", "stays", "number of stays", "aufenthalte", "anzahl aufenthalte"],
};

const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_.:°]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Trova la riga d'intestazione (entro le prime 10) e la posizione di ogni campo riconosciuto.
 * «soggiorni»: c'è una data di arrivo. «anagrafica»: email e nome ma nessuna data (esportazione clienti «patrons» di Slope).
 */
export function mappaColonne(
  righe: readonly (readonly string[])[],
): { riga: number; colonne: Partial<Record<Campo, number>>; tipo: "soggiorni" | "anagrafica" } | null {
  let anagrafica: { riga: number; colonne: Partial<Record<Campo, number>>; tipo: "anagrafica" } | null = null;
  for (let r = 0; r < Math.min(10, righe.length); r++) {
    const intest = righe[r].map(norm);
    const colonne: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(SINONIMI) as Campo[]) {
      const i = intest.findIndex((h) => SINONIMI[campo].some((s) => h === norm(s)));
      if (i >= 0) colonne[campo] = i;
    }
    if (colonne.email !== undefined && colonne.arrivo !== undefined) return { riga: r, colonne, tipo: "soggiorni" };
    if (!anagrafica && colonne.email !== undefined && (colonne.nome !== undefined || colonne.cognome !== undefined || colonne.nominativo !== undefined))
      anagrafica = { riga: r, colonne, tipo: "anagrafica" };
  }
  return anagrafica;
}

/** «sì», «si», «yes», «ja», «x», «1», «vero» → sì; «no», «nein», «0», «falso» → no; altro → non indicato. */
export function consensoDa(v: string): Consenso | null {
  const s = norm(v);
  if (!s) return null;
  if (["si", "yes", "y", "ja", "x", "1", "true", "vero", "s"].includes(s)) return "si";
  if (["no", "n", "nein", "0", "false", "falso"].includes(s)) return "no";
  return null;
}

/** Data da Excel (numero di serie), gg/mm/aaaa, gg.mm.aaaa, aaaa-mm-gg. */
export function dataDa(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Tabelle nome → codice ISO con i nomi in italiano, inglese e tedesco (Intl); vince il primo codice canonico. */
function dizionario(type: "region" | "language", codici: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const loc of ["it", "en", "de"]) {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([loc], { type });
    } catch {
      continue;
    }
    for (const c of codici) {
      try {
        const n = dn.of(c);
        if (n && n !== c && !m.has(norm(n))) m.set(norm(n), c);
      } catch {
        /* codice non riconosciuto */
      }
    }
  }
  return m;
}
const REGIONI = (() => {
  const out: string[] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) out.push(String.fromCharCode(a, b));
  return out;
})();
let paesi: Map<string, string> | null = null;
let lingue: Map<string, string> | null = null;

export function nazioneDa(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  paesi ??= dizionario("region", REGIONI);
  return paesi.get(norm(s)) ?? null;
}

export function linguaDa(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}([-_][A-Za-z]{2})?$/.test(s)) return s.slice(0, 2).toLowerCase();
  lingue ??= dizionario("language", ["it", "de", "en", "fr", "es", "nl", "pt", "pl", "cs", "ru", "zh", "ko", "ar", "he", "ja", "hu", "sv", "da", "no", "fi", "ro", "sk", "sl", "hr", "el", "tr", "uk"]);
  return lingue.get(norm(s)) ?? null;
}

export function casaIdDa(v: string): string | null {
  const s = norm(v);
  return CASE.find((c) => s.includes(c.key))?.id ?? null;
}

async function sha16(testo: string): Promise<string> {
  const h = await (globalThis as { crypto: Crypto }).crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface EsitoImport {
  /** «anagrafica» = file clienti senza date (diventano contatti, uno per indirizzo). */
  readonly tipo: "soggiorni" | "anagrafica";
  readonly soggiorni: Soggiorno[];
  readonly contatti: Contatto[];
  /** Righe con lo stesso indirizzo di un'altra riga del file (unite). */
  readonly doppioni: number;
  readonly righe: number;
  readonly esclusi: Esclusi;
  /** Righe senza data leggibile o senza casa riconoscibile. */
  readonly illeggibili: number;
  /** Righe già presenti nello storico per lo stesso ospite, casa e periodo (da La Scatola). */
  readonly giaPresenti: number;
  /** Righe con ultimo soggiorno oltre il periodo di conservazione (24 mesi). */
  readonly troppoVecchie: number;
  readonly colonne: Partial<Record<Campo, number>>;
}

/**
 * Righe di un'esportazione → soggiorni importati.
 * `casaPredefinita` (property_id) vale per le righe senza colonna struttura: è il caso dei tre file distinti per casa.
 * `esistenti`: lo storico attuale; una riga che corrisponde a un soggiorno già letto da La Scatola (stesso ospite,
 * stessa casa, date che si toccano) non si importa, perché La Scatola ha già il dato più completo.
 */
export async function importaRighe(
  righe: readonly (readonly string[])[],
  oggi: string,
  esistenti: readonly Soggiorno[],
  casaPredefinita: string | null,
): Promise<EsitoImport> {
  const mappa = mappaColonne(righe);
  if (!mappa)
    throw new Error("intestazione non riconosciuta: servono almeno una colonna «Email» e una con la data («Arrivo» o «Ultimo soggiorno») oppure con il nome (anagrafica clienti)");
  if (mappa.tipo === "anagrafica") return importaAnagrafica(righe, mappa.riga, mappa.colonne, oggi, casaPredefinita);
  const c = mappa.colonne;
  const cella = (r: readonly string[], k: Campo): string => (c[k] !== undefined ? (r[c[k]!] ?? "") : "");
  const esclusi = { portale: 0, nonValida: 0, interna: 0, minori: 0, cancellati: 0 };
  let illeggibili = 0;
  let giaPresenti = 0;
  let troppoVecchie = 0;
  const daScatola = new Map<string, Soggiorno[]>();
  for (const s of esistenti)
    if (s.origine !== "import") {
      const k = `${s.email}|${s.pid}`;
      const l = daScatola.get(k);
      if (l) l.push(s);
      else daScatola.set(k, [s]);
    }
  const out = new Map<string, Soggiorno>();
  const limite = addMonths(oggi, -24);
  const dati = righe.slice(mappa.riga + 1).filter((r) => r.some((x) => x !== ""));
  for (const r of dati) {
    const grezza = cella(r, "email");
    if (!grezza) {
      esclusi.nonValida++;
      continue;
    }
    const email = normalizzaEmail(grezza);
    const motivo = emailEsclusa(email);
    if (motivo) {
      esclusi[motivo]++;
      continue;
    }
    const dal = dataDa(cella(r, "arrivo"));
    const pid = (c.casa !== undefined ? casaIdDa(cella(r, "casa")) : null) ?? casaPredefinita;
    if (!dal || !pid) {
      illeggibili++;
      continue;
    }
    const alLetto = dataDa(cella(r, "partenza"));
    const al = alLetto && alLetto >= dal ? alLetto : dal;
    if (al < limite) {
      troppoVecchie++;
      continue;
    }
    const nascita = dataDa(cella(r, "nascita"));
    const maggiorenneDal = nascita ? addMonths(nascita, 18 * 12) : null;
    if (maggiorenneDal && maggiorenneDal > oggi) {
      esclusi.minori++;
      continue;
    }
    if ((daScatola.get(`${email}|${pid}`) ?? []).some((s) => s.dal <= addDays(al, 1) && s.al >= addDays(dal, -1))) {
      giaPresenti++;
      continue;
    }
    let nome = capitalizza(cella(r, "nome"));
    const cognome = capitalizza(cella(r, "cognome"));
    if (!nome && !cognome) nome = capitalizza(cella(r, "nominativo"));
    const n = Number.parseInt(cella(r, "soggiorni"), 10);
    const gsid = `imp-${await sha16(`${email}|${pid}|${dal}`)}`;
    out.set(gsid, {
      gsid,
      rid: null,
      pid,
      nome,
      cognome,
      email,
      linguaSlope: linguaDa(cella(r, "lingua")),
      nazione: nazioneDa(cella(r, "nazione")),
      dal,
      al,
      privacyDal: null,
      prenotataIl: null,
      canale: null,
      maggiorenneDal,
      vistoIl: oggi,
      origine: "import",
      ...(Number.isFinite(n) && n > 1 ? { soggiorniDichiarati: Math.min(n, 999) } : {}),
    });
  }
  return { tipo: "soggiorni", soggiorni: [...out.values()], contatti: [], doppioni: 0, righe: dati.length, esclusi, illeggibili, giaPresenti, troppoVecchie, colonne: c };
}

/**
 * Anagrafica clienti senza date (esportazione «patrons» di Slope): un contatto per indirizzo e casa.
 * Si tengono solo nome, cognome, email, lingua, nazione e consenso; la data di nascita serve solo a scartare i minori
 * e non si conserva. Telefono, documento, codice fiscale e residenza si ignorano.
 */
async function importaAnagrafica(
  righe: readonly (readonly string[])[],
  riga: number,
  c: Partial<Record<Campo, number>>,
  oggi: string,
  casaPredefinita: string | null,
): Promise<EsitoImport> {
  const cella = (r: readonly string[], k: Campo): string => (c[k] !== undefined ? (r[c[k]!] ?? "") : "");
  const esclusi = { portale: 0, nonValida: 0, interna: 0, minori: 0, cancellati: 0 };
  let illeggibili = 0;
  let doppioni = 0;
  const perId = new Map<string, { base: Contatto; consensi: (Consenso | null)[] }>();
  const dati = righe.slice(riga + 1).filter((r) => r.some((x) => x !== ""));
  for (const r of dati) {
    const grezza = cella(r, "email");
    if (!grezza) {
      esclusi.nonValida++;
      continue;
    }
    const email = normalizzaEmail(grezza);
    const motivo = emailEsclusa(email);
    if (motivo) {
      esclusi[motivo]++;
      continue;
    }
    const pid = (c.casa !== undefined ? casaIdDa(cella(r, "casa")) : null) ?? casaPredefinita;
    if (!pid) {
      illeggibili++;
      continue;
    }
    const nascita = dataDa(cella(r, "nascita"));
    const maggiorenneDal = nascita ? addMonths(nascita, 18 * 12) : null;
    if (maggiorenneDal && maggiorenneDal > oggi) {
      esclusi.minori++;
      continue;
    }
    const consenso = c.consenso !== undefined ? consensoDa(cella(r, "consenso")) : null;
    const id = `ana-${await sha16(`${email}|${pid}`)}`;
    const gia = perId.get(id);
    if (gia) {
      doppioni++;
      gia.consensi.push(consenso);
      continue;
    }
    let nome = capitalizza(cella(r, "nome"));
    const cognome = capitalizza(cella(r, "cognome"));
    if (!nome && !cognome) nome = capitalizza(cella(r, "nominativo"));
    perId.set(id, {
      base: { id, pid, email, nome, cognome, linguaSlope: linguaDa(cella(r, "lingua")), nazione: nazioneDa(cella(r, "nazione")), consenso, maggiorenneDal, importatoIl: oggi },
      consensi: [consenso],
    });
  }
  // Lo stesso indirizzo su più righe: «sì» solo se nessuna riga dice «no».
  const contatti = [...perId.values()].map((x) => ({ ...x.base, consenso: consensoUnito(x.consensi) }));
  return { tipo: "anagrafica", soggiorni: [], contatti, doppioni, righe: dati.length, esclusi, illeggibili, giaPresenti: 0, troppoVecchie: 0, colonne: c };
}

/** Un file del pacchetto clienti, già letto, con la casa a cui appartiene (null = colonna «Struttura» nel file). */
export interface FileImport {
  readonly nome: string;
  readonly casa: string | null;
  readonly righe: readonly (readonly string[])[];
}

/** Importa più file (tipicamente tre: Hartmann, Acadia, Saslong) e riassume l'esito per file. */
export async function importaPacchetto(
  file: readonly FileImport[],
  oggi: string,
  esistenti: readonly Soggiorno[],
): Promise<{ soggiorni: Soggiorno[]; contatti: Contatto[]; esiti: { nome: string; esito: EsitoImport }[] }> {
  const soggiorni: Soggiorno[] = [];
  const contatti: Contatto[] = [];
  const esiti: { nome: string; esito: EsitoImport }[] = [];
  for (const f of file) {
    const esito = await importaRighe(f.righe, oggi, esistenti, f.casa);
    if (esito.colonne.casa === undefined && !f.casa) throw new Error(`${f.nome}: manca la colonna «Struttura» e non è indicata la casa`);
    soggiorni.push(...esito.soggiorni);
    contatti.push(...esito.contatti);
    esiti.push({ nome: f.nome, esito });
  }
  return { soggiorni, contatti, esiti };
}

export function riassuntoEsito(nome: string, e: EsitoImport): string {
  const x = e.esclusi;
  if (e.tipo === "anagrafica") {
    const si = e.contatti.filter((k) => k.consenso === "si").length;
    const no = e.contatti.filter((k) => k.consenso === "no").length;
    return (
      `${nome} (anagrafica clienti, senza date): ${e.righe} righe → ${e.contatti.length} indirizzi` +
      (e.colonne.consenso !== undefined ? ` (consenso marketing sì ${si}, no ${no})` : " (colonna del consenso assente)") +
      ` · scartate ${x.portale} email dei portali (booking, expedia…), ${x.nonValida} senza email valida, ${x.interna} interne, ${x.minori} minori` +
      ` · ${e.doppioni} righe con un indirizzo già presente nel file, unite`
    );
  }
  return (
    `${nome}: ${e.righe} righe → ${e.soggiorni.length} importate` +
    ` · scartate ${x.portale} email dei portali, ${x.nonValida} senza email valida, ${x.interna} interne, ${x.minori} minori,` +
    ` ${e.illeggibili} senza data o casa, ${e.troppoVecchie} oltre 24 mesi · ${e.giaPresenti} già presenti da La Scatola`
  );
}
