// server.js
const fs           = require('fs');
const path         = require('path');
const express      = require('express');
const http         = require('http');
const sqlite3      = require('sqlite3').verbose();
const session      = require('express-session');
const SQLiteStore  = require('connect-sqlite3')(session);

const routes       = require('./routes');
const setupSockets = require('./sockets');

// — Préparation data/ + BDD SQLite —
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new sqlite3.Database(path.join(dataDir, 'db.sqlite'));
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
});

// — Express + sessions (partagées avec Socket.IO) —
const app    = express();
const server = http.createServer(app);

const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
  secret: 'un-super-secret-123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// — Routes HTTP —
app.use('/', routes(db));

// — Fichiers statiques —
app.use(express.static(path.join(__dirname, 'public')));

// — Socket.IO + logique lobby —
setupSockets(server, sessionMiddleware);

// — Démarrage —
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
