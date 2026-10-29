// Aggiornamento automatico di ospiti.json (piattaforma newsletter AlpStay).
//
// Doppio controllo: ospiti.json si apre solo con PASSWORD + CHIAVE del computer (vedi src/shared/crypto.ts).
//
//   node tools/ospiti.mjs start "<PASSWORD>" "<CHIAVE>" [--completo] [--primo]
//        prepara l'esecuzione e controlla che password e chiave aprano lo storico.
//        Di norma l'aggiornamento è INCREMENTALE: soggiorni che finiscono dagli ultimi 7 giorni in poi (~4 chiamate).
//        È COMPLETO (tutta la finestra di La Scatola, ~40 chiamate) con --completo, il 1° del mese o senza storico.
//   node tools/ospiti.mjs next                             dice quale chiamata fare a La Scatola, oppure scrive il file
//   node tools/ospiti.mjs verify "<PASSWORD>" "<CHIAVE>"    decifra ospiti.json e ne controlla il contenuto
//   node tools/ospiti.mjs importa "<PASSWORD>" "<CHIAVE>" --hartmann h.xlsx --acadia a.xlsx --saslong s.xlsx
//        aggiunge allo storico il pacchetto clienti esportato da Slope: un file per casa (anche solo uno o due),
//        oppure --file tutto.xlsx con una colonna «Struttura».
//   node tools/ospiti.mjs cambia "<PASSWORD>" "<CHIAVE o ->" "<NUOVA PASSWORD>" "<NUOVA CHIAVE>"
//        ricifra lo storico con credenziali nuove (con «-» per un file del vecchio formato a sola password).
//   node tools/ospiti.mjs chiave                           genera una nuova chiave del computer
//
// Le risposte di La Scatola NON si ricopiano a mano: il programma le legge dal registro della sessione,
// così gli ID di Slope restano esattamente quelli ricevuti.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aadFor, decryptJson, encryptJson, normalizzaChiave, nuovaChiave, segreto } from "../shared/crypto";
import { importaPacchetto, mappaColonne, riassuntoEsito } from "../shared/importa";
import type { FileImport } from "../shared/importa";
import {
  APP,
  CASE,
  CONSERVAZIONE_MESI,
  FILE,
  IMPORT_ID,
  addDays,
  emailEsclusa,
  envelopeSenzaDatiInChiaro,
  isEnvelope,
  isUuid,
  nessunEscluso,
  ospitiDa,
  prenotazioniDa,
  romeDay,
  soggiornoDa,
  unisci,
} from "../shared/model";
import { senzaEsclusi } from "../shared/model";
import type { Unione } from "../shared/model";
import type { Archivio, Envelope, Esclusi, Freshness, FreshnessStatus, Soggiorno } from "../shared/types";
import { leggiTabella } from "../shared/tabella";
import { inflateRawSync } from "node:zlib";
import { findTranscript, follow, readCalls } from "./transcript";
import type { Args } from "./transcript";

const RUN_FILE = join(tmpdir(), "newsletter-ospiti-run.json");
const CMD = "node tools/ospiti.mjs";
const MAX_TRIES = 3;
/** Se sparisce più di questa quota dei soggiorni già nel periodo letto, qualcosa non va: non si pubblica. */
const MAX_SPARITI = 0.3;
/** Aggiornamento incrementale: si rileggono i soggiorni che finiscono da questi giorni fa in poi. */
const GIORNI_INCREMENTALE = 7;

interface Run {
  readonly token: string;
  readonly startedAt: string;
  /** Password e chiave insieme (vedi segreto()). */
  readonly segreto: string;
  readonly day: string;
  readonly primo: boolean;
  readonly completo: boolean;
  readonly transcript: string | null;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}
function fail(message: string): never {
  out(`ERRORE ${message}`);
  process.exit(2);
}

const GUEST_FILTER = { field: "primary_email", op: "neq", value: null };
export function guestArgs(run: Pick<Run, "completo" | "day">): Args {
  return {
    view: "curated_guest_stays",
    filters: run.completo ? [GUEST_FILTER] : [GUEST_FILTER, { field: "stay_end", op: "gte", value: addDays(run.day, -GIORNI_INCREMENTALE) }],
    order_by: [{ field: "stay_start", direction: "asc" }],
    limit: 500,
  };
}
export const reservationArgs = (dal: string): Args => ({
  view: "curated_reservations",
  filters: [
    { field: "registered_guests", op: "gt", value: 0 },
    { field: "departure", op: "gte", value: dal },
  ],
  order_by: [{ field: "arrival", direction: "asc" }],
  limit: 500,
});

/** Separa argomenti posizionali e opzioni «--nome valore» / «--flag». */
function argomenti(args: readonly string[], conValore: readonly string[]): { pos: string[]; opt: Map<string, string | true> } {
  const pos: string[] = [];
  const opt = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (conValore.includes(k)) opt.set(k, args[++i] ?? "");
      else opt.set(k, true);
    } else pos.push(a);
  }
  return { pos, opt };
}

/** Password e chiave dagli argomenti, con i controlli di forma. */
function credenziali(pos: readonly string[], uso: string): { password: string; chiave: string } {
  const [password, chiaveGrezza] = pos;
  if (!password || password.length < 12 || !chiaveGrezza) fail(`servono password e chiave: ${CMD} ${uso}`);
  const chiave = normalizzaChiave(chiaveGrezza);
  if (!chiave) fail("la chiave del computer non è valida (forma NLK-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX).");
  return { password, chiave };
}

/** Il segreto giusto per il formato del file: 1 = sola password (vecchio), 2 = password + chiave. */
const segretoPer = (env: Envelope, password: string, chiave: string | null): string => (env.format === 2 ? segreto(password, chiave ?? "") : password);

async function leggiStorico(sgr: string, password?: string): Promise<{ env: Envelope; archivio: Archivio } | null> {
  if (!existsSync(FILE)) return null;
  const env: unknown = JSON.parse(readFileSync(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non è un file della piattaforma newsletter: non procedere.`);
  // Un file del vecchio formato (sola password) si apre ancora con la password; si riscrive al formato nuovo.
  const s = env.format === 1 && password ? password : sgr;
  const archivio = await decryptJson<Archivio>(env.enc, s, aadFor(env.day)).catch(() =>
    fail(`password o chiave non aprono ${FILE}: sono sbagliate o il file è alterato. Non procedere, lo storico andrebbe perso.`),
  );
  return { env, archivio };
}

const RANK: Record<FreshnessStatus, number> = { fresh: 0, stale: 1, failing: 2, unavailable: 3 };
function freschezza(list: readonly Freshness[]): { status: FreshnessStatus; updatedAt: string | null } {
  let status: FreshnessStatus = list.length ? "fresh" : "unavailable";
  let updatedAt: string | null = null;
  for (const f of list) {
    for (const s of f.sources) {
      if (s.resource !== "guest_stay" && s.resource !== "lodging_reservation") continue;
      if (RANK[s.status] > RANK[status]) status = s.status;
      if (s.last_success_at && (!updatedAt || s.last_success_at < updatedAt)) updatedAt = s.last_success_at;
    }
  }
  return { status, updatedAt };
}

/** Cifra, ricontrolla e scrive ospiti.json. */
async function scrivi(grezzo: Archivio, sgr: string, fresh: { status: FreshnessStatus; updatedAt: string | null }): Promise<Envelope> {
  const { archivio, tolti } = senzaEsclusi(grezzo);
  if (tolti > 0) console.log(`RIEPILOGO esclusi dallo storico per le regole attuali (booking/expedia, portali, non validi): ${tolti}`);
  const envelope: Envelope = {
    format: 2,
    app: APP,
    generated_at: new Date().toISOString(),
    scatola_updated_at: fresh.updatedAt,
    freshness: fresh.status,
    day: archivio.day,
    enc: await encryptJson(archivio, sgr, aadFor(archivio.day)),
  };
  const back = await decryptJson<Archivio>(envelope.enc, sgr, aadFor(archivio.day));
  if (JSON.stringify(back) !== JSON.stringify(archivio)) fail("la verifica della cifratura non torna. Non pubblicare.");
  if (!envelopeSenzaDatiInChiaro(envelope)) fail("dati personali fuori dal blocco cifrato. Non pubblicare.");
  writeFileSync(FILE, `${JSON.stringify(envelope)}\n`);
  return envelope;
}

function riepilogoOspiti(soggiorni: readonly Soggiorno[], day: string): void {
  const ospiti = ospitiDa(soggiorni, day);
  const perCasa = CASE.map((c) => `${c.nome} ${ospiti.filter((o) => o.case.includes(c.key)).length}`).join(" · ");
  const lingue = new Map<string, number>();
  for (const o of ospiti) lingue.set(o.lingua, (lingue.get(o.lingua) ?? 0) + 1);
  const topLingue = [...lingue].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l} ${n}`).join(" · ");
  out(`RIEPILOGO ospiti unici: ${ospiti.length}, abituali ${ospiti.filter((o) => o.abituale).length} · ${perCasa}`);
  out(`RIEPILOGO lingue: ${topLingue}`);
}

const riepilogoStorico = (u: Unione, importati = 0): string =>
  `RIEPILOGO storico: ${u.soggiorni.length} soggiorni (${u.nuovi} nuovi, ${u.aggiornati} aggiornati, ${u.spariti} tolti perché spariti da Slope, ${u.scaduti} oltre ${CONSERVAZIONE_MESI} mesi${importati ? `, ${importati} importati in tutto` : ""})`;

function loadRun(): Run {
  if (!existsSync(RUN_FILE)) fail(`nessuna esecuzione avviata: esegui prima ${CMD} start "<PASSWORD>" "<CHIAVE>".`);
  return JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
}

async function start(args: string[]): Promise<void> {
  const { pos, opt } = argomenti(args, ["transcript"]);
  const { password, chiave } = credenziali(pos, 'start "<PASSWORD>" "<CHIAVE>"');
  const sgr = segreto(password, chiave);
  if (!existsSync("tools/ospiti.mjs")) fail("esegui il comando dalla cartella del repository NewsletterOspiti.");
  const primo = opt.has("primo");
  const storico = await leggiStorico(sgr, password);
  if (!storico && !primo) fail(`${FILE} non c'è: senza storico gli abituali si perdono. Se è davvero il primo aggiornamento usa --primo.`);
  const day = romeDay();
  // Lettura completa: su richiesta, senza storico, o il 1° del mese come rete di sicurezza.
  const completo = opt.has("completo") || !storico || day.endsWith("-01");
  const tr = opt.get("transcript");
  const run: Run = {
    token: `NL-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    segreto: sgr,
    day,
    primo,
    completo,
    transcript: typeof tr === "string" && tr ? tr : null,
  };
  writeFileSync(RUN_FILE, JSON.stringify(run), { mode: 0o600 });
  out(`SEGNO ${run.token}`);
  out(
    `Giorno ${day} · aggiornamento ${completo ? "COMPLETO (tutta la finestra di La Scatola, ~40 chiamate)" : `INCREMENTALE (soggiorni che finiscono dal ${addDays(day, -GIORNI_INCREMENTALE)} in poi, poche chiamate)`} · storico: ${
      storico ? `${storico.archivio.soggiorni.length} soggiorni (aggiornato il ${storico.env.day})` : "nessuno, primo aggiornamento"
    }`,
  );
  out(`Ora esegui: ${CMD} next`);
}

async function next(): Promise<void> {
  const run = loadRun();
  const transcript = run.transcript ?? findTranscript(run.token);
  if (!transcript) fail(`nessun registro contiene il segno ${run.token}: riesegui start e poi next.`);
  const calls = readCalls(transcript, run.startedAt);

  const ask = (a: Args, chain: { failures: number; lastError: string | null }, what: string): never => {
    if (chain.failures >= MAX_TRIES) fail(`La Scatola non risponde (${what}) dopo ${chain.failures} tentativi: ${chain.lastError ?? "errore"}. Non pubblicare.`);
    out(`CHIAMA mcp__La_Scatola__query_curated_view ${JSON.stringify(a)}`);
    out(`Copia gli argomenti identici, poi riesegui: ${CMD} next`);
    process.exit(0);
  };

  // 1) Soggiorni con email (vista con i dati degli ospiti).
  const guests = follow(calls, guestArgs(run));
  if (guests.next) ask(guests.next, guests, "soggiorni con email");
  if (run.completo && !guests.rows.length) fail("La Scatola non ha restituito nessun soggiorno con email. Non pubblicare.");
  if (guests.total !== null && guests.rows.length < guests.total) fail(`lette ${guests.rows.length} righe su ${guests.total}. Non pubblicare.`);
  const primoInizio = guests.rows
    .map((r) => (typeof r.stay_start === "string" ? r.stay_start.slice(0, 10) : ""))
    .filter(Boolean)
    .sort()[0];
  const daIncr = addDays(run.day, -GIORNI_INCREMENTALE);
  if (run.completo && !primoInizio) fail("nessuna data di inizio soggiorno nelle righe lette. Non pubblicare.");
  // Prenotazioni da leggere: per la completa da inizio finestra, per l'incrementale dalle partenze degli ultimi giorni.
  const resDal = run.completo ? primoInizio! : primoInizio && primoInizio < daIncr ? primoInizio : daIncr;

  // 2) Stato, canale e data di creazione delle prenotazioni (vista senza dati personali).
  const res = follow(calls, reservationArgs(resDal));
  if (res.next) ask(res.next, res, "prenotazioni");

  // 3) Costruzione.
  const pren = prenotazioniDa(res.rows);
  const esclusi: Record<keyof Esclusi, number> = { ...nessunEscluso() };
  const letti = new Map<string, Soggiorno>();
  let senzaPrenotazione = 0;
  for (const row of guests.rows) {
    const e = soggiornoDa(row, pren, run.day);
    if ("escluso" in e) {
      esclusi[e.escluso]++;
      continue;
    }
    if (!pren.has(e.ok.rid!)) senzaPrenotazione++;
    letti.set(e.ok.gsid, e.ok);
  }

  const storico = run.primo ? null : await leggiStorico(run.segreto);
  if (!storico && !run.primo) fail(`${FILE} è sparito durante l'esecuzione. Non pubblicare.`);
  const prev = storico?.archivio.soggiorni ?? [];
  // Periodo coperto da questa lettura: lì vale La Scatola, fuori vale lo storico.
  const copre = run.completo ? (s: Soggiorno) => s.dal >= primoInizio! : (s: Soggiorno) => s.al >= daIncr;
  const u = unisci(prev, [...letti.values()], copre, run.day);
  if (u.precedentiInFinestra >= 20 && u.spariti / u.precedentiInFinestra > MAX_SPARITI)
    fail(`spariti ${u.spariti} soggiorni su ${u.precedentiInFinestra} già nello storico per lo stesso periodo: troppi, probabilmente una lettura incompleta. Non pubblicare.`);

  const archivio: Archivio = {
    format: 1,
    day: run.day,
    finestraDal: run.completo ? primoInizio! : (storico?.archivio.finestraDal ?? null),
    conservazioneMesi: CONSERVAZIONE_MESI,
    soggiorni: u.soggiorni,
    esclusi: run.completo ? esclusi : (storico?.archivio.esclusi ?? esclusi),
  };
  const envelope = await scrivi(archivio, run.segreto, freschezza([...guests.freshness, ...res.freshness]));

  out(`RIEPILOGO aggiornamento ${run.completo ? "completo" : "incrementale"}: ${guests.rows.length} soggiorni con email letti${run.completo ? ` dal ${primoInizio}` : ` (fine soggiorno dal ${daIncr})`}, ${res.rows.length} prenotazioni lette`);
  out(
    `RIEPILOGO scartati: ${esclusi.portale} email dei portali, ${esclusi.nonValida} non valide, ${esclusi.interna} interne, ${esclusi.minori} minori, ${esclusi.cancellati} prenotazioni cancellate o in opzione`,
  );
  if (senzaPrenotazione) out(`RIEPILOGO ATTENZIONE ${senzaPrenotazione} soggiorni senza prenotazione corrispondente (tenuti, canale ignoto)`);
  out(riepilogoStorico(u, u.soggiorni.filter((s) => s.origine === "import").length));
  riepilogoOspiti(u.soggiorni, run.day);
  out(`RIEPILOGO La Scatola ${envelope.freshness}${envelope.scatola_updated_at ? `, aggiornata alle ${envelope.scatola_updated_at}` : ""} · chiamate lette ${calls.length}`);
  out(`PRONTO ${FILE} scritto e verificato`);
}

async function importa(args: string[]): Promise<void> {
  const { pos, opt } = argomenti(args, ["hartmann", "acadia", "saslong", "file"]);
  const { password, chiave } = credenziali(pos, 'importa "<PASSWORD>" "<CHIAVE>" --hartmann h.xlsx --acadia a.xlsx --saslong s.xlsx');
  const sgr = segreto(password, chiave);
  const richieste: { nome: string; casa: string | null }[] = [];
  for (const c of CASE) {
    const f = opt.get(c.key);
    if (typeof f === "string" && f) richieste.push({ nome: f, casa: c.id });
  }
  const tutto = opt.get("file");
  if (typeof tutto === "string" && tutto) richieste.push({ nome: tutto, casa: null });
  if (!richieste.length) fail(`indica almeno un file: --hartmann, --acadia, --saslong (uno per casa) oppure --file con una colonna «Struttura».`);
  for (const r of richieste) if (!existsSync(r.nome)) fail(`file non trovato: ${r.nome}`);
  const storico = await leggiStorico(sgr, password);
  if (!storico) fail(`${FILE} non c'è: fai prima un aggiornamento da La Scatola, poi importa.`);
  const day = romeDay();
  const file: FileImport[] = [];
  for (const r of richieste) {
    const righe = await leggiTabella(r.nome, new Uint8Array(readFileSync(r.nome)), async (d) => new Uint8Array(inflateRawSync(d)));
    const m = mappaColonne(righe);
    out(`RIEPILOGO ${r.nome}: colonne ${m ? Object.entries(m.colonne).map(([k, i]) => `${k}=${String.fromCharCode(65 + (i as number))}`).join(" ") : "NON RICONOSCIUTE"}`);
    file.push({ nome: r.nome, casa: r.casa, righe });
  }
  const pac = await importaPacchetto(file, day, storico.archivio.soggiorni).catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
  for (const e of pac.esiti) out(`RIEPILOGO ${riassuntoEsito(e.nome, e.esito)}`);
  if (!pac.soggiorni.length) fail("nessun soggiorno importabile nei file indicati. Niente da pubblicare.");
  // L'importazione non toglie nulla: nessun soggiorno è «coperto» dalla lettura.
  const u = unisci(storico.archivio.soggiorni, pac.soggiorni, () => false, day);
  const archivio: Archivio = { ...storico.archivio, day, soggiorni: u.soggiorni };
  await scrivi(archivio, sgr, { status: storico.env.freshness, updatedAt: storico.env.scatola_updated_at });
  out(riepilogoStorico(u, u.soggiorni.filter((s) => s.origine === "import").length));
  riepilogoOspiti(u.soggiorni, day);
  out(`PRONTO ${FILE} scritto e verificato`);
}

async function cambia(args: string[]): Promise<void> {
  const [pw, ch, nuovaPw, nuovaCh] = args;
  if (!pw || !ch || !nuovaPw || !nuovaCh) fail(`uso: ${CMD} cambia "<PASSWORD>" "<CHIAVE o ->" "<NUOVA PASSWORD>" "<NUOVA CHIAVE>"`);
  if (nuovaPw.length < 12) fail("la nuova password deve avere almeno 12 caratteri.");
  const nuova = normalizzaChiave(nuovaCh);
  if (!nuova) fail("la nuova chiave non è valida: generane una con «chiave».");
  if (!existsSync(FILE)) fail(`${FILE} non c'è.`);
  const env: unknown = JSON.parse(readFileSync(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non è un file della piattaforma newsletter.`);
  const vecchio = segretoPer(env, pw, ch === "-" ? null : normalizzaChiave(ch));
  const archivio = await decryptJson<Archivio>(env.enc, vecchio, aadFor(env.day)).catch(() => fail("password o chiave attuali errate."));
  await scrivi(archivio, segreto(nuovaPw, nuova), { status: env.freshness, updatedAt: env.scatola_updated_at });
  out(`PRONTO ${FILE} ricifrato con le nuove credenziali (doppio controllo). Aggiorna il testo dell'attività pianificata e comunica le nuove credenziali di persona.`);
}

async function verify(args: string[]): Promise<void> {
  const { password, chiave } = credenziali(args, 'verify "<PASSWORD>" "<CHIAVE>"');
  const env: unknown = JSON.parse(readFileSync(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non è un file della piattaforma newsletter`);
  if (env.format !== 2) fail(`${FILE} è ancora nel vecchio formato a sola password: esegui «cambia».`);
  if (!envelopeSenzaDatiInChiaro(env)) fail("dati personali fuori dal blocco cifrato");
  const a = await decryptJson<Archivio>(env.enc, segreto(password, chiave), aadFor(env.day)).catch(() => fail("password o chiave errate, o file alterato"));
  if (a.format !== 1 || a.day !== env.day || !Array.isArray(a.soggiorni)) fail("contenuto incompleto");
  const ids = new Set<string>();
  for (const s of a.soggiorni) {
    const importato = s.origine === "import";
    if (importato ? !IMPORT_ID.test(s.gsid) || s.rid !== null : !isUuid(s.gsid) || !isUuid(s.rid)) fail("ID di Slope non validi nello storico");
    if (!isUuid(s.pid)) fail("property_id non valido nello storico");
    if (ids.has(s.gsid)) fail("soggiorno doppio nello storico");
    ids.add(s.gsid);
    if (emailEsclusa(s.email)) fail("nello storico c'è un'email che andava scartata");
  }
  const ospiti = ospitiDa(a.soggiorni, env.day);
  const imp = a.soggiorni.filter((s) => s.origine === "import").length;
  out(
    `verifica OK: ${env.day}, ${a.soggiorni.length} soggiorni${imp ? ` (${imp} importati)` : ""}, ${ospiti.length} ospiti unici, ${ospiti.filter((o) => o.abituale).length} abituali, scritto ${env.generated_at}`,
  );
}

const [cmd, ...rest] = process.argv.slice(2);
const job =
  cmd === "start"
    ? () => start(rest)
    : cmd === "next"
      ? next
      : cmd === "verify"
        ? () => verify(rest)
        : cmd === "importa"
          ? () => importa(rest)
          : cmd === "cambia"
            ? () => cambia(rest)
            : cmd === "chiave"
              ? async () => out(nuovaChiave())
              : null;
if (!job) fail('comandi: start "<PASSWORD>" "<CHIAVE>" [--completo] [--primo] · next · verify · importa · cambia · chiave (vedi tools/AGGIORNA.md)');
job().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
