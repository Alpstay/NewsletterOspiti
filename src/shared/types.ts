// Tipi condivisi tra il programma di aggiornamento (Node) e la pagina di Adriela (browser).

export type FreshnessStatus = "fresh" | "stale" | "failing" | "unavailable";

export interface FreshnessSource {
  readonly property_id: string;
  readonly resource: string;
  readonly last_success_at: string | null;
  readonly status: FreshnessStatus;
}

export interface Freshness {
  readonly overall: { readonly status: FreshnessStatus };
  readonly sources: readonly FreshnessSource[];
}

/** Canale della prenotazione, da `channel_bucket` di La Scatola. */
export type Canale = "diretto" | "portale" | "google" | "altro";

/** Chiave di una casa AlpStay. */
export type CasaKey = "acadia" | "hartmann" | "saslong";

export interface Casa {
  /** property_id di Slope, copiato identico. */
  readonly id: string;
  readonly key: CasaKey;
  readonly nome: string;
}

/**
 * Un soggiorno di un ospite con email: è l'unità dello storico cifrato.
 * Gli ID sono quelli di Slope / La Scatola, mai modificati.
 * Dati ridotti al minimo che serve alla newsletter: niente telefono, documento, data di nascita o residenza.
 */
export interface Soggiorno {
  /** guest_stay_id di Slope. */
  readonly gsid: string;
  /** reservation_id di Slope (null per i soggiorni importati da un'esportazione, che non ce l'hanno). */
  readonly rid: string | null;
  /** property_id di Slope. */
  readonly pid: string;
  readonly nome: string;
  readonly cognome: string;
  /** Email in minuscolo, senza spazi. */
  readonly email: string;
  /** Lingua registrata in Slope (in Slope «it» è spesso il valore predefinito). */
  readonly linguaSlope: string | null;
  /** Cittadinanza, codice ISO a due lettere. */
  readonly nazione: string | null;
  /** Inizio soggiorno AAAA-MM-GG. */
  readonly dal: string;
  /** Fine soggiorno AAAA-MM-GG. */
  readonly al: string;
  /** Data di accettazione dell'informativa privacy. */
  readonly privacyDal: string | null;
  /** Data di creazione della prenotazione (AAAA-MM-GG). */
  readonly prenotataIl: string | null;
  readonly canale: Canale | null;
  /** Giorno dei 18 anni (calcolato dalla data di nascita, che non viene conservata). */
  readonly maggiorenneDal: string | null;
  /** Ultimo giorno in cui La Scatola riportava questo soggiorno (o giorno dell'importazione). */
  readonly vistoIl: string;
  /** "import" = da un'esportazione di Slope (gsid «imp-…» generato, mai un ID di Slope); assente = La Scatola. */
  readonly origine?: "import";
  /** Numero di soggiorni dichiarato dall'esportazione di Slope (colonna «Soggiorni»), se maggiore di 1. */
  readonly soggiorniDichiarati?: number;
}

/** Quante righe di La Scatola non sono entrate nello storico, e perché. */
export interface Esclusi {
  /** Indirizzi mascherati dei portali (Booking, Expedia, Airbnb, …). */
  readonly portale: number;
  /** Indirizzi non validi o segnaposto. */
  readonly nonValida: number;
  /** Indirizzi interni AlpStay. */
  readonly interna: number;
  /** Ospiti minorenni. */
  readonly minori: number;
  /** Prenotazioni cancellate o in opzione. */
  readonly cancellati: number;
}

/** Contenuto cifrato di ospiti.json. */
export interface Archivio {
  readonly format: 1;
  /** Giorno dell'aggiornamento (Europe/Rome). */
  readonly day: string;
  /** Primo giorno coperto da La Scatola in questo aggiornamento (prima vale solo lo storico). */
  readonly finestraDal: string | null;
  /** Mesi dopo l'ultimo soggiorno oltre i quali un soggiorno viene cancellato dallo storico. */
  readonly conservazioneMesi: number;
  readonly soggiorni: readonly Soggiorno[];
  /** Esclusioni dell'ultimo aggiornamento. */
  readonly esclusi: Esclusi;
}

export interface EncBlock {
  readonly alg: "AES-GCM/PBKDF2-SHA256";
  readonly iter: number;
  readonly salt: string;
  readonly iv: string;
  readonly ct: string;
}

/** ospiti.json: in chiaro solo date e stato di freschezza, tutto il resto cifrato. */
export interface Envelope {
  /** 1 = solo password (vecchio); 2 = password + chiave del computer (doppio controllo). */
  readonly format: 1 | 2;
  readonly app: "newsletter-ospiti";
  readonly generated_at: string;
  readonly scatola_updated_at: string | null;
  readonly freshness: FreshnessStatus;
  readonly day: string;
  readonly enc: EncBlock;
}

/** Ospite unico (una email), ricavato dallo storico: è la riga della tabella e dell'Excel. */
export interface Ospite {
  readonly email: string;
  readonly nome: string;
  readonly cognome: string;
  /** Lingua per la newsletter (regola Colazioni: «it» di Slope vale solo se confermato dalla cittadinanza). */
  readonly lingua: string;
  /** true se la lingua è stata dedotta dalla cittadinanza invece che letta da Slope. */
  readonly linguaDedotta: boolean;
  readonly nazione: string | null;
  readonly case: readonly CasaKey[];
  /** Primo arrivo conosciuto. */
  readonly primo: string;
  /** Ultimo arrivo già avvenuto (≤ oggi), null se l'ospite deve ancora arrivare. */
  readonly ultimo: string | null;
  /** Prossimo arrivo (> oggi), null se non ce ne sono. */
  readonly prossimo: string | null;
  /** Soggiorni distinti: soggiorni attaccati o sovrapposti (anche in case diverse) contano come uno. */
  readonly viaggi: number;
  readonly clienteDal: string;
  readonly abituale: boolean;
  readonly motivoAbituale: string | null;
  /** Canale della prenotazione più recente. */
  readonly canale: Canale | null;
  readonly soggiorni: readonly { readonly casa: CasaKey | null; readonly dal: string; readonly al: string }[];
}
