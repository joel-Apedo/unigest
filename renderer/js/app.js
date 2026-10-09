/* ================= Application Gestion Universitaire ================= */
const $ = (sel) => document.querySelector(sel);
let user = null;       // utilisateur connecté
let pageCache = {};    // listes pour formulaires (filieres, salles, profs...)

const apiInvoke = (action, payload = {}) => window.api.invoke(action, payload);

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => t.classList.add('hidden'), 2600);
  t.classList.remove('hidden');
}

async function call(action, payload, okMsg) {
  const r = await apiInvoke(action, payload);
  if (!r.ok) { toast(r.error, true); throw new Error(r.error); }
  if (okMsg) toast(okMsg);
  return r.data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtMoney = (n) => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';

/* impression : copie le HTML dans la zone d'impression puis ouvre le dialogue
   (choisir "Microsoft Print to PDF" pour obtenir un PDF) */
function printHtml(inner) {
  $('#print-area').innerHTML = inner;
  window.print();
}

/* export CSV ouvrable dans Excel (BOM UTF-8, séparateur ;) */
function downloadCSV(filename, rows, headers) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [headers.map(q).join(';'), ...rows.map(r => r.map(q).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
}

/* ================= LOGIN ================= */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    user = await call('login', {
      username: $('#login-username').value.trim(),
      password: $('#login-password').value
    });
    $('#login-error').textContent = '';
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#current-user').innerHTML =
      `${esc(user.prenom || '')} ${esc(user.nom || user.username)}<small>${roleLabel(user.role)}</small>`;
    buildNav();
    goto('dashboard');
  } catch (err) {
    $('#login-error').textContent = 'Identifiants incorrects';
  }
});

$('#btn-logout').onclick = () => location.reload();

// Mode démo : accès direct en tant qu'administrateur sans mot de passe
$('#btn-guest').onclick = async () => {
  try {
    user = await call('loginDemo');
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#current-user').innerHTML =
      `${esc(user.prenom || '')} ${esc(user.nom || user.username)}<small>${roleLabel(user.role)}</small>`;
    buildNav();
    goto('dashboard');
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
};

const roleLabel = (r) => ({ admin: 'Administrateur', professeur: 'Professeur', etudiant: 'Étudiant' }[r] || r);

/* ================= NAVIGATION ================= */
const PAGES = {
  dashboard:   { title: 'Tableau de bord', roles: ['admin', 'professeur', 'etudiant'] },
  // admin
  etudiants:   { title: 'Étudiants', roles: ['admin'], section: 'Scolarité' },
  professeurs: { title: 'Professeurs', roles: ['admin'], section: 'Scolarité' },
  filieres:    { title: 'Filières', roles: ['admin'], section: 'Scolarité' },
  cours:       { title: 'Cours', roles: ['admin'], section: 'Scolarité' },
  absences:    { title: 'Absences & présences', roles: ['admin'], section: 'Scolarité' },
  edt:         { title: 'Emploi du temps', roles: ['admin'], section: 'Planning' },
  salles:      { title: 'Salles', roles: ['admin'], section: 'Planning' },
  finances:    { title: 'Finances', roles: ['admin'], section: 'Gestion' },
  biblio:      { title: 'Bibliothèque', roles: ['admin'], section: 'Gestion' },
  parametres:  { title: 'Paramètres & Sauvegardes', roles: ['admin'], section: 'Gestion' },
  // prof
  mesCours:    { title: 'Mes cours', roles: ['professeur'], section: 'Enseignement' },
  mesNotes:    { title: 'Saisie des notes', roles: ['professeur'], section: 'Enseignement' },
  monEdtProf:  { title: 'Mon emploi du temps', roles: ['professeur'], section: 'Enseignement' },
  // étudiant
  mesNotesEtu: { title: 'Mes notes', roles: ['etudiant'], section: 'Mon espace' },
  monBulletin: { title: 'Mon bulletin', roles: ['etudiant'], section: 'Mon espace' },
  mesAbsences: { title: 'Mes absences', roles: ['etudiant'], section: 'Mon espace' },
  monEdtEtu:   { title: 'Mon emploi du temps', roles: ['etudiant'], section: 'Mon espace' },
  mesFrais:    { title: 'Frais de scolarité', roles: ['etudiant'], section: 'Mon espace' },
  mesEmprunts: { title: 'Mes emprunts', roles: ['etudiant'], section: 'Mon espace' },
};

function buildNav() {
  const nav = $('#nav');
  let html = '<button class="nav-item" data-page="dashboard">📊 Tableau de bord</button>';
  let lastSection = null;
  for (const [key, p] of Object.entries(PAGES)) {
    if (!p.roles.includes(user.role) || key === 'dashboard') continue;
    if (p.section && p.section !== lastSection) {
      html += `<div class="nav-section">${p.section}</div>`;
      lastSection = p.section;
    }
    html += `<button class="nav-item" data-page="${key}">${p.title}</button>`;
  }
  nav.innerHTML = html;
  nav.querySelectorAll('.nav-item').forEach(b => b.onclick = () => goto(b.dataset.page));
}

async function goto(page) {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));
  $('#page-title').textContent = PAGES[page].title;
  const content = $('#content');
  content.innerHTML = '<p style="color:var(--muted)">Chargement…</p>';
  try { await RENDER[page](content); }
  catch (e) { content.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

/* ================= MODAL ================= */
function openModal(title, bodyHtml) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() { $('#modal-overlay').classList.add('hidden'); }
$('#modal-close').onclick = closeModal;
$('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

/* ================= PAGES ================= */
const RENDER = {};

/* ---------- Dashboard ---------- */
RENDER.dashboard = async (el) => {
  if (user.role === 'admin') {
    const [s, fil, pai] = await Promise.all([
      call('dashboard'), call('statsFiliares'), call('statsPaiements')]);
    const tot = (pai.solde || 0) + (pai.partiel || 0) + (pai.impaye || 0);
    const bar = (label, pct, color, val) =>
      `<div class="bar-row"><span class="bar-label">${esc(label)}</span>
       <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.max(pct, 2))}%;background:${color}"></div></div>
       <span class="bar-val">${val}</span></div>`;
    el.innerHTML = `
      <div class="stats-grid">
        ${stat('👥', s.etudiants, 'Étudiants')}
        ${stat('👨‍🏫', s.professeurs, 'Professeurs')}
        ${stat('📚', s.cours, 'Cours')}
        ${stat('📖', s.empruntsEnCours, 'Emprunts en cours')}
        ${stat('💰', fmtMoney(s.impayes), 'Impayés scolarité')}
        ${stat('📈', (s.moyenneGlobale ?? '—') + '/20', 'Moyenne générale')}
        ${stat('🚫', s.absencesAujourdui, 'Absences aujourd\u2019hui')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div class="card" style="margin:0"><h3>🎓 Réussite par filière (moyenne ≥ 10/20)</h3>
          ${fil.length ? fil.map(f => bar(f.code, f.tauxAdmis || 0, '#2563eb',
            `${f.tauxAdmis ?? '—'} %${f.moyenne !== null && f.moyenne !== undefined ? ' · moy ' + f.moyenne : ''}`)).join('')
            : '<p style="color:var(--muted)">Aucune donnée.</p>'}
        </div>
        <div class="card" style="margin:0"><h3>💰 Situation des paiements</h3>
          ${bar('Soldés', tot ? pai.solde / tot * 100 : 0, '#16a34a', (pai.solde || 0) + ' étudiants')}
          ${bar('Partiels', tot ? pai.partiel / tot * 100 : 0, '#d97706', (pai.partiel || 0) + ' étudiants')}
          ${bar('Impayés', tot ? pai.impaye / tot * 100 : 0, '#dc2626', (pai.impaye || 0) + ' étudiants')}
          <p style="font-size:12.5px;color:var(--muted);margin-top:10px">Encaissé : <b>${fmtMoney(pai.encaisse)}</b> sur ${fmtMoney(pai.attendu)} attendus.</p>
        </div>
      </div>`;
  } else if (user.role === 'professeur') {
    const cours = await call('mesCours', { professeurId: user.professeur_id });
    el.innerHTML = `
      <div class="stats-grid">${stat('📚', cours.length, 'Mes cours')}
      ${stat('👥', cours.reduce((a, c) => a + c.nb_etudiants, 0), 'Étudiants inscrits')}</div>
      <div class="card"><h3>Mes cours</h3>${tableRows(cours, c =>
        `<td>${esc(c.code)}</td><td>${esc(c.nom)}</td><td>${c.credits}</td><td>${c.nb_etudiants}</td>`,
        ['Code', 'Cours', 'Crédits', 'Inscrits'])}</div>`;
  } else {
    const [notes, frais, emprunts] = await Promise.all([
      call('mesNotes', { etudiantId: user.etudiant_id }),
      call('mesFrais', { etudiantId: user.etudiant_id }),
      call('mesEmprunts', { etudiantId: user.etudiant_id })
    ]);
    const moy = notes.length ? (notes.reduce((a, n) => a + (n.moyenne || 0), 0) / notes.filter(n => n.moyenne !== null).length).toFixed(2) : '—';
    const reste = frais.reduce((a, f) => a + (f.montant_total - f.montant_paye), 0);
    el.innerHTML = `
      <div class="stats-grid">
        ${stat('📈', moy + '/20', 'Ma moyenne')}
        ${stat('📚', notes.length, 'Cours suivis')}
        ${stat('💰', fmtMoney(reste), 'Reste à payer')}
        ${stat('📖', emprunts.filter(e => !e.date_retour_reel).length, 'Emprunts en cours')}
      </div>`;
  }
};
const stat = (icon, value, label) =>
  `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;

/* ---------- Étudiants ---------- */
RENDER.etudiants = async (el, q = '') => {
  pageCache.filieres = await call('filieres');
  const rows = await call('etudiants', { q });
  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="etu-q" placeholder="Rechercher (nom, matricule)…" value="${esc(q)}">
      <div class="spacer"></div>
      <button class="btn" id="etu-reinsc">🔄 Réinscriptions</button>
      <button class="btn btn-primary" id="etu-add">+ Nouvel étudiant</button>
      <button class="btn" id="etu-csv">⬇ CSV</button>
    </div>
    <div class="card">
      <table><thead><tr><th>Matricule</th><th>Nom</th><th>Prénom</th><th>Filière</th><th>Niveau</th><th>Promotion</th><th></th></tr></thead>
      <tbody>${rows.map(e => `
        <tr><td>${esc(e.matricule)}</td><td>${esc(e.nom)}</td><td>${esc(e.prenom)}</td>
        <td>${esc(e.filiere_code || '—')}</td><td>L${e.niveau || 1}</td><td>${esc(e.promotion || '')}</td>
        <td><div class="table-actions">
          <button class="btn btn-sm" title="Bulletin" data-bul="${e.id}">📄</button>
          <button class="btn btn-sm" title="Documents officiels" data-doc="${e.id}">🎓</button>
          <button class="btn btn-sm" data-edit="${e.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${e.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table>
      ${rows.length ? '' : '<p style="color:var(--muted);padding:14px">Aucun étudiant.</p>'}
    </div>`;

  $('#etu-q').oninput = debounce(() => RENDER.etudiants(el, $('#etu-q').value));
  $('#etu-add').onclick = () => etudiantForm();
  $('#etu-reinsc').onclick = () => reinscriptionForm();
  $('#etu-csv').onclick = () => downloadCSV('etudiants.csv',
    rows.map(e => [e.matricule, e.nom, e.prenom, e.sexe, e.filiere_code || '', 'L' + (e.niveau || 1), e.promotion || '', e.telephone || '', e.email || '']),
    ['Matricule', 'Nom', 'Prénom', 'Sexe', 'Filière', 'Niveau', 'Promotion', 'Téléphone', 'Email']);
  el.querySelectorAll('[data-bul]').forEach(b => b.onclick = () => bulletinView(+b.dataset.bul));
  el.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => documentsModal(+b.dataset.doc));
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    etudiantForm(rows.find(r => r.id == b.dataset.edit));
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cet étudiant et ses données ?')) return;
    await call('etudiantDelete', { id: +b.dataset.del }, 'Étudiant supprimé');
    RENDER.etudiants(el, q);
  });
};

function etudiantForm(e = {}) {
  const f = pageCache.filieres;
  openModal(e.id ? 'Modifier l\'étudiant' : 'Nouvel étudiant', `
    <form id="etu-form">
      <div class="form-row">
        <label>Matricule *<input name="matricule" required value="${esc(e.matricule || '')}"></label>
        <label>Niveau<select name="niveau">
          ${[1, 2, 3].map(n => `<option value="${n}" ${(e.niveau || 1) == n ? 'selected' : ''}>Licence ${n}</option>`).join('')}
        </select></label>
        <label>Promotion<input name="promotion" value="${esc(e.promotion || '')}" placeholder="2024"></label>
      </div>
      <div class="form-row">
        <label>Nom *<input name="nom" required value="${esc(e.nom || '')}"></label>
        <label>Prénom *<input name="prenom" required value="${esc(e.prenom || '')}"></label>
      </div>
      <div class="form-row">
        <label>Date de naissance<input type="date" name="date_naissance" value="${esc(e.date_naissance || '')}"></label>
        <label>Sexe<select name="sexe">
          <option value=""></option>
          <option ${e.sexe === 'M' ? 'selected' : ''} value="M">Masculin</option>
          <option ${e.sexe === 'F' ? 'selected' : ''} value="F">Féminin</option>
        </select></label>
      </div>
      <div class="form-row">
        <label>Email<input type="email" name="email" value="${esc(e.email || '')}"></label>
        <label>Téléphone<input name="telephone" value="${esc(e.telephone || '')}"></label>
      </div>
      <label>Filière<select name="filiere_id"><option value="">—</option>
        ${f.map(x => `<option ${e.filiere_id == x.id ? 'selected' : ''} value="${x.id}">${esc(x.code)} — ${esc(x.nom)}</option>`).join('')}
      </select></label>
      <label>Adresse<input name="adresse" value="${esc(e.adresse || '')}"></label>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#etu-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    data.filiere_id = data.filiere_id || null;
    await call('etudiantSave', { ...data, id: e.id || null }, 'Étudiant enregistré');
    closeModal();
    RENDER.etudiants($('#content'), $('#etu-q')?.value || '');
  };
}

/* ---------- Professeurs ---------- */
RENDER.professeurs = async (el, q = '') => {
  const rows = await call('professeurs', { q });
  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="prof-q" placeholder="Rechercher…" value="${esc(q)}">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="prof-add">+ Nouveau professeur</button>
    </div>
    <div class="card"><table>
      <thead><tr><th>Code</th><th>Nom</th><th>Prénom</th><th>Spécialité</th><th>Email</th><th>Cours</th><th></th></tr></thead>
      <tbody>${rows.map(p => `<tr><td>${esc(p.code)}</td><td>${esc(p.nom)}</td><td>${esc(p.prenom)}</td>
        <td>${esc(p.specialite || '')}</td><td>${esc(p.email || '')}</td><td>${p.nb_cours}</td>
        <td><div class="table-actions">
          <button class="btn btn-sm" data-edit="${p.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  $('#prof-q').oninput = debounce(() => RENDER.professeurs(el, $('#prof-q').value));
  $('#prof-add').onclick = () => profForm();
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => profForm(rows.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce professeur ?')) return;
    await call('professeurDelete', { id: +b.dataset.del }, 'Professeur supprimé');
    RENDER.professeurs(el, q);
  });
};

function profForm(p = {}) {
  openModal(p.id ? 'Modifier le professeur' : 'Nouveau professeur', `
    <form id="prof-form">
      <div class="form-row">
        <label>Code *<input name="code" required value="${esc(p.code || '')}" placeholder="P004"></label>
        <label>Spécialité<input name="specialite" value="${esc(p.specialite || '')}"></label>
      </div>
      <div class="form-row">
        <label>Nom *<input name="nom" required value="${esc(p.nom || '')}"></label>
        <label>Prénom *<input name="prenom" required value="${esc(p.prenom || '')}"></label>
      </div>
      <div class="form-row">
        <label>Email<input type="email" name="email" value="${esc(p.email || '')}"></label>
        <label>Téléphone<input name="telephone" value="${esc(p.telephone || '')}"></label>
      </div>
      ${p.id ? '' : '<p style="font-size:12px;color:var(--muted)">Un compte sera créé : <code>prof.prenom.nom</code> / <code>prof123</code></p>'}
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#prof-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('professeurSave', { ...Object.fromEntries(new FormData(ev.target)), id: p.id || null }, 'Professeur enregistré');
    closeModal();
    RENDER.professeurs($('#content'));
  };
}

/* ---------- Filières ---------- */
RENDER.filieres = async (el) => {
  const rows = await call('filieres');
  el.innerHTML = `
    <div class="toolbar"><div class="spacer"></div>
      <button class="btn btn-primary" id="fil-add">+ Nouvelle filière</button></div>
    <div class="card"><table><thead><tr><th>Code</th><th>Nom</th><th></th></tr></thead>
      <tbody>${rows.map(f => `<tr><td>${esc(f.code)}</td><td>${esc(f.nom)}</td>
        <td><div class="table-actions">
          <button class="btn btn-sm" data-edit="${f.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${f.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  $('#fil-add').onclick = () => filiereForm();
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => filiereForm(rows.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette filière ?')) return;
    await call('filiereDelete', { id: +b.dataset.del }, 'Filière supprimée');
    RENDER.filieres(el);
  });
};

function filiereForm(f = {}) {
  openModal(f.id ? 'Modifier la filière' : 'Nouvelle filière', `
    <form id="fil-form">
      <div class="form-row">
        <label>Code *<input name="code" required value="${esc(f.code || '')}" placeholder="INFO"></label>
        <label>Nom *<input name="nom" required value="${esc(f.nom || '')}"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#fil-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('filiereSave', { ...Object.fromEntries(new FormData(ev.target)), id: f.id || null }, 'Filière enregistrée');
    closeModal();
    RENDER.filieres($('#content'));
  };
}

/* ---------- Salles ---------- */
RENDER.salles = async (el) => {
  const rows = await call('salles');
  el.innerHTML = `
    <div class="toolbar"><div class="spacer"></div>
      <button class="btn btn-primary" id="sal-add">+ Nouvelle salle</button></div>
    <div class="card"><table><thead><tr><th>Code</th><th>Nom</th><th>Capacité</th><th>Type</th><th></th></tr></thead>
      <tbody>${rows.map(s => `<tr><td>${esc(s.code)}</td><td>${esc(s.nom)}</td><td>${s.capacite ?? ''}</td><td>${esc(s.type || '')}</td>
        <td><div class="table-actions">
          <button class="btn btn-sm" data-edit="${s.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${s.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  $('#sal-add').onclick = () => salleForm();
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => salleForm(rows.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette salle ?')) return;
    await call('salleDelete', { id: +b.dataset.del }, 'Salle supprimée');
    RENDER.salles(el);
  });
};

function salleForm(s = {}) {
  openModal(s.id ? 'Modifier la salle' : 'Nouvelle salle', `
    <form id="sal-form">
      <div class="form-row">
        <label>Code *<input name="code" required value="${esc(s.code || '')}" placeholder="B202"></label>
        <label>Nom *<input name="nom" required value="${esc(s.nom || '')}"></label>
      </div>
      <div class="form-row">
        <label>Capacité<input type="number" min="1" name="capacite" value="${s.capacite ?? ''}"></label>
        <label>Type<select name="type">
          ${['', 'Salle de cours', 'Amphithéâtre', 'Laboratoire', 'Bureau'].map(t =>
            `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#sal-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    await call('salleSave', { ...data, capacite: data.capacite || null, id: s.id || null }, 'Salle enregistrée');
    closeModal();
    RENDER.salles($('#content'));
  };
}

/* ---------- Cours (admin) ---------- */
RENDER.cours = async (el) => {
  const [rows, filieres, profs] = await Promise.all([call('cours'), call('filieres'), call('professeurs')]);
  pageCache = { filieres, profs };
  el.innerHTML = `
    <div class="toolbar"><div class="spacer"></div>
      <button class="btn btn-primary" id="cours-add">+ Nouveau cours</button></div>
    <div class="card"><table>
      <thead><tr><th>Code</th><th>Nom</th><th>Crédits</th><th>Filière</th><th>Professeur</th><th>Sem.</th><th>Inscrits</th><th></th></tr></thead>
      <tbody>${rows.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.nom)}</td><td>${c.credits}</td>
        <td>${esc(c.filiere_code || '—')}</td><td>${esc(c.prof_prenom ? c.prof_prenom + ' ' + c.prof_nom : '—')}</td>
        <td>S${c.semestre}</td><td>${c.nb_etudiants}</td>
        <td><div class="table-actions">
          <button class="btn btn-sm" title="Inscriptions" data-ins="${c.id}">👥</button>
          <button class="btn btn-sm" data-edit="${c.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${c.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  $('#cours-add').onclick = () => coursForm();
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => coursForm(rows.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => inscriptionsForm(+b.dataset.ins));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce cours ?')) return;
    await call('coursDelete', { id: +b.dataset.del }, 'Cours supprimé');
    RENDER.cours(el);
  });
};

function coursForm(c = {}) {
  const { filieres, profs } = pageCache;
  openModal(c.id ? 'Modifier le cours' : 'Nouveau cours', `
    <form id="cours-form">
      <div class="form-row">
        <label>Code *<input name="code" required value="${esc(c.code || '')}" placeholder="INF103"></label>
        <label>Crédits<input type="number" min="1" max="30" name="credits" value="${c.credits || 3}"></label>
      </div>
      <label>Nom *<input name="nom" required value="${esc(c.nom || '')}"></label>
      <div class="form-row">
        <label>Filière<select name="filiere_id"><option value="">—</option>
          ${filieres.map(f => `<option ${c.filiere_id == f.id ? 'selected' : ''} value="${f.id}">${esc(f.code)}</option>`).join('')}
        </select></label>
        <label>Professeur<select name="professeur_id"><option value="">—</option>
          ${profs.map(p => `<option ${c.professeur_id == p.id ? 'selected' : ''} value="${p.id}">${esc(p.prenom)} ${esc(p.nom)}</option>`).join('')}
        </select></label>
        <label>Semestre<select name="semestre">
          ${[1, 2].map(s => `<option ${c.semestre == s ? 'selected' : ''} value="${s}">S${s}</option>`).join('')}
        </select></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#cours-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    await call('coursSave', { ...data, filiere_id: data.filiere_id || null, professeur_id: data.professeur_id || null, id: c.id || null }, 'Cours enregistré');
    closeModal();
    RENDER.cours($('#content'));
  };
}

async function inscriptionsForm(coursId) {
  const [coursList, inscrits, dispo] = await Promise.all([
    call('cours'), call('coursInscrits', { coursId }), call('coursEtudiants', { coursId })]);
  const c = coursList.find(x => x.id === coursId);
  openModal(`Inscriptions — ${c.code}`, `
    <div class="card" style="margin:0 0 14px"><h3>Inscrits (${inscrits.length})</h3>
      <table><tbody>${inscrits.map(i => `<tr><td>${esc(i.matricule)}</td><td>${esc(i.nom)} ${esc(i.prenom)}</td>
        <td><button class="btn btn-sm btn-danger" data-desins="${i.id}">Retirer</button></td></tr>`).join('') || '<tr><td style="color:var(--muted)">Aucun inscrit</td></tr>'}</tbody></table></div>
    <div class="card" style="margin:0"><h3>Ajouter un étudiant de la filière</h3>
      <div style="display:flex;gap:10px">
        <select id="ins-select" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:8px">
          ${dispo.map(e => `<option value="${e.id}">${esc(e.matricule)} — ${esc(e.nom)} ${esc(e.prenom)}</option>`).join('') || '<option value="">Aucun étudiant disponible</option>'}
        </select>
        <button class="btn btn-primary" id="ins-add" ${dispo.length ? '' : 'disabled'}>Ajouter</button>
      </div></div>`);
  $('#ins-add').onclick = async () => {
    const id = $('#ins-select').value;
    if (!id) return;
    await call('coursInscrire', { coursId, etudiantId: +id }, 'Étudiant inscrit');
    inscriptionsForm(coursId);
  };
  document.querySelectorAll('[data-desins]').forEach(b => b.onclick = async () => {
    await call('coursDesinscrire', { coursId, etudiantId: +b.dataset.desins }, 'Étudiant retiré');
    inscriptionsForm(coursId);
  });
}

/* ---------- Emploi du temps (admin) ---------- */
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

RENDER.edt = async (el) => {
  const filieres = await call('filieres');
  const sel = el.dataset.filiere || '';
  const rows = await call('seances', { filiereId: sel || null });
  el.innerHTML = `
    <div class="toolbar">
      <select id="edt-fil"><option value="">Toutes les filières</option>
        ${filieres.map(f => `<option ${sel == f.id ? 'selected' : ''} value="${f.id}">${esc(f.code)}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="seance-add">+ Nouvelle séance</button>
    </div>
    <div class="edt-grid">${JOURS.map(j => `
      <div class="edt-day"><h4>${j}</h4>
        ${rows.filter(s => s.jour === j).map(s => `
          <div class="edt-seance"><b>${esc(s.heure_debut)}–${esc(s.heure_fin)} ${esc(s.cours_code)}</b>
            ${esc(s.cours_nom)}<br><small>${esc(s.salle_code || '—')} · ${esc(s.prof_nom || '')} ${esc(s.filiere_code || '')}</small>
            <div style="margin-top:4px">
              <button class="btn btn-sm" data-edit="${s.id}">✏️</button>
              <button class="btn btn-sm btn-danger" data-del="${s.id}">🗑</button>
            </div></div>`).join('') || '<small style="color:var(--muted)">—</small>'}
      </div>`).join('')}</div>`;
  $('#edt-fil').onchange = () => { el.dataset.filiere = $('#edt-fil').value; RENDER.edt(el); };
  $('#seance-add').onclick = () => seanceForm();
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => seanceForm(rows.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette séance ?')) return;
    await call('seanceDelete', { id: +b.dataset.del }, 'Séance supprimée');
    RENDER.edt(el);
  });
};

async function seanceForm(s = {}) {
  const [cours, salles] = await Promise.all([call('cours'), call('salles')]);
  openModal(s.id ? 'Modifier la séance' : 'Nouvelle séance', `
    <form id="seance-form">
      <label>Cours *<select name="cours_id" required>
        ${cours.map(c => `<option ${s.cours_id == c.id ? 'selected' : ''} value="${c.id}">${esc(c.code)} — ${esc(c.nom)}</option>`).join('')}
      </select></label>
      <div class="form-row">
        <label>Jour *<select name="jour">${JOURS.map(j => `<option ${s.jour === j ? 'selected' : ''}>${j}</option>`).join('')}</select></label>
        <label>Début *<input type="time" name="heure_debut" required value="${esc(s.heure_debut || '08:00')}"></label>
        <label>Fin *<input type="time" name="heure_fin" required value="${esc(s.heure_fin || '10:00')}"></label>
      </div>
      <div class="form-row">
        <label>Salle<select name="salle_id"><option value="">—</option>
          ${salles.map(x => `<option ${s.salle_id == x.id ? 'selected' : ''} value="${x.id}">${esc(x.code)}</option>`).join('')}
        </select></label>
        <label>Type<select name="type">
          ${['Cours', 'TD', 'TP', 'Examen'].map(t => `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#seance-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    await call('seanceSave', { ...data, salle_id: data.salle_id || null, id: s.id || null }, 'Séance enregistrée');
    closeModal();
    RENDER.edt($('#content'));
  };
}

/* ---------- Mes cours (prof) ---------- */
RENDER.mesCours = async (el) => {
  const rows = await call('mesCours', { professeurId: user.professeur_id });
  el.innerHTML = `<div class="card"><table>
    <thead><tr><th>Code</th><th>Cours</th><th>Crédits</th><th>Filière</th><th>Semestre</th><th>Inscrits</th><th></th></tr></thead>
    <tbody>${rows.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.nom)}</td><td>${c.credits}</td>
      <td>${esc(c.filiere_code || '—')}</td><td>S${c.semestre}</td><td>${c.nb_etudiants}</td>
      <td><div class="table-actions">
        <button class="btn btn-sm btn-primary" data-notes="${c.id}">📝 Notes</button>
        <button class="btn btn-sm" title="Présences" data-pres="${c.id}">📋</button>
      </div></td></tr>`).join('')}</tbody></table></div>`;
  el.querySelectorAll('[data-notes]').forEach(b => b.onclick = () => notesCoursPage(+b.dataset.notes));
  el.querySelectorAll('[data-pres]').forEach(b => b.onclick = async () => {
    const rows2 = await call('mesCours', { professeurId: user.professeur_id });
    const c = rows2.find(x => x.id === +b.dataset.pres);
    $('#page-title').textContent = 'Présences — ' + c.code;
    pointagePage(+b.dataset.pres);
  });
};

/* ---------- Saisie des notes (prof) ---------- */
async function notesCoursPage(coursId) {
  const bulletins = await call('bulletinCours', { coursId });
  $('#page-title').textContent = 'Saisie des notes';
  const el = $('#content');
  el.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="back-cours">← Retour aux cours</button>
      <div class="spacer"></div>
    </div>
    <div class="card"><table>
      <thead><tr><th>Matricule</th><th>Étudiant</th><th>Notes</th><th>Moyenne</th><th></th></tr></thead>
      <tbody>${bulletins.map(b => `<tr><td>${esc(b.matricule)}</td><td>${esc(b.nom)} ${esc(b.prenom)}</td>
        <td>${b.nb_notes ? b.nb_notes + ' note(s)' : '—'}</td>
        <td>${b.moyenne === null ? '—' : `<span class="badge ${b.moyenne >= 10 ? 'badge-success' : 'badge-danger'}">${b.moyenne}/20</span>`}</td>
        <td><button class="btn btn-sm" data-note="${b.inscription_id}">Gérer</button></td></tr>`).join('')}</tbody></table></div>`;
  $('#back-cours').onclick = () => { $('#page-title').textContent = 'Mes cours'; RENDER.mesCours(el); };
  el.querySelectorAll('[data-note]').forEach(b => b.onclick = () => notesEtudiantForm(+b.dataset.note, coursId));
}

async function notesEtudiantForm(inscriptionId, coursId) {
  const notes = await call('notes', { inscriptionId });
  const ins = notes.length ? null : null;
  openModal('Notes de l\'étudiant', `
    <div id="notes-list">${notes.map(n => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border)">
        <span style="flex:1">${esc(n.type_eval)} <small style="color:var(--muted)">(coef ${n.coefficient})</small></span>
        <span class="badge ${n.note >= 10 ? 'badge-success' : 'badge-danger'}">${n.note}/20</span>
        <button class="btn btn-sm btn-danger" data-delnote="${n.id}">🗑</button>
      </div>`).join('') || '<p style="color:var(--muted)">Aucune note.</p>'}</div>
    <form id="note-form" style="margin-top:16px">
      <div class="form-row">
        <label>Type<select name="type_eval">${['Devoir', 'TP', 'Examen', 'Rattrapage'].map(t => `<option>${t}</option>`).join('')}</select></label>
        <label>Note /20<input type="number" step="0.25" min="0" max="20" name="note" required></label>
        <label>Coef<input type="number" step="0.5" min="0.5" name="coefficient" value="1"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Fermer</button>
        <button class="btn btn-primary">Ajouter la note</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  document.querySelectorAll('[data-delnote]').forEach(b => b.onclick = async () => {
    await call('noteDelete', { id: +b.dataset.delnote }, 'Note supprimée');
    notesEtudiantForm(inscriptionId, coursId);
    notesCoursPage(coursId);
  });
  $('#note-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('noteAdd', { inscriptionId, ...Object.fromEntries(new FormData(ev.target)) }, 'Note ajoutée');
    notesEtudiantForm(inscriptionId, coursId);
    notesCoursPage(coursId);
  };
}

/* ---------- Mon EDT prof ---------- */
RENDER.monEdtProf = async (el) => {
  const rows = await call('monEdtProf', { professeurId: user.professeur_id });
  el.innerHTML = edtGrid(rows);
};

const edtGrid = (rows) => `<div class="edt-grid">${JOURS.map(j => `
  <div class="edt-day"><h4>${j}</h4>
    ${rows.filter(s => s.jour === j).map(s => `
      <div class="edt-seance"><b>${esc(s.heure_debut)}–${esc(s.heure_fin)} ${esc(s.cours_code)}</b>
        ${esc(s.cours_nom)}<br><small>${esc(s.salle_code || '—')}${s.filiere_code ? ' · ' + esc(s.filiere_code) : ''}${s.prof_nom ? ' · ' + esc(s.prof_prenom) + ' ' + esc(s.prof_nom) : ''}</small>
      </div>`).join('') || '<small style="color:var(--muted)">—</small>'}
  </div>`).join('')}</div>`;

/* ---------- Mes notes (étudiant) ---------- */
RENDER.mesNotesEtu = async (el) => {
  const rows = await call('mesNotes', { etudiantId: user.etudiant_id });
  const valid = rows.filter(r => r.moyenne !== null);
  const moyGen = valid.length ? (valid.reduce((a, r) => a + r.moyenne, 0) / valid.length).toFixed(2) : null;
  el.innerHTML = `
    ${moyGen !== null ? `<div class="card"><h3>Moyenne générale : ${moyGen}/20</h3></div>` : ''}
    <div class="card"><table>
      <thead><tr><th>Semestre</th><th>Code</th><th>Cours</th><th>Crédits</th><th>Moyenne</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>S${r.semestre}</td><td>${esc(r.code)}</td><td>${esc(r.cours_nom)}</td><td>${r.credits}</td>
        <td>${r.moyenne === null ? '—' : `<span class="badge ${r.moyenne >= 10 ? 'badge-success' : 'badge-danger'}">${r.moyenne}/20</span>`}</td></tr>`).join('')}</tbody></table></div>`;
};

RENDER.monEdtEtu = async (el) => {
  const rows = await call('monEdtEtudiant', { etudiantId: user.etudiant_id });
  el.innerHTML = edtGrid(rows);
};

/* ---------- Bulletins & reçus (impression) ---------- */
function bulletinHtml(b, uni = '') {
  const e = b.etudiant;
  return `
    <div class="print-doc">
      <div class="doc-head">
        ${uni ? `<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase">${esc(uni)}</div>` : ''}
        <div class="doc-title">🎓 BULLETIN DE NOTES</div>
        <div><b>${esc(e.nom)} ${esc(e.prenom)}</b> — ${esc(e.matricule)}</div>
        <div>Filière : ${esc(e.filiere_code || '—')} · Promotion : ${esc(e.promotion || '—')}</div>
      </div>
      ${b.semestres.map(s => `
        <h4>Semestre ${s.semestre}</h4>
        <table class="print-table">
          <thead><tr><th>Code</th><th>Cours</th><th>Crédits</th><th>Moyenne</th></tr></thead>
          <tbody>
            ${s.cours.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.cours_nom)}</td><td>${c.credits}</td>
              <td>${c.moyenne === null ? '—' : c.moyenne + '/20'}</td></tr>`).join('')}
            <tr class="tot"><td colspan="2">Moyenne semestrielle (pondérée par crédits)</td>
              <td>${s.creditsValides} cr. validés</td>
              <td><b>${s.moyenne === null ? '—' : s.moyenne + '/20'}</b></td></tr>
            <tr class="tot"><td colspan="2">Décision du jury</td>
              <td colspan="2"><b>${s.decision}</b> — ${esc(s.mention)}</td></tr>
          </tbody>
        </table>`).join('') || '<p>Aucun cours enregistré.</p>'}
      <div class="doc-foot"><span>Fait le ${new Date().toLocaleDateString('fr-FR')}</span><span>Signature de la scolarité</span></div>
    </div>`;
}

async function bulletinView(etudiantId) {
  const [b, s] = await Promise.all([
    call('bulletinEtudiant', { etudiantId }), call('settingsGet')]);
  const html = bulletinHtml(b, s.universite_nom);
  openModal(`Bulletin — ${b.etudiant.prenom} ${b.etudiant.nom}`, `
    ${html}
    <div class="modal-actions">
      <button type="button" class="btn" id="mf-cancel">Fermer</button>
      <button class="btn btn-primary" id="bul-print">🖨 Imprimer / PDF</button>
    </div>`);
  $('#mf-cancel').onclick = closeModal;
  $('#bul-print').onclick = () => printHtml(html);
}

async function recuView(paiementId) {
  const [p, s] = await Promise.all([
    call('recuPaiement', { paiementId }), call('settingsGet')]);
  const html = `
    <div class="print-doc">
      <div class="doc-head">
        ${s.universite_nom ? `<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase">${esc(s.universite_nom)}</div>` : ''}
        <div class="doc-title">🧾 REÇU DE PAIEMENT</div>
        <div>N° <b>${esc(p.numero_recu)}</b></div>
      </div>
      <table class="print-table">
        <tr><td>Étudiant</td><td><b>${esc(p.nom)} ${esc(p.prenom)} (${esc(p.matricule)})</b></td></tr>
        <tr><td>Filière</td><td>${esc(p.filiere_nom || '—')}</td></tr>
        <tr><td>Année académique</td><td>${esc(p.annee)}</td></tr>
        <tr><td>Date</td><td>${esc(p.date_paiement)}</td></tr>
        <tr><td>Montant total</td><td>${fmtMoney(p.montant_total)}</td></tr>
        <tr><td>Montant payé (cumulé)</td><td><b>${fmtMoney(p.montant_paye)}</b></td></tr>
        <tr><td>Reste à payer</td><td>${fmtMoney(p.montant_total - p.montant_paye)}</td></tr>
      </table>
      <div class="doc-foot"><span>Reçu généré le ${new Date().toLocaleDateString('fr-FR')}</span><span>Signature & cachet</span></div>
    </div>`;
  openModal('Reçu de paiement', `
    ${html}
    <div class="modal-actions">
      <button type="button" class="btn" id="mf-cancel">Fermer</button>
      <button class="btn btn-primary" id="recu-print">🖨 Imprimer / PDF</button>
    </div>`);
  $('#mf-cancel').onclick = closeModal;
  $('#recu-print').onclick = () => printHtml(html);
}

/* ---------- Mon bulletin (étudiant) ---------- */
RENDER.monBulletin = async (el) => {
  const [b, s] = await Promise.all([
    call('bulletinEtudiant', { etudiantId: user.etudiant_id }), call('settingsGet')]);
  el.innerHTML = `
    <div class="toolbar"><div class="spacer"></div>
      <button class="btn btn-primary" id="bul-print-page">🖨 Imprimer / PDF</button></div>
    <div class="card" id="bul-inline" style="background:#fff">${bulletinHtml(b, s.universite_nom)}</div>`;
  $('#bul-print-page').onclick = () => printHtml($('#bul-inline').innerHTML);
};

/* ---------- Finances (admin) ---------- */
RENDER.finances = async (el, q = '') => {
  const rows = await call('paiements', { q });
  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="fin-q" placeholder="Rechercher un étudiant…" value="${esc(q)}">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="fin-add">+ Nouveau paiement</button>
      <button class="btn" id="fin-csv">⬇ CSV</button>
    </div>
    <div class="card"><table>
      <thead><tr><th>Matricule</th><th>Étudiant</th><th>Année</th><th>Total</th><th>Payé</th><th>Reste</th><th>Statut</th><th></th></tr></thead>
      <tbody>${rows.map(p => {
        const statut = p.reste <= 0
          ? '<span class="badge badge-success">Soldé</span>'
          : p.montant_paye > 0 ? '<span class="badge badge-warning">Partiel</span>' : '<span class="badge badge-danger">Impayé</span>';
        return `<tr><td>${esc(p.matricule)}</td><td>${esc(p.nom)} ${esc(p.prenom)}</td><td>${esc(p.annee)}</td>
          <td>${fmtMoney(p.montant_total)}</td><td>${fmtMoney(p.montant_paye)}</td><td>${fmtMoney(p.reste)}</td>
          <td>${statut}</td>
          <td><div class="table-actions">
            ${p.reste > 0 ? `<button class="btn btn-sm btn-success" data-pay="${p.id}" data-reste="${p.reste}">💰 Encaisser</button>` : ''}
            <button class="btn btn-sm" title="Reçu" data-recu="${p.id}">🧾</button>
            <button class="btn btn-sm" data-edit="${p.id}">✏️</button>
            <button class="btn btn-sm btn-danger" data-del="${p.id}">🗑</button>
          </div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  $('#fin-q').oninput = debounce(() => RENDER.finances(el, $('#fin-q').value));
  $('#fin-add').onclick = () => paiementForm();
  $('#fin-csv').onclick = () => downloadCSV('finances.csv',
    rows.map(p => [p.matricule, p.nom + ' ' + p.prenom, p.annee, p.montant_total, p.montant_paye, p.reste,
      p.reste <= 0 ? 'Soldé' : p.montant_paye > 0 ? 'Partiel' : 'Impayé']),
    ['Matricule', 'Étudiant', 'Année', 'Total', 'Payé', 'Reste', 'Statut']);
  el.querySelectorAll('[data-recu]').forEach(b => b.onclick = () => recuView(+b.dataset.recu));
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => paiementForm(rows.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cette ligne de paiement ?')) return;
    await call('paiementDelete', { id: +b.dataset.del }, 'Supprimé');
    RENDER.finances(el, q);
  });
  el.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => {
    const m = prompt(`Montant à encaisser (reste : ${b.dataset.reste} FCFA) :`, b.dataset.reste);
    if (!m) return;
    await call('paiementEncaisser', { id: +b.dataset.pay, montant: +m }, 'Paiement encaissé');
    RENDER.finances(el, q);
    recuView(+b.dataset.pay);
  });
};

async function paiementForm(p = {}) {
  const etus = await call('etudiantsAll');
  openModal(p.id ? 'Modifier le paiement' : 'Nouveau paiement', `
    <form id="fin-form">
      <label>Étudiant *<select name="etudiant_id" required>
        ${etus.map(e => `<option ${p.etudiant_id == e.id ? 'selected' : ''} value="${e.id}">${esc(e.matricule)} — ${esc(e.nom)} ${esc(e.prenom)}</option>`).join('')}
      </select></label>
      <div class="form-row">
        <label>Année<input name="annee" value="${esc(p.annee || new Date().getFullYear())}"></label>
        <label>Montant total *<input type="number" min="0" name="montant_total" required value="${p.montant_total ?? ''}"></label>
        <label>Montant payé<input type="number" min="0" name="montant_paye" value="${p.montant_paye ?? 0}"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#fin-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('paiementSave', { ...Object.fromEntries(new FormData(ev.target)), id: p.id || null }, 'Paiement enregistré');
    closeModal();
    RENDER.finances($('#content'));
  };
}

/* ---------- Mes frais (étudiant) ---------- */
RENDER.mesFrais = async (el) => {
  const rows = await call('mesFrais', { etudiantId: user.etudiant_id });
  el.innerHTML = `<div class="card"><table>
    <thead><tr><th>Année</th><th>Total</th><th>Payé</th><th>Reste</th><th>Statut</th></tr></thead>
    <tbody>${rows.map(p => `<tr><td>${esc(p.annee)}</td><td>${fmtMoney(p.montant_total)}</td>
      <td>${fmtMoney(p.montant_paye)}</td><td>${fmtMoney(p.montant_total - p.montant_paye)}</td>
      <td>${p.montant_total - p.montant_paye <= 0 ? '<span class="badge badge-success">Soldé</span>' : '<span class="badge badge-danger">Impayé</span>'}</td></tr>`).join('')}</tbody></table></div>`;
};

/* ---------- Bibliothèque (admin) ---------- */
RENDER.biblio = async (el) => {
  const [livres, emprunts] = await Promise.all([call('livres'), call('emprunts')]);
  el.innerHTML = `
    <div class="toolbar">
      <h3 style="flex:1">📚 Livres</h3>
      <button class="btn btn-primary" id="liv-add">+ Nouveau livre</button>
    </div>
    <div class="card"><table>
      <thead><tr><th>Code</th><th>Titre</th><th>Auteur</th><th>Année</th><th>Disponibles</th><th></th></tr></thead>
      <tbody>${livres.map(l => `<tr><td>${esc(l.code)}</td><td>${esc(l.titre)}</td><td>${esc(l.auteur || '')}</td><td>${l.annee || ''}</td>
        <td>${l.disponible} / ${l.exemplaires}</td>
        <td><div class="table-actions">
          <button class="btn btn-sm btn-primary" data-empr="${l.id}" ${l.disponible < 1 ? 'disabled' : ''}>📖 Emprunter</button>
          <button class="btn btn-sm" data-edit="${l.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${l.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin:10px 0">📖 Emprunts</h3>
    <div class="card"><table>
      <thead><tr><th>Livre</th><th>Étudiant</th><th>Emprunt</th><th>Retour prévu</th><th>Statut</th><th></th></tr></thead>
      <tbody>${emprunts.map(e => `<tr><td>${esc(e.livre_code)} — ${esc(e.titre)}</td>
        <td>${esc(e.matricule)} ${esc(e.nom)}</td><td>${esc(e.date_emprunt)}</td><td>${esc(e.date_retour_prevue)}</td>
        <td>${e.date_retour_reel
          ? `<span class="badge badge-muted">Rendu (${esc(e.date_retour_reel)})</span>`
          : e.en_retard ? '<span class="badge badge-danger">En retard</span>' : '<span class="badge badge-success">En cours</span>'}</td>
        <td><div class="table-actions">
          ${!e.date_retour_reel ? `<button class="btn btn-sm btn-success" data-ret="${e.id}">Retour</button>` : ''}
          <button class="btn btn-sm btn-danger" data-dele="${e.id}">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  $('#liv-add').onclick = () => livreForm();
  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => livreForm(livres.find(r => r.id == b.dataset.edit)));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce livre ?')) return;
    await call('livreDelete', { id: +b.dataset.del }, 'Livre supprimé');
    RENDER.biblio(el);
  });
  el.querySelectorAll('[data-empr]').forEach(b => b.onclick = () => empruntForm(+b.dataset.empr));
  el.querySelectorAll('[data-ret]').forEach(b => b.onclick = async () => {
    await call('empruntRetour', { id: +b.dataset.ret }, 'Retour enregistré');
    RENDER.biblio(el);
  });
  el.querySelectorAll('[data-dele]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer cet emprunt ?')) return;
    await call('empruntDelete', { id: +b.dataset.dele }, 'Emprunt supprimé');
    RENDER.biblio(el);
  });
};

function livreForm(l = {}) {
  openModal(l.id ? 'Modifier le livre' : 'Nouveau livre', `
    <form id="liv-form">
      <div class="form-row">
        <label>Code *<input name="code" required value="${esc(l.code || '')}" placeholder="L004"></label>
        <label>Année<input type="number" name="annee" value="${l.annee || ''}"></label>
      </div>
      <label>Titre *<input name="titre" required value="${esc(l.titre || '')}"></label>
      <div class="form-row">
        <label>Auteur<input name="auteur" value="${esc(l.auteur || '')}"></label>
        <label>Exemplaires<input type="number" min="1" name="exemplaires" value="${l.exemplaires || 1}"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Enregistrer</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#liv-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('livreSave', { ...Object.fromEntries(new FormData(ev.target)), id: l.id || null }, 'Livre enregistré');
    closeModal();
    RENDER.biblio($('#content'));
  };
}

async function empruntForm(livreId) {
  const etus = await call('etudiantsAll');
  openModal('Nouvel emprunt', `
    <form id="emp-form">
      <label>Étudiant *<select name="etudiant_id" required>
        ${etus.map(e => `<option value="${e.id}">${esc(e.matricule)} — ${esc(e.nom)} ${esc(e.prenom)}</option>`).join('')}
      </select></label>
      <div class="form-row">
        <label>Durée (jours)<input type="number" name="jours" value="14" min="1"></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Emprunter</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#emp-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('empruntAdd', { livre_id: livreId, ...Object.fromEntries(new FormData(ev.target)) }, 'Emprunt enregistré');
    closeModal();
    RENDER.biblio($('#content'));
  };
}

/* ---------- Mes emprunts (étudiant) ---------- */
RENDER.mesEmprunts = async (el) => {
  const rows = await call('mesEmprunts', { etudiantId: user.etudiant_id });
  el.innerHTML = `<div class="card"><table>
    <thead><tr><th>Code</th><th>Titre</th><th>Emprunté le</th><th>Retour prévu</th><th>Statut</th></tr></thead>
    <tbody>${rows.map(e => `<tr><td>${esc(e.livre_code)}</td><td>${esc(e.titre)}</td><td>${esc(e.date_emprunt)}</td>
      <td>${esc(e.date_retour_prevue)}</td>
      <td>${e.date_retour_reel ? `<span class="badge badge-muted">Rendu</span>`
        : e.en_retard ? '<span class="badge badge-danger">En retard</span>' : '<span class="badge badge-success">En cours</span>'}</td></tr>`).join('')}</tbody></table></div>`;
};

/* ---------- Absences & présences ---------- */
RENDER.absences = async (el) => {
  const cours = await call('cours');
  el.innerHTML = `
    <div class="toolbar">
      <select id="abs-cours"><option value="">— Choisir un cours —</option>
        ${cours.map(c => `<option value="${c.id}" ${el.dataset.cours == c.id ? 'selected' : ''}>${esc(c.code)} — ${esc(c.nom)}</option>`).join('')}
      </select>
      <input type="date" id="abs-date" value="${el.dataset.date || new Date().toISOString().slice(0, 10)}">
    </div>
    <div id="abs-zone"></div>`;
  $('#abs-cours').onchange = () => { el.dataset.cours = $('#abs-cours').value; renderPointageZone(el); };
  $('#abs-date').onchange = () => { el.dataset.date = $('#abs-date').value; renderPointageZone(el); };
  if (el.dataset.cours) renderPointageZone(el);
};

async function renderPointageZone(el, zoneSel = '#abs-zone') {
  const zone = $(zoneSel);
  if (!zone) return;
  const coursId = el.dataset.cours;
  const date = el.dataset.date || new Date().toISOString().slice(0, 10);
  if (!coursId) { zone.innerHTML = '<p style="color:var(--muted)">Choisis un cours pour pointer les présences.</p>'; return; }
  const rows = await call('absenceJour', { coursId: +coursId, date });
  zone.innerHTML = `
    <div class="card"><table>
      <thead><tr><th>Matricule</th><th>Étudiant</th><th>Statut du jour</th><th>Justifié</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${esc(r.matricule)}</td><td>${esc(r.nom)} ${esc(r.prenom)}</td>
        <td><div class="abs-btns">
          ${['Present', 'Absent', 'Retard'].map(t => `<button class="abs-btn ${r.type === t ? 'active-' + t.toLowerCase() : ''}" data-e="${r.id}" data-t="${t}">${t === 'Present' ? 'Présent' : t}</button>`).join('')}
        </div></td>
        <td>${r.type !== 'Present' ? `<input type="checkbox" class="abs-just" data-e="${r.id}" ${r.justifiee ? 'checked' : ''}>` : '—'}</td>
      </tr>`).join('')}</tbody></table>
      <p style="font-size:12px;color:var(--muted);margin-top:8px">
        ${rows.filter(r => r.type === 'Absent').length} absent(s) · ${rows.filter(r => r.type === 'Retard').length} retard(s) · ${rows.length} inscrit(s)
      </p></div>`;
  zone.querySelectorAll('.abs-btn').forEach(b => b.onclick = async () => {
    await call('absenceSave', { etudiantId: +b.dataset.e, coursId: +coursId, date, type: b.dataset.t, justifiee: false }, 'Enregistré');
    renderPointageZone(el, zoneSel);
  });
  zone.querySelectorAll('.abs-just').forEach(c => c.onchange = async () => {
    const row = rows.find(r => r.id === +c.dataset.e);
    await call('absenceSave', { etudiantId: +c.dataset.e, coursId: +coursId, date, type: row.type, justifiee: c.checked }, 'Enregistré');
  });
}

// page de pointage pour un professeur (depuis « Mes cours »)
async function pointagePage(coursId) {
  const el = $('#content');
  el.dataset.cours = coursId;
  el.dataset.date = el.dataset.date || new Date().toISOString().slice(0, 10);
  el.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="pres-back">← Retour aux cours</button>
      <input type="date" id="pres-date" value="${el.dataset.date}">
    </div>
    <div id="abs-zone"></div>`;
  $('#pres-back').onclick = () => { $('#page-title').textContent = 'Mes cours'; RENDER.mesCours(el); };
  $('#pres-date').onchange = () => { el.dataset.date = $('#pres-date').value; renderPointageZone(el); };
  renderPointageZone(el);
}

/* ---------- Mes absences (étudiant) ---------- */
RENDER.mesAbsences = async (el) => {
  const r = await call('absencesEtudiant', { etudiantId: user.etudiant_id });
  el.innerHTML = `
    <div class="stats-grid">
      ${stat('🚫', r.parCours.reduce((a, c) => a + c.nonJustifiees, 0), 'Absences non justifiées')}
      ${stat('📄', r.parCours.reduce((a, c) => a + c.justifiees, 0), 'Absences justifiées')}
      ${stat('⏰', r.parCours.reduce((a, c) => a + c.retards, 0), 'Retards')}
    </div>
    <div class="card"><h3>Détail par cours</h3>
      <table><thead><tr><th>Cours</th><th>Non justifiées</th><th>Justifiées</th><th>Retards</th></tr></thead>
      <tbody>${r.parCours.map(c => `<tr><td>${esc(c.code)} — ${esc(c.cours_nom)}</td><td>${c.nonJustifiees}</td><td>${c.justifiees}</td><td>${c.retards}</td></tr>`).join('')
        || '<tr><td colspan="4" style="color:var(--muted)">Aucune absence enregistrée — continue comme ça ! 🎉</td></tr>'}</tbody></table></div>
    ${r.recentes.length ? `<div class="card"><h3>Historique récent</h3>
      <table><thead><tr><th>Date</th><th>Cours</th><th>Type</th><th>Justifiée</th></tr></thead>
      <tbody>${r.recentes.map(a => `<tr><td>${esc(a.date_abs)}</td><td>${esc(a.code)}</td>
        <td><span class="badge ${a.type === 'Absent' ? 'badge-danger' : 'badge-warning'}">${a.type}</span></td>
        <td>${a.justifiee ? 'Oui' : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
};

/* ---------- Documents officiels ---------- */
async function documentsModal(etudiantId) {
  const [all, s] = await Promise.all([call('etudiants'), call('settingsGet')]);
  const etu = all.find(x => x.id === etudiantId);
  if (!etu) return;
  const uni = s.universite_nom || 'UNIVERSITÉ';
  const annee = s.annee_academique || '';
  const today = new Date().toLocaleDateString('fr-FR');
  const ident = `<b>${esc(etu.nom)} ${esc(etu.prenom)}</b>, matricule <b>${esc(etu.matricule)}</b>${etu.date_naissance ? ', né(e) le ' + esc(etu.date_naissance) : ''}`;
  const docCert = `
    <div class="print-doc">
      <div class="doc-head"><div style="font-size:14px;letter-spacing:1.5px;text-transform:uppercase">${esc(uni)}</div>
        <div class="doc-title">📜 CERTIFICAT DE SCOLARITÉ</div><div>Année académique ${esc(annee)}</div></div>
      <p style="margin:16px 0;font-size:14px">Le Directeur des Études certifie que :</p>
      <p style="font-size:14.5px;line-height:1.8">${ident}, est régulièrement inscrit(e) en <b>Licence ${etu.niveau || 1}</b>
        au sein de la filière <b>${esc(etu.filiere_nom || '—')}</b> pour l'année académique <b>${esc(annee)}</b>.</p>
      <p style="margin-top:16px">La présente certification est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.</p>
      <div class="doc-foot"><span>Fait le ${today}</span><span>Le Directeur des Études</span></div>
    </div>`;
  const docAtt = `
    <div class="print-doc">
      <div class="doc-head"><div style="font-size:14px;letter-spacing:1.5px;text-transform:uppercase">${esc(uni)}</div>
        <div class="doc-title">📄 ATTESTATION D'INSCRIPTION</div><div>Année académique ${esc(annee)}</div></div>
      <p style="margin:16px 0;font-size:14px;line-height:1.8">Il est attesté que ${ident} est inscrit(e) en
        <b>Licence ${etu.niveau || 1}</b> — filière <b>${esc(etu.filiere_nom || '—')}</b> au titre de l'année académique <b>${esc(annee)}</b>.</p>
      <div class="doc-foot"><span>Fait le ${today}</span><span>Le Service de la Scolarité</span></div>
    </div>`;
  const docCarte = `
    <div class="print-doc">
      <div class="doc-head"><div style="font-size:14px;letter-spacing:1.5px;text-transform:uppercase">${esc(uni)}</div>
        <div class="doc-title">🪪 CARTE ÉTUDIANTE</div><div>Année académique ${esc(annee)}</div></div>
      <div style="display:flex;gap:20px;border:2px solid #0f172a;border-radius:12px;padding:18px;max-width:460px;margin:14px auto">
        <div style="font-size:52px">🎓</div>
        <div style="font-size:14px;line-height:1.8">
          <b>${esc(etu.nom)} ${esc(etu.prenom)}</b><br>
          Matricule : <b>${esc(etu.matricule)}</b><br>
          Filière : ${esc(etu.filiere_nom || '—')} · Licence ${etu.niveau || 1}<br>
          Valable jusqu'au 31 août ${esc((annee.split('-')[1] || ''))}
        </div>
      </div>
      <div class="doc-foot"><span>Carte officielle — non cessible</span><span>Signature &amp; cachet</span></div>
    </div>`;
  openModal(`Documents officiels — ${etu.prenom} ${etu.nom}`, `
    <p style="font-size:12.5px;color:var(--muted);margin-bottom:14px">Choisis le document à générer, puis imprime-le ou enregistre-le en PDF :</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-primary" id="doc-cert">📜 Certificat de scolarité</button>
      <button class="btn" id="doc-att">📄 Attestation d'inscription</button>
      <button class="btn" id="doc-carte">🪪 Carte étudiante</button>
      <button type="button" class="btn" id="mf-cancel">Fermer</button>
    </div>`);
  $('#mf-cancel').onclick = closeModal;
  $('#doc-cert').onclick = () => printHtml(docCert);
  $('#doc-att').onclick = () => printHtml(docAtt);
  $('#doc-carte').onclick = () => printHtml(docCarte);
}

/* ---------- Réinscriptions ---------- */
async function reinscriptionForm() {
  const s = await call('settingsGet');
  const parts = String(s.annee_academique || '').split('-').map(Number);
  const next = parts.length === 2 && parts[1]
    ? `${parts[1]}-${parts[1] + 1}`
    : `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  openModal('Réinscriptions — passage à la nouvelle année', `
    <form id="rei-form">
      <div class="form-row">
        <label>Année académique cible *<input name="annee" required value="${next}"></label>
        <label>Frais annuels (FCFA) *<input type="number" min="0" name="montant" required placeholder="500000"></label>
      </div>
      <label style="display:flex;align-items:center;gap:9px;font-weight:400;color:var(--text)">
        <input type="checkbox" name="avancer" style="width:auto;margin:0"> Passer tous les étudiants au niveau supérieur (L1→L2, L2→L3)
      </label>
      <p style="font-size:12px;color:var(--muted)">Crée la ligne de frais de chaque étudiant pour l'année cible (ceux qui l'ont déjà sont ignorés)
      et, si coché, avance le niveau de tous les étudiants.</p>
      <div class="modal-actions">
        <button type="button" class="btn" id="mf-cancel">Annuler</button>
        <button class="btn btn-primary">Lancer les réinscriptions</button>
      </div>
    </form>`);
  $('#mf-cancel').onclick = closeModal;
  $('#rei-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    if (!confirm(`Créer les frais pour l'année ${data.annee}${data.avancer ? ' et passer tous les étudiants au niveau supérieur' : ''} ?`)) return;
    const r = await call('reinscrire', { annee: data.annee, montant: +data.montant, avancerNiveau: !!data.avancer }, null);
    closeModal();
    toast(`✅ ${r.cree} ligne(s) de frais créée(s)${r.promus ? ' · ' + r.promus + ' étudiant(s) promu(s)' : ''}`);
    RENDER.etudiants($('#content'), $('#etu-q') ? $('#etu-q').value : '');
  };
}

/* ---------- Paramètres & Sauvegardes ---------- */
RENDER.parametres = async (el) => {
  const [s, backups] = await Promise.all([call('settingsGet'), call('backupList')]);
  el.innerHTML = `
    <div class="card"><h3>🏛️ Paramètres généraux</h3>
      <form id="set-form" style="max-width:480px">
        <label>Nom de l'université<input name="universite_nom" value="${esc(s.universite_nom || '')}" placeholder="UNIVERSITÉ DE …"></label>
        <label>Année académique<input name="annee_academique" value="${esc(s.annee_academique || '')}" placeholder="2026-2027"></label>
        <button class="btn btn-primary">Enregistrer</button>
      </form>
      <p style="font-size:12px;color:var(--muted);margin-top:8px">Ces informations apparaissent sur les bulletins, reçus et documents officiels.</p>
    </div>
    <div class="card"><h3>💾 Sauvegardes</h3>
      <div class="toolbar" style="margin-bottom:10px">
        <button class="btn btn-primary" id="bk-create">+ Créer une sauvegarde maintenant</button>
        <span style="font-size:12px;color:var(--muted)">Une sauvegarde automatique est aussi créée au premier démarrage de chaque jour.</span>
      </div>
      <table><thead><tr><th>Fichier</th><th>Date</th><th>Taille</th><th></th></tr></thead>
      <tbody>${backups.map(b => `<tr>
        <td>${esc(b.name)}</td><td>${esc(b.date.slice(0, 16).replace('T', ' '))}</td><td>${Math.round(b.taille / 1024)} Ko</td>
        <td><button class="btn btn-sm btn-danger" data-restore="${esc(b.name)}">Restaurer</button></td>
      </tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">Aucune sauvegarde pour l\u2019instant.</td></tr>'}</tbody></table>
      <p style="font-size:12px;color:var(--muted);margin-top:8px">⚠️ Restaurer remplace TOUTES les données actuelles par celles de la sauvegarde, puis l'application redémarre.</p>
    </div>`;
  $('#set-form').onsubmit = async (ev) => {
    ev.preventDefault();
    await call('settingsSet', Object.fromEntries(new FormData(ev.target)), 'Paramètres enregistrés');
  };
  $('#bk-create').onclick = async () => {
    const name = await call('backupCreate', {}, 'Sauvegarde créée');
    RENDER.parametres(el);
  };
  el.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
    if (!confirm(`⚠️ Remplacer TOUTES les données actuelles par « ${b.dataset.restore} » ?`)) return;
    if (!confirm('Dernière confirmation : cette action est irréversible. Continuer ?')) return;
    await call('backupRestore', { name: b.dataset.restore });
  });
};

/* ================= utils ================= */
function debounce(fn, ms = 350) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
