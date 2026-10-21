// Totopapaveromania — server senza dipendenze (basta Node 18+).
// Serve le pagine in /public e salva squadre, posizioni e risposte in data/stato.json.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'capi';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'stato.json');
const GIOCO_FILE = path.join(__dirname, 'gioco.json');
const MAX_PUNTI_PERCORSO = 3000;

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

function normalizza(nome) {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

function trovaPerToken(token) {
  return Object.values(stato.squadre).find((s) => s.token === token);
}

// Quello che vede la squadra: solo la prova corrente, mai quelle successive.
function vistaSquadra(s) {
  const g = gioco();
  const totale = g.prove.length;
  const base = {
    nome: s.nome,
    token: s.token,
    titolo: g.titolo,
    tracciamentoFino: s.creata + g.durataTracciamentoOre * 3600 * 1000,
    prova: Math.min(s.prova + 1, totale),
    totale,
    fase: s.fase,
  };
  if (s.fase === 'arrivo') {
    return { ...base, testo: g.arrivo.testo, arrivo: { lat: g.arrivo.lat, lng: g.arrivo.lng } };
  }
  const p = g.prove[s.prova];
  return { ...base, testo: s.fase === 'missione' ? p.missione : p.domanda };
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

function leggiCorpo(req) {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (c) => {
      corpo += c;
      if (corpo.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(corpo ? JSON.parse(corpo) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
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
      s = {
        id: crypto.randomBytes(4).toString('hex'),
        nome,
        token: crypto.randomBytes(16).toString('hex'),
        creata: Date.now(),
        prova: 0,
        fase: 'missione',
        risposte: [],
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
    s.risposte.push({ prova: s.prova + 1, domanda: g.prove[s.prova].domanda, risposta, ora: Date.now() });
    s.prova += 1;
    s.fase = s.prova >= g.prove.length ? 'arrivo' : 'missione';
    salva();
    return [200, vistaSquadra(s)];
  },

  'POST /api/admin': (corpo) => {
    if (corpo.password !== ADMIN_PASSWORD) return [401, { errore: 'Password sbagliata' }];
    return [200, vistaAdmin()];
  },

  // Riporta una squadra all'inizio di una prova (azzera da lì in poi le risposte).
  'POST /api/admin/riporta': (corpo) => {
    if (corpo.password !== ADMIN_PASSWORD) return [401, { errore: 'Password sbagliata' }];
    const s = Object.values(stato.squadre).find((x) => x.id === corpo.id);
    if (!s) return [404, { errore: 'Squadra non trovata' }];
    const prova = Math.max(0, Math.min(Number(corpo.prova) || 0, gioco().prove.length - 1));
    s.prova = prova;
    s.fase = 'missione';
    s.risposte = s.risposte.filter((r) => r.prova <= prova);
    salva();
    return [200, vistaAdmin()];
  },

  'POST /api/admin/elimina': (corpo) => {
    if (corpo.password !== ADMIN_PASSWORD) return [401, { errore: 'Password sbagliata' }];
    const chiave = Object.keys(stato.squadre).find((k) => stato.squadre[k].id === corpo.id);
    if (chiave) delete stato.squadre[chiave];
    salva();
    return [200, vistaAdmin()];
  },
};

const server = http.createServer(async (req, res) => {
  const percorso = new URL(req.url, 'http://x').pathname;
  const rotta = rotte[`${req.method} ${percorso}`];
  if (!rotta) {
    if (req.method === 'GET') return serviFile(req, res);
    return json(res, 404, { errore: 'non trovato' });
  }
  try {
    const corpo = await leggiCorpo(req);
    const [codice, dati] = rotta(corpo);
    json(res, codice, dati);
  } catch (e) {
    console.error(e);
    json(res, 500, { errore: 'Errore del server' });
  }
});

server.listen(PORT, () => {
  console.log(`Totopapaveromania su http://localhost:${PORT}  (admin: /admin)`);
});
