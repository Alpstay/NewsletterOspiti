import { aadFor, decryptJson, encryptJson } from "../src/shared/crypto";
import { addMonths, capitalizza, contaViaggi, emailEsclusa, linguaNewsletter, ospitiDa, prenotazioniDa, soggiornoDa, unisci } from "../src/shared/model";
import type { Soggiorno } from "../src/shared/types";
import { eq, fine, ok } from "./assert";

const ACADIA = "11111111-1111-4111-8111-111111111111";
const SASLONG = "33333333-3333-4333-8333-333333333333";
const OGGI = "2026-10-29";

// ── email ──
eq(emailEsclusa("abcde.123456@guest.booking.com"), "portale", "Booking mascherata");
eq(emailEsclusa("zzzz000000@m.expediapartnercentral.com"), "portale", "Expedia mascherata");
eq(emailEsclusa("abc123@guest.airbnb.com"), "portale", "Airbnb mascherata");
eq(emailEsclusa("info@alpstay.eu"), "interna", "interna AlpStay");
eq(emailEsclusa("noemail@gmail.com"), "nonValida", "segnaposto");
eq(emailEsclusa("mario rossi@gmail.com"), "nonValida", "spazio");
eq(emailEsclusa("mario@gmail"), "nonValida", "senza dominio di primo livello");
eq(emailEsclusa("mario.rossi@gmail.com"), null, "valida");
eq(emailEsclusa("123456789@qq.com"), null, "numerica valida");
eq(emailEsclusa("mario.booking@gmail.com"), "portale", "«booking» nel nome dell'indirizzo");
eq(emailEsclusa("info@hotelbooking.it"), "portale", "«booking» nel dominio");
eq(emailEsclusa("Res.EXPEDIA@outlook.com".toLowerCase()), "portale", "«expedia» in qualunque punto");
eq(emailEsclusa("bookkeeping@studio.it"), null, "parole simili non escluse");

// ── nomi ──
eq(capitalizza("MEILIN ZHOU"), "Meilin Zhou", "tutto maiuscolo");
eq(capitalizza("irina petrova"), "Irina Petrova", "tutto minuscolo");
eq(capitalizza("Meier-Lindqvist"), "Meier-Lindqvist", "misto invariato");
eq(capitalizza("VAN DER BERG"), "Van Der Berg", "più parole");
eq(capitalizza("o'NEIL"), "o'NEIL", "misto invariato anche con apostrofo");
eq(capitalizza("ŁUKASZCZYK"), "Łukaszczyk", "lettere non latine");

// ── lingua (regola Colazioni) ──
eq(linguaNewsletter("de", "DE"), { lingua: "de", dedotta: false }, "lingua Slope diversa da it");
eq(linguaNewsletter("it", "IT"), { lingua: "it", dedotta: false }, "it confermato dalla cittadinanza");
eq(linguaNewsletter("it", "HR"), { lingua: "en", dedotta: true }, "it predefinito + paese non previsto → inglese");
eq(linguaNewsletter("it", "AT"), { lingua: "de", dedotta: true }, "it predefinito + Austria → tedesco");
eq(linguaNewsletter(null, "FR"), { lingua: "fr", dedotta: true }, "senza lingua → dalla cittadinanza");
eq(linguaNewsletter("pt", "US"), { lingua: "pt", dedotta: false }, "lingua esplicita vince sulla cittadinanza");

// ── date ──
eq(addMonths("2008-02-29", 216), "2026-03-01", "18 anni da un 29 febbraio");
eq(addMonths("2026-10-29", -24), "2024-10-29", "24 mesi indietro");

// ── righe → soggiorni ──
const pren = prenotazioniDa([
  { reservation_id: "aaaaaaaa-0000-4000-8000-000000000001", booking_status: "CONFIRMED", is_canceled: false, creation_date: "2026-08-01T10:00:00+00:00", channel_bucket: "ota" },
  { reservation_id: "aaaaaaaa-0000-4000-8000-000000000002", booking_status: "CANCELLED", is_canceled: true, creation_date: "2026-08-01T10:00:00+00:00", channel_bucket: "direct" },
]);
const riga = (o: Record<string, unknown>): Record<string, unknown> => ({
  guest_stay_id: "bbbbbbbb-0000-4000-8000-000000000001",
  reservation_id: "aaaaaaaa-0000-4000-8000-000000000001",
  property_id: ACADIA,
  first_name: "ANNA",
  last_name: "huber",
  primary_email: " Anna.Huber@Example.COM ",
  language: "de",
  citizenship: "at",
  stay_start: "2026-09-10",
  stay_end: "2026-09-14",
  birth_date: "1980-05-05",
  privacy_policy_acceptance_date: "2024-12-21",
  ...o,
});
const s1 = soggiornoDa(riga({}), pren, OGGI);
ok("ok" in s1, "riga valida accettata");
if ("ok" in s1) {
  eq(s1.ok.email, "anna.huber@example.com", "email normalizzata");
  eq([s1.ok.nome, s1.ok.cognome], ["Anna", "Huber"], "nomi capitalizzati");
  eq(s1.ok.nazione, "AT", "nazione in maiuscolo");
  eq(s1.ok.canale, "portale", "canale dalla prenotazione");
  eq(s1.ok.prenotataIl, "2026-08-01", "data di prenotazione");
  eq(s1.ok.rid, "aaaaaaaa-0000-4000-8000-000000000001", "ID di Slope identico");
  ok(!("birth_date" in s1.ok) && !("primary_phone_number" in s1.ok), "niente data di nascita né telefono nello storico");
}
eq(soggiornoDa(riga({ primary_email: "x.1@guest.booking.com" }), pren, OGGI), { escluso: "portale" }, "scarta email Booking");
eq(soggiornoDa(riga({ reservation_id: "aaaaaaaa-0000-4000-8000-000000000002" }), pren, OGGI), { escluso: "cancellati" }, "scarta prenotazione cancellata");
eq(soggiornoDa(riga({ birth_date: "2012-01-01" }), pren, OGGI), { escluso: "minori" }, "scarta minorenni");
let errore = "";
try {
  soggiornoDa(riga({ reservation_id: "AAAA-ritoccato" }), pren, OGGI);
} catch (e) {
  errore = String(e);
}
ok(errore.includes("reservation_id non valido"), "un ID trascritto male fa fallire la costruzione");

// ── storico ──
const S = (gsid: string, o: Partial<Soggiorno> = {}): Soggiorno => ({
  gsid,
  rid: "aaaaaaaa-0000-4000-8000-0000000000" + gsid.slice(-2) as string | null,
  pid: ACADIA,
  nome: "Anna",
  cognome: "Huber",
  email: "anna@example.com",
  linguaSlope: "de",
  nazione: "AT",
  dal: "2026-09-10",
  al: "2026-09-14",
  privacyDal: null,
  prenotataIl: null,
  canale: "diretto",
  maggiorenneDal: null,
  vistoIl: OGGI,
  ...o,
});
const vecchio = S("cccccccc-0000-4000-8000-000000000001", { dal: "2026-02-10", al: "2026-02-15" }); // prima della finestra: resta
const sparito = S("cccccccc-0000-4000-8000-000000000002", { dal: "2026-09-20", al: "2026-09-22", email: "b@example.com" }); // in finestra, non più in Slope: si toglie
const scaduto = S("cccccccc-0000-4000-8000-000000000003", { dal: "2024-01-10", al: "2024-01-15" }); // oltre 24 mesi
const aggiornato = S("cccccccc-0000-4000-8000-000000000004", { dal: "2026-10-01", al: "2026-10-03", nome: "Vecchio" });
const u = unisci([vecchio, sparito, scaduto, aggiornato], [S("cccccccc-0000-4000-8000-000000000004", { dal: "2026-10-01", al: "2026-10-03" }), S("cccccccc-0000-4000-8000-000000000005", { dal: "2026-12-27", al: "2027-01-02" })], (s) => s.dal >= "2026-09-06", OGGI);
eq(
  u.soggiorni.map((s) => s.gsid.slice(-1)),
  ["1", "4", "5"],
  "storico: tiene il passato, toglie lo sparito e lo scaduto, aggiorna e aggiunge",
);
eq([u.nuovi, u.aggiornati, u.spariti, u.scaduti], [1, 1, 1, 1], "conteggi dell'unione");
eq(u.soggiorni.find((s) => s.gsid.endsWith("4"))?.nome, "Anna", "vale il dato di oggi");

const sporco = unisci([S("cccccccc-0000-4000-8000-000000000009", { dal: "2026-01-10", al: "2026-01-12", email: "x.booking@gmail.com" })], [], () => false, OGGI);
eq(sporco.soggiorni.length, 0, "lo storico già salvato perde gli indirizzi che contengono booking o expedia");
eq(ospitiDa([S("cccccccc-0000-4000-8000-000000000010", { email: "expedia.fan@gmail.com" })], OGGI).length, 0, "e la pagina non li mostra");

// ── viaggi e abituali ──
eq(contaViaggi([{ dal: "2026-01-01", al: "2026-01-04" }, { dal: "2026-01-04", al: "2026-01-06" }]), 1, "cambio casa nello stesso viaggio = 1");
eq(contaViaggi([{ dal: "2026-01-01", al: "2026-01-04" }, { dal: "2026-02-01", al: "2026-02-03" }]), 2, "due viaggi");
const ospiti = ospitiDa(
  [
    vecchio,
    S("cccccccc-0000-4000-8000-000000000005", { dal: "2026-12-27", al: "2027-01-02", pid: SASLONG }),
    S("cccccccc-0000-4000-8000-000000000006", { email: "nuovo@example.com", linguaSlope: "it", nazione: "IT", privacyDal: "2026-08-01", prenotataIl: "2026-08-01" }),
    S("cccccccc-0000-4000-8000-000000000007", { email: "noto@example.com", linguaSlope: "it", nazione: "DE", privacyDal: "2024-12-21", prenotataIl: "2026-07-01" }),
    S("cccccccc-0000-4000-8000-000000000008", { email: "minore@example.com", maggiorenneDal: "2027-05-01" }),
  ],
  OGGI,
);
const per = (e: string) => ospiti.find((o) => o.email === e);
eq(ospiti.length, 3, "un ospite per email, minori esclusi");
eq([per("anna@example.com")?.abituale, per("anna@example.com")?.motivoAbituale], [true, "2 soggiorni"], "abituale per due soggiorni");
eq(per("anna@example.com")?.case, ["acadia", "saslong"], "case in ordine fisso");
eq([per("anna@example.com")?.ultimo, per("anna@example.com")?.prossimo], ["2026-02-10", "2026-12-27"], "ultimo arrivo e prossimo");
eq(per("nuovo@example.com")?.abituale, false, "prenotazione con informativa dello stesso giorno = nuovo");
eq([per("noto@example.com")?.abituale, per("noto@example.com")?.motivoAbituale], [true, "cliente dal 12/2024"], "informativa precedente alla prenotazione = cliente noto");
eq([per("noto@example.com")?.lingua, per("noto@example.com")?.linguaDedotta], ["de", true], "it predefinito corretto dalla cittadinanza");
eq(per("noto@example.com")?.clienteDal, "2024-12-21", "cliente dal");

// ── cifratura ──
const enc = await encryptJson({ a: 1 }, "password-di-prova-123", aadFor(OGGI), 1000);
eq(await decryptJson(enc, "password-di-prova-123", aadFor(OGGI)), { a: 1 }, "cifra e decifra");
let rifiutata = false;
await decryptJson(enc, "sbagliata-sbagliata", aadFor(OGGI)).catch(() => (rifiutata = true));
ok(rifiutata, "password sbagliata rifiutata");
let altroGiorno = false;
await decryptJson(enc, "password-di-prova-123", aadFor("2026-10-30")).catch(() => (altroGiorno = true));
ok(altroGiorno, "il blocco è legato al giorno scritto in chiaro");

fine("modello");
