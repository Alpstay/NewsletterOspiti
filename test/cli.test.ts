// Prova completa del programma dell'attività pianificata, con un registro di sessione finto e ospiti inventati:
// start → next (chiamate a pagine, una risposta salvata su file) → PRONTO → verify, poi un secondo giorno
// per controllare che lo storico conservi chi La Scatola non ha più.
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
ok(run("start", PW).includes("ERRORE"), "senza storico e senza --primo si ferma");
let out = run("start", PW, "--primo");
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
ok(run("verify", PW).includes("verifica OK"), "verify con la password giusta");
ok(run("verify", "password-sbagliata").includes("ERRORE"), "verify con la password sbagliata");

// ── Giorno 2: La Scatola ha «dimenticato» settembre ──
ok(run("start", "password-sbagliata-123").includes("la password non apre"), "con password sbagliata non parte (lo storico non si perde)");
out = run("start", PW);
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
ok(run("verify", PW).includes("2 ospiti unici, 1 abituali"), "verify del secondo giorno");

fine("programma dell'attività pianificata");
