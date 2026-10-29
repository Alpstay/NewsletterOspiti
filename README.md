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
- **Pagina**: decifra nel browser; la Content-Security-Policy permette di scaricare dati solo dal
  proprio sito, quindi email e password non possono partire verso altri indirizzi. L'Excel si genera
  in locale.

## Regole sui dati

- Esclusi automaticamente: indirizzi mascherati dei portali (Booking, Expedia, Airbnb…), indirizzi non
  validi o interni AlpStay, minorenni, prenotazioni cancellate o in opzione.
- Conservati solo nome, cognome, email, lingua, cittadinanza, date dei soggiorni, casa, canale e data
  dell'informativa privacy. Niente telefono, documento, data di nascita o residenza.
- Gli ID di Slope si copiano identici: il programma rifiuta un ID che non abbia la forma di un UUID.
- **Lingua**: in Slope «it» è il valore predefinito; vale solo se confermato dalla cittadinanza,
  altrimenti la lingua si deduce dalla cittadinanza (stessa regola delle colazioni) e viene segnalata.
- **Abituale**: almeno due soggiorni distinti nello storico (soggiorni attaccati, anche in case diverse,
  contano come uno), oppure informativa privacy accettata più di 14 giorni prima della prenotazione
  (cliente già noto a Slope).
- Le disiscrizioni restano nello strumento newsletter: reimportando l'elenco, chi si è disiscritto
  resta escluso.

## Sviluppo

```
npm install
node build.mjs --test     # index.html, tools/ospiti.mjs, dist/prova.html + test con dati inventati
```

`dist/prova.html` è la stessa pagina con 140 ospiti inventati, senza password.
