# Margherita & Francescone — Il Quiz degli Sposi

Pagina singola, senza dipendenze: si apre `index.html` e funziona.
Due schede (Margherita e Francescone) che si alternano: uno legge la domanda,
l'altro prova a indovinare. Se indovina, si preme **"Indovinato!"** e la domanda
successiva compare automaticamente nella scheda dell'altro. Alla fine arriva la
schermata di successo con i coriandoli e il punteggio.

## Come personalizzare le domande

Tutto quello che serve è la lista `QUIZ` in fondo a `index.html`:

```js
const QUIZ = [
  { to:"margherita",  q:"La domanda...", a:"La risposta giusta" },
  { to:"francescone", q:"La domanda...", a:"La risposta giusta" },
];
```

- `to` → chi deve **indovinare** (`"margherita"` o `"francescone"`); l'altro legge la domanda
- `q` → il testo della domanda
- `a` → la risposta giusta, visibile solo con il pulsante "Mostra la risposta"

Si possono aggiungere o togliere domande liberamente: il contatore, la barra di
avanzamento e i turni si adattano da soli.

## Pubblicare su GitHub Pages

1. Push del repository su GitHub
2. **Settings → Pages → Source: Deploy from a branch**
3. Branch: quello con questi file, cartella `/ (root)` → **Save**
4. Dopo un minuto la pagina è online su `https://<utente>.github.io/<repository>/`

## Note

- L'avanzamento viene salvato nel browser (`localStorage`), quindi se si ricarica
  la pagina il gioco riprende dalla domanda giusta. "Ricomincia da capo" azzera tutto.
- Pensata per il telefono: si passa il telefono di mano in mano a ogni turno.
