// Mini-libreria di asserzioni per i test (nessuna dipendenza).
let falliti = 0;
let passati = 0;

export function ok(cond: unknown, msg: string): void {
  if (cond) passati++;
  else {
    falliti++;
    console.error(`  ✗ ${msg}`);
  }
}

export function eq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, `${msg}\n      atteso:   ${e}\n      ottenuto: ${a}`);
}

export function fine(nome: string): void {
  console.log(`${falliti ? "✗" : "✓"} ${nome}: ${passati} controlli superati${falliti ? `, ${falliti} falliti` : ""}`);
  if (falliti) process.exit(1);
}
