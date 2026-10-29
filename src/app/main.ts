// Pagina pubblicata: legge ospiti.json dal proprio sito e lo decifra nel browser con DUE segreti:
// la password (che si ricorda) e la chiave del computer (inserita una volta sola, poi salvata su questo computer).

import { aadFor, decryptJson, normalizzaChiave, segreto } from "../shared/crypto";
import { FILE, isEnvelope, romeDay } from "../shared/model";
import type { Archivio, Envelope } from "../shared/types";
import { mostra } from "./ui";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const CHIAVE_LS = "newsletter-ospiti-chiave";
/** Dopo questo tempo senza attività la pagina si richiude e dimentica i dati decifrati. */
const BLOCCO_MS = 15 * 60_000;

const leggiChiave = (): string | null => {
  try {
    return normalizzaChiave(localStorage.getItem(CHIAVE_LS) ?? "");
  } catch {
    return null;
  }
};
const salvaChiave = (k: string | null): void => {
  try {
    if (k) localStorage.setItem(CHIAVE_LS, k);
    else localStorage.removeItem(CHIAVE_LS);
  } catch {
    /* archiviazione non disponibile: la chiave andrà reinserita */
  }
};

async function carica(): Promise<Envelope> {
  const r = await fetch(`${FILE}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`elenco non disponibile (${r.status})`);
  const env: unknown = await r.json();
  if (!isEnvelope(env)) throw new Error("file dell'elenco non riconosciuto");
  return env;
}

/** Richiude la pagina dopo un periodo di inattività (anche a scheda nascosta). */
function bloccoAutomatico(): void {
  let ultimo = Date.now();
  const tocca = (): void => {
    ultimo = Date.now();
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, tocca, { passive: true });
  window.setInterval(() => {
    if (Date.now() - ultimo > BLOCCO_MS) location.reload();
  }, 30_000);
}

async function avvia(): Promise<void> {
  const msg = el<HTMLParagraphElement>("lockMsg");
  const stato = el<HTMLParagraphElement>("stato");
  const form = el<HTMLFormElement>("lockForm");
  const pw = el<HTMLInputElement>("pw");
  const boxChiave = el<HTMLDivElement>("boxChiave");
  const inChiave = el<HTMLInputElement>("chiave");
  const ricorda = el<HTMLInputElement>("ricorda");
  const autorizzato = el<HTMLParagraphElement>("autorizzato");
  const dimentica = el<HTMLButtonElement>("dimentica");
  const btn = el<HTMLButtonElement>("apri");
  let env: Envelope;
  try {
    env = await carica();
    stato.textContent = `Elenco aggiornato il ${new Date(env.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`;
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : String(e);
    btn.disabled = true;
    return;
  }
  const serveChiave = env.format === 2;
  const aggiornaChiave = (): void => {
    const k = leggiChiave();
    boxChiave.hidden = !serveChiave || !!k;
    autorizzato.hidden = !serveChiave || !k;
  };
  aggiornaChiave();
  dimentica.addEventListener("click", () => {
    salvaChiave(null);
    aggiornaChiave();
    inChiave.focus();
  });
  pw.focus();
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    let chiave = leggiChiave();
    if (serveChiave && !chiave) {
      chiave = normalizzaChiave(inChiave.value);
      if (!chiave) {
        msg.textContent = "La chiave del computer non è nel formato giusto (NLK-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX).";
        inChiave.focus();
        return;
      }
    }
    btn.disabled = true;
    msg.textContent = "Apertura in corso…";
    const sgr = serveChiave ? segreto(pw.value, chiave!) : pw.value;
    try {
      const archivio = await decryptJson<Archivio>(env.enc, sgr, aadFor(env.day));
      if (serveChiave && ricorda.checked) salvaChiave(chiave);
      pw.value = "";
      inChiave.value = "";
      msg.textContent = "";
      bloccoAutomatico();
      mostra(archivio, env, romeDay(), { segreto: sgr });
    } catch {
      msg.textContent = serveChiave ? "Password o chiave del computer non corrette." : "Password non corretta.";
      btn.disabled = false;
      pw.select();
    }
  });
}

void avvia();
