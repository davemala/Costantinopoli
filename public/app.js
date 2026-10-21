const INVIO_OGNI_MS = 20000; // ogni quanto mandare la posizione al server
const $ = (id) => document.getElementById(id);

const IPHONE = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const AIUTO_POSIZIONE = IPHONE
  ? 'Posizione negata. Andate in Impostazioni → Privacy e sicurezza → Localizzazione: attivatela, poi in "Siti web di Safari" (o Chrome) scegliete "Mentre usi l\'app" con posizione esatta. Poi ricaricate la pagina.'
  : 'Posizione negata. Toccate il lucchetto accanto all\'indirizzo → Autorizzazioni → Posizione → Consenti, controllate che la posizione del telefono sia accesa, poi ricaricate la pagina.';

let squadra = null;
let watchId = null;
let ultimoInvio = 0;
let wakeLock = null;

async function chiama(url, dati) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dati),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.errore || 'Errore di connessione'), { status: r.status });
  return j;
}

function leggiToken() {
  try { return localStorage.getItem('token'); } catch (e) { return null; }
}
function scriviToken(t) {
  try { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } catch (e) { /* niente */ }
}

function mostra(s) {
  squadra = s;
  scriviToken(s.token);
  $('schermoIngresso').classList.add('nascosto');
  $('schermoGioco').classList.remove('nascosto');
  $('titolo').textContent = s.titolo;
  $('nomeSq').textContent = s.nome;

  const fatte = s.fase === 'arrivo' ? s.totale : s.prova - 1 + (s.fase === 'domanda' ? 0.5 : 0);
  $('progresso').innerHTML = Array.from({ length: s.totale }, (_, i) =>
    `<span class="${i < fatte ? 'fatto' : ''}"></span>`).join('');

  $('etichettaFase').textContent =
    s.fase === 'missione' ? `Missione ${s.prova} di ${s.totale}` :
    s.fase === 'domanda' ? `Domanda ${s.prova} di ${s.totale}` : 'Punto di arrivo';
  $('testoFase').textContent = s.testo;

  $('bloccoMissione').classList.toggle('nascosto', s.fase !== 'missione');
  $('bloccoDomanda').classList.toggle('nascosto', s.fase !== 'domanda');
  $('bloccoArrivo').classList.toggle('nascosto', s.fase !== 'arrivo');
  if (s.fase === 'arrivo') {
    $('linkMappa').href = `https://www.google.com/maps/search/?api=1&query=${s.arrivo.lat},${s.arrivo.lng}`;
  }

  avviaPosizione();
}

// ---------- Posizione ----------

function statoGps(testo, ok) {
  $('statoGps').textContent = testo;
  $('pallinoGps').className = 'pallino' + (ok === true ? ' ok' : ok === false ? ' ko' : '');
}

function tracciamentoScaduto() {
  return squadra && Date.now() > squadra.tracciamentoFino;
}

function avviaPosizione() {
  if (watchId !== null) return;
  if (tracciamentoScaduto()) return statoGps('Tracciamento concluso', null);
  if (!('geolocation' in navigator)) return statoGps('Questo telefono non supporta la posizione', false);

  watchId = navigator.geolocation.watchPosition(inviaPosizione, (err) => {
    statoGps(err.code === 1 ? AIUTO_POSIZIONE : 'Posizione non disponibile, riprovo…', false);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  tieniSchermoAcceso();
}

function fermaPosizione() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

async function inviaPosizione(pos) {
  if (tracciamentoScaduto()) {
    fermaPosizione();
    return statoGps('Tracciamento concluso', null);
  }
  const ora = Date.now();
  if (ora - ultimoInvio < INVIO_OGNI_MS) return;
  ultimoInvio = ora;
  try {
    await chiama('/api/posizione', {
      token: squadra.token,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      precisione: pos.coords.accuracy,
    });
    statoGps(`Posizione attiva · inviata alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`, true);
  } catch (e) {
    ultimoInvio = 0; // riprova al prossimo aggiornamento
    statoGps('Posizione attiva, ma niente rete: riprovo…', false);
  }
}

// Evita che lo schermo si spenga (e con lui il GPS) mentre la pagina è aperta.
async function tieniSchermoAcceso() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { /* non supportato o negato: pazienza */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && squadra) {
    if (watchId !== null) tieniSchermoAcceso();
    aggiorna();
  }
});

// ---------- Azioni ----------

$('formIngresso').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erroreIngresso').textContent = '';
  const btn = e.currentTarget.querySelector('button');
  btn.disabled = true;
  try {
    mostra(await chiama('/api/entra', { nome: $('campoNome').value }));
  } catch (err) {
    $('erroreIngresso').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('btnFatta').addEventListener('click', async () => {
  if (!confirm('Avete davvero completato la missione?')) return;
  $('btnFatta').disabled = true;
  try {
    mostra(await chiama('/api/missione-fatta', { token: squadra.token }));
  } catch (err) {
    alert(err.message);
  } finally {
    $('btnFatta').disabled = false;
  }
});

$('bloccoDomanda').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erroreRisposta').textContent = '';
  const btn = e.currentTarget.querySelector('button');
  btn.disabled = true;
  try {
    mostra(await chiama('/api/rispondi', {
      token: squadra.token,
      prova: squadra.prova,
      risposta: $('campoRisposta').value,
    }));
    $('campoRisposta').value = '';
    window.scrollTo(0, 0);
  } catch (err) {
    $('erroreRisposta').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// Ricarica lo stato dal server (se i capi spostano la squadra, o se un altro telefono della squadra va avanti).
async function aggiorna() {
  const token = squadra ? squadra.token : leggiToken();
  if (!token) return;
  try {
    const s = await chiama('/api/stato', { token });
    const cambiato = !squadra || s.fase !== squadra.fase || s.prova !== squadra.prova || s.testo !== squadra.testo;
    if (cambiato) mostra(s);
  } catch (err) {
    if (err.status === 404) { // squadra eliminata dai capi
      scriviToken(null);
      location.reload();
    }
  }
}

aggiorna();
setInterval(aggiorna, 15000);
