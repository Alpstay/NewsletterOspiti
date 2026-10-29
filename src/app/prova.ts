// Anteprima con ospiti INVENTATI (nessun dato reale, nessuna password): serve per provare la pagina.

import { CASE, addDays, romeDay } from "../shared/model";
import type { Archivio, Canale, Soggiorno } from "../shared/types";
import { mostra } from "./ui";

const NOMI = ["Anna", "Lukas", "Sofia", "James", "Marie", "Paolo", "Eva", "Tomasz", "Lena", "Oliver", "Giulia", "Pieter", "Clara", "Jonas", "Emma", "Marco"];
const COGNOMI = ["Rossi", "Huber", "Müller", "Smith", "Dubois", "Bianchi", "Novak", "Kowalski", "Jansen", "Weber", "Ricci", "de Vries", "Schmid", "Brown", "Moreau", "Ferrari"];
const PROFILI: [string | null, string][] = [
  ["de", "DE"],
  ["it", "IT"],
  ["en", "GB"],
  ["it", "DE"],
  ["fr", "FR"],
  ["en", "US"],
  ["nl", "NL"],
  ["pl", "PL"],
  ["it", "CH"],
  ["de", "AT"],
];
const CANALI: Canale[] = ["diretto", "portale", "portale", "google"];

/** Generatore deterministico (stessi ospiti a ogni apertura). */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function ospitiInventati(oggi: string, n = 140): Soggiorno[] {
  const r = rng(42);
  const out: Soggiorno[] = [];
  const hex = (len: number): string => Array.from({ length: len }, () => Math.floor(r() * 16).toString(16)).join("");
  const uuid = (): string => `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
  for (let i = 0; i < n; i++) {
    const nome = NOMI[Math.floor(r() * NOMI.length)];
    const cognome = COGNOMI[Math.floor(r() * COGNOMI.length)];
    const [linguaSlope, nazione] = PROFILI[Math.floor(r() * PROFILI.length)];
    const email = `${nome}.${cognome}.${i}@esempio.test`.toLowerCase().replace(/[^a-z0-9.@]/g, "");
    const visite = r() < 0.2 ? 2 : 1;
    for (let v = 0; v < visite; v++) {
      const dal = addDays(oggi, Math.floor(r() * 700) - 560);
      out.push({
        gsid: uuid(),
        rid: uuid(),
        pid: CASE[Math.floor(r() * CASE.length)].id,
        nome,
        cognome,
        email,
        linguaSlope,
        nazione,
        dal,
        al: addDays(dal, 2 + Math.floor(r() * 6)),
        privacyDal: addDays(dal, -3),
        prenotataIl: addDays(dal, -40),
        canale: CANALI[Math.floor(r() * CANALI.length)],
        maggiorenneDal: null,
        vistoIl: oggi,
      });
    }
  }
  return out;
}

const oggi = romeDay();
const archivio: Archivio = {
  format: 1,
  day: oggi,
  finestraDal: addDays(oggi, -50),
  conservazioneMesi: 24,
  soggiorni: ospitiInventati(oggi),
  esclusi: { portale: 37, nonValida: 2, interna: 1, minori: 4, cancellati: 6 },
};
document.getElementById("stato")!.textContent = "Anteprima con ospiti inventati";
mostra(archivio, { generated_at: new Date().toISOString(), scatola_updated_at: null, freshness: "fresh", day: oggi }, oggi);
document.getElementById("stato")!.textContent = "ANTEPRIMA con ospiti inventati: nessun dato reale";
