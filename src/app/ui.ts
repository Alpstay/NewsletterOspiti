// Interfaccia della piattaforma newsletter: filtri, ordinamento a priorità, selezione ed export Excel.
// Nessun dato esce dalla pagina: si decifra nel browser e l'Excel si genera in locale.

import { CASE, ospitiDa } from "../shared/model";
import type { Archivio, Canale, CasaKey, Envelope, Ospite } from "../shared/types";
import { NOMI_CANALE, fogli } from "./export";
import { ORDINE_PREDEFINITO, conteggi, dataRiferimento, filtra, filtriVuoti, ordina, presetPeriodo } from "./filters";
import type { Abituali, CanaleFiltro, Criterio, Filtri, Nomi, Ordine } from "./filters";
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

/** Mostra l'elenco a partire dallo storico decifrato. */
export function mostra(archivio: Archivio, env: Pick<Envelope, "generated_at" | "scatola_updated_at" | "freshness" | "day">, oggi: string): void {
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
    `Esclusi automaticamente nell'ultimo aggiornamento: ${e.portale} email mascherate dei portali (Booking, Expedia…), ${e.nonValida} non valide, ` +
    `${e.interna} interne, ${e.minori} minorenni, ${e.cancellati} da prenotazioni cancellate. ` +
    `I soggiorni restano nello storico per ${archivio.conservazioneMesi} mesi dall'ultima partenza. ` +
    `Le disiscrizioni si gestiscono nello strumento newsletter: reimportando l'elenco, chi si è disiscritto resta escluso.`;

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
  });
  btnNessuno.addEventListener("click", () => {
    st.selezionati.clear();
    disegna();
  });
  chkLingua.addEventListener("change", () => (st.perLingua = chkLingua.checked));
  btnExcel.addEventListener("click", () => {
    const daEsportare = st.selezionati.size ? visibili.filter((o) => st.selezionati.has(o.email)) : visibili;
    if (!daEsportare.length) return;
    const bytes = creaXlsx(fogli(daEsportare, st.perLingua, NOMI));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = h("a", { href: url, download: `ospiti-newsletter-${oggi}.xlsx` });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });

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
  testaCb.addEventListener("change", () => {
    for (const o of paginaCorrente()) {
      if (testaCb.checked) st.selezionati.add(o.email);
      else st.selezionati.delete(o.email);
    }
    disegna();
  });
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
