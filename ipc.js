const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db/database');
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

module.exports = function registerIpc(ipcMain) {

  const WRITE_ACTIONS = new Set([
    'changePassword', 'filiereSave', 'filiereDelete', 'etudiantSave', 'etudiantDelete',
    'professeurSave', 'professeurDelete', 'salleSave', 'salleDelete', 'coursSave', 'coursDelete',
    'coursInscrire', 'coursDesinscrire', 'noteAdd', 'noteDelete', 'seanceSave', 'seanceDelete',
    'paiementSave', 'paiementEncaisser', 'paiementDelete', 'livreSave', 'livreDelete',
    'empruntAdd', 'empruntRetour', 'empruntDelete',
    'absenceSave', 'settingsSet', 'reinscrire'
  ]);

  ipcMain.handle('db', async (event, action, p = {}) => {
    try {
      const fn = handlers[action];
      if (!fn) throw new Error(`Action inconnue: ${action}`);
      const data = fn(db.get(), p);
      if (WRITE_ACTIONS.has(action)) db.save();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ---------- helpers ----------
  const nowYear = () => new Date().getFullYear().toString();

  // ---------- handlers ----------
  const handlers = {

    // ===== AUTH =====
    login: (d, { username, password }) => {
      const u = d.prepare(
        `SELECT u.id, u.username, u.role, u.etudiant_id, u.professeur_id,
                COALESCE(e.nom, pr.nom) AS nom, COALESCE(e.prenom, pr.prenom) AS prenom
         FROM users u
         LEFT JOIN etudiants e ON e.id = u.etudiant_id
         LEFT JOIN professeurs pr ON pr.id = u.professeur_id
         WHERE u.username = ? AND u.password = ?`
      ).get(username, hash(password));
      if (!u) throw new Error('Identifiants incorrects');
      return u;
    },

    // Mode démo : accès admin sans mot de passe
    loginDemo: (d) => {
      const u = d.prepare(
        `SELECT u.id, u.username, u.role, u.etudiant_id, u.professeur_id
         FROM users u WHERE u.role = 'admin' LIMIT 1`
      ).get();
      if (!u) throw new Error('Aucun compte administrateur trouvé');
      return u;
    },

    changePassword: (d, { userId, oldPassword, newPassword }) => {
      const u = d.prepare('SELECT password FROM users WHERE id = ?').get(userId);
      if (u.password !== hash(oldPassword)) throw new Error('Ancien mot de passe incorrect');
      d.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash(newPassword), userId);
      return true;
    },

    // ===== DASHBOARD =====
    dashboard: (d) => ({
      etudiants: d.prepare('SELECT COUNT(*) c FROM etudiants').get().c,
      professeurs: d.prepare('SELECT COUNT(*) c FROM professeurs').get().c,
      cours: d.prepare('SELECT COUNT(*) c FROM cours').get().c,
      impayes: d.prepare(
        `SELECT COALESCE(SUM(montant_total - montant_paye), 0) v FROM paiements`
      ).get().v,
      empruntsEnCours: d.prepare(
        'SELECT COUNT(*) c FROM emprunts WHERE date_retour_reel IS NULL'
      ).get().c,
      moyenneGlobale: d.prepare('SELECT ROUND(AVG(note), 2) m FROM notes').get().m,
      absencesAujourdui: d.prepare("SELECT COUNT(*) c FROM absences WHERE date_abs = date('now')").get().c
    }),

    // ===== FILIERES =====
    filieres: (d) => d.prepare('SELECT * FROM filieres ORDER BY code').all(),
    filiereSave: (d, { id, code, nom }) => {
      if (id) d.prepare('UPDATE filieres SET code=?, nom=? WHERE id=?').run(code, nom, id);
      else d.prepare('INSERT INTO filieres (code, nom) VALUES (?,?)').run(code, nom);
      return true;
    },
    filiereDelete: (d, { id }) => {
      d.prepare('DELETE FROM filieres WHERE id = ?').run(id);
      return true;
    },

    // ===== ETUDIANTS =====
    etudiants: (d, { q = '' }) => d.prepare(`
      SELECT e.*, f.nom AS filiere_nom, f.code AS filiere_code
      FROM etudiants e LEFT JOIN filieres f ON f.id = e.filiere_id
      WHERE e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ?
      ORDER BY e.nom`).all(`%${q}%`, `%${q}%`, `%${q}%`),

    etudiantSave: (d, { id, matricule, nom, prenom, date_naissance, sexe, email, telephone, adresse, filiere_id, promotion, niveau }) => {
      if (id) {
        d.prepare(`UPDATE etudiants SET matricule=?, nom=?, prenom=?, date_naissance=?, sexe=?,
                   email=?, telephone=?, adresse=?, filiere_id=?, promotion=?, niveau=? WHERE id=?`)
          .run(matricule, nom, prenom, date_naissance, sexe, email, telephone, adresse, filiere_id, promotion, niveau || 1, id);
      } else {
        const r = d.prepare(`INSERT INTO etudiants
          (matricule, nom, prenom, date_naissance, sexe, email, telephone, adresse, filiere_id, promotion, niveau)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .run(matricule, nom, prenom, date_naissance, sexe, email, telephone, adresse, filiere_id, promotion, niveau || 1);
        // compte utilisateur lié : username = matricule, mdp = matricule
        d.prepare(`INSERT OR IGNORE INTO users (username, password, role, etudiant_id)
                   VALUES (?, ?, 'etudiant', ?)`).run(matricule.toLowerCase(), hash(matricule.toLowerCase()), r.lastInsertRowid);
      }
      return true;
    },
    etudiantDelete: (d, { id }) => {
      d.prepare('DELETE FROM users WHERE etudiant_id = ?').run(id);
      d.prepare('DELETE FROM etudiants WHERE id = ?').run(id);
      return true;
    },

    // ===== PROFESSEURS =====
    professeurs: (d, { q = '' }) => d.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM cours c WHERE c.professeur_id = p.id) AS nb_cours
      FROM professeurs p
      WHERE p.nom LIKE ? OR p.prenom LIKE ? OR p.code LIKE ?
      ORDER BY p.nom`).all(`%${q}%`, `%${q}%`, `%${q}%`),

    professeurSave: (d, { id, code, nom, prenom, email, telephone, specialite }) => {
      if (id) d.prepare('UPDATE professeurs SET code=?, nom=?, prenom=?, email=?, telephone=?, specialite=? WHERE id=?')
        .run(code, nom, prenom, email, telephone, specialite, id);
      else {
        const r = d.prepare('INSERT INTO professeurs (code, nom, prenom, email, telephone, specialite) VALUES (?,?,?,?,?,?)')
          .run(code, nom, prenom, email, telephone, specialite);
        d.prepare(`INSERT OR IGNORE INTO users (username, password, role, professeur_id)
                   VALUES (?, ?, 'professeur', ?)`)
          .run(('prof.' + prenom.toLowerCase() + '.' + nom.toLowerCase()).replace(/\s+/g, ''), hash('prof123'), r.lastInsertRowid);
      }
      return true;
    },
    professeurDelete: (d, { id }) => {
      d.prepare('DELETE FROM users WHERE professeur_id = ?').run(id);
      d.prepare('DELETE FROM professeurs WHERE id = ?').run(id);
      return true;
    },

    // ===== SALLES =====
    salles: (d) => d.prepare('SELECT * FROM salles ORDER BY code').all(),
    salleSave: (d, { id, code, nom, capacite, type }) => {
      if (id) d.prepare('UPDATE salles SET code=?, nom=?, capacite=?, type=? WHERE id=?').run(code, nom, capacite, type, id);
      else d.prepare('INSERT INTO salles (code, nom, capacite, type) VALUES (?,?,?,?)').run(code, nom, capacite, type);
      return true;
    },
    salleDelete: (d, { id }) => { d.prepare('DELETE FROM salles WHERE id=?').run(id); return true; },

    // ===== COURS =====
    cours: (d) => d.prepare(`
      SELECT c.*, f.code AS filiere_code, f.nom AS filiere_nom,
             pr.nom AS prof_nom, pr.prenom AS prof_prenom,
             (SELECT COUNT(*) FROM inscriptions i WHERE i.cours_id = c.id) AS nb_etudiants
      FROM cours c
      LEFT JOIN filieres f ON f.id = c.filiere_id
      LEFT JOIN professeurs pr ON pr.id = c.professeur_id
      ORDER BY c.code`).all(),

    coursSave: (d, { id, code, nom, credits, filiere_id, professeur_id, semestre }) => {
      if (id) d.prepare('UPDATE cours SET code=?, nom=?, credits=?, filiere_id=?, professeur_id=?, semestre=? WHERE id=?')
        .run(code, nom, credits, filiere_id, professeur_id, semestre, id);
      else d.prepare('INSERT INTO cours (code, nom, credits, filiere_id, professeur_id, semestre) VALUES (?,?,?,?,?,?)')
        .run(code, nom, credits, filiere_id, professeur_id, semestre);
      return true;
    },
    coursDelete: (d, { id }) => { d.prepare('DELETE FROM cours WHERE id=?').run(id); return true; },

    // inscriptions d'un cours
    coursEtudiants: (d, { coursId }) => d.prepare(`
      SELECT e.id, e.matricule, e.nom, e.prenom
      FROM etudiants e
      WHERE e.filiere_id = (SELECT filiere_id FROM cours WHERE id = ?)
        AND e.id NOT IN (SELECT etudiant_id FROM inscriptions WHERE cours_id = ?)
      ORDER BY e.nom`).all(coursId, coursId),

    coursInscrire: (d, { coursId, etudiantId }) => {
      d.prepare('INSERT OR IGNORE INTO inscriptions (etudiant_id, cours_id, annee) VALUES (?,?,?)')
        .run(etudiantId, coursId, nowYear());
      return true;
    },
    coursDesinscrire: (d, { coursId, etudiantId }) => {
      d.prepare(`DELETE FROM notes WHERE inscription_id IN
        (SELECT id FROM inscriptions WHERE etudiant_id=? AND cours_id=?)`).run(etudiantId, coursId);
      d.prepare('DELETE FROM inscriptions WHERE etudiant_id=? AND cours_id=?').run(etudiantId, coursId);
      return true;
    },
    coursInscrits: (d, { coursId }) => d.prepare(`
      SELECT i.id AS inscription_id, e.id, e.matricule, e.nom, e.prenom
      FROM inscriptions i JOIN etudiants e ON e.id = i.etudiant_id
      WHERE i.cours_id = ? ORDER BY e.nom`).all(coursId),

    // ===== NOTES =====
    notes: (d, { inscriptionId }) => d.prepare(
      'SELECT * FROM notes WHERE inscription_id = ? ORDER BY date_eval').all(inscriptionId),

    noteAdd: (d, { inscriptionId, type_eval, note, coefficient }) => {
      d.prepare('INSERT INTO notes (inscription_id, type_eval, note, coefficient) VALUES (?,?,?,?)')
        .run(inscriptionId, type_eval, note, coefficient);
      return true;
    },
    noteDelete: (d, { id }) => { d.prepare('DELETE FROM notes WHERE id=?').run(id); return true; },

    // bulletins : pour un cours, moyennes pondérées par étudiant
    bulletinCours: (d, { coursId }) => d.prepare(`
      SELECT e.matricule, e.nom, e.prenom,
             ROUND(SUM(n.note * n.coefficient) / SUM(n.coefficient), 2) AS moyenne,
             COUNT(n.id) AS nb_notes
      FROM inscriptions i
      JOIN etudiants e ON e.id = i.etudiant_id
      LEFT JOIN notes n ON n.inscription_id = i.id
      WHERE i.cours_id = ?
      GROUP BY i.id ORDER BY moyenne DESC`).all(coursId),

    // notes d'un étudiant (toutes ses inscriptions)
    mesNotes: (d, { etudiantId }) => d.prepare(`
      SELECT c.code, c.nom AS cours_nom, c.credits, c.semestre,
             ROUND(SUM(n.note * n.coefficient) / NULLIF(SUM(n.coefficient),0), 2) AS moyenne
      FROM inscriptions i
      JOIN cours c ON c.id = i.cours_id
      LEFT JOIN notes n ON n.inscription_id = i.id
      WHERE i.etudiant_id = ?
      GROUP BY i.id ORDER BY c.semestre, c.code`).all(etudiantId),

    // ===== EMPLOI DU TEMPS =====
    seances: (d, { filiereId }) => d.prepare(`
      SELECT s.*, c.code AS cours_code, c.nom AS cours_nom,
             s2.code AS salle_code, pr.nom AS prof_nom, pr.prenom AS prof_prenom,
             f.code AS filiere_code
      FROM seances s
      JOIN cours c ON c.id = s.cours_id
      LEFT JOIN salles s2 ON s2.id = s.salle_id
      LEFT JOIN professeurs pr ON pr.id = c.professeur_id
      LEFT JOIN filieres f ON f.id = c.filiere_id
      ${filiereId ? 'WHERE c.filiere_id = ?' : ''}
      ORDER BY CASE s.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
               WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 ELSE 6 END, s.heure_debut`
    ).all(...(filiereId ? [filiereId] : [])),

    seanceSave: (d, { id, cours_id, salle_id, jour, heure_debut, heure_fin, type }) => {
      if (id) d.prepare('UPDATE seances SET cours_id=?, salle_id=?, jour=?, heure_debut=?, heure_fin=?, type=? WHERE id=?')
        .run(cours_id, salle_id, jour, heure_debut, heure_fin, type, id);
      else d.prepare('INSERT INTO seances (cours_id, salle_id, jour, heure_debut, heure_fin, type) VALUES (?,?,?,?,?,?)')
        .run(cours_id, salle_id, jour, heure_debut, heure_fin, type);
      return true;
    },
    seanceDelete: (d, { id }) => { d.prepare('DELETE FROM seances WHERE id=?').run(id); return true; },

    monEdtProf: (d, { professeurId }) => d.prepare(`
      SELECT s.*, c.code AS cours_code, c.nom AS cours_nom, s2.code AS salle_code, f.code AS filiere_code
      FROM seances s
      JOIN cours c ON c.id = s.cours_id
      LEFT JOIN salles s2 ON s2.id = s.salle_id
      LEFT JOIN filieres f ON f.id = c.filiere_id
      WHERE c.professeur_id = ?
      ORDER BY CASE s.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
               WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 ELSE 6 END, s.heure_debut`).all(professeurId),

    monEdtEtudiant: (d, { etudiantId }) => d.prepare(`
      SELECT s.*, c.code AS cours_code, c.nom AS cours_nom, s2.code AS salle_code,
             pr.nom AS prof_nom, pr.prenom AS prof_prenom
      FROM seances s
      JOIN cours c ON c.id = s.cours_id
      LEFT JOIN salles s2 ON s2.id = s.salle_id
      LEFT JOIN professeurs pr ON pr.id = c.professeur_id
      WHERE c.id IN (SELECT cours_id FROM inscriptions WHERE etudiant_id = ?)
      ORDER BY CASE s.jour WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
               WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 ELSE 6 END, s.heure_debut`).all(etudiantId),

    // ===== FINANCES =====
    paiements: (d, { q = '' }) => d.prepare(`
      SELECT p.*, e.matricule, e.nom, e.prenom,
             (p.montant_total - p.montant_paye) AS reste
      FROM paiements p JOIN etudiants e ON e.id = p.etudiant_id
      WHERE e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ?
      ORDER BY reste DESC`).all(`%${q}%`, `%${q}%`, `%${q}%`),

    paiementSave: (d, { id, etudiant_id, annee, montant_total, montant_paye }) => {
      if (id) d.prepare('UPDATE paiements SET etudiant_id=?, annee=?, montant_total=?, montant_paye=? WHERE id=?')
        .run(etudiant_id, annee, montant_total, montant_paye, id);
      else d.prepare('INSERT INTO paiements (etudiant_id, annee, montant_total, montant_paye) VALUES (?,?,?,?)')
        .run(etudiant_id, annee, montant_total, montant_paye);
      return true;
    },
    paiementEncaisser: (d, { id, montant }) => {
      d.prepare('UPDATE paiements SET montant_paye = montant_paye + ? WHERE id = ?').run(montant, id);
      return true;
    },
    paiementDelete: (d, { id }) => { d.prepare('DELETE FROM paiements WHERE id=?').run(id); return true; },

    mesFrais: (d, { etudiantId }) => d.prepare(
      'SELECT * FROM paiements WHERE etudiant_id = ? ORDER BY annee').all(etudiantId),

    // ===== BIBLIOTHEQUE =====
    livres: (d, { q = '' }) => d.prepare(`
      SELECT * FROM livres WHERE titre LIKE ? OR auteur LIKE ? OR code LIKE ? ORDER BY titre`)
      .all(`%${q}%`, `%${q}%`, `%${q}%`),

    livreSave: (d, { id, code, titre, auteur, annee, exemplaires }) => {
      if (id) d.prepare('UPDATE livres SET code=?, titre=?, auteur=?, annee=?, exemplaires=? WHERE id=?')
        .run(code, titre, auteur, annee, exemplaires, id);
      else d.prepare('INSERT INTO livres (code, titre, auteur, annee, exemplaires) VALUES (?,?,?,?,?)')
        .run(code, titre, auteur, annee, exemplaires);
      return true;
    },
    livreDelete: (d, { id }) => { d.prepare('DELETE FROM livres WHERE id=?').run(id); return true; },

    emprunts: (d) => d.prepare(`
      SELECT em.*, l.titre, l.code AS livre_code, e.matricule, e.nom, e.prenom,
             CASE WHEN em.date_retour_reel IS NULL AND em.date_retour_prevue < date('now')
                  THEN 1 ELSE 0 END AS en_retard
      FROM emprunts em
      JOIN livres l ON l.id = em.livre_id
      JOIN etudiants e ON e.id = em.etudiant_id
      ORDER BY em.date_emprunt DESC`).all(),

    empruntAdd: (d, { livre_id, etudiant_id, jours = 14 }) => {
      const dispo = d.prepare('SELECT disponible FROM livres WHERE id = ?').get(livre_id);
      if (!dispo || dispo.disponible < 1) throw new Error('Aucun exemplaire disponible');
      d.prepare(`INSERT INTO emprunts (livre_id, etudiant_id, date_retour_prevue)
                 VALUES (?,?, date('now', ?))`).run(livre_id, etudiant_id, `+${jours} days`);
      d.prepare('UPDATE livres SET disponible = disponible - 1 WHERE id = ?').run(livre_id);
      return true;
    },
    empruntRetour: (d, { id }) => {
      const em = d.prepare('SELECT * FROM emprunts WHERE id = ?').get(id);
      if (!em || em.date_retour_reel) throw new Error('Emprunt introuvable ou déjà rendu');
      d.prepare("UPDATE emprunts SET date_retour_reel = date('now') WHERE id = ?").run(id);
      d.prepare('UPDATE livres SET disponible = disponible + 1 WHERE id = ?').run(em.livre_id);
      return true;
    },
    empruntDelete: (d, { id }) => { d.prepare('DELETE FROM emprunts WHERE id=?').run(id); return true; },

    mesEmprunts: (d, { etudiantId }) => d.prepare(`
      SELECT em.*, l.titre, l.code AS livre_code,
             CASE WHEN em.date_retour_reel IS NULL AND em.date_retour_prevue < date('now')
                  THEN 1 ELSE 0 END AS en_retard
      FROM emprunts em JOIN livres l ON l.id = em.livre_id
      WHERE em.etudiant_id = ? ORDER BY em.date_emprunt DESC`).all(etudiantId),

    // ===== VUES PROF =====
    mesCours: (d, { professeurId }) => d.prepare(`
      SELECT c.*, f.code AS filiere_code,
             (SELECT COUNT(*) FROM inscriptions i WHERE i.cours_id = c.id) AS nb_etudiants
      FROM cours c LEFT JOIN filieres f ON f.id = c.filiere_id
      WHERE c.professeur_id = ? ORDER BY c.code`).all(professeurId),

    // ===== BULLETIN OFFICIEL =====
    bulletinEtudiant: (d, { etudiantId }) => {
      const etudiant = d.prepare(`
        SELECT e.*, f.nom AS filiere_nom, f.code AS filiere_code
        FROM etudiants e LEFT JOIN filieres f ON f.id = e.filiere_id
        WHERE e.id = ?`).get(etudiantId);
      if (!etudiant) throw new Error('Étudiant introuvable');

      const rows = d.prepare(`
        SELECT c.code, c.nom AS cours_nom, c.credits, c.semestre,
               ROUND(SUM(n.note * n.coefficient) / NULLIF(SUM(n.coefficient), 0), 2) AS moyenne
        FROM inscriptions i
        JOIN cours c ON c.id = i.cours_id
        LEFT JOIN notes n ON n.inscription_id = i.id
        WHERE i.etudiant_id = ?
        GROUP BY i.id ORDER BY c.semestre, c.code`).all(etudiantId);

      const mention = (m) => m === null || m === undefined ? '—'
        : m >= 16 ? 'Très Bien' : m >= 14 ? 'Bien' : m >= 12 ? 'Assez Bien'
        : m >= 10 ? 'Passable' : 'Insuffisant';

      const semestres = {};
      for (const r of rows) (semestres[r.semestre] ||= []).push(r);

      const result = Object.entries(semestres).map(([sem, cs]) => {
        const notés = cs.filter(c => c.moyenne !== null);
        const totalCredits = notés.reduce((a, c) => a + c.credits, 0);
        const moyenne = totalCredits
          ? Math.round(notés.reduce((a, c) => a + c.moyenne * c.credits, 0) / totalCredits * 100) / 100
          : null;
        return {
          semestre: +sem,
          cours: cs,
          moyenne,
          creditsValides: cs.filter(c => c.moyenne !== null && c.moyenne >= 10).reduce((a, c) => a + c.credits, 0),
          decision: moyenne === null ? '—' : (moyenne >= 10 ? 'Admis' : 'Ajourné'),
          mention: mention(moyenne)
        };
      }).sort((a, b) => a.semestre - b.semestre);

      return { etudiant, semestres: result };
    },

    // ===== REÇU DE PAIEMENT =====
    recuPaiement: (d, { paiementId }) => {
      const p = d.prepare(`
        SELECT p.*, e.matricule, e.nom, e.prenom, f.nom AS filiere_nom
        FROM paiements p
        JOIN etudiants e ON e.id = p.etudiant_id
        LEFT JOIN filieres f ON f.id = e.filiere_id
        WHERE p.id = ?`).get(paiementId);
      if (!p) throw new Error('Paiement introuvable');
      p.numero_recu = 'REC-' + p.annee + '-' + String(p.id).padStart(5, '0');
      return p;
    },

    // ===== ABSENCES & PRÉSENCES =====
    // état d'un jour pour un cours : tous les inscrits, avec leur statut éventuel
    absenceJour: (d, { coursId, date }) => {
      const inscrits = d.prepare(`
        SELECT e.id, e.matricule, e.nom, e.prenom
        FROM inscriptions i JOIN etudiants e ON e.id = i.etudiant_id
        WHERE i.cours_id = ? ORDER BY e.nom`).all(coursId);
      const abs = d.prepare('SELECT * FROM absences WHERE cours_id = ? AND date_abs = ?').all(coursId, date);
      const map = {};
      for (const a of abs) map[a.etudiant_id] = a;
      return inscrits.map(e => ({
        ...e,
        type: map[e.id] ? map[e.id].type : 'Present',
        justifiee: map[e.id] ? map[e.id].justifiee : 0
      }));
    },

    // enregistre le statut d'un étudiant pour un jour donné ('Present' = efface)
    absenceSave: (d, { etudiantId, coursId, date, type, justifiee }) => {
      d.prepare('DELETE FROM absences WHERE etudiant_id = ? AND cours_id = ? AND date_abs = ?')
        .run(etudiantId, coursId, date);
      if (type === 'Absent' || type === 'Retard') {
        d.prepare('INSERT INTO absences (etudiant_id, cours_id, date_abs, type, justifiee) VALUES (?,?,?,?,?)')
          .run(etudiantId, coursId, date, type, justifiee ? 1 : 0);
      }
      return true;
    },

    // synthèse des absences d'un étudiant
    absencesEtudiant: (d, { etudiantId }) => ({
      parCours: d.prepare(`
        SELECT c.code, c.nom AS cours_nom,
          SUM(CASE WHEN a.type='Absent' AND a.justifiee=0 THEN 1 ELSE 0 END) AS nonJustifiees,
          SUM(CASE WHEN a.type='Absent' AND a.justifiee=1 THEN 1 ELSE 0 END) AS justifiees,
          SUM(CASE WHEN a.type='Retard' THEN 1 ELSE 0 END) AS retards
        FROM absences a JOIN cours c ON c.id = a.cours_id
        WHERE a.etudiant_id = ? GROUP BY a.cours_id ORDER BY c.code`).all(etudiantId),
      recentes: d.prepare(`
        SELECT a.*, c.code FROM absences a JOIN cours c ON c.id = a.cours_id
        WHERE a.etudiant_id = ? ORDER BY a.date_abs DESC LIMIT 20`).all(etudiantId)
    }),

    absencesJour: (d) => d.prepare("SELECT COUNT(*) c FROM absences WHERE date_abs = date('now')").get().c,

    // ===== STATISTIQUES (graphiques du tableau de bord) =====
    statsFiliares: (d) => d.prepare(`
      SELECT f.code, COUNT(DISTINCT e.id) AS nb, ROUND(AVG(m.moyenne), 2) AS moyenne,
             ROUND(100.0 * SUM(CASE WHEN m.moyenne >= 10 THEN 1 ELSE 0 END) / NULLIF(COUNT(m.moyenne), 0), 0) AS tauxAdmis
      FROM filieres f
      LEFT JOIN etudiants e ON e.filiere_id = f.id
      LEFT JOIN (SELECT i.etudiant_id, SUM(n.note * n.coefficient) / NULLIF(SUM(n.coefficient), 0) AS moyenne
                 FROM inscriptions i JOIN notes n ON n.inscription_id = i.id GROUP BY i.etudiant_id) m
        ON m.etudiant_id = e.id
      GROUP BY f.id ORDER BY f.code`).all(),

    statsPaiements: (d) => d.prepare(`
      SELECT
        SUM(CASE WHEN montant_total - montant_paye <= 0 THEN 1 ELSE 0 END) AS solde,
        SUM(CASE WHEN montant_paye > 0 AND montant_total - montant_paye > 0 THEN 1 ELSE 0 END) AS partiel,
        SUM(CASE WHEN montant_paye <= 0 AND montant_total > 0 THEN 1 ELSE 0 END) AS impaye,
        SUM(montant_paye) AS encaisse, SUM(montant_total) AS attendu
      FROM paiements`).get(),

    // ===== PARAMÈTRES GÉNÉRAUX =====
    settingsGet: (d) => Object.fromEntries(
      d.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value])),

    settingsSet: (d, p) => {
      for (const [k, v] of Object.entries(p)) {
        if (!/^[a-z_]+$/.test(k)) throw new Error('Clé invalide');
        d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, String(v));
      }
      return true;
    },

    // ===== RÉINSCRIPTIONS (nouvelle année académique) =====
    reinscrire: (d, { annee, montant, avancerNiveau }) => {
      const etus = d.prepare('SELECT id, niveau FROM etudiants').all();
      let cree = 0;
      for (const e of etus) {
        const ex = d.prepare('SELECT id FROM paiements WHERE etudiant_id = ? AND annee = ?').get(e.id, annee);
        if (!ex) {
          d.prepare('INSERT INTO paiements (etudiant_id, annee, montant_total, montant_paye) VALUES (?, ?, ?, 0)')
            .run(e.id, annee, montant);
          cree++;
        }
      }
      let promus = 0;
      if (avancerNiveau) {
        for (const e of etus) {
          d.prepare('UPDATE etudiants SET niveau = niveau + 1 WHERE id = ?').run(e.id);
          promus++;
        }
      }
      return { cree, promus };
    },

    // ===== SAUVEGARDES =====
    backupCreate: () => {
      db.save();
      const dir = path.join(path.dirname(db.DB_PATH), 'sauvegardes');
      fs.mkdirSync(dir, { recursive: true });
      const d = new Date(), p = n => String(n).padStart(2, '0');
      const name = `sauvegarde-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
      fs.copyFileSync(db.DB_PATH, path.join(dir, name));
      return name;
    },

    backupList: () => {
      const dir = path.join(path.dirname(db.DB_PATH), 'sauvegardes');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter(f => f.endsWith('.db')).map(f => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, taille: st.size, date: st.mtime.toISOString() };
      }).sort((a, b) => b.date.localeCompare(a.date));
    },

    // restaure puis relance l'application
    backupRestore: (d, { name }) => {
      if (!/^[a-zA-Z0-9._-]+\.db$/.test(name)) throw new Error('Nom de sauvegarde invalide');
      const src = path.join(path.dirname(db.DB_PATH), 'sauvegardes', name);
      if (!fs.existsSync(src)) throw new Error('Sauvegarde introuvable');
      fs.copyFileSync(src, db.DB_PATH);
      const electron = require('electron');
      if (electron.app && electron.app.relaunch) {
        electron.app.relaunch();
        electron.app.exit(0);
      }
      return true;
    },

    // listes simples pour les formulaires
    etudiantsAll: (d) => d.prepare('SELECT id, matricule, nom, prenom FROM etudiants ORDER BY nom').all()
  };
};
