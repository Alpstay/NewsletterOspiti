// Pagina pubblicata: legge ospiti.json dal proprio sito, chiede la password e decifra nel browser.

import { aadFor, decryptJson } from "../shared/crypto";
import { FILE, isEnvelope, romeDay } from "../shared/model";
import type { Archivio, Envelope } from "../shared/types";
import { mostra } from "./ui";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function carica(): Promise<Envelope> {
  const r = await fetch(`${FILE}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`elenco non disponibile (${r.status})`);
  const env: unknown = await r.json();
  if (!isEnvelope(env)) throw new Error("file dell'elenco non riconosciuto");
  return env;
}

async function avvia(): Promise<void> {
  const msg = el<HTMLParagraphElement>("lockMsg");
  const stato = el<HTMLParagraphElement>("stato");
  const form = el<HTMLFormElement>("lockForm");
  const pw = el<HTMLInputElement>("pw");
  const btn = form.querySelector("button") as HTMLButtonElement;
  let env: Envelope;
  try {
    env = await carica();
    stato.textContent = `Elenco aggiornato il ${new Date(env.generated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`;
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : String(e);
    btn.disabled = true;
    return;
  }
  pw.focus();
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    btn.disabled = true;
    msg.textContent = "Apertura in corso…";
    try {
      const archivio = await decryptJson<Archivio>(env.enc, pw.value, aadFor(env.day));
      pw.value = "";
      msg.textContent = "";
      mostra(archivio, env, romeDay());
    } catch {
      msg.textContent = "Password non corretta.";
      btn.disabled = false;
      pw.select();
    }
  });
}

void avvia();
