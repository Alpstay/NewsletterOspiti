// Prova completa del programma dell'attività pianificata, con un registro di sessione finto e ospiti inventati:
// start → next (chiamate a pagine, una risposta salvata su file) → PRONTO → verify, poi un secondo giorno
// per controllare che lo storico conservi chi La Scatola non ha più.
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creaXlsx } from "../src/app/xlsx";
import { eq, fine, ok } from "./assert";

const PW = "Prova-ABCD-EFGH-IJKL";
const root = mkdtempSync(join(tmpdir(), "nl-test-"));
const home = join(root, "home");
const repo = join(root, "repo");
const proj = join(home, ".claude", "projects", "-repo");
mkdirSync(join(repo, "tools"), { recursive: true });
mkdirSync(join(proj, "tool-results"), { recursive: true });
copyFileSync("tools/ospiti.mjs", join(repo, "tools", "ospiti.mjs"));
const transcript = join(proj, "sessione.jsonl");
writeFileSync(transcript, "");

const run = (...args: string[]): string => {
  try {
    return execFileSync(process.execPath, ["tools/ospiti.mjs", ...args], { cwd: repo, env: { ...process.env, HOME: home, TMPDIR: root }, encoding: "utf8" });
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? e);
  }
};
let n = 0;
const registra = (input: Record<string, unknown>, risposta: string): void => {
  const id = `toolu_${++n}`;
  const ts = new Date().toISOString();
  appendFileSync(transcript, JSON.stringify({ timestamp: ts, message: { role: "assistant", content: [{ type: "tool_use", id, name: "mcp__La_Scatola__query_curated_view", input }] } }) + "\n");
  appendFileSync(transcript, JSON.stringify({ timestamp: ts, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: risposta }] }] } }) + "\n");
};
const fresh = { overall: { status: "fresh" }, sources: [{ property_id: "33333333-3333-4333-8333-333333333333", resource: "guest_stay", last_success_at: "2026-10-29T07:00:00+00:00", status: "fresh" }] };
const pagina = (data: unknown[], cursor: string | null, total: number): string => JSON.stringify({ data, freshness: fresh, page: { returned: data.length, total, truncated: !!cursor, next_cursor: cursor } });
const chiama = (out: string): Record<string, unknown> => {
  const m = /CHIAMA mcp__La_Scatola__query_curated_view (\{.*\})/.exec(out);
  if (!m) throw new Error(`atteso CHIAMA, ottenuto:\n${out}`);
  return JSON.parse(m[1]) as Record<string, unknown>;
};
const ospite = (i: number, o: Record<string, unknown> = {}): Record<string, unknown> => ({
  guest_stay_id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, "0")}`,
  reservation_id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
  property_id: "33333333-3333-4333-8333-333333333333",
  first_name: `Nome${i}`,
  last_name: `Cognome${i}`,
  primary_email: `ospite${i}@esempio.test`,
  language: "de",
  citizenship: "DE",
  stay_start: "2026-09-10",
  stay_end: "2026-09-12",
  birth_date: "1980-01-01",
  primary_phone_number: "+490000000",
  privacy_policy_acceptance_date: "2026-09-01",
  ...o,
});
const prenotazione = (i: number, o: Record<string, unknown> = {}): Record<string, unknown> => ({
  reservation_id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
  booking_status: "CONFIRMED",
  is_canceled: false,
  creation_date: "2026-08-15T09:00:00+00:00",
  channel_bucket: "direct",
  ...o,
});

// ── Giorno 1 ──
const CH = run("chiave").trim();
ok(/^NLK-[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/.test(CH), `chiave generata nel formato giusto: ${CH}`);
ok(run("start", PW).includes("servono password e chiave"), "senza chiave non parte");
ok(run("start", PW, CH).includes("ERRORE"), "senza storico e senza --primo si ferma");
let out = run("start", PW, CH, "--primo");
const token = /SEGNO (\S+)/.exec(out)?.[1];
ok(!!token, "start stampa il segno");
appendFileSync(transcript, JSON.stringify({ timestamp: new Date().toISOString(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "bash0", content: out }] } }) + "\n");

const g1 = chiama(run("next"));
eq(g1.view, "curated_guest_stays", "prima chiamata: soggiorni con email");
const p1 = [ospite(1), ospite(2, { primary_email: "x.1@guest.booking.com" }), ospite(3, { birth_date: "2015-01-01" })];
// Il modello a volte aggiunge campi vuoti: devono essere riconosciuti come la stessa chiamata.
registra({ ...g1, group_by: [], aggregates: [] }, pagina(p1, "CUR1", 5));
const g2 = chiama(run("next"));
eq(g2.cursor, "CUR1", "seconda chiamata: stesso filtro con il cursore");
const salvato = join(proj, "tool-results", "pagina2.txt");
writeFileSync(salvato, pagina([ospite(4, { reservation_id: "aaaaaaaa-0000-4000-8000-000000000099", stay_start: "2026-12-27", stay_end: "2027-01-02" }), ospite(5)], null, 5));
registra(g2, `Error: result (65,141 characters) exceeds maximum allowed tokens. Output has been saved to ${salvato}.\nFormat: JSON`);
const r1 = chiama(run("next"));
eq(r1.view, "curated_reservations", "terza chiamata: prenotazioni");
eq((r1.filters as { value: unknown }[])[1].value, "2026-09-10", "finestra dal primo soggiorno letto");
registra(r1, pagina([prenotazione(1), prenotazione(4), prenotazione(5, { is_canceled: true, booking_status: "CANCELLED" })], null, 3));
out = run("next");
ok(out.includes("PRONTO"), `il primo aggiornamento finisce\n${out}`);
ok(out.includes("1 email dei portali") && out.includes("1 minori") && out.includes("1 prenotazioni cancellate"), "esclusioni riportate");
ok(out.includes("ATTENZIONE 1 soggiorni senza prenotazione"), "segnala soggiorni senza prenotazione");
ok(out.includes("ospiti unici: 2"), "due ospiti utili");
const file1 = readFileSync(join(repo, "ospiti.json"), "utf8");
ok(!file1.includes("esempio.test") && !file1.includes("Nome1") && !file1.includes("+49"), "nessun dato personale in chiaro nel file");
ok(run("verify", PW, CH).includes("verifica OK"), "verify con la password giusta");
ok(run("verify", "password-sbagliata", CH).includes("ERRORE"), "verify con la password sbagliata");

// ── Giorno 2: La Scatola ha «dimenticato» settembre ──
ok(run("start", "password-sbagliata-123", CH).includes("non aprono"), "con password sbagliata non parte (lo storico non si perde)");
ok(run("start", PW, run("chiave").trim()).includes("non aprono"), "con la sola password giusta e un'altra chiave non parte: doppio controllo");
ok(!readFileSync(join(repo, "ospiti.json"), "utf8").includes('"format":1'), "il file è nel formato a doppio controllo");
out = run("start", PW, CH, "--completo");
const token2 = /SEGNO (\S+)/.exec(out)?.[1];
appendFileSync(transcript, JSON.stringify({ timestamp: new Date().toISOString(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "bash1", content: `${out} ${token2}` }] } }) + "\n");
const h1 = chiama(run("next"));
registra(h1, pagina([ospite(4, { reservation_id: "aaaaaaaa-0000-4000-8000-000000000099", stay_start: "2026-12-27", stay_end: "2027-01-02" }), ospite(6, { primary_email: "ospite1@esempio.test", stay_start: "2027-02-01", stay_end: "2027-02-05" })], null, 2));
const hr = chiama(run("next"));
eq((hr.filters as { value: unknown }[])[1].value, "2026-12-27", "la finestra si è spostata");
registra(hr, pagina([prenotazione(6)], null, 1));
out = run("next");
ok(out.includes("PRONTO"), `il secondo aggiornamento finisce\n${out}`);
ok(out.includes("ospiti unici: 2, abituali 1"), `ospite1 torna a febbraio: abituale grazie allo storico\n${out}`);
ok(/storico: 3 soggiorni/.test(out), "settembre resta nello storico anche se La Scatola non lo ha più");
ok(run("verify", PW, CH).includes("2 ospiti unici, 1 abituali"), "verify del secondo giorno");

// ── Giorno 3: aggiornamento incrementale (solo l'ultima settimana e il futuro) ──
out = run("start", PW, CH);
ok(out.includes("INCREMENTALE") || out.includes("COMPLETO (tutta"), "start annuncia il tipo di aggiornamento");
const incrementale = out.includes("INCREMENTALE");
appendFileSync(transcript, JSON.stringify({ timestamp: new Date().toISOString(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "bash2", content: out }] } }) + "\n");
const i1 = chiama(run("next"));
if (incrementale) eq((i1.filters as { field: string }[]).map((f) => f.field), ["primary_email", "stay_end"], "incrementale: filtro sulla fine del soggiorno");
registra(i1, pagina([ospite(4, { reservation_id: "aaaaaaaa-0000-4000-8000-000000000099", stay_start: "2026-12-27", stay_end: "2027-01-02" }), ospite(6, { primary_email: "ospite1@esempio.test", stay_start: "2027-02-01", stay_end: "2027-02-05" })], null, 2));
const ir = chiama(run("next"));
registra(ir, pagina([prenotazione(6)], null, 1));
out = run("next");
ok(out.includes("PRONTO") && /storico: 3 soggiorni/.test(out), `incrementale: storico intatto\n${out}`);

// ── Importazione del pacchetto clienti: tre file distinti, uno per casa (CSV e un vero .xlsx) ──
const fH = join(root, "hartmann.csv");
writeFileSync(
  fH,
  [
    "Cognome;Nome;E-mail;Lingua;Nazionalità;Arrivo;Partenza;Soggiorni",
    "Quattro;Ospite;ospite4@esempio.test;Deutsch;Germany;20/03/2026;22/03/2026;",
    "Verdi;Luca;luca.verdi@esempio.test;it;IT;10/01/2026;14/01/2026;3",
  ].join("\n"),
);
const fA = join(root, "acadia.xlsx");
writeFileSync(
  fA,
  creaXlsx([
    {
      nome: "Clienti",
      colonne: [
        { titolo: "Email", larghezza: 30, tipo: "testo" },
        { titolo: "Nome", larghezza: 10, tipo: "testo" },
        { titolo: "Cognome", larghezza: 10, tipo: "testo" },
        { titolo: "Ultimo soggiorno", larghezza: 12, tipo: "data" },
        { titolo: "Lingua", larghezza: 8, tipo: "testo" },
      ],
      righe: [
        ["anna.rossi@esempio.test", "Anna", "Rossi", "2026-08-03", "Italiano"],
        ["abc.1@guest.booking.com", "Tizio", "Portale", "2026-03-01", "en"],
      ],
    },
  ]),
);
const fS = join(root, "saslong.csv");
writeFileSync(
  fS,
  [
    "Email,Nome,Cognome,Arrivo,Partenza",
    "anna.rossi@esempio.test,Anna,Rossi,12/02/2026,16/02/2026",
    "ospite4@esempio.test,Ospite,Quattro,27/12/2026,02/01/2027",
    "sc@esempio.test,Senza,Data,,",
  ].join("\n"),
);
ok(run("importa", PW, CH).includes("indica almeno un file"), "importa senza file si ferma");
out = run("importa", PW, CH, "--hartmann", fH, "--acadia", fA, "--saslong", fS);
ok(out.includes("PRONTO"), `importazione dei tre file riuscita\n${out}`);
ok(/hartmann\.csv: 2 righe → 2 importate/.test(out), `Hartmann: 2 importate\n${out}`);
ok(/acadia\.xlsx: 2 righe → 1 importate · scartate 1 email dei portali/.test(out), `Acadia (.xlsx): 1 importata, 1 portale\n${out}`);
ok(/saslong\.csv: 3 righe → 1 importate.* 1 senza data o casa.* 1 già presenti da La Scatola/.test(out), `Saslong: 1 importata, 1 senza data, 1 già presente\n${out}`);
ok(out.includes("ospiti unici: 4, abituali 4"), `abituali da storico, da più case e dalla colonna Soggiorni\n${out}`);
ok(run("importa", PW, CH, "--hartmann", fH, "--acadia", fA, "--saslong", fS).includes("ospiti unici: 4") && run("verify", PW, CH).includes("(4 importati)"), "reimportare gli stessi file non crea doppioni");
ok(!readFileSync(join(repo, "ospiti.json"), "utf8").includes("esempio.test"), "anche dopo l'importazione nessun dato in chiaro");
out = run("start", PW, CH);
appendFileSync(transcript, JSON.stringify({ timestamp: new Date().toISOString(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "bash3", content: out }] } }) + "\n");
const j1 = chiama(run("next"));
registra(j1, pagina([ospite(4, { reservation_id: "aaaaaaaa-0000-4000-8000-000000000099", stay_start: "2026-12-27", stay_end: "2027-01-02" }), ospite(6, { primary_email: "ospite1@esempio.test", stay_start: "2027-02-01", stay_end: "2027-02-05" })], null, 2));
registra(chiama(run("next")), pagina([prenotazione(6)], null, 1));
out = run("next");
ok(out.includes("PRONTO") && out.includes("4 importati in tutto"), `i soggiorni importati restano dopo l'aggiornamento notturno\n${out}`);

// ── Cambio delle credenziali ──
const CH2 = run("chiave").trim();
ok(run("cambia", PW, CH, "Nuova-Password-2027", CH2).includes("PRONTO"), "cambio di password e chiave");
ok(run("verify", "Nuova-Password-2027", CH2).includes("verifica OK") && run("verify", PW, CH).includes("ERRORE"), "valgono solo le nuove credenziali");

fine("programma dell'attività pianificata");
