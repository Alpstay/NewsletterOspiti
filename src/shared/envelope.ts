// Costruzione di ospiti.json (busta in chiaro + storico cifrato), uguale per il programma e per la pagina.

import { aadFor, decryptJson, encryptJson } from "./crypto";
import { APP, envelopeSenzaDatiInChiaro, senzaEsclusi } from "./model";
import type { Archivio, Envelope, FreshnessStatus } from "./types";

export async function cifraArchivio(grezzo: Archivio, sgr: string, freshness: FreshnessStatus, scatolaUpdatedAt: string | null): Promise<Envelope> {
  const { archivio } = senzaEsclusi(grezzo);
  const envelope: Envelope = {
    format: 2,
    app: APP,
    generated_at: new Date().toISOString(),
    scatola_updated_at: scatolaUpdatedAt,
    freshness,
    day: archivio.day,
    enc: await encryptJson(archivio, sgr, aadFor(archivio.day)),
  };
  const back = await decryptJson<Archivio>(envelope.enc, sgr, aadFor(archivio.day));
  if (JSON.stringify(back) !== JSON.stringify(archivio)) throw new Error("la verifica della cifratura non torna");
  if (!envelopeSenzaDatiInChiaro(envelope)) throw new Error("dati personali fuori dal blocco cifrato");
  return envelope;
}
