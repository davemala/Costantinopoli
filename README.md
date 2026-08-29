# Margherita & Francescone — Il Quiz degli Sposi

Pagina singola, senza dipendenze: si apre `index.html` e funziona (anche offline).

## Come si gioca

Due schede in alto, **Margherita** e **Francescone**. La scheda con la prova è
sempre quella di **chi fa la domanda**, cioè di chi tiene il telefono in mano:
così chi deve indovinare non vede la soluzione, il mimo o la foto.

Se l'altro indovina si preme **"Ha indovinato! Avanti →"** e la prova successiva
compare da sola nella scheda dell'altro (il telefono passa di mano). Alla fine
arriva la schermata di successo con i coriandoli e i punteggi.

Parte **Francescone**: è il primo a dover indovinare, quindi il telefono comincia
in mano a Margherita. Da lì cambia mano a ogni prova, senza mai due turni di fila
alla stessa persona.

| # | Chi ha il telefono | Chi indovina | Prova |
|---|--------------------|--------------|-------|
| 1 | Margherita | Francescone | Mimo → *Clarinetto* |
| 2 | Francescone | Margherita | "Come si chiama il nostro gruppo?" → *Costantinopoli* |
| 3 | Margherita | Francescone | Indovinello in versi → *Margherita* |
| 4 | Francescone | Margherita | Foto del mezzo chilo di stracciatella → *una schiscetta* |
| 5 | Margherita | Francescone | "Il vostro prof disperso sulle Alpi?" → *Dell'Amico* |

## La foto della quarta prova

È già nel repository, in `foto/stracciatella.jpg`. Per sostituirla basta
rimpiazzare il file mantenendo lo stesso nome, oppure cambiare il campo `img`
della domanda. Se il file manca, al suo posto la pagina mostra un riquadro
tratteggiato con il promemoria.

## Come modificare le domande

Tutto sta nella lista `QUIZ` dentro `index.html`:

```js
{ indovina:"margherita", tipo:"testo", q:"La domanda...", a:"La risposta" }
```

- `indovina` → chi deve **indovinare** (`"margherita"` o `"francescone"`); la scheda
  compare automaticamente all'altro
- `tipo` → `"testo"` (domanda letta ad alta voce), `"mimo"` (la parola resta sfocata
  finché non la tocchi, così non la vede nessuno per sbaglio), `"foto"` (aggiungi
  anche `img:"foto/nome.jpg"`), `"poesia"` (versi da leggere, gli a capo si scrivono con `\n`)
- `q` → il testo della prova, `a` → la risposta giusta

Si possono aggiungere o togliere prove liberamente: contatore, barra di
avanzamento e turni si adattano da soli.

## Pubblicare su GitHub Pages

1. Push del repository su GitHub
2. **Settings → Pages → Source: Deploy from a branch**
3. Branch: quello con questi file, cartella `/ (root)` → **Save**
4. Dopo un minuto la pagina è online su `https://<utente>.github.io/<repository>/`

## Note

- L'avanzamento resta salvato nel browser (`localStorage`): se la pagina si ricarica
  il gioco riprende dalla prova giusta. "Ricomincia da capo" azzera tutto.
- "Mostra la risposta" serve a chi fa la domanda per verificare; sui mimi non c'è,
  la parola da mimare è già lì.
