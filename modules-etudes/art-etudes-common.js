/* ============================================================
   ZNK Beti Fondation — Art Études (logique commune par niveau)
   Chargé par ArtEtudes-maternelle.html / Primaire / College / lycee.
   Chaque page définit window.ART_ETUDES_LEVEL avant ce script.
   ============================================================ */

(function () {
  const LEVEL = window.ART_ETUDES_LEVEL || 'primaire';
  const LEVEL_LABELS = {
    maternelle: 'Maternelle',
    primaire: 'Primaire',
    college: 'Collège',
    lycee: 'Lycée'
  };

  // ===== Données de niveau (venant de inscription.html via znk_account) =====
  const NIVEAU_INFO = {
    ps: { label: 'Petite Section (PS)', level: 'maternelle' },
    ms: { label: 'Moyenne Section (MS)', level: 'maternelle' },
    gs: { label: 'Grande Section (GS)', level: 'maternelle' },
    cp: { label: 'CP', level: 'primaire' },
    ce1: { label: 'CE1', level: 'primaire' },
    ce2: { label: 'CE2', level: 'primaire' },
    cm1: { label: 'CM1', level: 'primaire' },
    cm2: { label: 'CM2', level: 'primaire' },
    '6eme': { label: '6ème', level: 'college' },
    '5eme': { label: '5ème', level: 'college' },
    '4eme': { label: '4ème', level: 'college' },
    '3eme': { label: '3ème', level: 'college' },
    seconde: { label: 'Seconde', level: 'lycee' },
    premiere: { label: 'Première', level: 'lycee' },
    terminale: { label: 'Terminale', level: 'lycee' },
    bts1: { label: 'BTS 1ère année', level: 'lycee' },
    bts2: { label: 'BTS 2ème année', level: 'lycee' },
    licence1: { label: 'Licence 1 (L1)', level: 'lycee' },
    licence2: { label: 'Licence 2 (L2)', level: 'lycee' },
    licence3: { label: 'Licence 3 (L3)', level: 'lycee' },
    master1: { label: 'Master 1 (M1)', level: 'lycee' },
    master2: { label: 'Master 2 (M2)', level: 'lycee' },
    doctorat: { label: 'Doctorat', level: 'lycee' },
    formation: { label: 'Formation professionnelle', level: 'lycee' },
    autre: { label: 'Niveau non précisé', level: 'lycee' }
  };
  const ROLE_LABELS = { ecole: 'Études', visitor: 'Visiteur' };

  let currentActiveLesson = null;
  let currentStudentId = 'invite';
  let avatarStorageKey = 'znk_avatar_photo';

  let quizTimerRunning = false;
  let quizStartTime = null;
  let quizTimerInterval = null;
  let quizElapsedSeconds = 0;
  let quizAnswersDraft = {};

  // ============================================================
  // Utilitaires compte / date
  // ============================================================
  function formatFrenchDate(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '---';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function getStoredAccount() {
    try {
      const raw = localStorage.getItem('znk_account');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('⚠️ Compte znk_account illisible dans localStorage:', err);
      return null;
    }
  }

  function loadAccountData() {
    const account = getStoredAccount();
    if (!account) {
      console.log('ℹ️ Aucun compte trouvé (znk_account) — affichage des données de démonstration');
      return;
    }
    currentStudentId = account.idZNK || currentStudentId;

    const fullName = `${account.prenom || ''} ${account.nom || ''}`.trim();
    if (fullName) document.getElementById('studentNameDisplay').textContent = fullName;

    const niveauInfo = account.niveau ? NIVEAU_INFO[account.niveau] : null;
    if (niveauInfo) {
      document.getElementById('studentClassDisplay').textContent = niveauInfo.label;
      document.getElementById('studentSchoolDisplay').textContent = 'École ZNKids';
    } else if (account.role === 'visitor') {
      document.getElementById('studentClassDisplay').textContent = 'Compte Visiteur';
      document.getElementById('studentSchoolDisplay').textContent = 'Accès découverte ZNK';
    }

    document.getElementById('regUserId').textContent = account.idZNK || '---';
    document.getElementById('regEmail').textContent = account.email || '---';
    document.getElementById('regDate').textContent = account.createdAt ? formatFrenchDate(account.createdAt) : '---';
    document.getElementById('regType').textContent = ROLE_LABELS[account.role] || account.role || '---';
    document.getElementById('regStatut').textContent = 'Actif';

    if (account.idZNK) {
      avatarStorageKey = `znk_avatar_photo_${account.idZNK}`;
      const savedPhoto = localStorage.getItem(avatarStorageKey);
      if (savedPhoto) applyAvatarPhoto(savedPhoto);
    }
  }

  function handleAvatarUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('⚠️ Merci de choisir un fichier image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      applyAvatarPhoto(e.target.result);
      try { localStorage.setItem(avatarStorageKey, e.target.result); } catch (err) { console.warn(err); }
    };
    reader.readAsDataURL(file);
  }

  function applyAvatarPhoto(dataUrl) {
    const avatarDisplay = document.getElementById('avatarDisplay');
    const avatarEmoji = document.getElementById('avatarEmoji');
    avatarDisplay.style.backgroundImage = `url('${dataUrl}')`;
    if (avatarEmoji) avatarEmoji.style.display = 'none';
  }

  function toggleRegistrationInfo() {
    const info = document.getElementById('registrationInfo');
    const btn = document.getElementById('idToggleBtn');
    const expanded = info.classList.toggle('expanded');
    btn.textContent = expanded ? '🆔 Masquer mes infos de compte ▴' : '🆔 Voir mes infos de compte ▾';
  }

  function toggleCard(headerEl) {
    const container = headerEl.parentElement;
    container.classList.toggle('collapsed');
  }

  // ============================================================
  // Progression par leçon (quiz + dessin + validation finale)
  // Clé : znk_lesson_progress_<niveau>_<idEleve>
  // ============================================================
  function progressStorageKey() {
    return `znk_lesson_progress_${LEVEL}_${currentStudentId}`;
  }

  function getAllProgress() {
    try {
      return JSON.parse(localStorage.getItem(progressStorageKey()) || '{}');
    } catch (e) { return {}; }
  }

  function getLessonProgress(lessonId) {
    const all = getAllProgress();
    return all[lessonId] || { quiz: null, drawing: null, finalized: false };
  }

  function saveLessonProgress(lessonId, progress) {
    const all = getAllProgress();
    all[lessonId] = progress;
    localStorage.setItem(progressStorageKey(), JSON.stringify(all));
  }

  // ============================================================
  // Fusion des leçons (seed + créées via terminal-lecons.html)
  // ============================================================
  function enrichManifestLesson(lesson) {
    const cat = window.ZNK_ETUDES_MANIFEST ? ZNK_ETUDES_MANIFEST.categoryById(lesson.categoryId) : null;
    const autoLevel = (cat && window.ZNK_ETUDES_MANIFEST) ? ZNK_ETUDES_MANIFEST.schoolLevelFromTargetAge(cat.targetAge) : 'tous';
    const schoolLevel = lesson.targetLevel || autoLevel;
    return Object.assign({}, lesson, {
      categoryInfo: cat,
      schoolLevel,
      isPublished: lesson.status === 'publie'
    });
  }

  function getAllLessonsMerged(filters) {
    filters = filters || {};
    const seed = window.ZNK_ETUDES_MANIFEST ? ZNK_ETUDES_MANIFEST.getAllLessons(filters) : [];
    let created = (window.ZNKManifest && ZNKManifest.lessons) ? ZNKManifest.lessons.list().map(enrichManifestLesson) : [];
    if (filters.published) created = created.filter(l => l.isPublished);
    if (filters.level && filters.level !== 'tous') {
      created = created.filter(l => l.schoolLevel === 'tous' || l.schoolLevel === filters.level);
    }
    return seed.concat(created).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function getLessonMerged(id) {
    const seedLesson = window.ZNK_ETUDES_MANIFEST ? ZNK_ETUDES_MANIFEST.getLesson(id) : null;
    if (seedLesson) return seedLesson;
    if (window.ZNKManifest && ZNKManifest.lessons) {
      const created = ZNKManifest.lessons.get(id);
      if (created) return enrichManifestLesson(created);
    }
    return null;
  }

  function levelLessons() {
    return getAllLessonsMerged({ published: true, level: LEVEL });
  }

  // Le quiz lié à une leçon : soit lesson.quizId le désigne explicitement,
  // soit un quiz publié référence lessonId === lesson.id.
  function findQuizForLesson(lesson) {
    if (!window.ZNKManifest || !ZNKManifest.quiz || !lesson) return null;
    const quizzes = ZNKManifest.quiz.list().filter(q => q.status === 'publie');
    if (lesson.quizId) {
      const byId = quizzes.find(q => q.id === lesson.quizId);
      if (byId) return byId;
    }
    return quizzes.find(q => q.lessonId === lesson.id) || null;
  }

  // Le visuel de la leçon : premier matériel de type "image".
  function findLessonVisual(lesson) {
    if (!lesson) return null;
    const materials = lesson.materials || [];
    return materials.find(m => m.type === 'image') || null;
  }

  // ============================================================
  // Colonne de droite : leçons de la semaine
  // ============================================================
  function renderLessonsSideList() {
    const container = document.getElementById('lessonsList');
    if (!container) return;
    if (!window.ZNK_ETUDES_MANIFEST) {
      container.innerHTML = `
        <div class="empty-lessons">
          <div class="empty-lessons-icon">⚠️</div>
          <p style="color: #ff6b6b;">Manifest non chargé</p>
          <p style="font-size: 0.85em; margin-top: 10px; opacity: 0.7;">Le fichier znk-etudes-manifest.js est requis</p>
        </div>`;
      return;
    }

    const lessons = levelLessons();
    if (lessons.length === 0) {
      container.innerHTML = `
        <div class="empty-lessons">
          <div class="empty-lessons-icon">📖</div>
          <p>Aucune leçon disponible cette semaine</p>
        </div>`;
      return;
    }
    container.innerHTML = lessons.map(lesson => createLessonCard(lesson)).join('');
  }

  function createLessonCard(lesson) {
    const cat = lesson.categoryInfo || { icon: '📚', name: lesson.categoryId };
    const progress = getLessonProgress(lesson.id);
    const completed = progress.finalized;
    const hasVideo = (lesson.materials || []).some(m => m.type === 'video');
    const hasAudio = (lesson.materials || []).some(m => m.type === 'audio');
    const hasDoc = (lesson.materials || []).some(m => m.type === 'document');

    return `
      <div class="lesson-card ${currentActiveLesson === lesson.id ? 'active' : ''} ${completed ? 'completed' : ''}"
           onclick="ArtEtudes.openLesson('${lesson.id}')"
           data-lesson-id="${lesson.id}">
        <div class="lesson-card-header">
          <span class="lesson-card-icon">${completed ? '✅' : cat.icon}</span>
          <span class="lesson-card-title">${lesson.title}</span>
        </div>
        ${lesson.description ? `<div class="lesson-card-description">${lesson.description}</div>` : ''}
        <div class="lesson-card-meta">
          <span class="lesson-card-badge">${cat.icon} ${cat.name || ''}</span>
          <span class="lesson-card-badge">⏱️ ${lesson.duration || ''}</span>
          ${hasVideo ? `<span class="lesson-card-badge">🎬 Vidéo</span>` : ''}
          ${hasAudio ? `<span class="lesson-card-badge">🔊 Audio</span>` : ''}
          ${hasDoc ? `<span class="lesson-card-badge">📄 Fiche</span>` : ''}
        </div>
        <span class="lesson-card-status ${completed ? 'completed' : 'published'}">
          ${completed ? `✅ Terminée${typeof progress.finalScore === 'number' ? ' — ' + progress.finalScore + '/20' : ''}` : '📘 À faire'}
        </span>
      </div>`;
  }

  // ============================================================
  // Leçon en cours
  // ============================================================
  function openLesson(lessonId) {
    const lesson = getLessonMerged(lessonId);
    if (!lesson) { alert('❌ Leçon introuvable'); return; }

    currentActiveLesson = lessonId;
    document.querySelectorAll('.lesson-card').forEach(card => card.classList.remove('active'));
    const activeCard = document.querySelector(`[data-lesson-id="${lessonId}"]`);
    if (activeCard) activeCard.classList.add('active');

    document.getElementById('lessonContentDisplay').innerHTML = generateLessonHTML(lesson);
    renderQuizForActiveLesson();
    renderArtClasseForActiveLesson();
    renderValidationBlock();

    document.querySelector('.video-lesson').scrollIntoView({ behavior: 'smooth', block: 'start' });
    console.log('📖 Leçon ouverte:', lesson.title);
  }

  function generateLessonHTML(lesson) {
    const cat = lesson.categoryInfo || { icon: '📚', name: lesson.categoryId };
    let html = `<h3>${cat.icon} ${lesson.title}</h3>`;
    if (lesson.description) {
      html += `<p style="color: rgba(255,255,255,0.8); margin: 10px 0; line-height: 1.5;">${lesson.description}</p>`;
    }
    html += `
      <div class="lesson-meta">
        <span class="lesson-meta-item">${cat.icon} ${cat.name || ''}</span>
        <span class="lesson-meta-item">⏱️ ${lesson.duration || ''}</span>
        ${lesson.instructor ? `<span class="lesson-meta-item">🧑‍🏫 ${lesson.instructor}</span>` : ''}
      </div>`;
    if (lesson.content) {
      html += `<div style="margin-top: 20px; line-height: 1.7; white-space: pre-wrap;">${lesson.content}</div>`;
    }
    const materials = lesson.materials || [];
    if (materials.length > 0) {
      html += `<div class="media-display">`;
      materials.forEach(file => {
        if (file.type === 'audio') {
          html += `<div style="margin: 20px 0;">
            <p style="font-size: 0.9em; color: rgba(255,255,255,0.7); margin-bottom: 8px;">🎵 ${file.title || file.filename}</p>
            <audio controls style="width: 100%; border-radius: 10px;"><source src="${file.url}" type="audio/mpeg"></audio>
          </div>`;
        } else if (file.type === 'document') {
          html += `<div style="margin: 20px 0;">
            <a href="${file.url}" target="_blank" style="display:inline-flex; align-items:center; gap:8px; color:#fff; text-decoration:none; background: rgba(255,255,255,0.1); padding: 10px 14px; border-radius: 10px;">📄 ${file.title || file.filename}</a>
          </div>`;
        } else if (file.type === 'image') {
          html += `<div style="margin: 20px 0;">
            <p style="font-size: 0.9em; color: rgba(255,255,255,0.7); margin-bottom: 8px;">🖼️ ${file.title || file.filename}</p>
            <img src="${file.url}" alt="${file.title || ''}" style="width: 100%; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
          </div>`;
        } else if (file.type === 'video') {
          html += `<div style="margin: 20px 0;">
            <p style="font-size: 0.9em; color: rgba(255,255,255,0.7); margin-bottom: 8px;">🎬 ${file.title || file.filename}</p>
            <video controls style="width: 100%; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);"><source src="${file.url}"></video>
          </div>`;
        }
      });
      html += `</div>`;
    }
    if (lesson.tags && lesson.tags.length > 0) {
      html += `<div style="margin-top: 20px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 10px; font-size: 0.85em;">🏷️ ${lesson.tags.join(', ')}</div>`;
    }
    return html;
  }

  // ============================================================
  // Zone interrogation (quiz de la leçon active)
  // ============================================================
  function activeLessonAndProgress() {
    if (!currentActiveLesson) return { lesson: null, progress: null };
    const lesson = getLessonMerged(currentActiveLesson);
    return { lesson, progress: getLessonProgress(currentActiveLesson) };
  }

  function renderQuizForActiveLesson() {
    const zone = document.getElementById('quizAnswerZone');
    if (!zone) return;
    stopQuizTimer();
    quizElapsedSeconds = 0;
    quizAnswersDraft = {};

    const { lesson, progress } = activeLessonAndProgress();
    if (!lesson) {
      zone.innerHTML = `<div class="quiz-answer-zone-empty">🧪 Sélectionne une leçon pour voir son interrogation.</div>`;
      return;
    }

    const quiz = findQuizForLesson(lesson);
    if (!quiz) {
      zone.innerHTML = `<div class="quiz-answer-zone-empty">ℹ️ Aucune interrogation n'est associée à cette leçon.</div>`;
      return;
    }

    if (progress.finalized || (progress.quiz && progress.quiz.submitted)) {
      const q = progress.quiz;
      zone.innerHTML = `
        <div class="quiz-answer-title">🧪 ${quiz.title}</div>
        <div class="quiz-locked-banner">✅ Interrogation déjà rendue${q ? ` — ${q.score}/20` : ''}. Non modifiable.</div>
        <div id="quizQuestionsContainer" class="quiz-locked">${renderQuizQuestionsHTML(quiz, q ? q.answers : {})}</div>`;
      return;
    }

    zone.innerHTML = `
      <div class="quiz-answer-title">🧪 ${quiz.title}</div>
      <div class="quiz-timer-row">
        <button class="btn btn-success" onclick="ArtEtudes.startQuizTimer()" id="quizStartBtn">▶️ Démarrer</button>
        <button class="btn btn-danger" onclick="ArtEtudes.stopQuizTimer()" id="quizStopBtn" disabled>⏸️ Arrêter</button>
        <div class="timer-display" id="quizTimerDisplay">Temps: 0m 0s</div>
      </div>
      <div id="quizQuestionsContainer">${renderQuizQuestionsHTML(quiz, {})}</div>
      <div class="report-controls" style="margin-top:10px;">
        <button class="btn btn-primary" onclick="ArtEtudes.submitQuizAnswers()" id="quizSubmitBtn">📤 Envoyer mes réponses</button>
      </div>`;
    zone.dataset.quizId = quiz.id;
    startQuizTimer();
  }

  function renderQuizQuestionsHTML(quiz, previousAnswers) {
    return (quiz.questions || []).map((q, idx) => {
      const prev = previousAnswers ? previousAnswers[idx] : undefined;
      if (q.type === 'qcm' || q.options) {
        const options = (q.options || []).map((opt, oIdx) => `
          <label class="quiz-option-label">
            <input type="radio" name="quizQ${idx}" value="${oIdx}" ${String(prev) === String(oIdx) ? 'checked' : ''}
                   onchange="ArtEtudes.setQuizAnswer(${idx}, '${oIdx}')">
            <span>${opt}</span>
          </label>`).join('');
        return `
          <div class="quiz-question-block">
            <div class="quiz-question-text">${idx + 1}. ${q.text || q.question || ''}</div>
            <div class="quiz-options">${options}</div>
          </div>`;
      }
      return `
        <div class="quiz-question-block">
          <div class="quiz-question-text">${idx + 1}. ${q.text || q.question || ''}</div>
          <textarea class="quiz-text-answer" placeholder="Écris ta réponse ici..."
                    oninput="ArtEtudes.setQuizAnswer(${idx}, this.value)">${prev || ''}</textarea>
        </div>`;
    }).join('') || '<p style="opacity:0.7;">Aucune question dans cette interrogation.</p>';
  }

  function setQuizAnswer(idx, value) { quizAnswersDraft[idx] = value; }

  function startQuizTimer() {
    if (quizTimerRunning) return;
    quizTimerRunning = true;
    quizStartTime = Date.now() - quizElapsedSeconds * 1000;
    const startBtn = document.getElementById('quizStartBtn');
    const stopBtn = document.getElementById('quizStopBtn');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    quizTimerInterval = setInterval(updateQuizTimer, 1000);
  }

  function stopQuizTimer() {
    if (!quizTimerRunning) return;
    quizTimerRunning = false;
    const startBtn = document.getElementById('quizStartBtn');
    const stopBtn = document.getElementById('quizStopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    clearInterval(quizTimerInterval);
  }

  function updateQuizTimer() {
    if (!quizTimerRunning || !quizStartTime) return;
    quizElapsedSeconds = Math.floor((Date.now() - quizStartTime) / 1000);
    const minutes = Math.floor(quizElapsedSeconds / 60);
    const seconds = quizElapsedSeconds % 60;
    const el = document.getElementById('quizTimerDisplay');
    if (el) el.textContent = `Temps: ${minutes}m ${seconds}s`;
  }

  function submitQuizAnswers() {
    const { lesson, progress } = activeLessonAndProgress();
    if (!lesson) return;
    const quiz = findQuizForLesson(lesson);
    if (!quiz) return;

    const totalQuestions = (quiz.questions || []).length;
    const answered = Object.keys(quizAnswersDraft).filter(k => quizAnswersDraft[k] !== '' && quizAnswersDraft[k] !== undefined).length;
    if (totalQuestions > 0 && answered === 0) {
      alert("⚠️ Réponds à au moins une question avant d'envoyer !");
      return;
    }
    stopQuizTimer();

    // Score approximatif basé sur le taux de réponse (à affiner avec la correction du professeur)
    const score = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 20) : 20;

    progress.quiz = {
      quizId: quiz.id,
      answers: Object.assign({}, quizAnswersDraft),
      answeredCount: answered,
      totalQuestions,
      score,
      submitted: true,
      submittedAt: new Date().toISOString()
    };
    saveLessonProgress(lesson.id, progress);

    renderQuizForActiveLesson();
    renderValidationBlock();
  }

  // ============================================================
  // Art-Classe (ouvrir le visuel de la leçon dans dessin.html)
  // ============================================================
  function renderArtClasseForActiveLesson() {
    const box = document.getElementById('artClasseBody');
    if (!box) return;
    const { lesson, progress } = activeLessonAndProgress();
    if (!lesson) {
      box.innerHTML = `<div class="art-classe-none">🎨 Sélectionne une leçon pour accéder à son atelier de coloriage.</div>`;
      return;
    }
    const visual = findLessonVisual(lesson);
    if (!visual) {
      box.innerHTML = `<div class="art-classe-none">🚫 Pas de visuel pour cette leçon.</div>`;
      return;
    }

    const locked = !!progress.finalized;
    const drawing = progress.drawing;
    box.innerHTML = `
      <div class="art-classe-thumb"><img src="${drawing ? drawing.dataUrl : visual.url}" alt="Visuel de la leçon"></div>
      <div class="art-classe-info">
        <div class="art-classe-status">
          ${drawing ? '✅ Dessin enregistré' : '📎 Visuel disponible — clique pour colorier'}
          ${locked ? ' · 🔒 Leçon validée, non modifiable' : ''}
        </div>
        <button class="btn btn-secondary" ${locked ? 'disabled' : ''} onclick="ArtEtudes.openArtClasse()">
          🖌️ ${drawing ? 'Reprendre le dessin' : "Ouvrir l'atelier de coloriage"}
        </button>
      </div>`;
  }

  function openArtClasse() {
    const { lesson } = activeLessonAndProgress();
    if (!lesson) return;
    const visual = findLessonVisual(lesson);
    if (!visual) {
      alert('🚫 Pas de visuel pour cette leçon.');
      return;
    }
    const url = `dessin-kids.html?img=${encodeURIComponent(visual.url)}&lessonId=${encodeURIComponent(lesson.id)}`;
    window.open(url, '_blank');
  }

  function handleDrawingSaved(lessonId, dataUrl) {
    if (!lessonId || !dataUrl) return;
    const progress = getLessonProgress(lessonId);
    if (progress.finalized) return; // leçon déjà verrouillée
    progress.drawing = { dataUrl, savedAt: new Date().toISOString() };
    saveLessonProgress(lessonId, progress);
    if (currentActiveLesson === lessonId) {
      renderArtClasseForActiveLesson();
      renderValidationBlock();
    }
  }

  function checkDrawingResult(lessonId) {
    try {
      const raw = localStorage.getItem('znk_drawing_result_' + lessonId);
      if (!raw) return;
      const val = JSON.parse(raw);
      if (val && val.dataUrl) handleDrawingSaved(lessonId, val.dataUrl);
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'znk-drawing-saved' && e.data.lessonId) {
      handleDrawingSaved(e.data.lessonId, e.data.dataUrl);
    }
  });
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf('znk_drawing_result_') === 0) {
      const lessonId = e.key.replace('znk_drawing_result_', '');
      try {
        const val = JSON.parse(e.newValue || 'null');
        if (val) handleDrawingSaved(lessonId, val.dataUrl);
      } catch (err) { /* ignore */ }
    }
  });
  window.addEventListener('focus', function () {
    if (currentActiveLesson) checkDrawingResult(currentActiveLesson);
  });

  // ============================================================
  // Validation finale de la leçon
  // ============================================================
  function renderValidationBlock() {
    const box = document.getElementById('lessonValidateBox');
    if (!box) return;
    const { lesson, progress } = activeLessonAndProgress();
    if (!lesson) { box.innerHTML = ''; return; }

    if (progress.finalized) {
      box.innerHTML = `
        <div class="final-result-box">
          <div>🎉 Leçon validée !</div>
          ${typeof progress.finalScore === 'number' ? `<div class="note-big">${progress.finalScore}/20</div>` : '<div class="note-big">✅</div>'}
          ${progress.drawing ? `<img src="${progress.drawing.dataUrl}" alt="Dessin final">` : ''}
          <div class="final-result-locked-msg">Résultat envoyé à ton professeur. Cette leçon ne peut pas être refaite.</div>
        </div>`;
      return;
    }

    const quiz = findQuizForLesson(lesson);
    const visual = findLessonVisual(lesson);
    const quizOk = !quiz || (progress.quiz && progress.quiz.submitted);
    const artOk = !visual || !!progress.drawing;
    const canValidate = quizOk && artOk;

    box.innerHTML = `
      <div class="lesson-validate-checklist">
        <div class="checklist-item ${quizOk ? 'checklist-ok' : 'checklist-pending'}">
          <span class="tick">${quizOk ? '✅' : '⬜'}</span> ${quiz ? 'Interrogation envoyée' : 'Aucune interrogation requise'}
        </div>
        <div class="checklist-item ${artOk ? 'checklist-ok' : 'checklist-pending'}">
          <span class="tick">${artOk ? '✅' : '⬜'}</span> ${visual ? 'Dessin enregistré' : 'Aucun visuel à colorier'}
        </div>
      </div>
      <button class="btn btn-success" ${canValidate ? '' : 'disabled'} onclick="ArtEtudes.validateFinalResult()">
        ✅ Valider et soumettre mon résultat final
      </button>`;
  }

  function validateFinalResult() {
    const { lesson, progress } = activeLessonAndProgress();
    if (!lesson || progress.finalized) return;

    const quiz = findQuizForLesson(lesson);
    const visual = findLessonVisual(lesson);
    const quizOk = !quiz || (progress.quiz && progress.quiz.submitted);
    const artOk = !visual || !!progress.drawing;
    if (!quizOk || !artOk) {
      alert('⚠️ Termine bien l\'interrogation et/ou le dessin avant de valider.');
      return;
    }

    progress.finalized = true;
    progress.finalScore = progress.quiz ? progress.quiz.score : null;
    progress.finalizedAt = new Date().toISOString();
    saveLessonProgress(lesson.id, progress);

    sendResultToProfessor(lesson, progress, quiz);

    renderLessonsSideList();
    renderWeekPlan();
    renderQuizForActiveLesson();
    renderArtClasseForActiveLesson();
    renderValidationBlock();
    computeNotes();
  }

  // Simule l'envoi de la note à professeur.html (clé partagée lue par
  // professeur.html dans son bloc "Résultat des interrogations").
  function sendResultToProfessor(lesson, progress, quiz) {
    const account = getStoredAccount();
    const result = {
      id: `res-${lesson.id}-${Date.now()}`,
      studentId: currentStudentId,
      studentName: account ? `${account.prenom || ''} ${account.nom || ''}`.trim() : 'Élève',
      niveauLevel: LEVEL,
      niveauLabel: LEVEL_LABELS[LEVEL] || LEVEL,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      quizId: quiz ? quiz.id : null,
      quizTitle: quiz ? quiz.title : null,
      score: progress.quiz ? progress.quiz.score : null,
      maxScore: 20,
      hasDrawing: !!progress.drawing,
      drawingDataUrl: progress.drawing ? progress.drawing.dataUrl : null,
      date: new Date().toISOString()
    };
    let all = [];
    try { all = JSON.parse(localStorage.getItem('znk_quiz_results') || '[]'); } catch (e) { all = []; }
    all.push(result);
    localStorage.setItem('znk_quiz_results', JSON.stringify(all));
  }

  // ============================================================
  // Programme de la semaine
  // ============================================================
  function weekPlanStorageKey() { return `znk_week_plan_${LEVEL}`; }

  function getWeekPlanState() {
    try { return JSON.parse(localStorage.getItem(weekPlanStorageKey()) || '{"order":[]}'); }
    catch (e) { return { order: [] }; }
  }
  function saveWeekPlanState(state) { localStorage.setItem(weekPlanStorageKey(), JSON.stringify(state)); }

  function renderWeekPlan() {
    const grid = document.getElementById('weekPlanGrid');
    const progressFill = document.getElementById('weekPlanProgressFill');
    if (!grid || !window.ZNK_ETUDES_MANIFEST) return;

    const lessons = levelLessons();
    if (lessons.length === 0) {
      grid.innerHTML = '<div class="week-plan-empty">📖 Aucune leçon à programmer cette semaine.</div>';
      progressFill.style.width = '0%';
      return;
    }

    let state = getWeekPlanState();
    lessons.forEach(l => { if (!state.order.includes(l.id)) state.order.push(l.id); });
    state.order = state.order.filter(id => lessons.some(l => l.id === id));
    saveWeekPlanState(state);

    const lessonsById = Object.fromEntries(lessons.map(l => [l.id, l]));
    const orderedLessons = state.order.map(id => lessonsById[id]).filter(Boolean);

    grid.innerHTML = orderedLessons.map((lesson, idx) => {
      const progress = getLessonProgress(lesson.id);
      const validated = progress.finalized;
      return `
        <div class="week-plan-item ${validated ? 'validated' : ''}" onclick="ArtEtudes.openLesson('${lesson.id}')">
          <div class="wp-title">${validated ? '🏆' : '📘'} ${lesson.title}</div>
          <div class="wp-status">${validated ? `Validée${typeof progress.finalScore === 'number' ? ' — ' + progress.finalScore + '/20' : ''}` : 'À apprendre'}</div>
          <div class="wp-order">
            <button type="button" onclick="event.stopPropagation(); ArtEtudes.moveWeekPlanItem('${lesson.id}', -1)" ${idx === 0 ? 'disabled' : ''}>◀</button>
            <button type="button" onclick="event.stopPropagation(); ArtEtudes.moveWeekPlanItem('${lesson.id}', 1)" ${idx === orderedLessons.length - 1 ? 'disabled' : ''}>▶</button>
          </div>
        </div>`;
    }).join('');

    const validatedCount = orderedLessons.filter(l => getLessonProgress(l.id).finalized).length;
    const percentage = orderedLessons.length > 0 ? Math.round((validatedCount / orderedLessons.length) * 100) : 0;
    progressFill.style.width = `${percentage}%`;
  }

  function moveWeekPlanItem(lessonId, direction) {
    const state = getWeekPlanState();
    const i = state.order.indexOf(lessonId);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= state.order.length) return;
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
    saveWeekPlanState(state);
    renderWeekPlan();
  }

  // ============================================================
  // Compte rendu hebdomadaire (notes)
  // ============================================================
  let timerRunning = false;
  let startTime = null;
  let timerInterval = null;

  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    startTime = Date.now();
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    timerInterval = setInterval(updateTimer, 1000);
  }
  function stopTimer() {
    if (!timerRunning) return;
    timerRunning = false;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    clearInterval(timerInterval);
  }
  function updateTimer() {
    if (!timerRunning || !startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('timerDisplay').textContent = `Temps: ${minutes}m ${seconds}s`;
  }
  function submitReport() {
    const report = document.getElementById('reportText').value.trim();
    if (!report) { alert("⚠️ Écris ton compte rendu avant de l'envoyer !"); return; }
    if (timerRunning) stopTimer();
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ Envoyé !';
    btn.style.background = 'linear-gradient(45deg, #55efc4, #00b894)';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '';
      document.getElementById('reportText').value = '';
      alert('📝 Compte rendu envoyé avec succès !');
    }, 2000);
  }

  function computeNotes() {
    const quizNoteEl = document.getElementById('quizAverageNote');
    const globalNoteEl = document.getElementById('globalNote');
    if (!quizNoteEl || !globalNoteEl) return;

    const lessons = levelLessons();
    const finalizedWithScore = lessons
      .map(l => getLessonProgress(l.id))
      .filter(p => p.finalized && typeof p.finalScore === 'number');

    let quizAverage = null;
    if (finalizedWithScore.length > 0) {
      quizAverage = finalizedWithScore.reduce((sum, p) => sum + p.finalScore, 0) / finalizedWithScore.length;
      quizNoteEl.textContent = `${quizAverage.toFixed(1)}/20`;
    } else {
      quizNoteEl.textContent = '--/20';
    }

    const validatedCount = lessons.filter(l => getLessonProgress(l.id).finalized).length;
    const progressRatio = lessons.length > 0 ? validatedCount / lessons.length : 0;
    const progressNote = progressRatio * 20;

    if (quizAverage !== null) {
      globalNoteEl.textContent = `${(quizAverage * 0.6 + progressNote * 0.4).toFixed(1)}/20`;
    } else if (lessons.length > 0) {
      globalNoteEl.textContent = `${progressNote.toFixed(1)}/20`;
    } else {
      globalNoteEl.textContent = '--/20';
    }
  }

  // ============================================================
  // Initialisation
  // ============================================================
  function init() {
    const titleEl = document.getElementById('levelTitle');
    if (titleEl) titleEl.textContent = `🎨 Art Études — ${LEVEL_LABELS[LEVEL] || LEVEL}`;

    if (typeof showEleveModule === 'function') showEleveModule('Bienvenue Élève !');
    if (window.ZNK && window.ZNK.Header) {
      window.ZNK.Header.init({
        title: `Art Études — ${LEVEL_LABELS[LEVEL] || LEVEL}`,
        subtitle: 'Espace élève',
        context: 'eleves',
        showBackBtn: true
      });
    }

    loadAccountData();

    function attemptInitialLoad(retriesLeft) {
      if (!window.ZNK_ETUDES_MANIFEST && retriesLeft > 0) {
        setTimeout(() => attemptInitialLoad(retriesLeft - 1), 500);
        return;
      }
      renderLessonsSideList();
      renderWeekPlan();
      computeNotes();
    }
    setTimeout(() => attemptInitialLoad(6), 500);

    if (window.ZNKManifest) {
      const refreshAfterSync = () => {
        renderLessonsSideList();
        renderWeekPlan();
        computeNotes();
        if (currentActiveLesson) {
          renderQuizForActiveLesson();
          renderArtClasseForActiveLesson();
          renderValidationBlock();
        }
      };
      window.addEventListener('znk-data-synced', refreshAfterSync);
      if (ZNKManifest.electron && ZNKManifest.electron.sync) {
        ZNKManifest.electron.sync().then(refreshAfterSync);
      }
    }

    setInterval(() => {
      if (window.ZNK_ETUDES_MANIFEST) {
        const currentCount = document.querySelectorAll('#lessonsList .lesson-card').length;
        const newCount = levelLessons().length;
        if (newCount !== currentCount) renderLessonsSideList();
      }
    }, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

  // ============================================================
  // API exposée au HTML
  // ============================================================
  window.ArtEtudes = {
    toggleRegistrationInfo,
    toggleCard,
    handleAvatarUpload,
    openLesson,
    startQuizTimer,
    stopQuizTimer,
    setQuizAnswer,
    submitQuizAnswers,
    openArtClasse,
    validateFinalResult,
    moveWeekPlanItem,
    startTimer,
    stopTimer,
    submitReport
  };
})();
