// Cifratura di ospiti.json: AES-256-GCM con chiave da PBKDF2-SHA256 (stesso formato delle altre app AlpStay).
// Gira identica in Node (≥ 20) e nel browser grazie a WebCrypto.

import type { EncBlock } from "./types";

export const ITERATIONS = 600_000;

const subtle = (): SubtleCrypto => (globalThis as { crypto: Crypto }).crypto.subtle;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function keyFrom(password: string, salt: Uint8Array<ArrayBuffer>, iter: number, usage: KeyUsage): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}

export async function encryptJson(value: unknown, password: string, aad: string, iter: number = ITERATIONS): Promise<EncBlock> {
  const c = (globalThis as { crypto: Crypto }).crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, iter, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { alg: "AES-GCM/PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Lancia un errore se la password è sbagliata o il file è stato alterato. */
export async function decryptJson<T>(enc: EncBlock, password: string, aad: string): Promise<T> {
  const key = await keyFrom(password, fromB64(enc.salt), enc.iter, "decrypt");
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(enc.iv), additionalData: new TextEncoder().encode(aad) }, key, fromB64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/** Dati aggiuntivi autenticati: legano il blocco cifrato a questa app e al giorno scritto in chiaro. */
export const aadFor = (day: string): string => `newsletter-ospiti|${day}`;

// ───────────── doppio controllo ─────────────
// Per aprire ospiti.json servono DUE segreti: la password (che la persona ricorda) e la chiave del computer
// (lunga e casuale, salvata una volta sola sul computer autorizzato). La sola password, anche se rubata o
// indovinata, non basta: chi scarica il file pubblico senza la chiave non può decifrarlo.

const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Chiave del computer: «NLK-» + 25 caratteri casuali (circa 125 bit), a gruppi di 5. */
export function nuovaChiave(): string {
  const r = (globalThis as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(25));
  const s = Array.from(r, (b) => BASE32[b % 32]).join("");
  return `NLK-${s.match(/.{5}/g)!.join("-")}`;
}

/** Chiave come la si digita (minuscole, spazi, trattini mancanti) → forma canonica; null se non valida. */
export function normalizzaChiave(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NLK/, "");
  if (s.length !== 25 || [...s].some((c) => !BASE32.includes(c))) return null;
  return `NLK-${s.match(/.{5}/g)!.join("-")}`;
}

/** Il segreto da cui si deriva la chiave AES: password e chiave del computer insieme. */
export const segreto = (password: string, chiave: string): string => `${password}\u0000${normalizzaChiave(chiave) ?? chiave}`;
