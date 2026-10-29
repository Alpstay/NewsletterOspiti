// Importazione dello storico da un'esportazione di Slope (Excel o CSV): dalle righe ai soggiorni dello storico.
// Le colonne si riconoscono dal nome (italiano, inglese o tedesco), in qualunque ordine.

import { CASE, addMonths, capitalizza, emailEsclusa, normalizzaEmail } from "./model";
import type { Esclusi, Soggiorno } from "./types";

export type Campo = "email" | "nome" | "cognome" | "nominativo" | "lingua" | "nazione" | "arrivo" | "partenza" | "casa" | "nascita";

const SINONIMI: Record<Campo, readonly string[]> = {
  email: ["email", "e-mail", "e mail", "mail", "indirizzo email", "email principale", "primary email", "e-mail-adresse"],
  nome: ["nome", "first name", "firstname", "vorname", "nome ospite"],
  cognome: ["cognome", "last name", "lastname", "surname", "nachname", "cognome ospite"],
  nominativo: ["nominativo", "cliente", "ospite", "intestatario", "nome completo", "full name", "guest", "name"],
  lingua: ["lingua", "language", "sprache", "lingua ospite"],
  nazione: ["cittadinanza", "nazionalita", "nazionalità", "nazione", "paese", "country", "citizenship", "nationality", "staatsangehorigkeit", "land"],
  arrivo: ["arrivo", "data arrivo", "check-in", "check in", "checkin", "dal", "arrival", "anreise", "inizio soggiorno"],
  partenza: ["partenza", "data partenza", "check-out", "check out", "checkout", "al", "departure", "abreise", "fine soggiorno"],
  casa: ["struttura", "hotel", "casa", "property", "proprieta", "proprietà", "esercizio"],
  nascita: ["data di nascita", "nascita", "birth date", "birthdate", "data nascita", "geburtsdatum"],
};

const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Trova la riga d'intestazione (entro le prime 10) e la posizione di ogni campo riconosciuto. */
export function mappaColonne(righe: readonly (readonly string[])[]): { riga: number; colonne: Partial<Record<Campo, number>> } | null {
  for (let r = 0; r < Math.min(10, righe.length); r++) {
    const intest = righe[r].map(norm);
    const colonne: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(SINONIMI) as Campo[]) {
      const i = intest.findIndex((h) => SINONIMI[campo].some((s) => h === norm(s)));
      if (i >= 0) colonne[campo] = i;
    }
    if (colonne.email !== undefined && colonne.arrivo !== undefined) return { riga: r, colonne };
  }
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

/** Tabelle nome → codice ISO costruite con i nomi in italiano, inglese e tedesco (Intl). */
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
  readonly soggiorni: Soggiorno[];
  readonly esclusi: Esclusi;
  /** Righe senza data di arrivo leggibile o senza casa riconoscibile. */
  readonly illeggibili: number;
  /** Righe dal giorno in cui La Scatola copre già i dati: le aggiorna la lettura notturna. */
  readonly giaInScatola: number;
  readonly colonne: Partial<Record<Campo, number>>;
}

/**
 * Righe di un'esportazione → soggiorni importati.
 * `casaPredefinita` (property_id) vale per le righe senza colonna struttura (esportazione di una sola casa).
 * `finoAl`: si importa solo prima di questo giorno (da lì in poi i dati arrivano da La Scatola).
 */
export async function importaRighe(righe: readonly (readonly string[])[], oggi: string, finoAl: string | null, casaPredefinita: string | null): Promise<EsitoImport> {
  const mappa = mappaColonne(righe);
  if (!mappa) throw new Error("intestazione non riconosciuta: servono almeno una colonna email e una colonna arrivo (es. «Email», «Arrivo»)");
  const c = mappa.colonne;
  const cella = (r: readonly string[], k: Campo): string => (c[k] !== undefined ? (r[c[k]!] ?? "") : "");
  const esclusi = { portale: 0, nonValida: 0, interna: 0, minori: 0, cancellati: 0 };
  let illeggibili = 0;
  let giaInScatola = 0;
  const out = new Map<string, Soggiorno>();
  const limite = addMonths(oggi, -24);
  for (const r of righe.slice(mappa.riga + 1)) {
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
    const al = dataDa(cella(r, "partenza")) ?? dal;
    if (al < limite) continue; // oltre il periodo di conservazione: non si importa nemmeno
    if (finoAl && dal >= finoAl) {
      giaInScatola++;
      continue;
    }
    const nascita = dataDa(cella(r, "nascita"));
    const maggiorenneDal = nascita ? addMonths(nascita, 18 * 12) : null;
    if (maggiorenneDal && maggiorenneDal > oggi) {
      esclusi.minori++;
      continue;
    }
    let nome = capitalizza(cella(r, "nome"));
    const cognome = capitalizza(cella(r, "cognome"));
    if (!nome && !cognome) nome = capitalizza(cella(r, "nominativo"));
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
      al: al >= dal ? al : dal,
      privacyDal: null,
      prenotataIl: null,
      canale: null,
      maggiorenneDal,
      vistoIl: oggi,
      origine: "import",
    });
  }
  return { soggiorni: [...out.values()], esclusi, illeggibili, giaInScatola, colonne: c };
}
