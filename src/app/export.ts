// Dagli ospiti filtrati ai fogli Excel: colonne pronte per l'importazione in uno strumento newsletter.

import { CASE } from "../shared/model";
import type { Canale, Ospite } from "../shared/types";
import type { Nomi } from "./filters";
import type { Cella, Colonna, Foglio } from "./xlsx";

export const NOMI_CANALE: Record<Canale, string> = { diretto: "Diretto", portale: "Portale (OTA)", google: "Google", altro: "Altro" };

export const COLONNE: readonly Colonna[] = [
  { titolo: "Email", larghezza: 34, tipo: "testo" },
  { titolo: "Nome", larghezza: 16, tipo: "testo" },
  { titolo: "Cognome", larghezza: 20, tipo: "testo" },
  { titolo: "Lingua (codice)", larghezza: 9, tipo: "testo" },
  { titolo: "Lingua", larghezza: 14, tipo: "testo" },
  { titolo: "Lingua dedotta da nazione", larghezza: 12, tipo: "testo" },
  { titolo: "Nazione (codice)", larghezza: 9, tipo: "testo" },
  { titolo: "Nazione", larghezza: 18, tipo: "testo" },
  { titolo: "Case", larghezza: 28, tipo: "testo" },
  { titolo: "Primo arrivo", larghezza: 12, tipo: "data" },
  { titolo: "Ultimo arrivo", larghezza: 12, tipo: "data" },
  { titolo: "Prossimo arrivo", larghezza: 12, tipo: "data" },
  { titolo: "Soggiorni", larghezza: 9, tipo: "numero" },
  { titolo: "Abituale", larghezza: 9, tipo: "testo" },
  { titolo: "Perché abituale", larghezza: 18, tipo: "testo" },
  { titolo: "Cliente dal", larghezza: 12, tipo: "data" },
  { titolo: "Canale ultima prenotazione", larghezza: 16, tipo: "testo" },
  { titolo: "Consenso marketing", larghezza: 12, tipo: "testo" },
];

export const NOMI_CONSENSO = { si: "Sì", no: "No" } as const;

export function riga(o: Ospite, nomi: Nomi): Cella[] {
  return [
    o.email,
    o.nome,
    o.cognome,
    o.lingua,
    nomi.lingua(o.lingua),
    o.linguaDedotta ? "Sì" : "No",
    o.nazione,
    o.nazione ? nomi.nazione(o.nazione) : null,
    o.case.map((k) => CASE.find((c) => c.key === k)?.nome ?? k).join(", "),
    o.primo,
    o.ultimo,
    o.prossimo,
    o.soggiorni.length ? o.viaggi : null,
    o.abituale ? "Sì" : "No",
    o.motivoAbituale,
    o.clienteDal,
    o.canale ? NOMI_CANALE[o.canale] : null,
    o.consenso ? NOMI_CONSENSO[o.consenso] : "Non indicato",
  ];
}

/** Un solo foglio, oppure un foglio per lingua (utile per spedire edizioni diverse). */
export function fogli(ospiti: readonly Ospite[], perLingua: boolean, nomi: Nomi): Foglio[] {
  if (!perLingua) return [{ nome: "Ospiti", colonne: COLONNE, righe: ospiti.map((o) => riga(o, nomi)) }];
  const gruppi = new Map<string, Ospite[]>();
  for (const o of ospiti) {
    const l = gruppi.get(o.lingua);
    if (l) l.push(o);
    else gruppi.set(o.lingua, [o]);
  }
  return [...gruppi].map(([lingua, list]) => ({ nome: `${nomi.lingua(lingua)} (${lingua})`, colonne: COLONNE, righe: list.map((o) => riga(o, nomi)) }));
}

/** Indirizzo di controllo (Microsoft 365 recapita gli indirizzi «info+qualcosa» nella casella info@alpstay.eu). */
export const emailControllo = (codice: string): string => `info+${codice}@alpstay.eu`;

/** Aggiunge in fondo a ogni foglio la riga dell'indirizzo di controllo. */
export function conControllo(fs: readonly Foglio[], email: string): Foglio[] {
  return fs.map((f) => ({
    ...f,
    righe: [...f.righe, f.colonne.map((c) => (c.titolo === "Email" ? email : c.titolo === "Nome" ? "AlpStay" : c.titolo === "Cognome" ? "Controllo" : null))],
  }));
}
