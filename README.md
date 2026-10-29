# Ospiti per la newsletter · AlpStay

Pagina per Adriela: elenco degli ospiti delle tre case AlpStay con un'email vera, da filtrare e
scaricare in Excel per la newsletter. Online su https://alpstay.github.io/NewsletterOspiti/ (password).

## Come funziona

- **Dati**: La Scatola (copia dei dati di Slope), vista `curated_guest_stays` per gli ospiti con email e
  `curated_reservations` per stato, canale e data di prenotazione.
- **Aggiornamento**: un'attività pianificata ogni notte esegue `tools/AGGIORNA.md` e pubblica solo
  `ospiti.json`, cifrato (AES-256-GCM, chiave da PBKDF2-SHA256 600 000 iterazioni). Stesso principio
  di Colazioni SAS, DailyList e WelcomeHartmann.
- **Storico**: La Scatola tiene i dati degli ospiti solo per una finestra mobile; lo storico cifrato li
  conserva per 24 mesi dall'ultima partenza, così gli abituali si riconoscono anche negli anni.
- **Solo i dati nuovi**: di notte si rileggono soltanto i soggiorni che finiscono dagli ultimi 7 giorni in
  poi (~4 chiamate); il 1° di ogni mese una lettura completa fa da rete di sicurezza.
- **Importazione**: il pacchetto clienti di Slope (un file Excel per casa: Hartmann, Acadia, Saslong) si aggiunge
  dalla pagina o con `node tools/ospiti.mjs importa` (dettagli in `tools/AGGIORNA.md`).
- **Pagina**: decifra nel browser; la Content-Security-Policy permette di scaricare dati solo dal
  proprio sito, quindi email e password non possono partire verso altri indirizzi. L'Excel si genera
  in locale.

## Sicurezza

- **Doppio controllo**: `ospiti.json` si apre solo con password **e** chiave del computer (`NLK-…`, circa 125 bit
  casuali, salvata una volta sul computer autorizzato). Chi scarica il file pubblico, o conosce solo la password,
  non può leggere nulla.
- **Blocco automatico** dopo 15 minuti senza attività.
- **Indirizzo di controllo** in ogni Excel (`info+nl-<data>-<codice>@alpstay.eu`, recapitato nella casella info):
  se riceve messaggi che non sono la newsletter, quell'elenco è uscito, e il codice dice da quale esportazione.
  Il registro delle esportazioni di ogni computer è nella pagina.
- **GitHub**: accesso con verifica in due passaggi; il file si cambia solo da utenti autenticati o dall'attività
  pianificata.

## Regole sui dati

- Esclusi automaticamente: ogni indirizzo che contiene «booking» o «expedia» in qualunque punto (nome o
  dominio), gli indirizzi mascherati degli altri portali (Airbnb, Agoda…), indirizzi non validi o interni
  AlpStay, minorenni, prenotazioni cancellate o in opzione. Le regole valgono anche sullo storico già salvato:
  a ogni scrittura chi non le supera più viene tolto.
- Conservati solo nome, cognome, email, lingua, cittadinanza, date dei soggiorni, casa, canale e data
  dell'informativa privacy. Niente telefono, documento, data di nascita o residenza.
- Gli ID di Slope si copiano identici: il programma rifiuta un ID che non abbia la forma di un UUID.
- **Lingua**: in Slope «it» è il valore predefinito; vale solo se confermato dalla cittadinanza,
  altrimenti la lingua si deduce dalla cittadinanza (stessa regola delle colazioni) e viene segnalata.
- **Abituale**: almeno due soggiorni distinti nello storico (soggiorni attaccati, anche in case diverse,
  contano come uno), oppure informativa privacy accettata più di 14 giorni prima della prenotazione
  (cliente già noto a Slope).
- **Cancellazione su richiesta** («Cancella un indirizzo» nella pagina, oppure `node tools/ospiti.mjs cancella`):
  l'ospite sparisce dall'elenco e dagli Excel, tutti i suoi soggiorni si tolgono dallo storico e resta solo
  l'impronta SHA-256 dell'email (dentro il file cifrato), così né l'aggiornamento notturno né un'importazione lo
  reinseriscono. La lista non si perde mai: ogni scrittura la unisce a quella del file precedente, e la pagina
  riapplica le cancellazioni fatte su quel computer finché il file pubblicato non le contiene. Va tolto anche dallo
  strumento con cui si spedisce la newsletter.

## Sviluppo

```
npm install
node build.mjs --test     # index.html, tools/ospiti.mjs, dist/prova.html + test con dati inventati
```

`dist/prova.html` è la stessa pagina con 140 ospiti inventati, senza password.
