# Totopapaveromania

Web app per il gioco a missioni con le squadriglie. Nessuna dipendenza: basta Node 18+.

## Come funziona

**Squadre** (`/`)
1. Scrivono il nome della squadriglia ed entrano. Se rientrano con lo stesso nome
   (anche da un altro telefono) ritrovano la loro partita.
2. Il telefono chiede il permesso per la posizione: da lì, per **3 ore**, la posizione
   viene inviata ai capi ogni 20 secondi circa. La pagina tiene lo schermo acceso.
3. Vedono la **missione 1** → premono *Missione completata* → compare la **domanda 1**
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

```json
{
  "titolo": "Totopapaveromania",
  "durataTracciamentoOre": 3,
  "prove": [
    { "missione": "Testo della sfida 1", "domanda": "Testo della domanda 1" },
    { "missione": "…", "domanda": "…" },
    { "missione": "…", "domanda": "…" }
  ],
  "arrivo": { "testo": "Raggiungete…", "lat": 45.4642, "lng": 9.19 }
}
```

- Le coordinate dell'arrivo si prendono da Google Maps: tasto destro (o tieni premuto) sul punto → si copiano i due numeri.
- Si possono aggiungere o togliere prove: il gioco segue quante ce ne sono nella lista.
- Nei testi si può andare a capo con `\n`.
- Le squadre vedono solo la prova corrente: le successive restano sul server finché non ci arrivano.

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

## Limiti da sapere

- I browser inviano la posizione solo **con la pagina aperta**: se il telefono va in tasca a
  schermo spento o si cambia app, la posizione si ferma finché non si riapre la pagina.
  Conviene dire ai ragazzi di tenere la pagina aperta (lo schermo resta acceso da solo su Android
  e iPhone recenti) e magari portare un powerbank.
- Chiunque scriva il nome di una squadra esistente entra in quella squadra.
