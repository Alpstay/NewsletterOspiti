// Aggiornamento automatico di ospiti.json (piattaforma newsletter AlpStay).
//
//   node tools/ospiti.mjs start "<PASSWORD>" [--primo]   prepara l'esecuzione e controlla la password sullo storico
//   node tools/ospiti.mjs next                          dice quale chiamata fare a La Scatola, oppure scrive il file
//   node tools/ospiti.mjs verify "<PASSWORD>"            decifra ospiti.json e ne controlla il contenuto
//
// Le risposte di La Scatola NON si ricopiano a mano: il programma le legge dal registro della sessione,
// così gli ID di Slope restano esattamente quelli ricevuti.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aadFor, decryptJson, encryptJson } from "../shared/crypto";
import {
  APP,
  CASE,
  CONSERVAZIONE_MESI,
  FILE,
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
import type { Archivio, Envelope, Esclusi, Freshness, FreshnessStatus, Soggiorno } from "../shared/types";
import { findTranscript, follow, readCalls } from "./transcript";
import type { Args } from "./transcript";

const RUN_FILE = join(tmpdir(), "newsletter-ospiti-run.json");
const CMD = "node tools/ospiti.mjs";
const MAX_TRIES = 3;
/** Se sparisce più di questa quota dei soggiorni già in finestra, qualcosa non va: non si pubblica. */
const MAX_SPARITI = 0.3;

interface Run {
  readonly token: string;
  readonly startedAt: string;
  readonly password: string;
  readonly day: string;
  readonly primo: boolean;
  readonly transcript: string | null;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}
function fail(message: string): never {
  out(`ERRORE ${message}`);
  process.exit(2);
}

const GUEST_ARGS: Args = {
  view: "curated_guest_stays",
  filters: [{ field: "primary_email", op: "neq", value: null }],
  order_by: [{ field: "stay_start", direction: "asc" }],
  limit: 500,
};
const reservationArgs = (finestraDal: string): Args => ({
  view: "curated_reservations",
  filters: [
    { field: "registered_guests", op: "gt", value: 0 },
    { field: "departure", op: "gte", value: finestraDal },
  ],
  order_by: [{ field: "arrival", direction: "asc" }],
  limit: 500,
});

async function leggiStorico(password: string): Promise<{ env: Envelope; archivio: Archivio } | null> {
  if (!existsSync(FILE)) return null;
  const env: unknown = JSON.parse(readFileSync(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non è un file della piattaforma newsletter: non procedere.`);
  const archivio = await decryptJson<Archivio>(env.enc, password, aadFor(env.day)).catch(() =>
    fail(`la password non apre ${FILE}: è sbagliata o il file è alterato. Non procedere, lo storico andrebbe perso.`),
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

function loadRun(): Run {
  if (!existsSync(RUN_FILE)) fail(`nessuna esecuzione avviata: esegui prima ${CMD} start "<PASSWORD>".`);
  return JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
}

async function start(args: string[]): Promise<void> {
  const password = args.find((a) => !a.startsWith("--"));
  if (!password || password.length < 12) fail(`serve la password: ${CMD} start "<PASSWORD>"`);
  if (!existsSync("tools/ospiti.mjs")) fail("esegui il comando dalla cartella del repository NewsletterOspiti.");
  const primo = args.includes("--primo");
  const storico = await leggiStorico(password);
  if (!storico && !primo) fail(`${FILE} non c'è: senza storico gli abituali si perdono. Se è davvero il primo aggiornamento usa --primo.`);
  const ti = args.indexOf("--transcript");
  const run: Run = {
    token: `NL-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    password,
    day: romeDay(),
    primo,
    transcript: ti >= 0 ? (args[ti + 1] ?? null) : null,
  };
  writeFileSync(RUN_FILE, JSON.stringify(run), { mode: 0o600 });
  out(`SEGNO ${run.token}`);
  out(`Giorno ${run.day} · storico: ${storico ? `${storico.archivio.soggiorni.length} soggiorni (aggiornato il ${storico.env.day})` : "nessuno, primo aggiornamento"}`);
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
  const guests = follow(calls, GUEST_ARGS);
  if (guests.next) ask(guests.next, guests, "soggiorni con email");
  if (!guests.rows.length) fail("La Scatola non ha restituito nessun soggiorno con email. Non pubblicare.");
  if (guests.total !== null && guests.rows.length < guests.total) fail(`lette ${guests.rows.length} righe su ${guests.total}. Non pubblicare.`);
  const finestraDal = guests.rows
    .map((r) => (typeof r.stay_start === "string" ? r.stay_start.slice(0, 10) : ""))
    .filter(Boolean)
    .sort()[0];
  if (!finestraDal) fail("nessuna data di inizio soggiorno nelle righe lette. Non pubblicare.");

  // 2) Stato, canale e data di creazione delle prenotazioni (vista senza dati personali).
  const res = follow(calls, reservationArgs(finestraDal));
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
    if (!pren.has(e.ok.rid)) senzaPrenotazione++;
    letti.set(e.ok.gsid, e.ok);
  }
  if (!letti.size) fail("nessun soggiorno utilizzabile dopo le esclusioni. Non pubblicare.");

  const storico = run.primo ? null : await leggiStorico(run.password);
  if (!storico && !run.primo) fail(`${FILE} è sparito durante l'esecuzione. Non pubblicare.`);
  const prev = storico?.archivio.soggiorni ?? [];
  const u = unisci(prev, [...letti.values()], finestraDal, run.day);
  if (u.precedentiInFinestra >= 20 && u.spariti / u.precedentiInFinestra > MAX_SPARITI)
    fail(`spariti ${u.spariti} soggiorni su ${u.precedentiInFinestra} già nello storico per lo stesso periodo: troppi, probabilmente una lettura incompleta. Non pubblicare.`);

  const archivio: Archivio = { format: 1, day: run.day, finestraDal, conservazioneMesi: CONSERVAZIONE_MESI, soggiorni: u.soggiorni, esclusi };
  const fresh = freschezza([...guests.freshness, ...res.freshness]);
  const envelope: Envelope = {
    format: 1,
    app: APP,
    generated_at: new Date().toISOString(),
    scatola_updated_at: fresh.updatedAt,
    freshness: fresh.status,
    day: run.day,
    enc: await encryptJson(archivio, run.password, aadFor(run.day)),
  };
  const back = await decryptJson<Archivio>(envelope.enc, run.password, aadFor(run.day));
  if (JSON.stringify(back) !== JSON.stringify(archivio)) fail("la verifica della cifratura non torna. Non pubblicare.");
  if (!envelopeSenzaDatiInChiaro(envelope)) fail("dati personali fuori dal blocco cifrato. Non pubblicare.");
  writeFileSync(FILE, `${JSON.stringify(envelope)}\n`);

  const ospiti = ospitiDa(u.soggiorni, run.day);
  const perCasa = CASE.map((c) => `${c.nome} ${ospiti.filter((o) => o.case.includes(c.key)).length}`).join(" · ");
  const lingue = new Map<string, number>();
  for (const o of ospiti) lingue.set(o.lingua, (lingue.get(o.lingua) ?? 0) + 1);
  const topLingue = [...lingue].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l} ${n}`).join(" · ");
  out(`RIEPILOGO La Scatola: ${guests.rows.length} soggiorni con email dal ${finestraDal}, ${res.rows.length} prenotazioni lette`);
  out(
    `RIEPILOGO scartati: ${esclusi.portale} email dei portali, ${esclusi.nonValida} non valide, ${esclusi.interna} interne, ${esclusi.minori} minori, ${esclusi.cancellati} prenotazioni cancellate o in opzione`,
  );
  if (senzaPrenotazione) out(`RIEPILOGO ATTENZIONE ${senzaPrenotazione} soggiorni senza prenotazione corrispondente (tenuti, canale ignoto)`);
  out(`RIEPILOGO storico: ${u.soggiorni.length} soggiorni (${u.nuovi} nuovi, ${u.aggiornati} aggiornati, ${u.spariti} tolti perché spariti da Slope, ${u.scaduti} oltre ${CONSERVAZIONE_MESI} mesi)`);
  out(`RIEPILOGO ospiti unici: ${ospiti.length}, abituali ${ospiti.filter((o) => o.abituale).length} · ${perCasa}`);
  out(`RIEPILOGO lingue: ${topLingue}`);
  out(`RIEPILOGO La Scatola ${envelope.freshness}${envelope.scatola_updated_at ? `, aggiornata alle ${envelope.scatola_updated_at}` : ""} · chiamate lette ${calls.length}`);
  out(`PRONTO ${FILE} scritto e verificato`);
}

async function verify(args: string[]): Promise<void> {
  const password = args[args.length - 1];
  const file = args.length > 1 ? args[0] : FILE;
  if (!password) fail(`uso: ${CMD} verify "<PASSWORD>"`);
  const env: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isEnvelope(env)) fail(`${file} non è un file della piattaforma newsletter`);
  if (!envelopeSenzaDatiInChiaro(env)) fail("dati personali fuori dal blocco cifrato");
  const a = await decryptJson<Archivio>(env.enc, password, aadFor(env.day)).catch(() => fail("password errata o file alterato"));
  if (a.format !== 1 || a.day !== env.day || !Array.isArray(a.soggiorni)) fail("contenuto incompleto");
  const ids = new Set<string>();
  for (const s of a.soggiorni) {
    if (!isUuid(s.gsid) || !isUuid(s.rid) || !isUuid(s.pid)) fail("ID di Slope non validi nello storico");
    if (ids.has(s.gsid)) fail("soggiorno doppio nello storico");
    ids.add(s.gsid);
    if (emailEsclusa(s.email)) fail("nello storico c'è un'email che andava scartata");
  }
  const ospiti = ospitiDa(a.soggiorni, env.day);
  out(`verifica OK: ${env.day}, ${a.soggiorni.length} soggiorni, ${ospiti.length} ospiti unici, ${ospiti.filter((o) => o.abituale).length} abituali, scritto ${env.generated_at}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const job = cmd === "start" ? () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : null;
if (!job) fail('comandi: start "<PASSWORD>" [--primo] · next · verify "<PASSWORD>"');
job().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
