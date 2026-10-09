const crypto = require('crypto');
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');

// Données d'exemple insérées au premier lancement uniquement.
// Comptes par défaut : admin/admin, prof.dupont/prof123, e20001/etu123
module.exports = [
  `INSERT INTO users (username, password, role) VALUES ('admin', '${hash('admin')}', 'admin')`,

  `INSERT INTO filieres (code, nom) VALUES
    ('INFO', 'Informatique'),
    ('GES', 'Gestion'),
    ('DRT', 'Droit')`,

  `INSERT INTO salles (code, nom, capacite, type) VALUES
    ('A101', 'Amphi A101', 200, 'Amphithéâtre'),
    ('B201', 'Salle B201', 50, 'Salle de cours'),
    ('LAB1', 'Laboratoire Info 1', 30, 'Laboratoire'),
    ('LAB2', 'Laboratoire Info 2', 30, 'Laboratoire')`,

  `INSERT INTO professeurs (code, nom, prenom, email, telephone, specialite) VALUES
    ('P001', 'Dupont', 'Jean', 'j.dupont@univ.edu', '0601020304', 'Programmation'),
    ('P002', 'Martin', 'Sophie', 's.martin@univ.edu', '0605060708', 'Bases de données'),
    ('P003', 'Bernard', 'Luc', 'l.bernard@univ.edu', '0609101112', 'Droit privé')`,

  `INSERT INTO etudiants (matricule, nom, prenom, date_naissance, sexe, email, telephone, filiere_id, promotion) VALUES
    ('E20001', 'Kouassi', 'Awa', '2003-05-12', 'F', 'awa.k@univ.edu', '0701010101', 1, '2023'),
    ('E20002', 'Traore', 'Moussa', '2002-11-03', 'M', 'moussa.t@univ.edu', '0702020202', 1, '2023'),
    ('E20003', 'Diallo', 'Fatou', '2004-01-25', 'F', 'fatou.d@univ.edu', '0703030303', 2, '2024'),
    ('E20004', 'Ndiaye', 'Omar', '2003-08-17', 'M', 'omar.n@univ.edu', '0704040404', 3, '2024')`,

  `INSERT INTO users (username, password, role, professeur_id, etudiant_id)
   SELECT 'prof.dupont', '${hash('prof123')}', 'professeur', id, NULL FROM professeurs WHERE code = 'P001'`,

  `INSERT INTO users (username, password, role, professeur_id, etudiant_id)
   SELECT 'e20001', '${hash('etu123')}', 'etudiant', NULL, id FROM etudiants WHERE matricule = 'E20001'`,

  `INSERT INTO cours (code, nom, credits, filiere_id, professeur_id, semestre) VALUES
    ('INF101', 'Algorithmique', 6, 1, 1, 1),
    ('INF102', 'Programmation Java', 6, 1, 1, 1),
    ('INF201', 'Bases de données', 5, 1, 2, 2),
    ('GES101', 'Comptabilité générale', 4, 2, 2, 1),
    ('DRT101', 'Droit constitutionnel', 5, 3, 3, 1)`,

  `INSERT INTO inscriptions (etudiant_id, cours_id) VALUES
    (1, 1), (1, 2), (2, 1), (2, 2), (3, 4), (4, 5)`,

  `INSERT INTO notes (inscription_id, type_eval, note, coefficient) VALUES
    (1, 'Devoir', 14, 1), (1, 'Examen', 16, 2),
    (2, 'Devoir', 11, 1), (2, 'Examen', 13, 2),
    (3, 'Examen', 9, 2), (4, 'Examen', 15, 2),
    (5, 'Devoir', 12, 1), (6, 'Examen', 17, 2)`,

  `INSERT INTO seances (cours_id, salle_id, jour, heure_debut, heure_fin, type) VALUES
    (1, 1, 'Lundi', '08:00', '10:00', 'Cours'),
    (2, 3, 'Lundi', '10:15', '12:15', 'TP'),
    (3, 2, 'Mardi', '08:00', '11:00', 'Cours'),
    (4, 2, 'Mercredi', '14:00', '16:00', 'Cours'),
    (5, 1, 'Jeudi', '08:00', '10:00', 'Cours')`,

  `INSERT INTO paiements (etudiant_id, annee, montant_total, montant_paye) VALUES
    (1, '2026', 500000, 500000),
    (2, '2026', 500000, 250000),
    (3, '2026', 450000, 0),
    (4, '2026', 450000, 450000)`,

  `INSERT INTO livres (code, titre, auteur, annee, exemplaires, disponible) VALUES
    ('L001', 'Algorithmique en Java', 'J. Dupont', 2020, 3, 3),
    ('L002', 'SQL pour tous', 'S. Martin', 2019, 2, 2),
    ('L003', 'Droit constitutionnel', 'L. Bernard', 2021, 1, 1)`,

  `INSERT INTO emprunts (livre_id, etudiant_id, date_emprunt, date_retour_prevue, date_retour_reel) VALUES
    (1, 1, date('now', '-10 days'), date('now', '+4 days'), NULL),
    (2, 2, date('now', '-30 days'), date('now', '-16 days'), NULL)`
];
