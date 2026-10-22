// Totopapaveromania — server senza dipendenze (basta Node 18+).
// Serve le pagine in /public e salva squadre, posizioni e risposte in data/stato.json.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'capi';

// Si ignorano spazi e maiuscole: le tastiere dei telefoni li aggiungono da sole.
function passwordOk(p) {
  const pulisci = (x) => String(x || '').trim().toLowerCase();
  return pulisci(p) === pulisci(ADMIN_PASSWORD);
}
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'stato.json');
const GIOCO_FILE = path.join(__dirname, 'gioco.json');
const FOTO_DIR = path.join(DATA_DIR, 'foto');
const MAX_PUNTI_PERCORSO = 3000;
const MAX_FOTO_BYTE = 10 * 1024 * 1024;

// Il file del gioco viene riletto a ogni richiesta: si può modificare a gioco in corso.
function gioco() {
  return JSON.parse(fs.readFileSync(GIOCO_FILE, 'utf8'));
}

let stato = { squadre: {} };
try {
  stato = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  // primo avvio: nessun dato salvato
}

let salvataggioInSospeso = null;
function salva() {
  if (salvataggioInSospeso) return;
  salvataggioInSospeso = setTimeout(() => {
    salvataggioInSospeso = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(stato));
    fs.renameSync(tmp, DATA_FILE);
  }, 500);
}

// Ogni squadriglia ha tante missioni quante sono le domande, estratte a caso.
// Si preferiscono le missioni assegnate meno volte, così le squadriglie non vanno tutte negli stessi posti.
function scegliMissioni(g) {
  const usate = g.missioni.map(() => 0);
  Object.values(stato.squadre).forEach((s) => s.missioni.forEach((i) => { usate[i] += 1; }));
  return g.missioni
    .map((_, i) => ({ i, peso: usate[i] + Math.random() }))
    .sort((a, b) => a.peso - b.peso)
    .slice(0, g.domande.length)
    .map((x) => x.i);
}

function normalizza(nome) {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

function trovaPerToken(token) {
  return Object.values(stato.squadre).find((s) => s.token === token);
}

// Quello che vede la squadra: solo la prova corrente, mai quelle successive.
function vistaSquadra(s) {
  const g = gioco();
  const totale = g.domande.length;
  const base = {
    nome: s.nome,
    token: s.token,
    titolo: g.titolo,
    iniziata: s.creata,
    tracciamentoFino: s.creata + g.durataTracciamentoOre * 3600 * 1000,
    prova: Math.min(s.prova + 1, totale),
    totale,
    fase: s.fase,
  };
  if (s.fase === 'arrivo') {
    return { ...base, testo: g.arrivo.testo, arrivo: g.arrivo };
  }
  return { ...base, testo: s.fase === 'missione' ? g.missioni[s.missioni[s.prova]] : g.domande[s.prova] };
}

function vistaAdmin() {
  const g = gioco();
  return {
    gioco: g,
    ora: Date.now(),
    squadre: Object.values(stato.squadre)
      .sort((a, b) => a.creata - b.creata)
      .map(({ token, ...s }) => s),
  };
}

function json(res, codice, dati) {
  res.writeHead(codice, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dati));
}

function leggiCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const pezzi = [];
    let lunghezza = 0;
    req.on('data', (c) => {
      lunghezza += c.length;
      if (lunghezza > limite) return req.destroy(new Error('Corpo troppo grande'));
      pezzi.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(pezzi)));
    req.on('error', reject);
  });
}

// La foto arriva già rimpicciolita dal telefono, come JPEG grezzo.
async function caricaFoto(req, res, parametri) {
  const s = trovaPerToken(parametri.get('token'));
  if (!s) return json(res, 404, { errore: 'Squadra non trovata' });
  const dati = await leggiCorpo(req, MAX_FOTO_BYTE);
  if (dati.length < 100 || dati[0] !== 0xff || dati[1] !== 0xd8) return json(res, 400, { errore: 'Foto non valida' });
  // Come per le risposte: si accetta solo la foto della missione in corso.
  if (s.fase !== 'missione' || Number(parametri.get('prova')) !== s.prova + 1) return json(res, 200, vistaSquadra(s));
  const file = `${s.id}-${s.prova + 1}-${Date.now()}.jpg`;
  fs.mkdirSync(FOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(FOTO_DIR, file), dati);
  const ora = Date.now();
  const foto = { prova: s.prova + 1, file, ora };
  // Posizione letta dal GPS dentro la foto (se il telefono non l'ha tolta). Serve quando la posizione
  // dal vivo non funziona: la si usa solo se non ne è arrivata una dal vivo negli ultimi 5 minuti.
  const lat = Number(parametri.get('lat'));
  const lng = Number(parametri.get('lng'));
  if (parametri.has('lat') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    foto.posizione = { lat, lng };
    const p = s.ultimaPosizione;
    if (!p || p.fonte === 'foto' || ora - p.ora > 5 * 60000) {
      s.ultimaPosizione = { lat, lng, precisione: null, ora, fonte: 'foto' };
      s.percorso.push([lat, lng, ora]);
    }
  }
  s.foto.push(foto);
  s.fase = 'domanda';
  salva();
  json(res, 200, vistaSquadra(s));
}

function serviFoto(req, res, parametri) {
  if (!passwordOk(parametri.get('password'))) return json(res, 401, { errore: 'Password sbagliata' });
  const file = path.basename(new URL(req.url, 'http://x').pathname);
  fs.readFile(path.join(FOTO_DIR, file), (err, contenuto) => {
    if (err) return json(res, 404, { errore: 'Foto non trovata' });
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    res.end(contenuto);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function serviFile(req, res) {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  if (url === '/admin') url = '/admin.html';
  const file = path.normalize(path.join(PUBLIC_DIR, url));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { errore: 'vietato' });
  fs.readFile(file, (err, contenuto) => {
    if (err) return json(res, 404, { errore: 'non trovato' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(contenuto);
  });
}

const rotte = {
  // Una squadra entra col suo nome. Se il nome esiste già si rientra nella stessa
  // squadra (utile se si cambia telefono o si chiude la pagina).
  'POST /api/entra': (corpo) => {
    const nome = String(corpo.nome || '').trim().slice(0, 40);
    if (!nome) return [400, { errore: 'Scrivete il nome della squadra' }];
    const chiave = normalizza(nome);
    let s = stato.squadre[chiave];
    if (!s) {
      const g = gioco();
      if (g.missioni.length < g.domande.length) return [500, { errore: 'In gioco.json servono almeno tante missioni quante domande' }];
      s = {
        id: crypto.randomBytes(4).toString('hex'),
        nome,
        token: crypto.randomBytes(16).toString('hex'),
        creata: Date.now(),
        prova: 0,
        fase: 'missione',
        missioni: scegliMissioni(g),
        risposte: [],
        foto: [],
        ultimaPosizione: null,
        percorso: [],
      };
      stato.squadre[chiave] = s;
      salva();
    }
    return [200, vistaSquadra(s)];
  },

  'POST /api/stato': (corpo) => {
    const s = trovaPerToken(corpo.token);
    if (!s) return [404, { errore: 'Squadra non trovata' }];
    return [200, vistaSquadra(s)];
  },

  'POST /api/posizione': (corpo) => {
    const s = trovaPerToken(corpo.token);
    if (!s) return [404, { errore: 'Squadra non trovata' }];
    const lat = Number(corpo.lat);
    const lng = Number(corpo.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [400, { errore: 'Posizione non valida' }];
    const ora = Date.now();
    s.ultimaPosizione = { lat, lng, precisione: Number(corpo.precisione) || null, ora };
    s.percorso.push([lat, lng, ora]);
    if (s.percorso.length > MAX_PUNTI_PERCORSO) s.percorso.splice(0, s.percorso.length - MAX_PUNTI_PERCORSO);
    salva();
    return [200, { ok: true }];
  },

  // Chiude la missione senza foto, se proprio non si riesce a caricarla.
  'POST /api/missione-fatta': (corpo) => {
    const s = trovaPerToken(corpo.token);
    if (!s) return [404, { errore: 'Squadra non trovata' }];
    if (s.fase === 'missione') {
      s.fase = 'domanda';
      salva();
    }
    return [200, vistaSquadra(s)];
  },

  'POST /api/rispondi': (corpo) => {
    const s = trovaPerToken(corpo.token);
    if (!s) return [404, { errore: 'Squadra non trovata' }];
    const risposta = String(corpo.risposta || '').trim().slice(0, 2000);
    if (!risposta) return [400, { errore: 'Scrivete una risposta' }];
    // Il numero di prova inviato evita doppie risposte se due telefoni della stessa squadra rispondono insieme.
    if (s.fase !== 'domanda' || Number(corpo.prova) !== s.prova + 1) return [200, vistaSquadra(s)];
    const g = gioco();
    s.risposte.push({
      prova: s.prova + 1,
      missione: g.missioni[s.missioni[s.prova]],
      domanda: g.domande[s.prova],
      risposta,
      ora: Date.now(),
    });
    s.prova += 1;
    s.fase = s.prova >= g.domande.length ? 'arrivo' : 'missione';
    salva();
    return [200, vistaSquadra(s)];
  },

  'POST /api/admin': (corpo) => {
    if (!passwordOk(corpo.password)) return [401, { errore: 'Password sbagliata' }];
    return [200, vistaAdmin()];
  },

  // Riporta una squadra all'inizio di una prova (azzera da lì in poi le risposte).
  'POST /api/admin/riporta': (corpo) => {
    if (!passwordOk(corpo.password)) return [401, { errore: 'Password sbagliata' }];
    const s = Object.values(stato.squadre).find((x) => x.id === corpo.id);
    if (!s) return [404, { errore: 'Squadra non trovata' }];
    const prova = Math.max(0, Math.min(Number(corpo.prova) || 0, gioco().domande.length - 1));
    s.prova = prova;
    s.fase = 'missione';
    s.risposte = s.risposte.filter((r) => r.prova <= prova);
    s.foto = s.foto.filter((f) => f.prova <= prova);
    salva();
    return [200, vistaAdmin()];
  },

  'POST /api/admin/elimina': (corpo) => {
    if (!passwordOk(corpo.password)) return [401, { errore: 'Password sbagliata' }];
    const chiave = Object.keys(stato.squadre).find((k) => stato.squadre[k].id === corpo.id);
    if (chiave) {
      stato.squadre[chiave].foto.forEach((f) => fs.rm(path.join(FOTO_DIR, f.file), { force: true }, () => {}));
      delete stato.squadre[chiave];
    }
    salva();
    return [200, vistaAdmin()];
  },
};

const server = http.createServer(async (req, res) => {
  const { pathname: percorso, searchParams: parametri } = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && percorso === '/api/foto') return await caricaFoto(req, res, parametri);
    if (req.method === 'GET' && percorso.startsWith('/foto/')) return serviFoto(req, res, parametri);
    const rotta = rotte[`${req.method} ${percorso}`];
    if (!rotta) {
      if (req.method === 'GET') return serviFile(req, res);
      return json(res, 404, { errore: 'non trovato' });
    }
    const corpo = (await leggiCorpo(req, 100000)).toString('utf8');
    const [codice, dati] = rotta(corpo ? JSON.parse(corpo) : {});
    json(res, codice, dati);
  } catch (e) {
    console.error(e);
    json(res, 500, { errore: 'Errore del server' });
  }
});

server.listen(PORT, () => {
  console.log(`Totopapaveromania su http://localhost:${PORT}  (admin: /admin)`);
  console.log(process.env.ADMIN_PASSWORD ? 'Password capi: quella impostata in ADMIN_PASSWORD' : 'Password capi: "capi" (ADMIN_PASSWORD non impostata)');
});
