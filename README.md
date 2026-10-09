# 🎓 UniGest — Application de Gestion Universitaire

Application desktop Windows (Electron + SQLite) de gestion universitaire complète, multi-rôles.

## Installation (version installateur)
1. Double-cliquer **`UniGest Setup 1.2.0.exe`**
2. Suivre l'assistant (choisir le dossier, raccourcis créés automatiquement)
3. Lancer **UniGest** depuis le Bureau ou le menu Démarrer

La base de données est créée automatiquement au premier lancement dans
`%APPDATA%\UniGest\universite.db` — pour sauvegarder, copier ce fichier.

## Modules
- **Étudiants** : inscription, niveau (L1/L2/L3), recherche, filière & promotion, export CSV
- **Professeurs** : gestion et affectation aux cours
- **Filières & Cours** : matières, crédits, semestres, inscriptions
- **Notes & Bulletins** : saisie par les professeurs, moyennes pondérées,
  **bulletin officiel imprimable** (moyennes par semestre, crédits validés,
  décision Admis/Ajourné, mention) — export PDF via « Imprimer / PDF »
- **Absences & présences** : pointage par cours et par jour (Présent/Absent/Retard),
  justificatifs, statistiques par étudiant et vue « Mes absences » pour l'étudiant
- **Documents officiels** : certificat de scolarité, attestation d'inscription,
  carte étudiante — imprimables en PDF, au nom de l'université
- **Réinscriptions** : passage à la nouvelle année académique en 1 clic
  (frais créés pour tous, promotion des niveaux en option)
- **Emploi du temps** : séances hebdomadaires, vues par filière
- **Salles** : gestion des salles
- **Finances** : frais de scolarité, encaissements, impayés, export CSV,
  **reçus de paiement numérotés imprimables** (générés automatiquement à chaque encaissement)
- **Bibliothèque** : livres, emprunts/retours, retards
- **Tableau de bord** : statistiques et graphiques (réussite par filière, situation des paiements)
- **Paramètres & Sauvegardes** : nom de l'université et année académique,
  sauvegarde en 1 clic + sauvegarde automatique quotidienne, restauration avec relance

## Rôles
| Rôle | Accès |
|------|-------|
| Admin | Tout |
| Professeur | Ses cours, saisie des notes, son emploi du temps |
| Étudiant | Ses notes, son bulletin, son emploi du temps, ses frais, ses emprunts |

## Comptes de démonstration (premier lancement)
| Utilisateur | Mot de passe | Rôle |
|-------------|--------------|------|
| `admin` | `admin` | Administrateur |
| `prof.dupont` | `prof123` | Professeur |
| `e20001` | `etu123` | Étudiant |

> ⚠️ Changez ces mots de passe en production.
> Le bouton « Continuer sans connexion » ouvre le mode démo (accès admin sans mot de passe).

## Lancement depuis les sources (développeurs)
```bash
npm install
npm start        # lancer en développement
npm run dist     # reconstruire l'installateur Windows
```

## Structure
```
main.js               Processus principal Electron
preload.js            Pont sécurisé (contextBridge)
ipc.js                Handlers métier (IPC)
db/database.js        Schéma SQLite (sql.js/WebAssembly) + persistance
db/seed.js            Données d'exemple
renderer/             Interface (HTML/CSS/JS)
dist/                 Sorties de compilation (installateur)
```
