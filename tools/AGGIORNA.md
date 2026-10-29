# Aggiornamento notturno degli ospiti per la newsletter (La Scatola → ospiti.json)

Procedura per l'attività pianificata che ogni notte riscrive `ospiti.json`: lo **storico cifrato**
degli ospiti con email che la pagina https://alpstay.github.io/NewsletterOspiti/ mostra ad Adriela.
La **password** NON è in questo repository (è pubblico): viene data nel testo dell'attività pianificata.

## Perché uno storico

La Scatola conserva i dati degli ospiti solo per una finestra mobile (circa gli ultimi due mesi più le
prenotazioni future). Per riconoscere gli **abituali** il programma unisce ogni notte quello che legge
con lo storico già cifrato in `ospiti.json`:
- dentro la finestra di La Scatola vale La Scatola (un soggiorno sparito da Slope si toglie);
- prima della finestra vale lo storico;
- dopo 24 mesi dall'ultima partenza un soggiorno si cancella comunque.

Per questo `start` controlla subito che la password apra lo storico: con una password sbagliata lo
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

1. Dalla cartella del repository: `node tools/ospiti.mjs start "<PASSWORD>"`
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
3. Controllo: `node tools/ospiti.mjs verify "<PASSWORD>"` deve rispondere `verifica OK`.
4. Pubblica: `git add ospiti.json`, commit `Ospiti newsletter <AAAA-MM-GG>`, `git push origin HEAD:main`.
   Se il push è rifiutato perché il repository è cambiato: copia `ospiti.json` fuori dal repository,
   `git fetch origin main`, `git reset --hard origin/main`, rimetti il file, di nuovo add, commit e push.
   Una volta sola. Con errore 403 non insistere: scrivilo nel riepilogo.
5. Riepilogo breve in italiano con le righe `RIEPILOGO` (solo conteggi, nessun dato personale).

## Importare lo storico da un'esportazione di Slope

La Scatola non ha gli ospiti degli anni passati. Per far riconoscere subito gli abituali si può aggiungere
allo storico un'esportazione di Slope (Excel .xlsx o CSV) con almeno le colonne email e data di arrivo:

```
node tools/ospiti.mjs importa esportazione.xlsx "<PASSWORD>"            # con una colonna Struttura/Hotel
node tools/ospiti.mjs importa esportazione.xlsx "<PASSWORD>" --casa saslong   # esportazione di una sola casa
```

- Le colonne si riconoscono dal nome (Nome, Cognome, Email, Lingua, Cittadinanza/Nazionalità, Arrivo,
  Partenza, Struttura, Data di nascita; anche in inglese o tedesco), in qualunque ordine.
- Si importano solo i soggiorni **prima** della finestra di La Scatola (da lì in poi valgono i dati
  aggiornati ogni notte) e non più vecchi di 24 mesi; stesse esclusioni (portali, minori, …).
- I soggiorni importati hanno un identificativo generato `imp-…` (non è un ID di Slope) e non vengono
  mai tolti dall'aggiornamento notturno. Reimportare lo stesso file non crea doppioni.
- Il file esportato contiene dati personali: si usa nella sessione e **non si aggiunge al repository**.
  Si pubblica solo `ospiti.json` (commit `Importazione storico <AAAA-MM-GG>`).

## Modifiche al codice

Sorgente TypeScript in `src/` (`shared/model.ts` regole, `cli/` programma, `app/` pagina).
`npm install && node build.mjs --test` rigenera `index.html`, `tools/ospiti.mjs`, `dist/prova.html`
ed esegue i test con dati inventati.
