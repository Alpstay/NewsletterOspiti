// Rete di sicurezza per le cancellazioni dalla newsletter fatte su questo computer.
// Finché il file pubblicato non le contiene (file non caricato su GitHub, o sovrascritto), la pagina le
// riapplica da sola e chiede di ricaricare il file. Si salvano solo le impronte, mai gli indirizzi.

import { elencoDisiscritti } from "../shared/disiscritti";
import type { Archivio, Disiscritto } from "../shared/types";

const LS = "newsletter-ospiti-cancellazioni-in-sospeso";

function leggi(): Disiscritto[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LS) ?? "[]");
    return Array.isArray(v) ? (v as Disiscritto[]).filter((d) => typeof d?.h === "string" && typeof d?.dal === "string") : [];
  } catch {
    return [];
  }
}
function scrivi(v: readonly Disiscritto[]): void {
  try {
    if (v.length) localStorage.setItem(LS, JSON.stringify(v));
    else localStorage.removeItem(LS);
  } catch {
    /* archiviazione non disponibile: resta valido il file scaricato */
  }
}

/** Ricorda le cancellazioni appena fatte finché il file pubblicato non le contiene. */
export function ricordaSospese(nuove: readonly Disiscritto[]): void {
  const tutte = new Map(leggi().map((d) => [d.h, d]));
  for (const d of nuove) tutte.set(d.h, d);
  scrivi([...tutte.values()]);
}

/** Dimentica una cancellazione (riattivazione). */
export function dimenticaSospesa(h: string): void {
  scrivi(leggi().filter((d) => d.h !== h));
}

/** Cancellazioni fatte qui che il file appena aperto non contiene ancora; quelle già pubblicate si dimenticano. */
export function sospeseMancanti(archivio: Archivio): Disiscritto[] {
  const pubblicate = new Set(elencoDisiscritti(archivio).map((d) => d.h));
  const mancanti = leggi().filter((d) => !pubblicate.has(d.h));
  scrivi(mancanti);
  return mancanti;
}
