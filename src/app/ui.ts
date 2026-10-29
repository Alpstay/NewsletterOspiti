// Interfaccia della piattaforma newsletter: filtri, ordinamento a priorità, selezione ed export Excel.
// Nessun dato esce dalla pagina: si decifra nel browser e l'Excel si genera in locale.

import { aadFor, decryptJson } from "../shared/crypto";
import { cancellatoIl, disiscrivi, elencoDisiscritti, impronta, indirizziDa, pulisci, riattiva } from "../shared/disiscritti";
import { cifraArchivio } from "../shared/envelope";
import { importaPacchetto, riassuntoEsito } from "../shared/importa";
import type { FileImport } from "../shared/importa";
import { CASE, FILE, isEnvelope, ospitiDa, unisci } from "../shared/model";
import { inflateBrowser, leggiTabella } from "../shared/tabella";
import type { Archivio, Canale, CasaKey, Envelope, Ospite } from "../shared/types";
import { NOMI_CANALE, conControllo, emailControllo, fogli } from "./export";
import { ORDINE_PREDEFINITO, conteggi, dataRiferimento, filtra, filtriVuoti, ordina, presetPeriodo } from "./filters";
import type { Abituali, CanaleFiltro, Criterio, Filtri, Nomi, Ordine } from "./filters";
import { dimenticaSospesa, ricordaSospese } from "./sospese";
import { creaXlsx } from "./xlsx";

type Attrs = Record<string, string | boolean | number | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} mancante`);
  return el as T;
};

// ───────────── nomi leggibili ─────────────

const capitalizzaPrima = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
function displayNames(type: "language" | "region"): (code: string) => string {
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames(["it"], { type });
  } catch {
    dn = null;
  }
  const cache = new Map<string, string>();
  return (code: string): string => {
    if (!code) return "—";
    const hit = cache.get(code);
    if (hit) return hit;
    let name = code.toUpperCase();
    try {
      name = capitalizzaPrima(dn?.of(code) ?? name);
    } catch {
      /* codice sconosciuto */
    }
    cache.set(code, name);
    return name;
  };
}
const nomeLingua = displayNames("language");
const nomeRegione = displayNames("region");
export const NOMI: Nomi = { lingua: nomeLingua, nazione: (c) => (c ? nomeRegione(c) : "Senza nazione") };

const NOMI_CRITERIO: Record<Criterio, string> = { lingua: "Lingua", nazione: "Nazione", data: "Data soggiorno", abituale: "Abituali" };
function versoLabel(o: Ordine): string {
  switch (o.criterio) {
    case "lingua":
    case "nazione":
      return o.verso === 1 ? "A→Z" : "Z→A";
    case "data":
      return o.verso === -1 ? "più recenti" : "più vecchi";
    case "abituale":
      return o.verso === 1 ? "prima" : "dopo";
  }
}

const fmtData = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const fmtOra = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const CASA_BREVE: Record<CasaKey, string> = { acadia: "Acadia", hartmann: "Hartmann", saslong: "Saslong" };

// ───────────── stato ─────────────

interface Stato {
  readonly ospiti: readonly Ospite[];
  readonly oggi: string;
  filtri: {
    case: Set<CasaKey>;
    lingue: Set<string>;
    nazioni: Set<string>;
    da: string | null;
    a: string | null;
    abituali: Abituali;
    canali: Set<CanaleFiltro>;
    testo: string;
  };
  preset: string;
  ordini: Ordine[];
  selezionati: Set<string>;
  pagina: number;
  perLingua: boolean;
  cercaNazione: string;
}

const PER_PAGINA = 50;

export interface Opzioni {
  /** Segreto (password + chiave) per ricifrare dopo un'importazione; senza, il pannello di importazione non compare. */
  readonly segreto?: string;
  /** Un ospiti.json appena preparato (importazione o cancellazione), da scaricare e caricare su GitHub. */
  readonly daCaricare?: { readonly titolo: string; readonly json: string; readonly esiti: readonly string[] };
}

interface VoceRegistro {
  readonly at: string;
  readonly righe: number;
  readonly controllo: string;
}
const REGISTRO_LS = "newsletter-ospiti-registro";
function leggiRegistro(): VoceRegistro[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(REGISTRO_LS) ?? "[]");
    return Array.isArray(v) ? (v as VoceRegistro[]).slice(0, 20) : [];
  } catch {
    return [];
  }
}
function scriviRegistro(v: VoceRegistro): void {
  try {
    localStorage.setItem(REGISTRO_LS, JSON.stringify([v, ...leggiRegistro()].slice(0, 20)));
  } catch {
    /* archiviazione non disponibile */
  }
}

/** Scarica un file generato in locale (funziona sulla pagina pubblicata; nelle anteprime può essere bloccato). */
function scarica(dati: BlobPart, tipo: string, nome: string): void {
  const url = URL.createObjectURL(new Blob([dati], { type: tipo }));
  const link = h("a", { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Base per una modifica: l'ultimo ospiti.json pubblicato (così una cancellazione fatta da un altro computer non
 * si perde), oppure l'elenco in memoria se contiene già una modifica non ancora caricata.
 */
async function baseModifica(attuale: Archivio, sgr: string, inSospeso: boolean): Promise<Archivio> {
  if (inSospeso) return attuale;
  try {
    const r = await fetch(`${FILE}?t=${Date.now()}`, { cache: "no-store" });
    const env: unknown = r.ok ? await r.json() : null;
    if (!isEnvelope(env)) return attuale;
    const pubblicato = await decryptJson<Archivio>(env.enc, sgr, aadFor(env.day));
    const visti = new Set<string>();
    const lista = [...elencoDisiscritti(pubblicato), ...elencoDisiscritti(attuale)].filter((d) => !visti.has(d.h) && visti.add(d.h));
    return { ...pubblicato, disiscritti: lista };
  } catch {
    return attuale;
  }
}

let ctrlPrecedente: AbortController | null = null;
let daSalvare = false;
window.addEventListener("beforeunload", (ev) => {
  if (daSalvare) ev.preventDefault();
});

/** Mostra l'elenco a partire dallo storico decifrato. */
export function mostra(
  archivio: Archivio,
  env: Pick<Envelope, "generated_at" | "scatola_updated_at" | "freshness" | "day">,
  oggi: string,
  opzioni: Opzioni = {},
): void {
  // Una nuova chiamata (dopo un'importazione) sostituisce i gestori della precedente.
  ctrlPrecedente?.abort();
  const ctrl = new AbortController();
  ctrlPrecedente = ctrl;
  const sig = { signal: ctrl.signal };
  const ospiti = ospitiDa(archivio.soggiorni, oggi);
  const v = filtriVuoti();
  const st: Stato = {
    ospiti,
    oggi,
    filtri: { case: new Set(), lingue: new Set(), nazioni: new Set(), da: v.da, a: v.a, abituali: v.abituali, canali: new Set(), testo: "" },
    preset: "tutti",
    ordini: [...ORDINE_PREDEFINITO],
    selezionati: new Set(),
    pagina: 0,
    perLingua: false,
    cercaNazione: "",
  };

  $("lock").hidden = true;
  $("main").hidden = false;
  const vecchio = Date.now() - new Date(env.generated_at).getTime() > 2 * 86_400_000;
  const stato = $("stato");
  stato.textContent = `Dati aggiornati il ${fmtOra(env.generated_at)} · ${ospiti.length} ospiti con email · storico dal ${fmtData(archivio.soggiorni[0]?.dal ?? null)}`;
  stato.classList.toggle("avviso", vecchio || env.freshness !== "fresh");
  if (vecchio) stato.textContent += " · ATTENZIONE: aggiornamento vecchio di oltre 2 giorni";

  const e = archivio.esclusi;
  $("note").textContent =
    `Esclusi automaticamente nell'ultima lettura completa di La Scatola: ${e.portale} email mascherate dei portali (Booking, Expedia…), ${e.nonValida} non valide, ` +
    `${e.interna} interne, ${e.minori} minorenni, ${e.cancellati} da prenotazioni cancellate. ` +
    `I soggiorni restano nello storico per ${archivio.conservazioneMesi} mesi dall'ultima partenza. ` +
    `Chi chiede di non ricevere più la newsletter si cancella con «Cancella un indirizzo»: sparisce dall'elenco e non rientra più. ` +
    `Ogni Excel contiene un indirizzo di controllo info+nl-…@alpstay.eu: se riceve messaggi estranei alla newsletter, quell'elenco è uscito dall'azienda. ` +
    `La pagina si richiude da sola dopo 15 minuti senza attività.`;

  const filtriAttivi = (): Filtri => st.filtri;
  let visibili: Ospite[] = [];

  // ── pannello filtri ──
  const pannello = $("filtri");
  const cerca = h("input", { type: "search", id: "cerca", placeholder: "Nome, cognome o email", autocomplete: "off" });
  let t: number | undefined;
  cerca.addEventListener("input", () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      st.filtri.testo = cerca.value;
      aggiorna();
    }, 120);
  });

  const caseBox = h("div", { class: "chips" });
  for (const c of CASE) {
    const n = ospiti.filter((o) => o.case.includes(c.key)).length;
    const b = h("button", { type: "button", class: "chip", "aria-pressed": "false" }, `${CASA_BREVE[c.key]} `, h("small", {}, String(n)));
    b.addEventListener("click", () => {
      if (st.filtri.case.has(c.key)) st.filtri.case.delete(c.key);
      else st.filtri.case.add(c.key);
      b.setAttribute("aria-pressed", String(st.filtri.case.has(c.key)));
      aggiorna();
    });
    caseBox.append(b);
  }

  const presets = presetPeriodo(oggi);
  const selPeriodo = h("select", { id: "periodo" });
  for (const p of presets) selPeriodo.append(h("option", { value: p.id }, p.etichetta));
  selPeriodo.append(h("option", { value: "custom" }, "Date a scelta…"));
  const da = h("input", { type: "date", id: "da", "aria-label": "Dal" });
  const a = h("input", { type: "date", id: "a", "aria-label": "Al" });
  const dateBox = h("div", { class: "date", hidden: true }, h("label", {}, "dal ", da), h("label", {}, "al ", a));
  selPeriodo.addEventListener("change", () => {
    st.preset = selPeriodo.value;
    const p = presets.find((x) => x.id === st.preset);
    dateBox.hidden = st.preset !== "custom";
    if (p) {
      st.filtri.da = p.da;
      st.filtri.a = p.a;
    } else {
      st.filtri.da = da.value || null;
      st.filtri.a = a.value || null;
    }
    aggiorna();
  });
  for (const inp of [da, a])
    inp.addEventListener("change", () => {
      st.filtri.da = da.value || null;
      st.filtri.a = a.value || null;
      aggiorna();
    });

  const checklist = (voci: [string, number][], set: Set<string>, nome: (c: string) => string, extra?: (c: string) => string): HTMLElement => {
    const box = h("div", { class: "checklist" });
    for (const [code, n] of voci) {
      const cb = h("input", { type: "checkbox", value: code });
      cb.checked = set.has(code);
      cb.addEventListener("change", () => {
        if (cb.checked) set.add(code);
        else set.delete(code);
        aggiorna();
      });
      box.append(h("label", { "data-nome": nome(code).toLowerCase() }, cb, ` ${nome(code)}`, extra ? h("em", {}, extra(code)) : null, h("small", {}, String(n))));
    }
    return box;
  };
  const lingueBox = checklist(
    conteggi(ospiti, (o) => o.lingua),
    st.filtri.lingue,
    nomeLingua,
    (c) => ` ${c}`,
  );
  const cercaNaz = h("input", { type: "search", placeholder: "Cerca nazione", class: "mini", autocomplete: "off" });
  const nazioniBox = checklist(
    conteggi(ospiti, (o) => o.nazione ?? ""),
    st.filtri.nazioni,
    (c) => (c ? nomeRegione(c) : "Senza nazione"),
  );
  cercaNaz.addEventListener("input", () => {
    const q = cercaNaz.value.trim().toLowerCase();
    for (const l of Array.from(nazioniBox.querySelectorAll<HTMLLabelElement>("label"))) l.hidden = !!q && !(l.dataset.nome ?? "").includes(q);
  });

  const segAbituali = h("div", { class: "seg", role: "group", "aria-label": "Abituali" });
  for (const [val, lab] of [
    ["tutti", "Tutti"],
    ["si", "Abituali"],
    ["no", "Nuovi"],
  ] as [Abituali, string][]) {
    const b = h("button", { type: "button", "aria-pressed": String(val === "tutti") }, lab);
    b.addEventListener("click", () => {
      st.filtri.abituali = val;
      for (const x of Array.from(segAbituali.children)) x.setAttribute("aria-pressed", String(x === b));
      aggiorna();
    });
    segAbituali.append(b);
  }

  const canaliPresenti = conteggi(ospiti, (o) => o.canale ?? "ignoto");
  const canaliBox = checklist(
    canaliPresenti,
    st.filtri.canali as Set<string>,
    (c) => (c === "ignoto" ? "Non noto" : NOMI_CANALE[c as Canale]),
  );

  const azzera = h("button", { type: "button", class: "link" }, "Azzera filtri");
  azzera.addEventListener("click", () => {
    st.filtri.case.clear();
    st.filtri.lingue.clear();
    st.filtri.nazioni.clear();
    st.filtri.canali.clear();
    st.filtri.da = st.filtri.a = null;
    st.filtri.abituali = "tutti";
    st.filtri.testo = "";
    st.preset = "tutti";
    cerca.value = "";
    cercaNaz.value = "";
    selPeriodo.value = "tutti";
    dateBox.hidden = true;
    da.value = a.value = "";
    for (const x of Array.from(pannello.querySelectorAll<HTMLInputElement>("input[type=checkbox]"))) x.checked = false;
    for (const x of Array.from(pannello.querySelectorAll<HTMLLabelElement>(".checklist label"))) x.hidden = false;
    for (const x of Array.from(caseBox.children)) x.setAttribute("aria-pressed", "false");
    for (const x of Array.from(segAbituali.children)) x.setAttribute("aria-pressed", String(x === segAbituali.firstElementChild));
    aggiorna();
  });

  const gruppo = (titolo: string, ...c: Child[]): HTMLElement => h("fieldset", {}, h("legend", {}, titolo), ...c);
  pannello.replaceChildren(
    h(
      "details",
      { class: "filtri-box", open: window.matchMedia("(min-width: 900px)").matches },
      h("summary", {}, "Filtri"),
      gruppo("Cerca", cerca),
      gruppo("Casa", caseBox),
      gruppo("Periodo di soggiorno", selPeriodo, dateBox),
      gruppo("Lingua", lingueBox),
      gruppo("Nazione", cercaNaz, nazioniBox),
      gruppo("Abituali", segAbituali),
      gruppo("Canale ultima prenotazione", canaliBox),
      azzera,
    ),
  );

  // ── barra azioni ──
  const conta = $("conta");
  const btnTutti = $<HTMLButtonElement>("selTutti");
  const btnNessuno = $<HTMLButtonElement>("selNessuno");
  const chkLingua = $<HTMLInputElement>("perLingua");
  const btnExcel = $<HTMLButtonElement>("excel");
  btnTutti.addEventListener("click", () => {
    for (const o of visibili) st.selezionati.add(o.email);
    disegna();
  }, sig);
  btnNessuno.addEventListener("click", () => {
    st.selezionati.clear();
    disegna();
  }, sig);
  chkLingua.addEventListener("change", () => (st.perLingua = chkLingua.checked), sig);
  btnExcel.addEventListener(
    "click",
    () => {
      const daEsportare = st.selezionati.size ? visibili.filter((o) => st.selezionati.has(o.email)) : visibili;
      if (!daEsportare.length) return;
      // Ogni file contiene un indirizzo di controllo unico: se riceve messaggi estranei alla newsletter, l'elenco è uscito
      // e il codice dice da quale esportazione.
      const codice = `nl-${oggi.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
      const bytes = creaXlsx(conControllo(fogli(daEsportare, st.perLingua, NOMI), emailControllo(codice)));
      scarica(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `ospiti-newsletter-${oggi}.xlsx`);
      scriviRegistro({ at: new Date().toISOString(), righe: daEsportare.length, controllo: emailControllo(codice) });
      disegnaRegistro();
    },
    sig,
  );

  // ── registro delle esportazioni (solo su questo computer) ──
  const registroBox = $("registro");
  const disegnaRegistro = (): void => {
    const voci = leggiRegistro();
    registroBox.replaceChildren(
      voci.length
        ? h(
            "ul",
            {},
            ...voci.map((v) => h("li", {}, `${fmtOra(v.at)} · ${v.righe} ospiti · indirizzo di controllo `, h("code", {}, v.controllo))),
          )
        : h("p", { class: "muted" }, "Nessuna esportazione da questo computer."),
    );
  };
  disegnaRegistro();

  // ── importazione del pacchetto clienti (tre file Excel, uno per casa) ──
  const impBox = $("importa");
  impBox.hidden = !opzioni.segreto;
  const vaiImporta = $("vaiImporta") as HTMLButtonElement;
  vaiImporta.hidden = !opzioni.segreto;
  vaiImporta.addEventListener(
    "click",
    () => {
      const d = impBox.querySelector("details");
      if (d) d.open = true;
      impBox.scrollIntoView({ behavior: "smooth", block: "start" });
      (impBox.querySelector("input[type=file]") as HTMLInputElement | null)?.focus({ preventScroll: true });
    },
    sig,
  );
  if (opzioni.segreto) {
    const sgr = opzioni.segreto;
    const inputs = CASE.map((c) => ({ casa: c, input: h("input", { type: "file", id: `imp-${c.key}`, accept: ".xlsx,.csv" }) }));
    const esitiBox = h("div", { class: "esiti", "aria-live": "polite" });
    const btnImporta = h("button", { type: "button", class: "btn" }, "Importa i file scelti");
    btnImporta.addEventListener("click", async () => {
      const scelti = inputs.filter((x) => x.input.files && x.input.files.length);
      if (!scelti.length) {
        esitiBox.replaceChildren(h("p", { class: "errore" }, "Scegli almeno un file (Hartmann, Acadia o Saslong)."));
        return;
      }
      btnImporta.disabled = true;
      esitiBox.replaceChildren(h("p", {}, "Lettura dei file…"));
      try {
        const file: FileImport[] = [];
        for (const x of scelti) {
          const f = x.input.files![0];
          const righe = await leggiTabella(f.name, new Uint8Array(await f.arrayBuffer()), inflateBrowser);
          file.push({ nome: `${x.casa.nome} (${f.name})`, casa: x.casa.id, righe });
        }
        const base = await baseModifica(archivio, sgr, !!opzioni.daCaricare);
        const pac = await importaPacchetto(file, oggi, base.soggiorni);
        const esiti = pac.esiti.map((e) => riassuntoEsito(e.nome, e.esito));
        if (!pac.soggiorni.length) {
          esitiBox.replaceChildren(...esiti.map((t) => h("p", {}, t)), h("p", { class: "errore" }, "Nessun cliente nuovo da aggiungere."));
          btnImporta.disabled = false;
          return;
        }
        const u = unisci(base.soggiorni, pac.soggiorni, () => false, oggi);
        const { archivio: nuovo } = await pulisci({ ...base, day: oggi, soggiorni: u.soggiorni });
        const envNuovo = await cifraArchivio(nuovo, sgr, env.freshness, env.scatola_updated_at);
        mostra(nuovo, envNuovo, oggi, { segreto: sgr, daCaricare: { titolo: "Importazione pronta.", json: `${JSON.stringify(envNuovo)}\n`, esiti } });
      } catch (e) {
        esitiBox.replaceChildren(h("p", { class: "errore" }, e instanceof Error ? e.message : String(e)));
        btnImporta.disabled = false;
      }
    });
    impBox.replaceChildren(
      h(
        "details",
        { open: false },
        h("summary", {}, "Aggiorna il pacchetto clienti da Excel"),
        h(
          "p",
          { class: "muted" },
          "Un file esportato da Slope per ogni casa (.xlsx o .csv) con almeno le colonne Email e Arrivo (o Ultimo soggiorno). Si riconoscono anche Nome, Cognome, Lingua, Cittadinanza, Partenza, Data di nascita e Soggiorni. I file restano su questo computer: non vengono inviati da nessuna parte.",
        ),
        h("div", { class: "imp-grid" }, ...inputs.map((x) => h("label", { for: x.input.id }, x.casa.nome, x.input))),
        btnImporta,
        esitiBox,
      ),
    );
  }

  // ── modifica pronta da caricare su GitHub (importazione o cancellazione) ──
  const pronto = opzioni.daCaricare;
  const boxCaricare = $("daCaricare");
  boxCaricare.hidden = !pronto;
  daSalvare = !!pronto;
  if (pronto) {
    const b = h("button", { type: "button", class: "btn oro" }, "Scarica ospiti.json aggiornato");
    b.addEventListener("click", () => scarica(pronto.json, "application/json", "ospiti.json"), sig);
    boxCaricare.replaceChildren(
      h("p", {}, h("strong", {}, pronto.titolo, " "), "L'elenco qui sotto la include già, ma vale solo su questo schermo finché non carichi il file:"),
      h(
        "ol",
        {},
        h("li", {}, "Premi «Scarica ospiti.json aggiornato»."),
        h("li", {}, "Apri il repository NewsletterOspiti su GitHub (con password e codice di verifica) e scegli «Add file → Upload files»."),
        h("li", {}, "Trascina ospiti.json e premi «Commit changes». Fallo subito: l'aggiornamento notturno riparte da quel file."),
      ),
      ...pronto.esiti.map((t) => h("p", { class: "muted" }, t)),
      b,
    );
    boxCaricare.scrollIntoView({ block: "start" });
  } else boxCaricare.replaceChildren();

  // ── cancellazione dalla newsletter (richiesta dell'ospite) ──
  const canBox = $("cancella");
  canBox.hidden = !opzioni.segreto;
  const vaiCancella = $("vaiCancella") as HTMLButtonElement;
  vaiCancella.hidden = !opzioni.segreto;
  if (opzioni.segreto) {
    const sgr = opzioni.segreto;
    const lista = elencoDisiscritti(archivio);
    const campo = h("textarea", { id: "daCancellare", rows: 3, placeholder: "es. mario.rossi@gmail.com (anche più indirizzi, uno per riga)", spellcheck: "false" });
    const btnCancella = h("button", { type: "button", class: "btn" }, "Cancella dalla newsletter");
    const esitoBox = h("div", { class: "esiti", "aria-live": "polite" });
    const errore = (t: string): void => esitoBox.replaceChildren(h("p", { class: "errore" }, t));
    btnCancella.addEventListener(
      "click",
      async () => {
        const emails = indirizziDa(campo.value);
        if (!emails.length) return errore("Scrivi o incolla almeno un indirizzo email valido.");
        btnCancella.disabled = true;
        esitoBox.replaceChildren(h("p", {}, "Cancellazione in corso…"));
        try {
          const base = await baseModifica(archivio, sgr, !!opzioni.daCaricare);
          // Indirizzi già nella lista: niente da fare, si offre la riattivazione (uno alla volta).
          const date = await Promise.all(emails.map((e) => cancellatoIl(base, e)));
          if (date.every(Boolean)) {
            btnCancella.disabled = false;
            const righe: HTMLElement[] = emails.map((e, i) => h("p", {}, `${e}: già cancellato dal ${fmtData(date[i])}.`));
            if (emails.length === 1) {
              const btnRiattiva = h("button", { type: "button", class: "btn ghost" }, "Riattiva questo indirizzo");
              btnRiattiva.addEventListener(
                "click",
                async () => {
                  btnRiattiva.disabled = true;
                  const r = await riattiva(base, emails[0]);
                  dimenticaSospesa(await impronta(emails[0]));
                  const { archivio: nuovo } = await pulisci(r.archivio);
                  const envNuovo = await cifraArchivio(nuovo, sgr, env.freshness, env.scatola_updated_at);
                  mostra(nuovo, envNuovo, oggi, {
                    segreto: sgr,
                    daCaricare: {
                      titolo: "Riattivazione pronta.",
                      json: `${JSON.stringify(envNuovo)}\n`,
                      esiti: [`${emails[0]} può di nuovo ricevere la newsletter: rientrerà nell'elenco con i prossimi soggiorni (quelli passati erano stati cancellati).`],
                    },
                  });
                },
                sig,
              );
              righe.push(h("p", { class: "muted" }, "Riattiva solo se l'ospite ha chiesto di nuovo, per iscritto, di ricevere la newsletter."), btnRiattiva);
            }
            esitoBox.replaceChildren(...righe);
            return;
          }
          const r = await disiscrivi(base, emails, oggi);
          ricordaSospese(elencoDisiscritti(r.archivio).filter((d) => d.dal === oggi));
          const { archivio: nuovo } = await pulisci(r.archivio);
          const envNuovo = await cifraArchivio(nuovo, sgr, env.freshness, env.scatola_updated_at);
          const esiti = r.righe.map((x, i) =>
            x.gia
              ? `${x.email}: era già cancellato dal ${fmtData(date[i])}.`
              : x.soggiorni
                ? `${x.email}: cancellato${x.nome ? ` (${x.nome})` : ""}, tolti ${x.soggiorni} ${x.soggiorni === 1 ? "soggiorno" : "soggiorni"} dallo storico.`
                : `${x.email}: non era nell'elenco; registrato comunque, così non entrerà mai.`,
          );
          esiti.push("Toglilo anche dallo strumento con cui spedisci la newsletter, se è già iscritto lì.");
          mostra(nuovo, envNuovo, oggi, { segreto: sgr, daCaricare: { titolo: "Cancellazione pronta.", json: `${JSON.stringify(envNuovo)}\n`, esiti } });
        } catch (e) {
          btnCancella.disabled = false;
          errore(e instanceof Error ? e.message : String(e));
        }
      },
      sig,
    );
    canBox.replaceChildren(
      h(
        "details",
        { open: false },
        h("summary", {}, "Cancella un indirizzo dalla newsletter"),
        h(
          "p",
          { class: "muted" },
          "Quando un ospite chiede di non ricevere più la newsletter (per email, telefono o di persona): incolla il suo indirizzo e premi «Cancella». " +
            "Sparisce subito dall'elenco e dagli Excel, i suoi soggiorni si tolgono dallo storico, e non rientra più: né con l'aggiornamento notturno, né con un'importazione. " +
            "Dell'indirizzo resta solo un'impronta cifrata, che serve a riconoscerlo. Se hai sbagliato prima di caricare il file, ricarica la pagina.",
        ),
        h("label", { for: "daCancellare" }, "Indirizzo email"),
        campo,
        btnCancella,
        esitoBox,
        h("p", { class: "muted" }, lista.length ? `Indirizzi nella lista di cancellazione: ${lista.length} · ultima richiesta il ${fmtData(lista.map((d) => d.dal).sort().at(-1) ?? null)}.` : "Nessun indirizzo nella lista di cancellazione."),
      ),
    );
  }
  vaiCancella.addEventListener(
    "click",
    () => {
      const d = canBox.querySelector("details");
      if (d) d.open = true;
      canBox.scrollIntoView({ behavior: "smooth", block: "start" });
      (canBox.querySelector("textarea") as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
    },
    sig,
  );

  // ── ordinamento a priorità ──
  const ordineBox = $("ordine");
  const disegnaOrdine = (): void => {
    ordineBox.replaceChildren(
      h("span", { class: "etichetta" }, "Ordina per"),
      ...st.ordini.map((o, i) => {
        const verso = h("button", { type: "button", class: "verso", title: "Cambia verso" }, `${i + 1}. ${NOMI_CRITERIO[o.criterio]} · ${versoLabel(o)}`);
        verso.addEventListener("click", () => {
          st.ordini[i] = { criterio: o.criterio, verso: o.verso === 1 ? -1 : 1 };
          disegnaOrdine();
          aggiorna(false);
        });
        const su = h("button", { type: "button", class: "su", title: "Dai più priorità", "aria-label": `Più priorità a ${NOMI_CRITERIO[o.criterio]}`, disabled: i === 0 }, "↑");
        su.addEventListener("click", () => {
          [st.ordini[i - 1], st.ordini[i]] = [st.ordini[i], st.ordini[i - 1]];
          disegnaOrdine();
          aggiorna(false);
        });
        return h("span", { class: "criterio" }, su, verso);
      }),
    );
  };
  disegnaOrdine();

  // ── tabella ──
  const corpo = $("righe");
  const testaCb = $<HTMLInputElement>("selPagina");
  testaCb.addEventListener(
    "change",
    () => {
      for (const o of paginaCorrente()) {
        if (testaCb.checked) st.selezionati.add(o.email);
        else st.selezionati.delete(o.email);
      }
      disegna();
    },
    sig,
  );
  const pager = $("pager");
  const paginaCorrente = (): Ospite[] => visibili.slice(st.pagina * PER_PAGINA, (st.pagina + 1) * PER_PAGINA);

  function disegna(): void {
    const sel = st.selezionati.size;
    const quanti = sel ? visibili.filter((o) => st.selezionati.has(o.email)).length : visibili.length;
    conta.textContent = `${visibili.length} ospiti${sel ? ` · ${sel} selezionati` : ""}`;
    btnExcel.textContent = `Scarica Excel (${quanti})`;
    btnExcel.disabled = quanti === 0;
    btnNessuno.disabled = sel === 0;
    btnTutti.textContent = `Seleziona tutti (${visibili.length})`;

    const pag = paginaCorrente();
    corpo.replaceChildren(
      ...pag.map((o) => {
        const cb = h("input", { type: "checkbox", "aria-label": `Seleziona ${o.nome} ${o.cognome}` });
        cb.checked = st.selezionati.has(o.email);
        cb.addEventListener("change", () => {
          if (cb.checked) st.selezionati.add(o.email);
          else st.selezionati.delete(o.email);
          disegna();
        });
        const soggiorno = o.prossimo
          ? h("span", {}, `arriva ${fmtData(o.prossimo)}`, o.ultimo ? h("small", {}, `ultimo ${fmtData(o.ultimo)}`) : null)
          : h("span", {}, fmtData(o.ultimo ?? dataRiferimento(o)));
        return h(
          "tr",
          { class: st.selezionati.has(o.email) ? "sel" : "" },
          h("td", { class: "cb" }, cb),
          h("td", { class: "ospite", "data-l": "Ospite" }, h("strong", {}, `${o.nome} ${o.cognome}`.trim() || "—"), h("span", { class: "email" }, o.email)),
          h(
            "td",
            { "data-l": "Lingua" },
            nomeLingua(o.lingua),
            o.linguaDedotta ? h("small", { title: "In Slope la lingua non era indicata (o era il valore predefinito «it»): dedotta dalla nazione" }, "dalla nazione") : null,
          ),
          h("td", { "data-l": "Nazione" }, o.nazione ? nomeRegione(o.nazione) : "—"),
          h("td", { "data-l": "Case" }, o.case.map((k) => CASA_BREVE[k]).join(", ") || "—"),
          h("td", { "data-l": "Soggiorno" }, soggiorno),
          h(
            "td",
            { "data-l": "Abituale" },
            o.abituale ? h("span", { class: "badge", title: o.motivoAbituale ?? "" }, "Abituale") : h("span", { class: "muted" }, "Nuovo"),
            o.abituale && o.motivoAbituale ? h("small", {}, o.motivoAbituale) : null,
          ),
        );
      }),
    );
    if (!pag.length) corpo.append(h("tr", {}, h("td", { colspan: 7, class: "vuoto" }, "Nessun ospite con questi filtri.")));
    testaCb.checked = pag.length > 0 && pag.every((o) => st.selezionati.has(o.email));

    const pagine = Math.max(1, Math.ceil(visibili.length / PER_PAGINA));
    const prev = h("button", { type: "button", disabled: st.pagina === 0 }, "‹ Precedenti");
    const next = h("button", { type: "button", disabled: st.pagina >= pagine - 1 }, "Successivi ›");
    prev.addEventListener("click", () => {
      st.pagina--;
      disegna();
    });
    next.addEventListener("click", () => {
      st.pagina++;
      disegna();
    });
    pager.replaceChildren(prev, h("span", {}, `Pagina ${st.pagina + 1} di ${pagine}`), next);
  }

  function aggiorna(tornaInCima = true): void {
    visibili = ordina(filtra(st.ospiti, filtriAttivi()), st.ordini, NOMI);
    if (tornaInCima) st.pagina = 0;
    disegna();
  }

  aggiorna();
}
