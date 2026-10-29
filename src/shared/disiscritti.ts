// Lista di cancellazione dalla newsletter, uguale per il programma notturno e per la pagina.
// Chi chiede la cancellazione esce subito dallo storico (tutti i suoi soggiorni) e resta solo l'impronta
// dell'email, così nessun aggiornamento o importazione lo può reinserire. Gli ID degli altri soggiorni non cambiano.

import { normalizzaEmail, senzaEsclusi } from "./model";
import type { Archivio, Disiscritto } from "./types";

const IMPRONTA = /^[0-9a-f]{64}$/;

/** Impronta SHA-256 (esadecimale) dell'email normalizzata. */
export async function impronta(email: string): Promise<string> {
  const dati = new TextEncoder().encode(normalizzaEmail(email));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", dati));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const elencoDisiscritti = (a: Archivio): readonly Disiscritto[] => (a.disiscritti ?? []).filter((d) => IMPRONTA.test(d.h));

/** Indirizzi validi trovati in un testo incollato (uno o più, separati da spazi, virgole, punti e virgola o a capo). */
export function indirizziDa(testo: string): string[] {
  const visti = new Set<string>();
  for (const parte of testo.split(/[\s,;<>"']+/)) {
    const e = normalizzaEmail(parte.replace(/^mailto:/i, ""));
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) visti.add(e);
  }
  return [...visti];
}

export interface EsitoCancellazione {
  readonly archivio: Archivio;
  /** Per ogni indirizzo: soggiorni tolti dallo storico e se era già nella lista. */
  readonly righe: readonly { readonly email: string; readonly soggiorni: number; readonly nome: string | null; readonly gia: boolean }[];
}

/** Aggiunge gli indirizzi alla lista di cancellazione e toglie dallo storico tutti i loro soggiorni. */
export async function disiscrivi(archivio: Archivio, emails: readonly string[], oggi: string): Promise<EsitoCancellazione> {
  const lista = [...elencoDisiscritti(archivio)];
  const presenti = new Set(lista.map((d) => d.h));
  const righe: { email: string; soggiorni: number; nome: string | null; gia: boolean }[] = [];
  let soggiorni = archivio.soggiorni;
  for (const raw of emails) {
    const email = normalizzaEmail(raw);
    const h = await impronta(email);
    const suoi = soggiorni.filter((s) => s.email === email);
    const nome = suoi.map((s) => [s.nome, s.cognome].filter(Boolean).join(" ")).find(Boolean) ?? null;
    soggiorni = soggiorni.filter((s) => s.email !== email);
    const gia = presenti.has(h);
    if (!gia) {
      lista.push({ h, dal: oggi });
      presenti.add(h);
    }
    righe.push({ email, soggiorni: suoi.length, nome, gia });
  }
  return { archivio: { ...archivio, soggiorni, disiscritti: lista }, righe };
}

/** Toglie un indirizzo dalla lista (solo se l'ospite ha chiesto di nuovo la newsletter). I soggiorni tolti non tornano. */
export async function riattiva(archivio: Archivio, email: string): Promise<{ archivio: Archivio; trovato: boolean }> {
  const h = await impronta(email);
  const lista = elencoDisiscritti(archivio);
  const resto = lista.filter((d) => d.h !== h);
  return { archivio: { ...archivio, disiscritti: resto }, trovato: resto.length !== lista.length };
}

/** Giorno della cancellazione dell'indirizzo, o null se non è nella lista. */
export async function cancellatoIl(archivio: Archivio, email: string): Promise<string | null> {
  const h = await impronta(email);
  return elencoDisiscritti(archivio).find((d) => d.h === h)?.dal ?? null;
}

/**
 * Applica le regole attuali allo storico prima di ogni scrittura: esclusioni sugli indirizzi (portali, booking/expedia…)
 * e lista di cancellazione. Usata dal programma notturno, dall'importazione e dalla pagina.
 */
export async function pulisci(grezzo: Archivio): Promise<{ archivio: Archivio; esclusi: number; cancellati: number }> {
  const { archivio, tolti } = senzaEsclusi(grezzo);
  const lista = elencoDisiscritti(archivio);
  if (!lista.length) return { archivio: { ...archivio, disiscritti: [] }, esclusi: tolti, cancellati: 0 };
  const vietate = new Set(lista.map((d) => d.h));
  const impronte = new Map<string, string>();
  for (const s of archivio.soggiorni) if (!impronte.has(s.email)) impronte.set(s.email, await impronta(s.email));
  const soggiorni = archivio.soggiorni.filter((s) => !vietate.has(impronte.get(s.email)!));
  return { archivio: { ...archivio, soggiorni, disiscritti: lista }, esclusi: tolti, cancellati: archivio.soggiorni.length - soggiorni.length };
}

/** Quanti soggiorni dello storico appartengono a indirizzi cancellati (deve essere 0). */
export async function soggiorniCancellati(archivio: Archivio): Promise<number> {
  const vietate = new Set(elencoDisiscritti(archivio).map((d) => d.h));
  if (!vietate.size) return 0;
  let n = 0;
  for (const s of archivio.soggiorni) if (vietate.has(await impronta(s.email))) n++;
  return n;
}
