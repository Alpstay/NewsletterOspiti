// Filtri e ordinamento a priorità degli ospiti. Funzioni pure, testate in test/app.test.ts.

import type { Canale, CasaKey, Ospite } from "../shared/types";

export type Abituali = "tutti" | "si" | "no";
export type CanaleFiltro = Canale | "ignoto";

export interface Filtri {
  readonly case: ReadonlySet<CasaKey>;
  readonly lingue: ReadonlySet<string>;
  readonly nazioni: ReadonlySet<string>;
  /** Periodo: l'ospite deve avere almeno un soggiorno che lo tocca. null = senza limite. */
  readonly da: string | null;
  readonly a: string | null;
  readonly abituali: Abituali;
  readonly canali: ReadonlySet<CanaleFiltro>;
  /** Ricerca libera su nome, cognome ed email. */
  readonly testo: string;
}

export const filtriVuoti = (): Filtri => ({
  case: new Set(),
  lingue: new Set(),
  nazioni: new Set(),
  da: null,
  a: null,
  abituali: "tutti",
  canali: new Set(),
  testo: "",
});

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Casa e periodo valgono sullo stesso soggiorno: «Saslong in inverno» non pesca chi era al Saslong d'estate. */
export function filtra(ospiti: readonly Ospite[], f: Filtri): Ospite[] {
  const q = fold(f.testo.trim());
  return ospiti.filter((o) => {
    if (f.lingue.size && !f.lingue.has(o.lingua)) return false;
    if (f.nazioni.size && !f.nazioni.has(o.nazione ?? "")) return false;
    if (f.abituali === "si" && !o.abituale) return false;
    if (f.abituali === "no" && o.abituale) return false;
    if (f.canali.size && !f.canali.has(o.canale ?? "ignoto")) return false;
    if (f.case.size || f.da || f.a) {
      const hit = o.soggiorni.some(
        (s) => (!f.case.size || (s.casa !== null && f.case.has(s.casa))) && (!f.da || s.al >= f.da) && (!f.a || s.dal <= f.a),
      );
      if (!hit) return false;
    }
    if (q && !fold(`${o.nome} ${o.cognome} ${o.email}`).includes(q)) return false;
    return true;
  });
}

export type Criterio = "lingua" | "nazione" | "data" | "abituale";
export interface Ordine {
  readonly criterio: Criterio;
  /** 1 = crescente / abituali prima / data più vecchia prima; -1 = il contrario. */
  readonly verso: 1 | -1;
}

/** Priorità chiesta: lingua, nazione, data del soggiorno (più recente prima), abituali. */
export const ORDINE_PREDEFINITO: readonly Ordine[] = [
  { criterio: "lingua", verso: 1 },
  { criterio: "nazione", verso: 1 },
  { criterio: "data", verso: -1 },
  { criterio: "abituale", verso: 1 },
];

export interface Nomi {
  lingua(code: string): string;
  nazione(code: string | null): string;
}

/** Data di riferimento per l'ordinamento: il soggiorno più recente, compreso un arrivo futuro. */
export const dataRiferimento = (o: Ospite): string => o.soggiorni.reduce((m, s) => (s.dal > m ? s.dal : m), o.primo);

export function ordina(ospiti: readonly Ospite[], ordini: readonly Ordine[], nomi: Nomi): Ospite[] {
  const cmp = (a: Ospite, b: Ospite, o: Ordine): number => {
    switch (o.criterio) {
      case "lingua":
        return o.verso * nomi.lingua(a.lingua).localeCompare(nomi.lingua(b.lingua), "it");
      case "nazione": {
        // Senza nazione in fondo, in qualunque verso.
        if (!a.nazione !== !b.nazione) return a.nazione ? -1 : 1;
        return o.verso * nomi.nazione(a.nazione).localeCompare(nomi.nazione(b.nazione), "it");
      }
      case "data":
        return o.verso * dataRiferimento(a).localeCompare(dataRiferimento(b));
      case "abituale":
        return o.verso * (Number(b.abituale) - Number(a.abituale));
    }
  };
  return [...ospiti].sort((a, b) => {
    for (const o of ordini) {
      const c = cmp(a, b, o);
      if (c) return c;
    }
    return a.cognome.localeCompare(b.cognome, "it") || a.email.localeCompare(b.email);
  });
}

/** Conteggi per costruire le liste di scelta (lingua, nazione) con il numero accanto. */
export function conteggi(ospiti: readonly Ospite[], chiave: (o: Ospite) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const o of ospiti) m.set(chiave(o), (m.get(chiave(o)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export interface Preset {
  readonly id: string;
  readonly etichetta: string;
  readonly da: string | null;
  readonly a: string | null;
}

/** Periodi pronti: un clic invece di due date. Stagioni AlpStay: inverno 1 dic–31 mar, estate 15 mag–31 ott. */
export function presetPeriodo(oggi: string): Preset[] {
  const y = Number(oggi.slice(0, 4));
  const md = oggi.slice(5);
  // Inverno in corso o appena finito: se siamo prima del 1 dicembre, è quello iniziato l'anno scorso.
  const invY = md >= "12-01" ? y : y - 1;
  const estY = md >= "05-15" ? y : y - 1;
  const meno12 = `${y - 1}${oggi.slice(4)}`;
  return [
    { id: "tutti", etichetta: "Tutto lo storico", da: null, a: null },
    { id: "12m", etichetta: "Ultimi 12 mesi", da: meno12, a: oggi },
    { id: "inverno", etichetta: `Inverno ${invY}/${String(invY + 1).slice(2)}`, da: `${invY}-12-01`, a: `${invY + 1}-03-31` },
    { id: "estate", etichetta: `Estate ${estY}`, da: `${estY}-05-15`, a: `${estY}-10-31` },
    { id: "arrivo", etichetta: "In arrivo", da: oggi, a: null },
  ];
}
