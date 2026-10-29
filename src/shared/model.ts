// Regole di dominio: dalle righe di La Scatola allo storico, e dallo storico agli ospiti unici.
// Funzioni pure, usate sia dal programma di aggiornamento sia dalla pagina.

import type { Canale, Casa, CasaKey, Envelope, Esclusi, Ospite, Soggiorno } from "./types";

export const APP = "newsletter-ospiti" as const;
export const FILE = "ospiti.json";
/** Conservazione dello storico: 24 mesi dall'ultimo soggiorno (prassi del Garante per i dati di marketing). */
export const CONSERVAZIONE_MESI = 24;
/** Informativa accettata almeno così tanti giorni prima della prenotazione = cliente già noto. */
export const MARGINE_CLIENTE_NOTO = 14;

export const CASE: readonly Casa[] = [
  { id: "11111111-1111-4111-8111-111111111111", key: "acadia", nome: "Hotel Acadia" },
  { id: "22222222-2222-4222-8222-222222222222", key: "hartmann", nome: "Chalet Hartmann" },
  { id: "33333333-3333-4333-8333-333333333333", key: "saslong", nome: "Smart Hotel Saslong" },
];
export const casaDa = (pid: string): CasaKey | null => CASE.find((c) => c.id === pid)?.key ?? null;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const day = (v: unknown): string | null => {
  const s = str(v);
  return s && ISO_DAY.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
};

// ───────────── date ─────────────

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Aggiunge mesi; il giorno che non esiste (31 → febbraio) scivola al mese dopo come fa Date. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

export function romeDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

// ───────────── email ─────────────

/** Domini con cui i portali mascherano l'ospite: non arrivano a una persona, si scartano. */
const PORTALI: readonly RegExp[] = [
  /(^|\.)booking\.com$/,
  /(^|\.)expediapartnercentral\.com$/,
  /(^|\.)airbnb\.com$/,
  /(^|\.)agoda-messaging\.com$/,
  /(^|\.)hostelworld\.com$/,
  /(^|\.)hotelbeds\.com$/,
];
/** Domini AlpStay: indirizzi interni (prenotazioni di prova o di servizio). */
const INTERNI: readonly RegExp[] = [/(^|\.)alpstay\.(eu|ai|it|com)$/, /(^|\.)saslong\.ai$/];
const SEGNAPOSTO = /^(no-?e?-?mail|nomail|none|test|keine|nessuna|na|n\.a\.|x+|0+|-+)$/;
const EMAIL = /^[^\s@<>()[\],;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

export const normalizzaEmail = (raw: string): string => raw.trim().replace(/^mailto:/i, "").toLowerCase();

export type MotivoEmail = "portale" | "nonValida" | "interna";

export function emailEsclusa(email: string): MotivoEmail | null {
  if (!EMAIL.test(email)) return "nonValida";
  const [local, domain] = email.split("@");
  if (SEGNAPOSTO.test(local)) return "nonValida";
  if (PORTALI.some((r) => r.test(domain))) return "portale";
  if (INTERNI.some((r) => r.test(domain))) return "interna";
  return null;
}

// ───────────── nomi, lingua, canale ─────────────

/** Nomi scritti TUTTO MAIUSCOLO o tutto minuscolo diventano «Nome Cognome»; quelli misti restano come sono. */
export function capitalizza(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Lingue che la regola riconosce (stesse dell'app colazioni). */
export const LINGUE = ["it", "de", "en", "fr", "es", "nl", "pt", "pl", "cs", "ru", "zh", "ko", "ar", "he"] as const;
const COUNTRY: Record<string, string> = {};
for (const [lang, codes] of Object.entries({
  it: "IT SM VA",
  de: "DE AT LI CH",
  fr: "FR MC",
  nl: "NL",
  es: "ES MX AR CO CL PE UY VE EC BO PY CR PA DO GT HN SV NI CU",
  pt: "PT BR",
  pl: "PL",
  cs: "CZ",
  ru: "RU BY KZ",
  zh: "CN TW HK MO",
  ko: "KR",
  he: "IL",
  ar: "SA AE EG QA KW BH OM JO LB MA DZ TN IQ SY LY YE",
}))
  for (const c of codes.split(" ")) COUNTRY[c] = lang;

/**
 * Lingua della newsletter. In Slope «it» è il valore predefinito e da solo non dice nulla:
 * vale la lingua di Slope se diversa da «it»; altrimenti decide la cittadinanza (paesi plurilingue o
 * non previsti → inglese); senza cittadinanza resta «it».
 */
export function linguaNewsletter(linguaSlope: string | null, nazione: string | null): { lingua: string; dedotta: boolean } {
  const g = (linguaSlope ?? "").toLowerCase();
  if (g && g !== "it") return { lingua: g, dedotta: false };
  if (nazione) {
    const l = COUNTRY[nazione.toUpperCase()] ?? "en";
    return { lingua: l, dedotta: !(g === "it" && l === "it") };
  }
  return { lingua: g || "it", dedotta: !g };
}

export function canaleDa(bucket: unknown): Canale | null {
  switch (bucket) {
    case "direct":
      return "diretto";
    case "ota":
      return "portale";
    case "metasearch":
      return "google";
    case "unclassified":
      return "altro";
    default:
      return null;
  }
}

// ───────────── righe di La Scatola → soggiorni ─────────────

/** Stato di una prenotazione da curated_reservations (vista senza dati personali). */
export interface InfoPrenotazione {
  readonly annullata: boolean;
  readonly prenotataIl: string | null;
  readonly canale: Canale | null;
}

export function prenotazioniDa(rows: readonly Row[]): Map<string, InfoPrenotazione> {
  const map = new Map<string, InfoPrenotazione>();
  for (const r of rows) {
    if (!isUuid(r.reservation_id)) throw new Error(`reservation_id non valido in curated_reservations: ${String(r.reservation_id).slice(0, 40)}`);
    map.set(r.reservation_id, {
      annullata: r.is_canceled === true || r.booking_status === "CANCELLED" || r.booking_status === "OPTION" || r.is_option === true,
      prenotataIl: day(r.creation_date),
      canale: canaleDa(r.channel_bucket),
    });
  }
  return map;
}

export type Esito = { readonly ok: Soggiorno } | { readonly escluso: keyof Esclusi };

/** Una riga di curated_guest_stays (con email) → soggiorno dello storico, oppure il motivo per cui si scarta. */
export function soggiornoDa(r: Row, pren: ReadonlyMap<string, InfoPrenotazione>, oggi: string): Esito {
  for (const k of ["guest_stay_id", "reservation_id", "property_id"] as const)
    if (!isUuid(r[k])) throw new Error(`${k} non valido in curated_guest_stays: ${String(r[k]).slice(0, 40)}`);
  const rawEmail = str(r.primary_email);
  if (!rawEmail) return { escluso: "nonValida" };
  const email = normalizzaEmail(rawEmail);
  const motivo = emailEsclusa(email);
  if (motivo) return { escluso: motivo };
  const info = pren.get(r.reservation_id as string);
  if (info?.annullata) return { escluso: "cancellati" };
  const nascita = day(r.birth_date);
  const maggiorenneDal = nascita ? addMonths(nascita, 18 * 12) : null;
  if (maggiorenneDal && maggiorenneDal > oggi) return { escluso: "minori" };
  const dal = day(r.stay_start);
  const al = day(r.stay_end) ?? dal;
  if (!dal || !al) return { escluso: "nonValida" };
  const nazione = str(r.citizenship)?.toUpperCase() ?? null;
  return {
    ok: {
      gsid: r.guest_stay_id as string,
      rid: r.reservation_id as string,
      pid: r.property_id as string,
      nome: capitalizza(str(r.first_name) ?? ""),
      cognome: capitalizza(str(r.last_name) ?? ""),
      email,
      linguaSlope: str(r.language)?.toLowerCase() ?? null,
      nazione: nazione && /^[A-Z]{2}$/.test(nazione) ? nazione : null,
      dal,
      al,
      privacyDal: day(r.privacy_policy_acceptance_date),
      prenotataIl: info?.prenotataIl ?? null,
      canale: info?.canale ?? null,
      maggiorenneDal,
      vistoIl: oggi,
    },
  };
}

export const nessunEscluso = (): Esclusi => ({ portale: 0, nonValida: 0, interna: 0, minori: 0, cancellati: 0 });

// ───────────── storico ─────────────

export interface Unione {
  readonly soggiorni: Soggiorno[];
  readonly nuovi: number;
  readonly aggiornati: number;
  /** Soggiorni del periodo letto che La Scatola non ha più (cancellati, email tolta, …). */
  readonly spariti: number;
  /** Soggiorni oltre il periodo di conservazione. */
  readonly scaduti: number;
  /** Soggiorni dello storico che ricadevano nel periodo letto, prima dell'unione. */
  readonly precedentiInFinestra: number;
}

/** ID generato per un soggiorno importato: stabile (reimportare lo stesso file non crea doppioni) e mai confondibile con un ID di Slope. */
export const IMPORT_ID = /^imp-[0-9a-f]{16}$/;

/**
 * Unisce lo storico precedente con i soggiorni letti oggi.
 * - Nel periodo letto (`copre`) vale La Scatola: un soggiorno sparito si toglie.
 * - Fuori dal periodo letto vale lo storico, ed è proprio lo scopo dello storico.
 * - I soggiorni importati da un'esportazione non si tolgono mai per «sparizione».
 * - Oltre il periodo di conservazione un soggiorno si cancella comunque.
 */
export function unisci(
  prev: readonly Soggiorno[],
  oggiLetti: readonly Soggiorno[],
  copre: (s: Soggiorno) => boolean,
  oggi: string,
  mesi = CONSERVAZIONE_MESI,
): Unione {
  const fresh = new Map(oggiLetti.map((s) => [s.gsid, s]));
  const out = new Map<string, Soggiorno>();
  let spariti = 0;
  let precedentiInFinestra = 0;
  for (const s of prev) {
    if (s.origine !== "import" && copre(s)) {
      precedentiInFinestra++;
      if (!fresh.has(s.gsid)) {
        spariti++;
        continue;
      }
    }
    out.set(s.gsid, s);
  }
  let nuovi = 0;
  let aggiornati = 0;
  for (const s of fresh.values()) {
    if (out.has(s.gsid)) aggiornati++;
    else nuovi++;
    out.set(s.gsid, s);
  }
  const limite = addMonths(oggi, -mesi);
  let scaduti = 0;
  for (const [k, s] of out) {
    if (s.al < limite) {
      out.delete(k);
      scaduti++;
    }
  }
  const soggiorni = [...out.values()].sort((a, b) => a.dal.localeCompare(b.dal) || a.gsid.localeCompare(b.gsid));
  return { soggiorni, nuovi, aggiornati, spariti, scaduti, precedentiInFinestra };
}

// ───────────── storico → ospiti unici ─────────────

const meseAnno = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Soggiorni attaccati o sovrapposti (anche in case diverse) contano come un solo viaggio. */
export function contaViaggi(sogg: readonly { dal: string; al: string }[]): number {
  const s = [...sogg].sort((a, b) => a.dal.localeCompare(b.dal));
  let n = 0;
  let fine = "";
  for (const x of s) {
    if (!n || x.dal > addDays(fine, 1)) {
      n++;
      fine = x.al;
    } else if (x.al > fine) fine = x.al;
  }
  return n;
}

export function ospitiDa(soggiorni: readonly Soggiorno[], oggi: string): Ospite[] {
  const perEmail = new Map<string, Soggiorno[]>();
  for (const s of soggiorni) {
    if (s.maggiorenneDal && s.maggiorenneDal > oggi) continue;
    const l = perEmail.get(s.email);
    if (l) l.push(s);
    else perEmail.set(s.email, [s]);
  }
  const out: Ospite[] = [];
  for (const [email, list] of perEmail) {
    list.sort((a, b) => a.dal.localeCompare(b.dal) || a.gsid.localeCompare(b.gsid));
    const recente = list[list.length - 1];
    const nome = [...list].reverse().find((s) => s.nome)?.nome ?? "";
    const cognome = [...list].reverse().find((s) => s.cognome)?.cognome ?? "";
    const nazione = [...list].reverse().find((s) => s.nazione)?.nazione ?? null;
    const linguaSlope = [...list].reverse().find((s) => s.linguaSlope && s.linguaSlope !== "it")?.linguaSlope ?? recente.linguaSlope;
    const { lingua, dedotta } = linguaNewsletter(linguaSlope, nazione);
    const caseSet = new Set(list.map((s) => casaDa(s.pid)).filter((k): k is CasaKey => k !== null));
    const passati = list.filter((s) => s.dal <= oggi);
    const futuri = list.filter((s) => s.dal > oggi);
    const viaggi = contaViaggi(list);
    const primo = list[0].dal;
    const privacy = list.map((s) => s.privacyDal).filter((d): d is string => !!d).sort()[0] ?? null;
    const prenotata = list.map((s) => s.prenotataIl).filter((d): d is string => !!d).sort()[0] ?? null;
    const clienteNoto = !!privacy && !!prenotata && privacy < addDays(prenotata, -MARGINE_CLIENTE_NOTO);
    const clienteDal = privacy && privacy < primo ? privacy : primo;
    const abituale = viaggi >= 2 || clienteNoto;
    out.push({
      email,
      nome,
      cognome,
      lingua,
      linguaDedotta: dedotta,
      nazione,
      case: CASE.map((c) => c.key).filter((k) => caseSet.has(k)),
      primo,
      ultimo: passati.length ? passati[passati.length - 1].dal : null,
      prossimo: futuri.length ? futuri[0].dal : null,
      viaggi,
      clienteDal,
      abituale,
      motivoAbituale: viaggi >= 2 ? `${viaggi} soggiorni` : clienteNoto ? `cliente dal ${meseAnno(privacy!)}` : null,
      canale: recente.canale,
      soggiorni: list.map((s) => ({ casa: casaDa(s.pid), dal: s.dal, al: s.al })),
    });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

// ───────────── controlli ─────────────

export function isEnvelope(v: unknown): v is Envelope {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  const enc = e.enc as Record<string, unknown> | undefined;
  return e.format === 1 && e.app === APP && typeof e.day === "string" && typeof e.generated_at === "string" && !!enc && typeof enc.ct === "string" && typeof enc.iter === "number";
}

/** Nessun dato personale fuori dal blocco cifrato: in chiaro non deve esserci nessuna «@». */
export function envelopeSenzaDatiInChiaro(e: Envelope): boolean {
  const { enc: _enc, ...chiaro } = e;
  return !JSON.stringify(chiaro).includes("@");
}
