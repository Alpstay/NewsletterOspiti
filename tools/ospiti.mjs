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
var BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function nuovaChiave() {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(25));
  const s = Array.from(r, (b) => BASE32[b % 32]).join("");
  return `NLK-${s.match(/.{5}/g).join("-")}`;
}
function normalizzaChiave(raw) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NLK/, "");
  if (s.length !== 25 || [...s].some((c) => !BASE32.includes(c))) return null;
  return `NLK-${s.match(/.{5}/g).join("-")}`;
}
var segreto = (password, chiave) => `${password}\0${normalizzaChiave(chiave) ?? chiave}`;

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
var PAROLE_PORTALE = ["booking", "expedia"];
function emailEsclusa(email) {
  if (!EMAIL.test(email)) return "nonValida";
  const [local, domain] = email.split("@");
  if (SEGNAPOSTO.test(local)) return "nonValida";
  if (PAROLE_PORTALE.some((p) => email.includes(p))) return "portale";
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
var IMPORT_ID = /^imp-[0-9a-f]{16}$/;
function unisci(prev, oggiLetti, copre, oggi, mesi = CONSERVAZIONE_MESI) {
  const fresh = new Map(oggiLetti.map((s) => [s.gsid, s]));
  const out2 = /* @__PURE__ */ new Map();
  let spariti = 0;
  let precedentiInFinestra = 0;
  for (const s of prev) {
    if (s.origine !== "import" && copre(s)) {
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
  for (const [k, s] of out2) if (emailEsclusa(s.email)) out2.delete(k);
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
    if (emailEsclusa(s.email)) continue;
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
    const viaggi = Math.max(contaViaggi(list), ...list.map((s) => s.soggiorniDichiarati ?? 1));
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
  return (e.format === 1 || e.format === 2) && e.app === APP && typeof e.day === "string" && typeof e.generated_at === "string" && !!enc && typeof enc.ct === "string" && typeof enc.iter === "number";
}
function envelopeSenzaDatiInChiaro(e) {
  const { enc: _enc, ...chiaro } = e;
  return !JSON.stringify(chiaro).includes("@");
}
function senzaEsclusi(archivio) {
  const soggiorni = archivio.soggiorni.filter((s) => emailEsclusa(s.email) === null);
  const tolti = archivio.soggiorni.length - soggiorni.length;
  return tolti === 0 ? { archivio, tolti } : { archivio: { ...archivio, soggiorni }, tolti };
}

// src/shared/importa.ts
var SINONIMI = {
  email: ["email", "e-mail", "e mail", "mail", "indirizzo email", "email principale", "primary email", "e-mail-adresse"],
  nome: ["nome", "first name", "firstname", "vorname", "nome ospite"],
  cognome: ["cognome", "last name", "lastname", "surname", "nachname", "cognome ospite"],
  nominativo: ["nominativo", "cliente", "ospite", "intestatario", "nome completo", "full name", "guest", "name"],
  lingua: ["lingua", "language", "sprache", "lingua ospite"],
  nazione: ["cittadinanza", "nazionalita", "nazione", "paese", "country", "citizenship", "nationality", "staatsangehorigkeit", "land"],
  arrivo: [
    "arrivo",
    "data arrivo",
    "check-in",
    "check in",
    "checkin",
    "dal",
    "arrival",
    "anreise",
    "inizio soggiorno",
    "ultimo soggiorno",
    "data ultimo soggiorno",
    "ultimo arrivo",
    "ultima visita",
    "last stay",
    "last arrival",
    "letzter aufenthalt"
  ],
  partenza: ["partenza", "data partenza", "check-out", "check out", "checkout", "al", "departure", "abreise", "fine soggiorno"],
  casa: ["struttura", "hotel", "casa", "property", "proprieta", "esercizio"],
  nascita: ["data di nascita", "nascita", "birth date", "birthdate", "data nascita", "geburtsdatum"],
  soggiorni: ["soggiorni", "numero soggiorni", "n soggiorni", "n soggiorno", "visite", "numero visite", "stays", "number of stays", "aufenthalte", "anzahl aufenthalte"]
};
var norm = (s) => s.normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase().replace(/[_.:°]+/g, " ").replace(/\s+/g, " ").trim();
function mappaColonne(righe) {
  for (let r = 0; r < Math.min(10, righe.length); r++) {
    const intest = righe[r].map(norm);
    const colonne = {};
    for (const campo of Object.keys(SINONIMI)) {
      const i = intest.findIndex((h) => SINONIMI[campo].some((s) => h === norm(s)));
      if (i >= 0) colonne[campo] = i;
    }
    if (colonne.email !== void 0 && colonne.arrivo !== void 0) return { riga: r, colonne };
  }
  return null;
}
function dataDa(v) {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n > 2e4 && n < 8e4) return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}
function dizionario(type, codici) {
  const m = /* @__PURE__ */ new Map();
  for (const loc of ["it", "en", "de"]) {
    let dn = null;
    try {
      dn = new Intl.DisplayNames([loc], { type });
    } catch {
      continue;
    }
    for (const c of codici) {
      try {
        const n = dn.of(c);
        if (n && n !== c && !m.has(norm(n))) m.set(norm(n), c);
      } catch {
      }
    }
  }
  return m;
}
var REGIONI = (() => {
  const out2 = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) out2.push(String.fromCharCode(a, b));
  return out2;
})();
var paesi = null;
var lingue = null;
function nazioneDa(v) {
  const s = v.trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  paesi ??= dizionario("region", REGIONI);
  return paesi.get(norm(s)) ?? null;
}
function linguaDa(v) {
  const s = v.trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}([-_][A-Za-z]{2})?$/.test(s)) return s.slice(0, 2).toLowerCase();
  lingue ??= dizionario("language", ["it", "de", "en", "fr", "es", "nl", "pt", "pl", "cs", "ru", "zh", "ko", "ar", "he", "ja", "hu", "sv", "da", "no", "fi", "ro", "sk", "sl", "hr", "el", "tr", "uk"]);
  return lingue.get(norm(s)) ?? null;
}
function casaIdDa(v) {
  const s = norm(v);
  return CASE.find((c) => s.includes(c.key))?.id ?? null;
}
async function sha16(testo) {
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function importaRighe(righe, oggi, esistenti, casaPredefinita) {
  const mappa = mappaColonne(righe);
  if (!mappa)
    throw new Error("intestazione non riconosciuta: servono almeno una colonna \xABEmail\xBB e una colonna con la data (es. \xABArrivo\xBB o \xABUltimo soggiorno\xBB)");
  const c = mappa.colonne;
  const cella = (r, k) => c[k] !== void 0 ? r[c[k]] ?? "" : "";
  const esclusi = { portale: 0, nonValida: 0, interna: 0, minori: 0, cancellati: 0 };
  let illeggibili = 0;
  let giaPresenti = 0;
  let troppoVecchie = 0;
  const daScatola = /* @__PURE__ */ new Map();
  for (const s of esistenti)
    if (s.origine !== "import") {
      const k = `${s.email}|${s.pid}`;
      const l = daScatola.get(k);
      if (l) l.push(s);
      else daScatola.set(k, [s]);
    }
  const out2 = /* @__PURE__ */ new Map();
  const limite = addMonths(oggi, -24);
  const dati = righe.slice(mappa.riga + 1).filter((r) => r.some((x) => x !== ""));
  for (const r of dati) {
    const grezza = cella(r, "email");
    if (!grezza) {
      esclusi.nonValida++;
      continue;
    }
    const email = normalizzaEmail(grezza);
    const motivo = emailEsclusa(email);
    if (motivo) {
      esclusi[motivo]++;
      continue;
    }
    const dal = dataDa(cella(r, "arrivo"));
    const pid = (c.casa !== void 0 ? casaIdDa(cella(r, "casa")) : null) ?? casaPredefinita;
    if (!dal || !pid) {
      illeggibili++;
      continue;
    }
    const alLetto = dataDa(cella(r, "partenza"));
    const al = alLetto && alLetto >= dal ? alLetto : dal;
    if (al < limite) {
      troppoVecchie++;
      continue;
    }
    const nascita = dataDa(cella(r, "nascita"));
    const maggiorenneDal = nascita ? addMonths(nascita, 18 * 12) : null;
    if (maggiorenneDal && maggiorenneDal > oggi) {
      esclusi.minori++;
      continue;
    }
    if ((daScatola.get(`${email}|${pid}`) ?? []).some((s) => s.dal <= addDays(al, 1) && s.al >= addDays(dal, -1))) {
      giaPresenti++;
      continue;
    }
    let nome = capitalizza(cella(r, "nome"));
    const cognome = capitalizza(cella(r, "cognome"));
    if (!nome && !cognome) nome = capitalizza(cella(r, "nominativo"));
    const n = Number.parseInt(cella(r, "soggiorni"), 10);
    const gsid = `imp-${await sha16(`${email}|${pid}|${dal}`)}`;
    out2.set(gsid, {
      gsid,
      rid: null,
      pid,
      nome,
      cognome,
      email,
      linguaSlope: linguaDa(cella(r, "lingua")),
      nazione: nazioneDa(cella(r, "nazione")),
      dal,
      al,
      privacyDal: null,
      prenotataIl: null,
      canale: null,
      maggiorenneDal,
      vistoIl: oggi,
      origine: "import",
      ...Number.isFinite(n) && n > 1 ? { soggiorniDichiarati: Math.min(n, 999) } : {}
    });
  }
  return { soggiorni: [...out2.values()], righe: dati.length, esclusi, illeggibili, giaPresenti, troppoVecchie, colonne: c };
}
async function importaPacchetto(file, oggi, esistenti) {
  const soggiorni = [];
  const esiti = [];
  for (const f of file) {
    const esito = await importaRighe(f.righe, oggi, esistenti, f.casa);
    if (esito.colonne.casa === void 0 && !f.casa) throw new Error(`${f.nome}: manca la colonna \xABStruttura\xBB e non \xE8 indicata la casa`);
    soggiorni.push(...esito.soggiorni);
    esiti.push({ nome: f.nome, esito });
  }
  return { soggiorni, esiti };
}
function riassuntoEsito(nome, e) {
  const x = e.esclusi;
  return `${nome}: ${e.righe} righe \u2192 ${e.soggiorni.length} importate \xB7 scartate ${x.portale} email dei portali, ${x.nonValida} senza email valida, ${x.interna} interne, ${x.minori} minori, ${e.illeggibili} senza data o casa, ${e.troppoVecchie} oltre 24 mesi \xB7 ${e.giaPresenti} gi\xE0 presenti da La Scatola`;
}

// src/shared/disiscritti.ts
var IMPRONTA = /^[0-9a-f]{64}$/;
async function impronta(email) {
  const dati = new TextEncoder().encode(normalizzaEmail(email));
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", dati));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
var elencoDisiscritti = (a) => (a.disiscritti ?? []).filter((d) => IMPRONTA.test(d.h));
function indirizziDa(testo) {
  const visti = /* @__PURE__ */ new Set();
  for (const parte of testo.split(/[\s,;<>"']+/)) {
    const e = normalizzaEmail(parte.replace(/^mailto:/i, ""));
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) visti.add(e);
  }
  return [...visti];
}
async function disiscrivi(archivio, emails, oggi) {
  const lista = [...elencoDisiscritti(archivio)];
  const presenti = new Set(lista.map((d) => d.h));
  const righe = [];
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
async function riattiva(archivio, email) {
  const h = await impronta(email);
  const lista = elencoDisiscritti(archivio);
  const resto = lista.filter((d) => d.h !== h);
  return { archivio: { ...archivio, disiscritti: resto }, trovato: resto.length !== lista.length };
}
async function pulisci(grezzo) {
  const { archivio, tolti } = senzaEsclusi(grezzo);
  const lista = elencoDisiscritti(archivio);
  if (!lista.length) return { archivio: { ...archivio, disiscritti: [] }, esclusi: tolti, cancellati: 0 };
  const vietate = new Set(lista.map((d) => d.h));
  const impronte = /* @__PURE__ */ new Map();
  for (const s of archivio.soggiorni) if (!impronte.has(s.email)) impronte.set(s.email, await impronta(s.email));
  const soggiorni = archivio.soggiorni.filter((s) => !vietate.has(impronte.get(s.email)));
  return { archivio: { ...archivio, soggiorni, disiscritti: lista }, esclusi: tolti, cancellati: archivio.soggiorni.length - soggiorni.length };
}
async function soggiorniCancellati(archivio) {
  const vietate = new Set(elencoDisiscritti(archivio).map((d) => d.h));
  if (!vietate.size) return 0;
  let n = 0;
  for (const s of archivio.soggiorni) if (vietate.has(await impronta(s.email))) n++;
  return n;
}

// src/shared/tabella.ts
var u16 = (b, p) => b[p] | b[p + 1] << 8;
var u32 = (b, p) => (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0;
var utf8 = new TextDecoder("utf-8");
async function voci(buf, inflate) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (u32(buf, i) === 101010256) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("il file non \xE8 un .xlsx valido");
  const n = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const out2 = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    if (u32(buf, p) !== 33639248) throw new Error("file .xlsx danneggiato");
    const metodo = u16(buf, p + 10);
    const compresso = u32(buf, p + 20);
    const lNome = u16(buf, p + 28);
    const lExtra = u16(buf, p + 30);
    const lComm = u16(buf, p + 32);
    const locale = u32(buf, p + 42);
    const nome = utf8.decode(buf.subarray(p + 46, p + 46 + lNome));
    p += 46 + lNome + lExtra + lComm;
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(nome)) continue;
    const inizio = locale + 30 + u16(buf, locale + 26) + u16(buf, locale + 28);
    const dati = buf.subarray(inizio, inizio + compresso);
    if (metodo !== 0 && metodo !== 8) throw new Error(`compressione non supportata nel file .xlsx (${metodo})`);
    out2.set(nome, utf8.decode(metodo === 0 ? dati : await inflate(dati)));
  }
  return out2;
}
var unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
var testi = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
function colonna(ref) {
  let n = 0;
  for (const c of /^[A-Z]+/.exec(ref)?.[0] ?? "A") n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
async function leggiXlsx(buf, inflate) {
  const z = await voci(buf, inflate);
  const stringhe = [...(z.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => testi(m[1]));
  const wb = z.get("xl/workbook.xml") ?? "";
  const rels = z.get("xl/_rels/workbook.xml.rels") ?? "";
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const rel = rid ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`)) : void 0;
  const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : void 0;
  const percorso = target ? target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}` : "xl/worksheets/sheet1.xml";
  const foglio = z.get(percorso) ?? z.get("xl/worksheets/sheet1.xml");
  if (!foglio) throw new Error("primo foglio non trovato nel file .xlsx");
  const righe = [];
  for (const r of foglio.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const riga = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = c[1];
      const corpo = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attr)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(attr)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let val = "";
      if (tipo === "s" && v !== void 0) val = stringhe[Number(v)] ?? "";
      else if (tipo === "inlineStr") val = testi(corpo);
      else if (v !== void 0) val = unescape(v);
      riga[ref ? colonna(ref) : riga.length] = val.trim();
    }
    righe.push(Array.from(riga, (x) => x ?? ""));
  }
  return righe;
}
function leggiCsv(testo) {
  const t = testo.replace(/^﻿/, "");
  const primaRiga = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", ",", "	"].sort((a, b) => primaRiga.split(b).length - primaRiga.split(a).length)[0];
  const righe = [];
  let riga = [];
  let campo = "";
  let virgolette = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (virgolette) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') virgolette = false;
      else campo += ch;
    } else if (ch === '"') virgolette = true;
    else if (ch === sep) {
      riga.push(campo.trim());
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      riga.push(campo.trim());
      righe.push(riga);
      riga = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || riga.length) {
    riga.push(campo.trim());
    righe.push(riga);
  }
  return righe.filter((r) => r.some((c) => c !== ""));
}
async function leggiTabella(nome, buf, inflate) {
  if (/\.xls$/i.test(nome)) throw new Error(`${nome}: il vecchio formato .xls non \xE8 supportato, salva il file come .xlsx`);
  if (/\.xlsx$/i.test(nome) || buf[0] === 80 && buf[1] === 75) return leggiXlsx(buf, inflate);
  return leggiCsv(utf8.decode(buf));
}

// src/cli/ospiti-cli.ts
import { inflateRawSync } from "node:zlib";

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
var GIORNI_INCREMENTALE = 7;
function out(line) {
  process.stdout.write(`${line}
`);
}
function fail(message) {
  out(`ERRORE ${message}`);
  process.exit(2);
}
var GUEST_FILTER = { field: "primary_email", op: "neq", value: null };
function guestArgs(run) {
  return {
    view: "curated_guest_stays",
    filters: run.completo ? [GUEST_FILTER] : [GUEST_FILTER, { field: "stay_end", op: "gte", value: addDays(run.day, -GIORNI_INCREMENTALE) }],
    order_by: [{ field: "stay_start", direction: "asc" }],
    limit: 500
  };
}
var reservationArgs = (dal) => ({
  view: "curated_reservations",
  filters: [
    { field: "registered_guests", op: "gt", value: 0 },
    { field: "departure", op: "gte", value: dal }
  ],
  order_by: [{ field: "arrival", direction: "asc" }],
  limit: 500
});
function argomenti(args, conValore) {
  const pos = [];
  const opt = /* @__PURE__ */ new Map();
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
function credenziali(pos, uso) {
  const [password, chiaveGrezza] = pos;
  if (!password || password.length < 12 || !chiaveGrezza) fail(`servono password e chiave: ${CMD} ${uso}`);
  const chiave = normalizzaChiave(chiaveGrezza);
  if (!chiave) fail("la chiave del computer non \xE8 valida (forma NLK-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX).");
  return { password, chiave };
}
var segretoPer = (env, password, chiave) => env.format === 2 ? segreto(password, chiave ?? "") : password;
async function leggiStorico(sgr, password) {
  if (!existsSync2(FILE)) return null;
  const env = JSON.parse(readFileSync2(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non \xE8 un file della piattaforma newsletter: non procedere.`);
  const s = env.format === 1 && password ? password : sgr;
  const archivio = await decryptJson(env.enc, s, aadFor(env.day)).catch(
    () => fail(`password o chiave non aprono ${FILE}: sono sbagliate o il file \xE8 alterato. Non procedere, lo storico andrebbe perso.`)
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
async function scrivi(grezzo, sgr, fresh, prima) {
  const visti = /* @__PURE__ */ new Set();
  const lista = [...elencoDisiscritti(grezzo), ...prima ? elencoDisiscritti(prima) : []].filter((d) => !visti.has(d.h) && visti.add(d.h));
  const { archivio, esclusi, cancellati } = await pulisci({ ...grezzo, disiscritti: lista });
  if (esclusi > 0) out(`RIEPILOGO esclusi dallo storico per le regole attuali (booking/expedia, portali, non validi): ${esclusi}`);
  if (cancellati > 0) out(`RIEPILOGO tolti dallo storico perch\xE9 nella lista di cancellazione: ${cancellati} soggiorni`);
  if (await soggiorniCancellati(archivio)) fail("nello storico resta un indirizzo cancellato dalla newsletter. Non pubblicare.");
  const envelope = {
    format: 2,
    app: APP,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    scatola_updated_at: fresh.updatedAt,
    freshness: fresh.status,
    day: archivio.day,
    enc: await encryptJson(archivio, sgr, aadFor(archivio.day))
  };
  const back = await decryptJson(envelope.enc, sgr, aadFor(archivio.day));
  if (JSON.stringify(back) !== JSON.stringify(archivio)) fail("la verifica della cifratura non torna. Non pubblicare.");
  if (!envelopeSenzaDatiInChiaro(envelope)) fail("dati personali fuori dal blocco cifrato. Non pubblicare.");
  writeFileSync(FILE, `${JSON.stringify(envelope)}
`);
  return envelope;
}
function riepilogoOspiti(soggiorni, day2) {
  const ospiti = ospitiDa(soggiorni, day2);
  const perCasa = CASE.map((c) => `${c.nome} ${ospiti.filter((o) => o.case.includes(c.key)).length}`).join(" \xB7 ");
  const lingue2 = /* @__PURE__ */ new Map();
  for (const o of ospiti) lingue2.set(o.lingua, (lingue2.get(o.lingua) ?? 0) + 1);
  const topLingue = [...lingue2].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l} ${n}`).join(" \xB7 ");
  out(`RIEPILOGO ospiti unici: ${ospiti.length}, abituali ${ospiti.filter((o) => o.abituale).length} \xB7 ${perCasa}`);
  out(`RIEPILOGO lingue: ${topLingue}`);
}
var riepilogoStorico = (u, importati = 0) => `RIEPILOGO storico: ${u.soggiorni.length} soggiorni (${u.nuovi} nuovi, ${u.aggiornati} aggiornati, ${u.spariti} tolti perch\xE9 spariti da Slope, ${u.scaduti} oltre ${CONSERVAZIONE_MESI} mesi${importati ? `, ${importati} importati in tutto` : ""})`;
function loadRun() {
  if (!existsSync2(RUN_FILE)) fail(`nessuna esecuzione avviata: esegui prima ${CMD} start "<PASSWORD>" "<CHIAVE>".`);
  return JSON.parse(readFileSync2(RUN_FILE, "utf8"));
}
async function start(args) {
  const { pos, opt } = argomenti(args, ["transcript"]);
  const { password, chiave } = credenziali(pos, 'start "<PASSWORD>" "<CHIAVE>"');
  const sgr = segreto(password, chiave);
  if (!existsSync2("tools/ospiti.mjs")) fail("esegui il comando dalla cartella del repository NewsletterOspiti.");
  const primo = opt.has("primo");
  const storico = await leggiStorico(sgr, password);
  if (!storico && !primo) fail(`${FILE} non c'\xE8: senza storico gli abituali si perdono. Se \xE8 davvero il primo aggiornamento usa --primo.`);
  const day2 = romeDay();
  const completo = opt.has("completo") || !storico || day2.endsWith("-01");
  const tr = opt.get("transcript");
  const run = {
    token: `NL-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1e3).toISOString(),
    segreto: sgr,
    day: day2,
    primo,
    completo,
    transcript: typeof tr === "string" && tr ? tr : null
  };
  writeFileSync(RUN_FILE, JSON.stringify(run), { mode: 384 });
  out(`SEGNO ${run.token}`);
  out(
    `Giorno ${day2} \xB7 aggiornamento ${completo ? "COMPLETO (tutta la finestra di La Scatola, ~40 chiamate)" : `INCREMENTALE (soggiorni che finiscono dal ${addDays(day2, -GIORNI_INCREMENTALE)} in poi, poche chiamate)`} \xB7 storico: ${storico ? `${storico.archivio.soggiorni.length} soggiorni (aggiornato il ${storico.env.day})` : "nessuno, primo aggiornamento"}`
  );
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
  const guests = follow(calls, guestArgs(run));
  if (guests.next) ask(guests.next, guests, "soggiorni con email");
  if (run.completo && !guests.rows.length) fail("La Scatola non ha restituito nessun soggiorno con email. Non pubblicare.");
  if (guests.total !== null && guests.rows.length < guests.total) fail(`lette ${guests.rows.length} righe su ${guests.total}. Non pubblicare.`);
  const primoInizio = guests.rows.map((r) => typeof r.stay_start === "string" ? r.stay_start.slice(0, 10) : "").filter(Boolean).sort()[0];
  const daIncr = addDays(run.day, -GIORNI_INCREMENTALE);
  if (run.completo && !primoInizio) fail("nessuna data di inizio soggiorno nelle righe lette. Non pubblicare.");
  const resDal = run.completo ? primoInizio : primoInizio && primoInizio < daIncr ? primoInizio : daIncr;
  const res = follow(calls, reservationArgs(resDal));
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
  const storico = run.primo ? null : await leggiStorico(run.segreto);
  if (!storico && !run.primo) fail(`${FILE} \xE8 sparito durante l'esecuzione. Non pubblicare.`);
  const prev = storico?.archivio.soggiorni ?? [];
  const copre = run.completo ? (s) => s.dal >= primoInizio : (s) => s.al >= daIncr;
  const u = unisci(prev, [...letti.values()], copre, run.day);
  if (u.precedentiInFinestra >= 20 && u.spariti / u.precedentiInFinestra > MAX_SPARITI)
    fail(`spariti ${u.spariti} soggiorni su ${u.precedentiInFinestra} gi\xE0 nello storico per lo stesso periodo: troppi, probabilmente una lettura incompleta. Non pubblicare.`);
  const archivio = {
    format: 1,
    day: run.day,
    finestraDal: run.completo ? primoInizio : storico?.archivio.finestraDal ?? null,
    conservazioneMesi: CONSERVAZIONE_MESI,
    soggiorni: u.soggiorni,
    esclusi: run.completo ? esclusi : storico?.archivio.esclusi ?? esclusi,
    disiscritti: storico?.archivio.disiscritti ?? []
  };
  const envelope = await scrivi(archivio, run.segreto, freschezza([...guests.freshness, ...res.freshness]), storico?.archivio ?? null);
  out(`RIEPILOGO aggiornamento ${run.completo ? "completo" : "incrementale"}: ${guests.rows.length} soggiorni con email letti${run.completo ? ` dal ${primoInizio}` : ` (fine soggiorno dal ${daIncr})`}, ${res.rows.length} prenotazioni lette`);
  out(
    `RIEPILOGO scartati: ${esclusi.portale} email dei portali, ${esclusi.nonValida} non valide, ${esclusi.interna} interne, ${esclusi.minori} minori, ${esclusi.cancellati} prenotazioni cancellate o in opzione`
  );
  if (senzaPrenotazione) out(`RIEPILOGO ATTENZIONE ${senzaPrenotazione} soggiorni senza prenotazione corrispondente (tenuti, canale ignoto)`);
  out(riepilogoStorico(u, u.soggiorni.filter((s) => s.origine === "import").length));
  riepilogoOspiti(u.soggiorni, run.day);
  out(`RIEPILOGO La Scatola ${envelope.freshness}${envelope.scatola_updated_at ? `, aggiornata alle ${envelope.scatola_updated_at}` : ""} \xB7 chiamate lette ${calls.length}`);
  out(`PRONTO ${FILE} scritto e verificato`);
}
async function importa(args) {
  const { pos, opt } = argomenti(args, ["hartmann", "acadia", "saslong", "file"]);
  const { password, chiave } = credenziali(pos, 'importa "<PASSWORD>" "<CHIAVE>" --hartmann h.xlsx --acadia a.xlsx --saslong s.xlsx');
  const sgr = segreto(password, chiave);
  const richieste = [];
  for (const c of CASE) {
    const f = opt.get(c.key);
    if (typeof f === "string" && f) richieste.push({ nome: f, casa: c.id });
  }
  const tutto = opt.get("file");
  if (typeof tutto === "string" && tutto) richieste.push({ nome: tutto, casa: null });
  if (!richieste.length) fail(`indica almeno un file: --hartmann, --acadia, --saslong (uno per casa) oppure --file con una colonna \xABStruttura\xBB.`);
  for (const r of richieste) if (!existsSync2(r.nome)) fail(`file non trovato: ${r.nome}`);
  const storico = await leggiStorico(sgr, password);
  if (!storico) fail(`${FILE} non c'\xE8: fai prima un aggiornamento da La Scatola, poi importa.`);
  const day2 = romeDay();
  const file = [];
  for (const r of richieste) {
    const righe = await leggiTabella(r.nome, new Uint8Array(readFileSync2(r.nome)), async (d) => new Uint8Array(inflateRawSync(d)));
    const m = mappaColonne(righe);
    out(`RIEPILOGO ${r.nome}: colonne ${m ? Object.entries(m.colonne).map(([k, i]) => `${k}=${String.fromCharCode(65 + i)}`).join(" ") : "NON RICONOSCIUTE"}`);
    file.push({ nome: r.nome, casa: r.casa, righe });
  }
  const pac = await importaPacchetto(file, day2, storico.archivio.soggiorni).catch((e) => fail(e instanceof Error ? e.message : String(e)));
  for (const e of pac.esiti) out(`RIEPILOGO ${riassuntoEsito(e.nome, e.esito)}`);
  if (!pac.soggiorni.length) fail("nessun soggiorno importabile nei file indicati. Niente da pubblicare.");
  const u = unisci(storico.archivio.soggiorni, pac.soggiorni, () => false, day2);
  const archivio = { ...storico.archivio, day: day2, soggiorni: u.soggiorni };
  await scrivi(archivio, sgr, { status: storico.env.freshness, updatedAt: storico.env.scatola_updated_at }, storico.archivio);
  out(riepilogoStorico(u, u.soggiorni.filter((s) => s.origine === "import").length));
  riepilogoOspiti(u.soggiorni, day2);
  out(`PRONTO ${FILE} scritto e verificato`);
}
async function cambia(args) {
  const [pw, ch, nuovaPw, nuovaCh] = args;
  if (!pw || !ch || !nuovaPw || !nuovaCh) fail(`uso: ${CMD} cambia "<PASSWORD>" "<CHIAVE o ->" "<NUOVA PASSWORD>" "<NUOVA CHIAVE>"`);
  if (nuovaPw.length < 12) fail("la nuova password deve avere almeno 12 caratteri.");
  const nuova = normalizzaChiave(nuovaCh);
  if (!nuova) fail("la nuova chiave non \xE8 valida: generane una con \xABchiave\xBB.");
  if (!existsSync2(FILE)) fail(`${FILE} non c'\xE8.`);
  const env = JSON.parse(readFileSync2(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non \xE8 un file della piattaforma newsletter.`);
  const vecchio = segretoPer(env, pw, ch === "-" ? null : normalizzaChiave(ch));
  const archivio = await decryptJson(env.enc, vecchio, aadFor(env.day)).catch(() => fail("password o chiave attuali errate."));
  await scrivi(archivio, segreto(nuovaPw, nuova), { status: env.freshness, updatedAt: env.scatola_updated_at }, archivio);
  out(`PRONTO ${FILE} ricifrato con le nuove credenziali (doppio controllo). Aggiorna il testo dell'attivit\xE0 pianificata e comunica le nuove credenziali di persona.`);
}
async function cancella(args) {
  const { pos, opt } = argomenti(args, []);
  const riattivare = opt.has("riattiva");
  const { password, chiave } = credenziali(pos, 'cancella "<PASSWORD>" "<CHIAVE>" email1 [email2 \u2026] [--riattiva]');
  const emails = indirizziDa(pos.slice(2).join(" "));
  if (!emails.length) fail("indica almeno un indirizzo email.");
  const sgr = segreto(password, chiave);
  const storico = await leggiStorico(sgr, password);
  if (!storico) fail(`${FILE} non c'\xE8.`);
  const fresh = { status: storico.env.freshness, updatedAt: storico.env.scatola_updated_at };
  if (riattivare) {
    if (emails.length !== 1) fail("--riattiva vale per un indirizzo alla volta.");
    const r2 = await riattiva(storico.archivio, emails[0]);
    if (!r2.trovato) fail("l'indirizzo non \xE8 nella lista di cancellazione.");
    await scrivi(r2.archivio, sgr, fresh, null);
    out("PRONTO indirizzo tolto dalla lista di cancellazione (rientrer\xE0 con i prossimi soggiorni).");
    return;
  }
  const r = await disiscrivi(storico.archivio, emails, romeDay());
  await scrivi(r.archivio, sgr, fresh, storico.archivio);
  const nuovi = r.righe.filter((x) => !x.gia).length;
  out(`RIEPILOGO cancellati ${nuovi} indirizzi (${r.righe.length - nuovi} erano gi\xE0 nella lista), tolti ${r.righe.reduce((t, x) => t + x.soggiorni, 0)} soggiorni dallo storico`);
  out(`PRONTO ${FILE} scritto e verificato`);
}
async function verify(args) {
  const { password, chiave } = credenziali(args, 'verify "<PASSWORD>" "<CHIAVE>"');
  const env = JSON.parse(readFileSync2(FILE, "utf8"));
  if (!isEnvelope(env)) fail(`${FILE} non \xE8 un file della piattaforma newsletter`);
  if (env.format !== 2) fail(`${FILE} \xE8 ancora nel vecchio formato a sola password: esegui \xABcambia\xBB.`);
  if (!envelopeSenzaDatiInChiaro(env)) fail("dati personali fuori dal blocco cifrato");
  const a = await decryptJson(env.enc, segreto(password, chiave), aadFor(env.day)).catch(() => fail("password o chiave errate, o file alterato"));
  if (a.format !== 1 || a.day !== env.day || !Array.isArray(a.soggiorni)) fail("contenuto incompleto");
  const ids = /* @__PURE__ */ new Set();
  for (const s of a.soggiorni) {
    const importato = s.origine === "import";
    if (importato ? !IMPORT_ID.test(s.gsid) || s.rid !== null : !isUuid(s.gsid) || !isUuid(s.rid)) fail("ID di Slope non validi nello storico");
    if (!isUuid(s.pid)) fail("property_id non valido nello storico");
    if (ids.has(s.gsid)) fail("soggiorno doppio nello storico");
    ids.add(s.gsid);
    if (emailEsclusa(s.email)) fail("nello storico c'\xE8 un'email che andava scartata");
  }
  if (await soggiorniCancellati(a)) fail("nello storico c'\xE8 un indirizzo cancellato dalla newsletter");
  const ospiti = ospitiDa(a.soggiorni, env.day);
  const imp = a.soggiorni.filter((s) => s.origine === "import").length;
  out(
    `verifica OK: ${env.day}, ${a.soggiorni.length} soggiorni${imp ? ` (${imp} importati)` : ""}, ${ospiti.length} ospiti unici, ${ospiti.filter((o) => o.abituale).length} abituali, ${elencoDisiscritti(a).length} indirizzi cancellati dalla newsletter, scritto ${env.generated_at}`
  );
}
var [cmd, ...rest] = process.argv.slice(2);
var job = cmd === "start" ? () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : cmd === "importa" ? () => importa(rest) : cmd === "cambia" ? () => cambia(rest) : cmd === "cancella" ? () => cancella(rest) : cmd === "chiave" ? async () => out(nuovaChiave()) : null;
if (!job) fail('comandi: start "<PASSWORD>" "<CHIAVE>" [--completo] [--primo] \xB7 next \xB7 verify \xB7 importa \xB7 cancella \xB7 cambia \xB7 chiave (vedi tools/AGGIORNA.md)');
job().catch((e) => fail(e instanceof Error ? e.message : String(e)));
export {
  guestArgs,
  reservationArgs
};
