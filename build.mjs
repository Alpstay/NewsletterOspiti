// Build: TypeScript → index.html (GitHub Pages, con Content-Security-Policy), dist/prova.html (anteprima con
// ospiti inventati) e tools/ospiti.mjs (programma dell'attività pianificata).
//   node build.mjs          costruisce
//   node build.mjs --test   costruisce ed esegue i test con dati inventati
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const bundle = async (entry) => {
  const r = await build({ entryPoints: [entry], bundle: true, format: "iife", target: "es2020", minify: true, write: false, legalComments: "none" });
  return r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
};

const tpl = readFileSync("src/app/page.html", "utf8");
if (!tpl.includes("/*APP_SCRIPT*/")) throw new Error("segnaposto /*APP_SCRIPT*/ mancante in src/app/page.html");
const cut = tpl.indexOf('<div id="app">');
if (cut < 0) throw new Error('<div id="app"> mancante in src/app/page.html');
const head = tpl.slice(0, cut).trim();
const corpo = (js) => tpl.slice(cut).replace("/*APP_SCRIPT*/", () => js).trim();

// 1) Pagina pubblicata. Content-Security-Policy: gira solo lo script dell'app (impronta sha256) e la pagina può
//    scaricare dati solo dal proprio sito (connect-src 'self'): nomi, email e password non possono partire altrove.
const body = corpo(await bundle("src/app/main.ts"));
const hashes = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
const csp = [
  "default-src 'none'",
  `script-src ${hashes.join(" ")}`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join("; ");
const pagina = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync("index.html", pagina);
console.log("ok index.html", Math.round(pagina.length / 1024), "KB");

// 2) Anteprima con ospiti inventati (senza password, nessun dato reale).
mkdirSync("dist", { recursive: true });
const prova = `<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${head}\n</head>\n<body>\n${corpo(await bundle("src/app/prova.ts"))}\n</body>\n</html>\n`;
writeFileSync("dist/prova.html", prova);
console.log("ok dist/prova.html", Math.round(prova.length / 1024), "KB");

// 3) Programma dell'attività pianificata.
await build({
  entryPoints: ["src/cli/ospiti-cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "tools/ospiti.mjs",
  banner: { js: "// Generato da src/cli/ospiti-cli.ts con build.mjs: non modificare a mano." },
  legalComments: "none",
});
console.log("ok tools/ospiti.mjs");

if (process.argv.includes("--test")) {
  mkdirSync("out", { recursive: true });
  for (const f of readdirSync("test").filter((n) => n.endsWith(".test.ts"))) {
    const outfile = `out/${f.replace(/\.ts$/, ".mjs")}`;
    await build({ entryPoints: [`test/${f}`], bundle: true, platform: "node", format: "esm", target: "node20", outfile, legalComments: "none" });
    execFileSync(process.execPath, [outfile], { stdio: "inherit" });
  }
}
