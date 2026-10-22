const INVIO_OGNI_MS = 20000; // ogni quanto mandare la posizione al server
const LATO_MAX_FOTO = 1600; // le foto si rimpiccioliscono sul telefono prima dell'invio
const $ = (id) => document.getElementById(id);

const IPHONE = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let senzaPosizione = false; // la squadra ha scelto di giocare comunque senza posizione

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
  if (!squadra || s.fase !== squadra.fase || s.prova !== squadra.prova) azzeraFoto();
  squadra = s;
  scriviToken(s.token);
  $('schermoIngresso').classList.add('nascosto');
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
    const { lat, lng, link } = s.arrivo;
    $('linkMappa').href = link
      || (IPHONE ? `https://maps.apple.com/?ll=${lat},${lng}&q=Arrivo` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  }

  controllaPosizione();
}

// ---------- Posizione ----------

function mostraGioco() {
  $('schermoPosizione').classList.add('nascosto');
  $('schermoGioco').classList.remove('nascosto');
  aggiornaSceltaFoto();
}

// Senza posizione dal vivo la posizione si prende dal GPS della foto. Le foto scattate da qui
// (pulsante "Scatta") non ce l'hanno, quindi si deve scattare con la Fotocamera e caricare dalla galleria.
function servePosizioneDallaFoto() {
  return watchId === null && !tracciamentoScaduto();
}

function aggiornaSceltaFoto() {
  const serve = servePosizioneDallaFoto();
  $('etichettaScatta').classList.toggle('nascosto', serve);
  $('etichettaGalleria').textContent = serve ? '🖼️ Carica la foto' : '🖼️ Dalla galleria';
  // Su iPhone il menu di Safari offre anche "Scatta foto", che però dà foto senza posizione: non si può togliere.
  $('suggerimentoIphone').classList.toggle('nascosto', !(serve && IPHONE));
}

function chiediPosizione(conAiuto) {
  $('schermoGioco').classList.add('nascosto');
  $('schermoPosizione').classList.remove('nascosto');
  $('aiutoPosizione').classList.toggle('nascosto', !conAiuto);
}

// Se il permesso c'è già si parte subito, altrimenti si mostra il pulsante per chiederlo.
async function controllaPosizione() {
  if (watchId !== null || senzaPosizione || tracciamentoScaduto() || !('geolocation' in navigator)) {
    if (tracciamentoScaduto()) statoGps('Tracciamento concluso', null);
    else if (!('geolocation' in navigator)) statoGps('Questo telefono non supporta la posizione', false);
    return mostraGioco();
  }
  let permesso = 'prompt';
  try {
    permesso = (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch (e) { /* browser senza Permissions API: si chiede col pulsante */ }
  if (permesso === 'granted') {
    avviaPosizione();
    mostraGioco();
  } else {
    chiediPosizione(permesso === 'denied');
  }
}


$('btnPosizione').addEventListener('click', () => {
  const btn = $('btnPosizione');
  btn.disabled = true;
  btn.textContent = 'Attendo il telefono…';
  let finito = false;
  const fine = () => {
    if (finito) return false;
    finito = true;
    btn.disabled = false;
    btn.textContent = '📍 Attiva la posizione';
    return true;
  };
  // Se il popup resta senza risposta (o il telefono non lo mostra) non si resta bloccati.
  setTimeout(() => fine() && chiediPosizione(true), 25000);
  // getCurrentPosition dentro il tocco: è questo che fa comparire il popup di iPhone.
  navigator.geolocation.getCurrentPosition((pos) => {
    fine();
    ultimoInvio = 0;
    inviaPosizione(pos);
    avviaPosizione();
    mostraGioco();
  }, (err) => {
    if (!fine()) return;
    chiediPosizione(true);
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
});

$('btnSenzaPosizione').addEventListener('click', () => {
  senzaPosizione = true;
  statoGps('Posizione non attiva', false);
  mostraGioco();
});

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
    if (err.code === 1) { // permesso tolto a gioco iniziato: si torna al pulsante
      fermaPosizione();
      aggiornaSceltaFoto();
      return chiediPosizione(true);
    }
    statoGps('Posizione non disponibile, riprovo…', false);
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

// ---------- Foto della missione ----------

let fotoScelta = null;
let gpsFoto = null;

// Legge posizione GPS e ora di scatto dai dati EXIF di una foto JPEG. Va fatto sul file originale:
// rimpicciolendo la foto col canvas questi dati si perdono. Quello che manca resta null.
async function leggiInfoFoto(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return { gps: null, scattata: null };
    for (let o = 2; o + 10 < v.byteLength;) {
      const marcatore = v.getUint16(o);
      if (marcatore === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return leggiTiff(v, o + 10); // "Exif"
      if ((marcatore & 0xff00) !== 0xff00 || marcatore === 0xffda) break;
      o += 2 + v.getUint16(o + 2);
    }
  } catch (e) { /* file strano: niente dati */ }
  return { gps: null, scattata: null };
}

function leggiTiff(v, t) {
  const le = v.getUint16(t) === 0x4949; // "II" = little endian
  const u16 = (p) => v.getUint16(p, le);
  const u32 = (p) => v.getUint32(p, le);
  const voce = (ifd, id) => {
    for (let i = 0, n = u16(ifd); i < n; i++) if (u16(ifd + 2 + i * 12) === id) return ifd + 2 + i * 12;
    return null;
  };
  const ifd0 = t + u32(t + 4);
  return { gps: leggiGps(), scattata: leggiOra() };

  function leggiGps() {
    const puntatore = voce(ifd0, 0x8825);
    if (!puntatore) return null;
    const gps = t + u32(puntatore + 8);
    const gradi = (id) => {
      const e = voce(gps, id);
      if (!e) return NaN;
      const p = t + u32(e + 8);
      const r = (k) => u32(p + k * 8) / u32(p + k * 8 + 4);
      return r(0) + r(1) / 60 + r(2) / 3600;
    };
    const verso = (id) => { const e = voce(gps, id); return e ? String.fromCharCode(v.getUint8(e + 8)) : ''; };
    let lat = gradi(2);
    let lng = gradi(4);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    if (verso(1) === 'S') lat = -lat;
    if (verso(3) === 'W') lng = -lng;
    return { lat, lng };
  }

  // DateTimeOriginal, "AAAA:MM:GG hh:mm:ss" nell'ora locale del telefono.
  function leggiOra() {
    const puntatore = voce(ifd0, 0x8769);
    const e = puntatore && voce(t + u32(puntatore + 8), 0x9003);
    if (!e) return null;
    const p = t + u32(e + 8);
    const testo = Array.from({ length: 19 }, (_, k) => String.fromCharCode(v.getUint8(p + k))).join('');
    const n = testo.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    return n ? new Date(n[1], n[2] - 1, n[3], n[4], n[5], n[6]) : null;
  }
}

function azzeraFoto() {
  fotoScelta = null;
  gpsFoto = null;
  $('campoFotoScatta').value = '';
  $('campoFotoGalleria').value = '';
  $('anteprima').classList.add('nascosto');
  $('anteprima').removeAttribute('src');
  $('btnInviaFoto').classList.add('nascosto');
  $('erroreFoto').textContent = '';
}

// Ridisegna la foto su un canvas più piccolo: da 5-10 MB si passa a qualche centinaio di KB.
function rimpicciolisci(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scala = Math.min(1, LATO_MAX_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scala);
      canvas.height = Math.round(img.naturalHeight * scala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Foto non leggibile'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Questo formato di foto non si apre: provate a sceglierne un\'altra'));
    };
    img.src = url;
  });
}

async function quandoScegliFoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  $('erroreFoto').textContent = '';
  try {
    const info = await leggiInfoFoto(file);
    // 10 minuti di margine per orologi dei telefoni un po' sfasati.
    if (info.scattata && info.scattata.getTime() < squadra.iniziata - 10 * 60000) {
      throw new Error('Questa foto è stata scattata prima dell\'inizio del gioco: fatene una nuova.');
    }
    gpsFoto = info.gps;
    fotoScelta = await rimpicciolisci(file);
    $('anteprima').src = URL.createObjectURL(fotoScelta);
    $('anteprima').classList.remove('nascosto');
    $('btnInviaFoto').classList.remove('nascosto');
  } catch (err) {
    azzeraFoto();
    $('erroreFoto').textContent = err.message;
  }
}
$('campoFotoScatta').addEventListener('change', quandoScegliFoto);
$('campoFotoGalleria').addEventListener('change', quandoScegliFoto);

$('btnInviaFoto').addEventListener('click', async () => {
  if (!fotoScelta) return;
  const btn = $('btnInviaFoto');
  btn.disabled = true;
  btn.textContent = 'Invio in corso…';
  $('erroreFoto').textContent = '';
  try {
    const dove = gpsFoto ? `&lat=${gpsFoto.lat}&lng=${gpsFoto.lng}` : '';
    const r = await fetch(`/api/foto?token=${encodeURIComponent(squadra.token)}&prova=${squadra.prova}${dove}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: fotoScelta,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.errore || 'Invio non riuscito');
    mostra(j);
    window.scrollTo(0, 0);
  } catch (err) {
    $('erroreFoto').textContent = `${err.message === 'Failed to fetch' || err.message === 'Load failed' ? 'Niente rete' : err.message}: riprovate tra poco.`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Invia la foto e vai avanti ✔';
  }
});

$('btnSenzaFoto').addEventListener('click', async () => {
  if (!confirm('Avete completato la missione ma non riuscite a caricare la foto? Fatela vedere ai capi alla fine.')) return;
  try {
    mostra(await chiama('/api/missione-fatta', { token: squadra.token }));
  } catch (err) {
    alert(err.message);
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
