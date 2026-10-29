import { mkdirSync, writeFileSync } from "node:fs";
import { conControllo, emailControllo, fogli } from "../src/app/export";
import { ORDINE_PREDEFINITO, filtra, filtriVuoti, ordina, presetPeriodo } from "../src/app/filters";
import type { Filtri, Nomi } from "../src/app/filters";
import { creaXlsx, crc32, nomeFoglio, serialeData } from "../src/app/xlsx";
import type { Ospite } from "../src/shared/types";
import { eq, fine, ok } from "./assert";

const nomi: Nomi = { lingua: (c) => ({ de: "Tedesco", en: "Inglese", it: "Italiano" })[c] ?? c, nazione: (c) => c ?? "Senza nazione" };
const O = (email: string, o: Partial<Ospite> = {}): Ospite => ({
  email,
  nome: "N",
  cognome: email,
  lingua: "it",
  linguaDedotta: false,
  nazione: "IT",
  case: ["saslong"],
  primo: "2026-02-01",
  ultimo: "2026-02-01",
  prossimo: null,
  viaggi: 1,
  clienteDal: "2026-02-01",
  abituale: false,
  motivoAbituale: null,
  canale: "diretto",
  soggiorni: [{ casa: "saslong", dal: "2026-02-01", al: "2026-02-04" }],
  ...o,
});
const lista = [
  O("a@x.it", { lingua: "de", nazione: "DE" }),
  O("b@x.it", { lingua: "de", nazione: "AT", abituale: true, viaggi: 2 }),
  O("c@x.it", { lingua: "en", nazione: "GB", case: ["acadia"], soggiorni: [{ casa: "acadia", dal: "2026-07-10", al: "2026-07-12" }], canale: "portale" }),
  O("d@x.it", { lingua: "it", nazione: null, soggiorni: [{ casa: "saslong", dal: "2026-07-01", al: "2026-07-03" }] }),
  O("e@x.it", { lingua: "de", nazione: "DE", soggiorni: [{ casa: "saslong", dal: "2026-08-20", al: "2026-08-25" }], abituale: true }),
];
const F = (o: Partial<Filtri>): Filtri => ({ ...filtriVuoti(), ...o });

eq(filtra(lista, F({})).length, 5, "senza filtri tutti");
eq(filtra(lista, F({ lingue: new Set(["de"]) })).map((o) => o.email), ["a@x.it", "b@x.it", "e@x.it"], "filtro lingua");
eq(filtra(lista, F({ abituali: "si" })).map((o) => o.email), ["b@x.it", "e@x.it"], "solo abituali");
eq(filtra(lista, F({ abituali: "no" })).length, 3, "solo nuovi");
eq(filtra(lista, F({ case: new Set(["acadia"]) })).map((o) => o.email), ["c@x.it"], "filtro casa");
eq(filtra(lista, F({ da: "2026-06-01", a: "2026-07-31" })).map((o) => o.email), ["c@x.it", "d@x.it"], "filtro periodo");
eq(filtra(lista, F({ case: new Set(["saslong"]), da: "2026-07-05", a: "2026-07-31" })).length, 0, "casa e periodo sullo stesso soggiorno");
eq(filtra(lista, F({ nazioni: new Set([""]) })).map((o) => o.email), ["d@x.it"], "senza nazione");
eq(filtra(lista, F({ canali: new Set(["portale"]) })).map((o) => o.email), ["c@x.it"], "filtro canale");
eq(filtra([O("z@x.it", { nome: "Jürgen", cognome: "Müller" })], F({ testo: "muller" })).length, 1, "ricerca senza accenti");

eq(
  ordina(lista, ORDINE_PREDEFINITO, nomi).map((o) => o.email),
  ["c@x.it", "d@x.it", "b@x.it", "e@x.it", "a@x.it"],
  "ordine predefinito: lingua, poi nazione, poi data più recente",
);
eq(
  ordina(lista, [{ criterio: "abituale", verso: 1 }, ...ORDINE_PREDEFINITO.filter((o) => o.criterio !== "abituale")], nomi).slice(0, 2).map((o) => o.email),
  ["b@x.it", "e@x.it"],
  "abituali in testa quando hanno la priorità",
);

const p = presetPeriodo("2026-10-29");
eq(p.find((x) => x.id === "inverno"), { id: "inverno", etichetta: "Inverno 2025/26", da: "2025-12-01", a: "2026-03-31" }, "inverno appena finito");
eq(p.find((x) => x.id === "estate")?.da, "2026-05-15", "estate in corso");
eq(presetPeriodo("2026-12-10").find((x) => x.id === "inverno")?.da, "2026-12-01", "inverno in corso");

// ── Excel ──
eq(serialeData("2026-10-29"), 46324, "data Excel");
eq(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "CRC32 di riferimento");
const usati = new Set<string>();
eq([nomeFoglio("Tedesco (de)", usati), nomeFoglio("Tedesco (de)", usati), nomeFoglio("a/b:c", usati)], ["Tedesco (de)", "Tedesco (de) 2", "a b c"], "nomi foglio validi e unici");
const speciali = O("f@x.it", { nome: 'Zoë <&> "Ops"', cognome: "=SOMMA(A1)" });
const xlsx1 = creaXlsx(fogli([...lista, speciali], false, nomi), new Date(2026, 9, 29, 8, 0));
const xlsx2 = creaXlsx(fogli(lista, true, nomi), new Date(2026, 9, 29, 8, 0));
ok(xlsx1[0] === 0x50 && xlsx1[1] === 0x4b, "è un archivio ZIP");
mkdirSync("out", { recursive: true });
writeFileSync("out/prova-un-foglio.xlsx", xlsx1);
writeFileSync("out/prova-per-lingua.xlsx", xlsx2);

const ctrl = conControllo(fogli(lista, true, nomi), emailControllo("nl-20261029-ab12"));
ok(ctrl.every((f) => f.righe[f.righe.length - 1][0] === "info+nl-20261029-ab12@alpstay.eu"), "ogni foglio termina con l'indirizzo di controllo");
eq(ctrl[0].righe[ctrl[0].righe.length - 1].slice(1, 3), ["AlpStay", "Controllo"], "riga di controllo riconoscibile");

fine("pagina (filtri, ordinamento, Excel)");
