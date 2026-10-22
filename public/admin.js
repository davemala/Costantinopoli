const AGGIORNA_OGNI_MS = 10000;
const COLORI = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#000075', '#808000', '#469990', '#e6a700'];
const $ = (id) => document.getElementById(id);

let password = sessionStorageGet();
let mappa = null;
let livelli = null;
let primaVista = true;
let chiaveSchede = '';
let ultimiDati = null;

function sessionStorageGet() {
  try { return sessionStorage.getItem('pw'); } catch (e) { return null; }
}
function sessionStorageSet(v) {
  try { sessionStorage.setItem('pw', v); } catch (e) { /* niente */ }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ora = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

function fa(t, adesso) {
  const min = Math.round((adesso - t) / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  return `${Math.floor(min / 60)} h ${min % 60} min fa`;
}

async function chiama(url, dati) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...dati }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.errore || 'Errore di connessione'), { status: r.status });
  return j;
}

const urlFoto = (f) => `/foto/${encodeURIComponent(f.file)}?password=${encodeURIComponent(password)}`;

function descriviFase(s, totale) {
  if (s.fase === 'arrivo') return 'Verso il punto di arrivo';
  return `${s.fase === 'missione' ? 'Missione' : 'Domanda'} ${s.prova + 1} di ${totale}`;
}

function disegnaMappa(dati) {
  if (!mappa) {
    mappa = L.map('mappa');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mappa);
    livelli = L.layerGroup().addTo(mappa);
    mappa.setView([42.5, 12.5], 6); // Italia, finché non arrivano posizioni
  }
  livelli.clearLayers();
  const confini = [];
  const conPercorsi = $('mostraPercorsi').checked;

  const { lat, lng } = dati.gioco.arrivo;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    L.marker([lat, lng]).bindTooltip('Punto di arrivo').addTo(livelli);
    confini.push([lat, lng]);
  }

  dati.squadre.forEach((s, i) => {
    const colore = COLORI[i % COLORI.length];
    if (conPercorsi && s.percorso.length > 1) {
      L.polyline(s.percorso.map((p) => [p[0], p[1]]), { color: colore, weight: 3, opacity: 0.6 }).addTo(livelli);
    }
    s.foto.filter((f) => f.posizione).forEach((f) => {
      L.marker([f.posizione.lat, f.posizione.lng], {
        icon: L.divIcon({ className: 'segno-foto', html: `<span style="border-color:${colore}">📷${f.prova}</span>`, iconSize: [34, 22] }),
      }).bindTooltip(`${esc(s.nome)} · foto missione ${f.prova} · ${ora(f.ora)}`).addTo(livelli);
    });
    if (!s.ultimaPosizione) return;
    const p = [s.ultimaPosizione.lat, s.ultimaPosizione.lng];
    confini.push(p);
    L.circleMarker(p, { radius: 9, color: '#fff', weight: 2, fillColor: colore, fillOpacity: 1 })
      .bindTooltip(`<b>${esc(s.nome)}</b><br>${descriviFase(s, dati.gioco.domande.length)}<br>${fa(s.ultimaPosizione.ora, dati.ora)}${s.ultimaPosizione.fonte === 'foto' ? ' (dalla foto)' : ''}`,
        { permanent: true, direction: 'right', offset: [10, 0] })
      .addTo(livelli);
  });

  if (primaVista && confini.length) {
    mappa.fitBounds(confini, { padding: [40, 40], maxZoom: 16 });
    primaVista = false;
  }
}

function disegnaSchede(dati) {
  const totale = dati.gioco.domande.length;
  const chiave = JSON.stringify(dati.squadre.map((s) => [s.id, s.prova, s.fase, s.risposte.length, s.foto.length]));
  if (chiave !== chiaveSchede) {
    chiaveSchede = chiave;
    $('squadre').innerHTML = dati.squadre.map((s, i) => `
      <div class="card" data-id="${s.id}">
        <div class="sq-titolo"><span class="colore" style="background:${COLORI[i % COLORI.length]}"></span>${esc(s.nome)}</div>
        <div class="meta">${descriviFase(s, totale)} · entrata alle ${ora(s.creata)}<br><span class="vista"></span></div>
        <div class="missioni">${s.missioni.map((m, n) => `<div class="${n < s.prova || s.fase === 'arrivo' ? 'fatta' : ''}">${n + 1}. ${esc(dati.gioco.missioni[m])}</div>`).join('')}</div>
        ${s.foto.length ? `<div class="foto">${s.foto.map((f) => `
          <a href="${urlFoto(f)}" target="_blank" rel="noopener" title="Missione ${f.prova} · ${ora(f.ora)}">
            <img src="${urlFoto(f)}" loading="lazy" alt="Foto della missione ${f.prova}"><span>M${f.prova}</span>
          </a>`).join('')}</div>` : ''}
        ${s.risposte.length ? s.risposte.map((r) => `
          <div class="risposta">
            <div class="d">Domanda ${r.prova} · ${ora(r.ora)} — ${esc(r.domanda)}</div>
            <div class="r">${esc(r.risposta)}</div>
          </div>`).join('') : '<div class="risposta d">Nessuna risposta ancora</div>'}
        <div class="azioni">
          <select>${s.missioni.map((_, n) => `<option value="${n}">Missione ${n + 1}</option>`).join('')}</select>
          <button class="secondario" data-azione="riporta">Riporta</button>
          <button class="secondario" data-azione="elimina">Elimina</button>
        </div>
      </div>`).join('') || '<div class="card">Nessuna squadra è ancora entrata.</div>';
  }
  // Questi cambiano a ogni aggiornamento: li tocchiamo senza ridisegnare la scheda.
  dati.squadre.forEach((s) => {
    const el = document.querySelector(`[data-id="${s.id}"] .vista`);
    if (!el) return;
    const p = s.ultimaPosizione;
    const vecchia = p && dati.ora - p.ora > 5 * 60000;
    el.className = 'vista' + (!p || vecchia ? ' vecchia' : '');
    el.textContent = p
      ? (p.fonte === 'foto' ? `Posizione dalla foto, ${fa(p.ora, dati.ora)}` : `Posizione ${fa(p.ora, dati.ora)} (±${Math.round(p.precisione || 0)} m)`)
      : 'Nessuna posizione ricevuta';
  });
}

function disegna(dati) {
  ultimiDati = dati;
  $('formLogin').classList.add('nascosto');
  $('pannello').classList.remove('nascosto');
  const arrivate = dati.squadre.filter((s) => s.fase === 'arrivo').length;
  $('riepilogo').textContent = `${dati.squadre.length} squadre · ${arrivate} con il punto di arrivo`;
  $('aggiornato').textContent = `aggiornato alle ${new Date(dati.ora).toLocaleTimeString('it-IT')}`;
  disegnaSchede(dati);
  if (window.L) disegnaMappa(dati);
  else $('mappa').textContent = 'Mappa non disponibile (serve la connessione a internet).';
}

async function aggiorna() {
  if (!password) return;
  try {
    disegna(await chiama('/api/admin', {}));
  } catch (err) {
    if (err.status === 401) {
      password = null;
      $('formLogin').classList.remove('nascosto');
      $('pannello').classList.add('nascosto');
      $('erroreLogin').textContent = err.message;
    } else {
      $('aggiornato').textContent = 'connessione persa, riprovo…';
    }
  }
}

$('formLogin').addEventListener('submit', (e) => {
  e.preventDefault();
  $('erroreLogin').textContent = '';
  password = $('campoPassword').value;
  sessionStorageSet(password);
  aggiorna();
});

$('mostraPercorsi').addEventListener('change', () => ultimiDati && window.L && disegnaMappa(ultimiDati));

$('squadre').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-azione]');
  if (!btn) return;
  const scheda = btn.closest('[data-id]');
  const nome = scheda.querySelector('.sq-titolo').textContent;
  const id = scheda.dataset.id;
  try {
    if (btn.dataset.azione === 'riporta') {
      const prova = Number(scheda.querySelector('select').value);
      if (!confirm(`Riportare "${nome}" all'inizio della missione ${prova + 1}? Le risposte da lì in poi verranno cancellate.`)) return;
      disegna(await chiama('/api/admin/riporta', { id, prova }));
    } else {
      if (!confirm(`Eliminare la squadra "${nome}" con posizioni e risposte?`)) return;
      disegna(await chiama('/api/admin/elimina', { id }));
    }
  } catch (err) {
    alert(err.message);
  }
});

aggiorna();
setInterval(aggiorna, AGGIORNA_OGNI_MS);
