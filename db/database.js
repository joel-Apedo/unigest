// Base SQLite via sql.js (WebAssembly — aucune compilation native requise).
// Persistée dans db/universite.db ; sauvegardée après chaque écriture IPC.
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// En version installée, la base vit dans %APPDATA%/UniGest (dossier inscriptible) ;
// en dev, dans le dossier db/.
const electron = require('electron');
const DB_PATH = electron.app
  ? path.join(electron.app.getPath('userData'), 'universite.db')
  : path.join(__dirname, 'universite.db');
let db;

// Adaptateur : même API que better-sqlite3 (prepare().run/get/all)
function wrapper() {
  return {
    prepare(sql) {
      return {
        run(...params) { const s = db.prepare(sql); s.run(params); s.free(); return this; },
        get(...params) {
          const s = db.prepare(sql); s.bind(params);
          const r = s.step() ? s.getAsObject() : undefined;
          s.free(); return r;
        },
        all(...params) {
          const s = db.prepare(sql); s.bind(params);
          const out = []; while (s.step()) out.push(s.getAsObject());
          s.free(); return out;
        }
      };
    },
    exec(sql) { db.run(sql); }
  };
}

function save() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

async function init() {
  if (db) return wrapper();
  const distDir = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
  const unpacked = distDir.replace('app.asar', 'app.asar.unpacked');
  const wasmDir = fs.existsSync(path.join(unpacked, 'sql-wasm.wasm')) ? unpacked : distDir;
  const SQL = await initSqlJs({ locateFile: f => path.join(wasmDir, f) });
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  createSchema();
  migrate();
  seed();
  ensureSettings();
  save();
  autoBackup();
  return wrapper();
}

// pour usage interne une fois initialisée
function get() {
  if (!db) throw new Error('Base non initialisée');
  return wrapper();
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','professeur','etudiant')),
      etudiant_id INTEGER,
      professeur_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS filieres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS etudiants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricule TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      date_naissance TEXT,
      sexe TEXT,
      email TEXT,
      telephone TEXT,
      adresse TEXT,
      filiere_id INTEGER REFERENCES filieres(id),
      promotion TEXT,
      date_inscription TEXT DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS professeurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      email TEXT,
      telephone TEXT,
      specialite TEXT,
      date_embauche TEXT DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS salles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      capacite INTEGER,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS cours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      credits INTEGER DEFAULT 1,
      filiere_id INTEGER REFERENCES filieres(id),
      professeur_id INTEGER REFERENCES professeurs(id),
      semestre INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL REFERENCES etudiants(id),
      cours_id INTEGER NOT NULL REFERENCES cours(id),
      annee TEXT,
      UNIQUE(etudiant_id, cours_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inscription_id INTEGER NOT NULL REFERENCES inscriptions(id),
      type_eval TEXT NOT NULL,
      note REAL NOT NULL CHECK(note >= 0 AND note <= 20),
      coefficient REAL DEFAULT 1,
      date_eval TEXT
    );

    CREATE TABLE IF NOT EXISTS seances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cours_id INTEGER NOT NULL REFERENCES cours(id),
      salle_id INTEGER REFERENCES salles(id),
      jour TEXT NOT NULL CHECK(jour IN ('Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi')),
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS paiements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL REFERENCES etudiants(id),
      annee TEXT,
      montant_total REAL NOT NULL,
      montant_paye REAL NOT NULL DEFAULT 0,
      date_paiement TEXT
    );

    CREATE TABLE IF NOT EXISTS livres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      titre TEXT NOT NULL,
      auteur TEXT,
      annee INTEGER,
      exemplaires INTEGER DEFAULT 1,
      disponible INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS emprunts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      livre_id INTEGER NOT NULL REFERENCES livres(id),
      etudiant_id INTEGER NOT NULL REFERENCES etudiants(id),
      date_emprunt TEXT DEFAULT (date('now')),
      date_retour_prevue TEXT,
      date_retour_reel TEXT
    );

    CREATE TABLE IF NOT EXISTS absences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL REFERENCES etudiants(id),
      cours_id INTEGER NOT NULL REFERENCES cours(id),
      date_abs TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('Absent','Retard')),
      justifiee INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// Ajout de colonnes sur les bases créées par une ancienne version
function migrate() {
  try { db.run("ALTER TABLE etudiants ADD COLUMN niveau INTEGER DEFAULT 1"); } catch (e) { /* colonne déjà présente */ }
  db.run("UPDATE etudiants SET niveau = 1 WHERE niveau IS NULL");
}

// Valeurs par défaut : nom d'université et année académique
function ensureSettings() {
  const y = new Date().getFullYear();
  const annee = new Date().getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('universite_nom', 'UNIVERSITÉ')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('annee_academique', '${annee}')`);
}

// Sauvegarde automatique une fois par jour au démarrage
function autoBackup() {
  try {
    const dir = path.join(path.dirname(DB_PATH), 'sauvegardes');
    fs.mkdirSync(dir, { recursive: true });
    const name = path.join(dir, `auto-${new Date().toISOString().slice(0, 10)}.db`);
    if (!fs.existsSync(name)) fs.writeFileSync(name, Buffer.from(db.export()));
  } catch (e) { /* non bloquant */ }
}

function seed() {
  const c = wrapper().prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (c > 0) return;
  for (const sql of require('./seed')) db.run(sql);
}

module.exports = { init, get, save, DB_PATH };
