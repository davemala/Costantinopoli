# Totopapaveromania

Web app per il gioco a missioni con le squadriglie. Nessuna dipendenza: basta Node 18+.

## Come funziona

**Squadre** (`/`)
1. Scrivono il nome della squadriglia ed entrano. Se rientrano con lo stesso nome
   (anche da un altro telefono) ritrovano la loro partita.
2. Il telefono chiede il permesso per la posizione: da lì, per **3 ore**, la posizione
   viene inviata ai capi ogni 20 secondi circa. La pagina tiene lo schermo acceso.
3. Vedono la prima delle loro **3 missioni estratte a caso** → premono *Missione completata* → compare la **domanda 1**
   → inviano la risposta → compare la **missione 2**, e così via per 3 prove.
4. Dopo l'ultima risposta compare il **punto di arrivo**, con il pulsante per aprirlo su Google Maps.

**Capi** (`/admin`, password nella variabile `ADMIN_PASSWORD`, di default `capi`)
- Mappa con l'ultima posizione di ogni squadra, a che punto sono e (opzionale) il percorso fatto.
- Le risposte di ogni squadra alle domande, con l'orario.
- *Riporta*: rimanda una squadra all'inizio di una missione (es. se hanno premuto "completata" per sbaglio).
- *Elimina*: cancella una squadra (es. nomi di prova).
- Si aggiorna da sola ogni 10 secondi. In rosso le squadre senza posizione da più di 5 minuti.

## Inserire missioni, domande e punto di arrivo

Tutto il contenuto sta in **`gioco.json`**:

- `missioni`: l'elenco di tutte le missioni possibili. Ogni squadriglia, quando entra, ne riceve
  **3 a caso** (tante quante sono le domande), preferendo quelle date a meno squadriglie, così non
  vanno tutte negli stessi posti.
- `domande`: le 3 domande, uguali per tutti e sempre nello stesso ordine
  (missione 1 → domanda 1 → missione 2 → domanda 2 → …).
- `arrivo`: testo e coordinate del punto finale. Le coordinate si prendono da Google Maps:
  tasto destro (o tieni premuto) sul punto → si copiano i due numeri.

Nei testi si può andare a capo con `\n`. Le squadriglie vedono solo la prova corrente.
Le missioni vengono estratte quando la squadriglia entra: se cambiate l'elenco a gioco iniziato,
le squadriglie già entrate tengono le posizioni nell'elenco che avevano.

## Provarla sul computer

```bash
node server.js
# squadre: http://localhost:3000   capi: http://localhost:3000/admin
```

## Pubblicarla (Render, gratis)

La posizione funziona solo su **https**, quindi serve pubblicarla online.

1. Su [render.com](https://render.com) → *New* → *Blueprint* → collega questo repository (usa `render.yaml`).
2. Quando lo chiede, scegli la password dei capi (`ADMIN_PASSWORD`).
3. Dopo qualche minuto avrai un indirizzo tipo `https://totopapaveromania.onrender.com`: quello va dato ai ragazzi, `/admin` ai capi.

⚠️ Sul piano gratuito i dati (squadre, posizioni, risposte) stanno su un disco temporaneo:
**si perdono se il servizio si riavvia o si ripubblica**, e il servizio si addormenta dopo 15 minuti
senza visite. Quindi:
- aprite la pagina qualche minuto prima di iniziare (il primo caricamento dopo la pausa è lento);
- non modificate il repository durante il gioco (ogni modifica ripubblica e azzera tutto);
- finché le squadre giocano, le posizioni inviate lo tengono sveglio.

Se serve che i dati sopravvivano, si può aggiungere un disco persistente (Render a pagamento,
oppure Railway/Fly.io con un volume) e impostare `DATA_DIR` sul percorso del disco.

## iPhone e Android

Funziona dal browser su entrambi (Safari o Chrome su iPhone, Chrome su Android): non serve installare nulla.
- Al primo ingresso il telefono chiede il permesso per la posizione: rispondere **Consenti**.
- Se l'hanno negato, la pagina spiega dove riattivarlo (diverso per iPhone e Android).
- Lo schermo resta acceso da solo su Android e su iPhone con iOS 16.4 o successivo.

## Limiti da sapere

- I browser inviano la posizione solo **con la pagina aperta**: se il telefono va in tasca a
  schermo spento o si cambia app, la posizione si ferma finché non si riapre la pagina.
  Conviene dire ai ragazzi di tenere la pagina aperta (lo schermo resta acceso da solo su Android
  e iPhone recenti) e magari portare un powerbank.
- Chiunque scriva il nome di una squadra esistente entra in quella squadra.
