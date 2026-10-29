# Aggiornamento notturno degli ospiti per la newsletter (La Scatola → ospiti.json)

Procedura per l'attività pianificata che ogni notte riscrive `ospiti.json`: lo **storico cifrato**
degli ospiti con email che la pagina https://alpstay.github.io/NewsletterOspiti/ mostra ad Adriela.
Il file si apre solo con **due segreti**: la **password** e la **chiave del computer** (`NLK-…`). Nessuno dei due è
in questo repository (è pubblico): li dà il testo dell'attività pianificata.

## Perché uno storico

La Scatola conserva i dati degli ospiti solo per una finestra mobile (circa gli ultimi due mesi più le
prenotazioni future). Per riconoscere gli **abituali** il programma unisce ogni notte quello che legge
con lo storico già cifrato in `ospiti.json`:
- dentro la finestra di La Scatola vale La Scatola (un soggiorno sparito da Slope si toglie);
- prima della finestra vale lo storico;
- dopo 24 mesi dall'ultima partenza un soggiorno si cancella comunque.

Per questo `start` controlla subito che password e chiave aprano lo storico: con credenziali sbagliate lo
storico andrebbe perso, e il programma si ferma.

## Regole

- Gli ID ricevuti da Slope / La Scatola non si modificano mai. Per questo **le risposte non si
  ricopiano a mano**: non salvarle in un file, non riassumerle, **non aprire** i file in cui il sistema
  salva le risposte grandi. Le legge il programma dal registro della sessione.
- Gli argomenti stampati da `next` si copiano **identici** nella chiamata (filtri, order_by, limit,
  cursor). Una chiamata per volta, poi di nuovo `next`.
- `start` e `next` vanno lanciati in **due comandi separati** (il programma cerca nel registro il
  segno stampato da `start`).
- Si pubblica **solo** `ospiti.json`. Nessun nome, email o altro dato personale nei comandi, nel
  messaggio di commit o nel riepilogo. Non modificare `index.html`, `src/`, `test/` né `tools/`.
- Se il programma risponde `ERRORE`: **non pubblicare**. La pagina continua con l'ultimo file riuscito e
  mostra da sola quanto sono vecchi i dati.

## Passi

1. Dalla cartella del repository: `node tools/ospiti.mjs start "<PASSWORD>" "<CHIAVE>"`
   (solo la primissima volta, senza `ospiti.json`, si aggiunge `--primo`: non va mai usato altrimenti).
2. `node tools/ospiti.mjs next` e fai quello che dice:
   - `CHIAMA mcp__La_Scatola__query_curated_view {argomenti}`: esegui quella chiamata con quegli
     argomenti, poi di nuovo `next`. Se lo strumento dà errore, riesegui `next`: ripropone la stessa
     chiamata (dopo 3 errori si ferma).
   - `PRONTO`: `ospiti.json` è scritto e verificato. Vai al passo 3.
   - `ERRORE`: fermati, non pubblicare, riporta il messaggio.
   `start` dice quale aggiornamento fa:
   - **INCREMENTALE** (di norma): solo i soggiorni che finiscono dagli ultimi 7 giorni in poi e le loro
     prenotazioni. Servono poche chiamate (circa 4). I soggiorni più vecchi sono già nello storico.
   - **COMPLETO** (il 1° di ogni mese, con `--completo` o senza storico): tutta la finestra di La Scatola,
     circa 40 chiamate (~16 pagine di `curated_guest_stays`, ~26 di `curated_reservations`). È la rete di
     sicurezza per le correzioni tardive fatte in Slope.
   Il server restituisce al massimo ~65 KB per pagina: è normale.
3. Controllo: `node tools/ospiti.mjs verify "<PASSWORD>" "<CHIAVE>"` deve rispondere `verifica OK`.
4. Pubblica: `git add ospiti.json`, commit `Ospiti newsletter <AAAA-MM-GG>`, `git push origin HEAD:main`.
   Se il push è rifiutato perché il repository è cambiato: copia `ospiti.json` fuori dal repository,
   `git fetch origin main`, `git reset --hard origin/main`, rimetti il file, di nuovo add, commit e push.
   Una volta sola. Con errore 403 non insistere: scrivilo nel riepilogo.
5. Riepilogo breve in italiano con le righe `RIEPILOGO` (solo conteggi, nessun dato personale).

## Importare il pacchetto clienti da Slope (tre file Excel)

La Scatola non ha gli ospiti degli anni passati. Il pacchetto clienti esportato da Slope, **un file per casa**
(.xlsx o .csv), si aggiunge allo storico in due modi:

- **Dalla pagina** (chi ha password e chiave): sezione «Aggiorna il pacchetto clienti da Excel», si scelgono i tre
  file, la pagina li legge sul computer (non li invia a nessuno), mostra l'esito e prepara un `ospiti.json`
  aggiornato da caricare su GitHub con «Add file → Upload files».
- **Da qui**:
  ```
  node tools/ospiti.mjs importa "<PASSWORD>" "<CHIAVE>" --hartmann hartmann.xlsx --acadia acadia.xlsx --saslong saslong.xlsx
  ```
  (anche solo uno o due file; oppure `--file tutto.xlsx` se c'è una colonna «Struttura»). Poi commit
  `Importazione pacchetto clienti <AAAA-MM-GG>` con il solo `ospiti.json`.

Regole:
- Le colonne si riconoscono dal nome (Email; Arrivo o Ultimo soggiorno; e se ci sono Nome, Cognome, Lingua,
  Cittadinanza/Nazionalità, Partenza, Data di nascita, Soggiorni), anche in inglese o tedesco, in qualunque ordine.
- Una riga che corrisponde a un soggiorno già letto da La Scatola (stesso ospite, stessa casa, date che si toccano)
  non si importa: vale il dato di La Scatola. Le altre si aggiungono, anche se recenti.
- La colonna «Soggiorni» (numero di visite) rende abituale chi ne ha almeno 2.
- Anagrafica clienti «patrons» (Nome, Cognome, E-mail, Lingua, Aut. e-mail marketing, senza date): un cliente per
  indirizzo e casa, ID generato `ana-…`, consenso «sì» solo se nessuna riga dello stesso indirizzo dice «no».
- Stesse esclusioni (qualunque indirizzo con «booking» o «expedia», portali, minori, indirizzi non validi) e niente
  oltre 24 mesi dall'ultima partenza.
- I soggiorni importati hanno un identificativo generato `imp-…` (mai un ID di Slope) e non vengono tolti
  dall'aggiornamento notturno. Reimportare gli stessi file non crea doppioni.
- I file esportati contengono dati personali: **non si aggiungono mai al repository** (`.gitignore` li esclude).

## Cancellazioni dalla newsletter

Chi chiede di non ricevere più la newsletter si cancella dalla pagina («Cancella un indirizzo», poi si carica
`ospiti.json` su GitHub) oppure da qui:
```
node tools/ospiti.mjs cancella "<PASSWORD>" "<CHIAVE>" indirizzo1 [indirizzo2 …]
node tools/ospiti.mjs cancella "<PASSWORD>" "<CHIAVE>" indirizzo --riattiva   # solo su nuova richiesta scritta dell'ospite
```
Poi commit `Cancellazione newsletter <AAAA-MM-GG>` con il solo `ospiti.json` (nessun indirizzo nel messaggio).
L'aggiornamento notturno conserva sempre la lista e non reinserisce mai quegli indirizzi; `verify` si ferma se
nello storico ne resta uno.

## Credenziali (doppio controllo)

- `node tools/ospiti.mjs chiave` genera una chiave del computer nuova.
- `node tools/ospiti.mjs cambia "<PASSWORD>" "<CHIAVE>" "<NUOVA PASSWORD>" "<NUOVA CHIAVE>"` ricifra lo storico.
  Subito dopo va aggiornato il testo dell'attività pianificata, e le nuove credenziali si consegnano di persona.
- Cambiarle quando una persona con accesso lascia l'azienda, e comunque ogni 6 mesi.

## Modifiche al codice

Sorgente TypeScript in `src/` (`shared/model.ts` regole, `cli/` programma, `app/` pagina).
`npm install && node build.mjs --test` rigenera `index.html`, `tools/ospiti.mjs`, `dist/prova.html`
ed esegue i test con dati inventati.
