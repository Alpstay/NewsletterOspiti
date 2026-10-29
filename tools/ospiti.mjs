// Generato da src/cli/ospiti-cli.ts con build.mjs: non modificare a mano.

// src/cli/ospiti-cli.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";

// src/shared/crypto.ts
var ITERATIONS = 6e5;
var subtle = () => globalThis.crypto.subtle;
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out2 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out2[i] = s.charCodeAt(i);
  return out2;
}
async function keyFrom(password, salt, iter, usage) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}
async function encryptJson(value, password, aad, iter = ITERATIONS) {
  const c = globalThis.crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, iter, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  return { alg: "AES-GCM/PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function decryptJson(enc, password, aad) {
  const key = await keyFrom(password, fromB64(enc.salt), enc.iter, "decrypt");
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(enc.iv), additionalData: new TextEncoder().encode(aad) }, key, fromB64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
var aadFor = (day2) => `newsletter-ospiti|${day2}`;

// src/shared/model.ts
var APP = "newsletter-ospiti";
var FILE = "ospiti.json";
var CONSERVAZIONE_MESI = 24;
var MARGINE_CLIENTE_NOTO = 14;
var CASE = [
  { id: "11111111-1111-4111-8111-111111111111", key: "acadia", nome: "Hotel Acadia" },
  { id: "22222222-2222-4222-8222-222222222222", key: "hartmann", nome: "Chalet Hartmann" },
  { id: "33333333-3333-4333-8333-333333333333", key: "saslong", nome: "Smart Hotel Saslong" }
];
var casaDa = (pid) => CASE.find((c) => c.id === pid)?.key ?? null;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var isUuid = (v) => typeof v === "string" && UUID.test(v);
var ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
var str = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
var day = (v) => {
  const s = str(v);
  return s && ISO_DAY.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
};
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}
function romeDay(at = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
var PORTALI = [
  /(^|\.)booking\.com$/,
  /(^|\.)expediapartnercentral\.com$/,
  /(^|\.)airbnb\.com$/,
  /(^|\.)agoda-messaging\.com$/,
  /(^|\.)hostelworld\.com$/,
  /(^|\.)hotelbeds\.com$/
];
var INTERNI = [/(^|\.)alpstay\.(eu|ai|it|com)$/, /(^|\.)saslong\.ai$/];
var SEGNAPOSTO = /^(no-?e?-?mail|nomail|none|test|keine|nessuna|na|n\.a\.|x+|0+|-+)$/;
var EMAIL = /^[^\s@<>()[\],;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
var normalizzaEmail = (raw) => raw.trim().replace(/^mailto:/i, "").toLowerCase();
function emailEsclusa(email) {
  if (!EMAIL.test(email)) return "nonValida";
  const [local, domain] = email.split("@");
  if (SEGNAPOSTO.test(local)) return "nonValida";
  if (PORTALI.some((r) => r.test(domain))) return "portale";
  if (INTERNI.some((r) => r.test(domain))) return "interna";
  return null;
}
function capitalizza(raw) {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(new RegExp("(^|[\\s\\-'\u2019])(\\p{L})", "gu"), (_m, sep, ch) => sep + ch.toUpperCase());
}
var COUNTRY = {};
for (const [lang, codes] of Object.entries({
  it: "IT SM VA",
  de: "DE AT LI CH",
  fr: "FR MC",
  nl: "NL",
  es: "ES MX AR CO CL PE UY VE EC BO PY CR PA DO GT HN SV NI CU",
  pt: "PT BR",
  pl: "PL",
  cs: "CZ",
  ru: "RU BY KZ",
  zh: "CN TW HK MO",
  ko: "KR",
  he: "IL",
  ar: "SA AE EG QA KW BH OM JO LB MA DZ TN IQ SY LY YE"
}))
  for (const c of codes.split(" ")) COUNTRY[c] = lang;
function linguaNewsletter(linguaSlope, nazione) {
  const g = (linguaSlope ?? "").toLowerCase();
  if (g && g !== "it") return { lingua: g, dedotta: false };
  if (nazione) {
    const l = COUNTRY[nazione.toUpperCase()] ?? "en";
    return { lingua: l, dedotta: !(g === "it" && l === "it") };
  }
  return { lingua: g || "it", dedotta: !g };
}
function canaleDa(bucket) {
  switch (bucket) {
    case "direct":
      return "diretto";
    case "ota":
      return "portale";
    case "metasearch":
      return "google";
    case "unclassified":
      return "altro";
    default:
      return null;
  }
}
function prenotazioniDa(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!isUuid(r.reservation_id)) throw new Error(`reservation_id non valido in curated_reservations: ${String(r.reservation_id).slice(0, 40)}`);
    map.set(r.reservation_id, {
      annullata: r.is_canceled === true || r.booking_status === "CANCELLED" || r.booking_status === "OPTION" || r.is_option === true,
      prenotataIl: day(r.creation_date),
      canale: canaleDa(r.channel_bucket)
    });
  }
  return map;
}
function soggiornoDa(r, pren, oggi) {
  for (const k of ["guest_stay_id", "reservation_id", "property_id"])
    if (!isUuid(r[k])) throw new Error(`${k} non valido in curated_guest_stays: ${String(r[k]).slice(0, 40)}`);
  const rawEmail = str(r.primary_email);
  if (!rawEmail) return { escluso: "nonValida" };
  const email = normalizzaEmail(rawEmail);
  const motivo = emailEsclusa(email);
  if (motivo) return { escluso: motivo };
  const info = pren.get(r.reservation_id);
  if (info?.annullata) return { escluso: "cancellati" };
  const nascita = day(r.birth_date);
  const maggiorenneDal = nascita ? addMonths(nascita, 18 * 12) : null;
  if (maggiorenneDal && maggiorenneDal > oggi) return { escluso: "minori" };
  const dal = day(r.stay_start);
  const al = day(r.stay_end) ?? dal;
  if (!dal || !al) return { escluso: "nonValida" };
  const nazione = str(r.citizenship)?.toUpperCase() ?? null;
  return {
    ok: {
      gsid: r.guest_stay_id,
      rid: r.reservation_id,
      pid: r.property_id,
      nome: capitalizza(str(r.first_name) ?? ""),
      cognome: capitalizza(str(r.last_name) ?? ""),
      email,
      linguaSlope: str(r.language)?.toLowerCase() ?? null,
      nazione: nazione && /^[A-Z]{2}$/.test(nazione) ? nazione : null,
      dal,
      al,
      privacyDal: day(r.privacy_policy_acceptance_date),
      prenotataIl: info?.prenotataIl ?? null,
      canale: info?.canale ?? null,
      maggiorenneDal,
      vistoIl: oggi
    }
  };
}
var nessunEscluso = () => ({ portale: 0, nonValida: 0, interna: 0, minori: 0, cancellati: 0 });
function unisci(prev, oggiLetti, finestraDal, oggi, mesi = CONSERVAZIONE_MESI) {
  const fresh = new Map(oggiLetti.map((s) => [s.gsid, s]));
  const out2 = /* @__PURE__ */ new Map();
  let spariti = 0;
  let precedentiInFinestra = 0;
  for (const s of prev) {
    if (s.dal >= finestraDal) {
      precedentiInFinestra++;
      if (!fresh.has(s.gsid)) {
        spariti++;
        continue;
      }
    }
    out2.set(s.gsid, s);
  }
  let nuovi = 0;
  let aggiornati = 0;
  for (const s of fresh.values()) {
    if (out2.has(s.gsid)) aggiornati++;
    else nuovi++;
    out2.set(s.gsid, s);
  }
  const limite = addMonths(oggi, -mesi);
  let scaduti = 0;
  for (const [k, s] of out2) {
    if (s.al < limite) {
      out2.delete(k);
      scaduti++;
    }
  }
  const soggiorni = [...out2.values()].sort((a, b) => a.dal.localeCompare(b.dal) || a.gsid.localeCompare(b.gsid));
  return { soggiorni, nuovi, aggiornati, spariti, scaduti, precedentiInFinestra };
}
var meseAnno = (iso) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
function contaViaggi(sogg) {
  const s = [...sogg].sort((a, b) => a.dal.localeCompare(b.dal));
  let n = 0;
  let fine = "";
  for (const x of s) {
    if (!n || x.dal > addDays(fine, 1)) {
      n++;
      fine = x.al;
    } else if (x.al > fine) fine = x.al;
  }
  return n;
}
function ospitiDa(soggiorni, oggi) {
  const perEmail = /* @__PURE__ */ new Map();
  for (const s of soggiorni) {
    if (s.maggiorenneDal && s.maggiorenneDal > oggi) continue;
    const l = perEmail.get(s.email);
    if (l) l.push(s);
    else perEmail.set(s.email, [s]);
  }
  const out2 = [];
  for (const [email, list] of perEmail) {
    list.sort((a, b) => a.dal.localeCompare(b.dal) || a.gsid.localeCompare(b.gsid));
    const recente = list[list.length - 1];
    const nome = [...list].reverse().find((s) => s.nome)?.nome ?? "";
    const cognome = [...list].reverse().find((s) => s.cognome)?.cognome ?? "";
    const nazione = [...list].reverse().find((s) => s.nazione)?.nazione ?? null;
    const linguaSlope = [...list].reverse().find((s) => s.linguaSlope && s.linguaSlope !== "it")?.linguaSlope ?? recente.linguaSlope;
    const { lingua, dedotta } = linguaNewsletter(linguaSlope, nazione);
    const caseSet = new Set(list.map((s) => casaDa(s.pid)).filter((k) => k !== null));
    const passati = list.filter((s) => s.dal <= oggi);
    const futuri = list.filter((s) => s.dal > oggi);
    const viaggi = contaViaggi(list);
    const primo = list[0].dal;
    const privacy = list.map((s) => s.privacyDal).filter((d) => !!d).sort()[0] ?? null;
    const prenotata = list.map((s) => s.prenotataIl).filter((d) => !!d).sort()[0] ?? null;
    const clienteNoto = !!privacy && !!prenotata && privacy < addDays(prenotata, -MARGINE_CLIENTE_NOTO);
    const clienteDal = privacy && privacy < primo ? privacy : primo;
    const abituale = viaggi >= 2 || clienteNoto;
    out2.push({
      email,
      nome,
      cognome,
      lingua,
      linguaDedotta: dedotta,
      nazione,
      case: CASE.map((c) => c.key).filter((k) => caseSet.has(k)),
      primo,
      ultimo: passati.length ? passati[passati.length - 1].dal : null,
      prossimo: futuri.length ? futuri[0].dal : null,
      viaggi,
      clienteDal,
      abituale,
      motivoAbituale: viaggi >= 2 ? `${viaggi} soggiorni` : clienteNoto ? `cliente dal ${meseAnno(privacy)}` : null,
      canale: recente.canale,
      soggiorni: list.map((s) => ({ casa: casaDa(s.pid), dal: s.dal, al: s.al }))
    });
  }
  return out2.sort((a, b) => a.email.localeCompare(b.email));
}
function isEnvelope(v) {
  if (typeof v !== "object" || v === null) return false;
  const e = v;
  const enc = e.enc;
  return e.format === 1 && e.app === APP && typeof e.day === "string" && typeof e.generated_at === "string" && !!enc && typeof enc.ct === "string" && typeof enc.iter === "number";
}
function envelopeSenzaDatiInChiaro(e) {
  const { enc: _enc, ...chiaro } = e;
  return !JSON.stringify(chiaro).includes("@");
}

// src/cli/transcript.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
var isRec = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isRec(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function sostanza(input) {
  const rest2 = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "cursor" || v === void 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    rest2[k] = v;
  }
  return canonical(rest2);
}
function transcripts() {
  const found = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          if (depth < 5 && name !== "tool-results") walk(p, depth + 1);
        } else if (name.endsWith(".jsonl")) found.push({ path: p, mtime: st.mtimeMs });
      } catch {
      }
    }
  };
  walk(join(homedir(), ".claude", "projects"), 0);
  return found.sort((a, b) => b.mtime - a.mtime);
}
function findTranscript(token) {
  for (const t of transcripts()) {
    try {
      if (readFileSync(t.path, "utf8").includes(token)) return t.path;
    } catch {
    }
  }
  return null;
}
function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => isRec(b) && typeof b.text === "string" ? b.text : "").join("");
  return "";
}
var SAVED_PATH = /saved to:?\s+(\/\S+?\.(?:txt|json))(?=[.,;)\s]|$)/i;
function asPage(v, depth = 0) {
  if (typeof v === "string") {
    const t = v.trim();
    if (depth > 3 || !/^[{["]/.test(t)) return null;
    try {
      return asPage(JSON.parse(t), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return asPage(v.map((b) => isRec(b) && typeof b.text === "string" ? b.text : "").join(""), depth + 1);
  if (!isRec(v) || !Array.isArray(v.data)) return null;
  const page = isRec(v.page) ? v.page : {};
  const fresh = isRec(v.freshness) ? v.freshness : { overall: { status: "unavailable" }, sources: [] };
  return {
    data: v.data,
    freshness: fresh,
    next: typeof page.next_cursor === "string" && page.next_cursor ? page.next_cursor : null,
    total: typeof page.total === "number" ? page.total : null
  };
}
function parseResult(body, isError) {
  const raw = body.trim();
  const saved = SAVED_PATH.exec(raw);
  if (saved) {
    if (!existsSync(saved[1])) return { page: null, error: `file della risposta non trovato (${basename(saved[1])})` };
    const page2 = asPage(readFileSync(saved[1], "utf8"));
    return page2 ? { page: page2, error: null } : { page: null, error: `file della risposta illeggibile (${basename(saved[1])})` };
  }
  if (isError) return { page: null, error: raw.replace(/\s+/g, " ").slice(0, 160) || "errore dello strumento" };
  if (/OUTPUT TRUNCATED/.test(raw)) return { page: null, error: "risposta troncata nel registro: riesegui la stessa chiamata" };
  const page = asPage(raw);
  return page ? { page, error: null } : { page: null, error: `risposta non riconosciuta (${raw.length} caratteri)` };
}
function readCalls(transcript, since) {
  const byId = /* @__PURE__ */ new Map();
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line || !line.includes("Scatola") && !line.includes("tool_result")) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRec(o) || !isRec(o.message) || !Array.isArray(o.message.content)) continue;
    const at = typeof o.timestamp === "string" ? o.timestamp : "";
    for (const block of o.message.content) {
      if (!isRec(block)) continue;
      if (block.type === "tool_use" && typeof block.name === "string" && /scatola/i.test(block.name) && typeof block.id === "string" && isRec(block.input)) {
        if (block.name.endsWith("query_curated_view") && at >= since)
          byId.set(block.id, { id: block.id, at, tool: "query_curated_view", input: block.input, page: null, error: "nessuna risposta" });
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) Object.assign(call, parseResult(resultText(block.content), block.is_error === true));
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}
function follow(calls, first) {
  const want = sostanza(first);
  const mine = calls.filter((c) => sostanza(c.input) === want);
  const lastError = mine.filter((c) => c.error).pop()?.error ?? null;
  const starts = mine.filter((c) => !c.input.cursor);
  const ok = starts.filter((c) => c.page).pop();
  if (!ok) return { rows: [], freshness: [], total: null, next: first, failures: starts.length, lastError };
  const rows = [];
  const freshness = [];
  let cur = ok;
  for (let guard = 0; guard < 500; guard++) {
    rows.push(...cur.page.data);
    freshness.push(cur.page.freshness);
    const cursor = cur.page.next;
    if (!cursor) return { rows, freshness, total: ok.page.total, next: null, failures: 0, lastError };
    const tries = mine.filter((c) => c.input.cursor === cursor && c.at >= ok.at);
    const good = tries.filter((c) => c.page).pop();
    if (!good) return { rows, freshness, total: ok.page.total, next: { ...first, cursor }, failures: tries.length, lastError };
    cur = good;
  }
  throw new Error("la lettura a pagine non termina");
}

// src/cli/ospiti-cli.ts
var RUN_FILE = join2(tmpdir(), "newsletter-ospiti-run.json");
var CMD = "node tools/ospiti.mjs";
var MAX_TRIES = 3;
var MAX_SPARITI = 0.3;
function out(line) {
  process.stdout.write(`${line}
`);
}
function fail(message) {
  out(`ERRORE ${message}`);
  process.exit(2);
}
var GUEST_ARGS = {
  view: "curated_guest_stays",
  filters: [{ field: "primary_email", op: "neq", value: null }],
  order_by: [{ field: "stay_start", direction: "asc" }],
  limit: 500
};
var reservationArgs = (finestraDal) => ({
  view: "curated_reservations",
  filters: [
    { field: "registered_guests", op: "gt", value: 0 },
    { field: "departure", op: "gte", value: finestraDal }
  ],
  order_by: [{ field: "arrival", direction: "asc" }],
  limit: 500
});
async function leggiStorico(password) {
  if (!existsSync2(FILE)) return null;
  const env = JSON.parse(readFileSync2(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non \xE8 un file della piattaforma newsletter: non procedere.`);
  const archivio = await decryptJson(env.enc, password, aadFor(env.day)).catch(
    () => fail(`la password non apre ${FILE}: \xE8 sbagliata o il file \xE8 alterato. Non procedere, lo storico andrebbe perso.`)
  );
  return { env, archivio };
}
var RANK = { fresh: 0, stale: 1, failing: 2, unavailable: 3 };
function freschezza(list) {
  let status = list.length ? "fresh" : "unavailable";
  let updatedAt = null;
  for (const f of list) {
    for (const s of f.sources) {
      if (s.resource !== "guest_stay" && s.resource !== "lodging_reservation") continue;
      if (RANK[s.status] > RANK[status]) status = s.status;
      if (s.last_success_at && (!updatedAt || s.last_success_at < updatedAt)) updatedAt = s.last_success_at;
    }
  }
  return { status, updatedAt };
}
function loadRun() {
  if (!existsSync2(RUN_FILE)) fail(`nessuna esecuzione avviata: esegui prima ${CMD} start "<PASSWORD>".`);
  return JSON.parse(readFileSync2(RUN_FILE, "utf8"));
}
async function start(args) {
  const password = args.find((a) => !a.startsWith("--"));
  if (!password || password.length < 12) fail(`serve la password: ${CMD} start "<PASSWORD>"`);
  if (!existsSync2("tools/ospiti.mjs")) fail("esegui il comando dalla cartella del repository NewsletterOspiti.");
  const primo = args.includes("--primo");
  const storico = await leggiStorico(password);
  if (!storico && !primo) fail(`${FILE} non c'\xE8: senza storico gli abituali si perdono. Se \xE8 davvero il primo aggiornamento usa --primo.`);
  const ti = args.indexOf("--transcript");
  const run = {
    token: `NL-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1e3).toISOString(),
    password,
    day: romeDay(),
    primo,
    transcript: ti >= 0 ? args[ti + 1] ?? null : null
  };
  writeFileSync(RUN_FILE, JSON.stringify(run), { mode: 384 });
  out(`SEGNO ${run.token}`);
  out(`Giorno ${run.day} \xB7 storico: ${storico ? `${storico.archivio.soggiorni.length} soggiorni (aggiornato il ${storico.env.day})` : "nessuno, primo aggiornamento"}`);
  out(`Ora esegui: ${CMD} next`);
}
async function next() {
  const run = loadRun();
  const transcript = run.transcript ?? findTranscript(run.token);
  if (!transcript) fail(`nessun registro contiene il segno ${run.token}: riesegui start e poi next.`);
  const calls = readCalls(transcript, run.startedAt);
  const ask = (a, chain, what) => {
    if (chain.failures >= MAX_TRIES) fail(`La Scatola non risponde (${what}) dopo ${chain.failures} tentativi: ${chain.lastError ?? "errore"}. Non pubblicare.`);
    out(`CHIAMA mcp__La_Scatola__query_curated_view ${JSON.stringify(a)}`);
    out(`Copia gli argomenti identici, poi riesegui: ${CMD} next`);
    process.exit(0);
  };
  const guests = follow(calls, GUEST_ARGS);
  if (guests.next) ask(guests.next, guests, "soggiorni con email");
  if (!guests.rows.length) fail("La Scatola non ha restituito nessun soggiorno con email. Non pubblicare.");
  if (guests.total !== null && guests.rows.length < guests.total) fail(`lette ${guests.rows.length} righe su ${guests.total}. Non pubblicare.`);
  const finestraDal = guests.rows.map((r) => typeof r.stay_start === "string" ? r.stay_start.slice(0, 10) : "").filter(Boolean).sort()[0];
  if (!finestraDal) fail("nessuna data di inizio soggiorno nelle righe lette. Non pubblicare.");
  const res = follow(calls, reservationArgs(finestraDal));
  if (res.next) ask(res.next, res, "prenotazioni");
  const pren = prenotazioniDa(res.rows);
  const esclusi = { ...nessunEscluso() };
  const letti = /* @__PURE__ */ new Map();
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
  if (!storico && !run.primo) fail(`${FILE} \xE8 sparito durante l'esecuzione. Non pubblicare.`);
  const prev = storico?.archivio.soggiorni ?? [];
  const u = unisci(prev, [...letti.values()], finestraDal, run.day);
  if (u.precedentiInFinestra >= 20 && u.spariti / u.precedentiInFinestra > MAX_SPARITI)
    fail(`spariti ${u.spariti} soggiorni su ${u.precedentiInFinestra} gi\xE0 nello storico per lo stesso periodo: troppi, probabilmente una lettura incompleta. Non pubblicare.`);
  const archivio = { format: 1, day: run.day, finestraDal, conservazioneMesi: CONSERVAZIONE_MESI, soggiorni: u.soggiorni, esclusi };
  const fresh = freschezza([...guests.freshness, ...res.freshness]);
  const envelope = {
    format: 1,
    app: APP,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    scatola_updated_at: fresh.updatedAt,
    freshness: fresh.status,
    day: run.day,
    enc: await encryptJson(archivio, run.password, aadFor(run.day))
  };
  const back = await decryptJson(envelope.enc, run.password, aadFor(run.day));
  if (JSON.stringify(back) !== JSON.stringify(archivio)) fail("la verifica della cifratura non torna. Non pubblicare.");
  if (!envelopeSenzaDatiInChiaro(envelope)) fail("dati personali fuori dal blocco cifrato. Non pubblicare.");
  writeFileSync(FILE, `${JSON.stringify(envelope)}
`);
  const ospiti = ospitiDa(u.soggiorni, run.day);
  const perCasa = CASE.map((c) => `${c.nome} ${ospiti.filter((o) => o.case.includes(c.key)).length}`).join(" \xB7 ");
  const lingue = /* @__PURE__ */ new Map();
  for (const o of ospiti) lingue.set(o.lingua, (lingue.get(o.lingua) ?? 0) + 1);
  const topLingue = [...lingue].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l} ${n}`).join(" \xB7 ");
  out(`RIEPILOGO La Scatola: ${guests.rows.length} soggiorni con email dal ${finestraDal}, ${res.rows.length} prenotazioni lette`);
  out(
    `RIEPILOGO scartati: ${esclusi.portale} email dei portali, ${esclusi.nonValida} non valide, ${esclusi.interna} interne, ${esclusi.minori} minori, ${esclusi.cancellati} prenotazioni cancellate o in opzione`
  );
  if (senzaPrenotazione) out(`RIEPILOGO ATTENZIONE ${senzaPrenotazione} soggiorni senza prenotazione corrispondente (tenuti, canale ignoto)`);
  out(`RIEPILOGO storico: ${u.soggiorni.length} soggiorni (${u.nuovi} nuovi, ${u.aggiornati} aggiornati, ${u.spariti} tolti perch\xE9 spariti da Slope, ${u.scaduti} oltre ${CONSERVAZIONE_MESI} mesi)`);
  out(`RIEPILOGO ospiti unici: ${ospiti.length}, abituali ${ospiti.filter((o) => o.abituale).length} \xB7 ${perCasa}`);
  out(`RIEPILOGO lingue: ${topLingue}`);
  out(`RIEPILOGO La Scatola ${envelope.freshness}${envelope.scatola_updated_at ? `, aggiornata alle ${envelope.scatola_updated_at}` : ""} \xB7 chiamate lette ${calls.length}`);
  out(`PRONTO ${FILE} scritto e verificato`);
}
async function verify(args) {
  const password = args[args.length - 1];
  const file = args.length > 1 ? args[0] : FILE;
  if (!password) fail(`uso: ${CMD} verify "<PASSWORD>"`);
  const env = JSON.parse(readFileSync2(file, "utf8"));
  if (!isEnvelope(env)) fail(`${file} non \xE8 un file della piattaforma newsletter`);
  if (!envelopeSenzaDatiInChiaro(env)) fail("dati personali fuori dal blocco cifrato");
  const a = await decryptJson(env.enc, password, aadFor(env.day)).catch(() => fail("password errata o file alterato"));
  if (a.format !== 1 || a.day !== env.day || !Array.isArray(a.soggiorni)) fail("contenuto incompleto");
  const ids = /* @__PURE__ */ new Set();
  for (const s of a.soggiorni) {
    if (!isUuid(s.gsid) || !isUuid(s.rid) || !isUuid(s.pid)) fail("ID di Slope non validi nello storico");
    if (ids.has(s.gsid)) fail("soggiorno doppio nello storico");
    ids.add(s.gsid);
    if (emailEsclusa(s.email)) fail("nello storico c'\xE8 un'email che andava scartata");
  }
  const ospiti = ospitiDa(a.soggiorni, env.day);
  out(`verifica OK: ${env.day}, ${a.soggiorni.length} soggiorni, ${ospiti.length} ospiti unici, ${ospiti.filter((o) => o.abituale).length} abituali, scritto ${env.generated_at}`);
}
var [cmd, ...rest] = process.argv.slice(2);
var job = cmd === "start" ? () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : null;
if (!job) fail('comandi: start "<PASSWORD>" [--primo] \xB7 next \xB7 verify "<PASSWORD>"');
job().catch((e) => fail(e instanceof Error ? e.message : String(e)));
