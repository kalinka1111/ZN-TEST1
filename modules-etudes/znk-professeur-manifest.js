/**
 * ZNK — Manifest des modules Professeur
 * ---------------------------------------------------------
 * Fichier partagé par :
 *   - terminal-professeurs.html  (création / édition des modules)
 *   - terminal-lecons.html       (création / édition des leçons)
 *   - terminal-interrogations.html (création / édition des interrogations)
 *   - professeur.html            (dashboard professeur généré depuis le manifest)
 *   - etudes.html                (affichage des modules "visibles élèves")
 *   - ArtEtudes-<niveau>.html    (dashboard élève par niveau, via art-etudes-common.js)
 *   - parents.html               (synthèse des modules "visibles parents")
 *
 * Stockage : localStorage (clé ci-dessous), avec export/import JSON
 * pour partager ou sauvegarder le manifest en dehors du navigateur.
 * ---------------------------------------------------------
 */
(function (global) {
    const STORAGE_KEY = 'znk_professeur_manifest_v1';
    const QUIZ_STORAGE_KEY = 'znk_quizzes_v1';
    const ATTEMPTS_STORAGE_KEY = 'znk_quiz_attempts_v1';
    const LESSON_STORAGE_KEY = 'znk_lessons_v1';
    const KNOWN_PROFS_KEY = 'znk_known_profs_v1';
    // "Tombstones" (traces de suppression) : la fusion sync (mergeById) n'écrase
    // jamais aveuglément, donc une simple absence d'id côté disque ne suffit PAS
    // à faire disparaître une leçon/interrogation supprimée d'un cache local resté
    // ancien (ArtEtudes-*.html, import-lecons-interrogations.html, une autre fenêtre…).
    // Ces listes mémorisent EXPLICITEMENT "cet id a été supprimé", sont elles-mêmes
    // synchronisées via electron.sync()/flush() comme le reste, et sont appliquées à
    // CHAQUE lecture (getLessons/getQuizzes) pour garantir qu'un id supprimé ne
    // réapparaît plus nulle part, quelle que soit la page qui l'avait encore en cache.
    const LESSON_TOMBSTONES_KEY = 'znk_lessons_tombstones_v1';
    const QUIZ_TOMBSTONES_KEY = 'znk_quiz_tombstones_v1';

    // Prof "actif" pour cette fenêtre/onglet — à définir via ZNKManifest.setCurrentProf(id)
    // au chargement de chaque page côté professeur (professeur.html, terminal-interrogations.html...).
    // Sert à savoir dans quel fichier écrire côté Electron, et à filtrer "mes interrogations".
    let currentProfId = null;
    function setCurrentProf(id) {
        currentProfId = id || null;
        if (currentProfId) registerKnownProf(currentProfId);
    }
    function getCurrentProf() { return currentProfId; }

    function getKnownProfs() {
        try {
            const raw = global.localStorage.getItem(KNOWN_PROFS_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }
    function registerKnownProf(profId) {
        try {
            const list = getKnownProfs();
            if (!list.includes(profId)) {
                list.push(profId);
                global.localStorage.setItem(KNOWN_PROFS_KEY, JSON.stringify(list));
            }
        } catch (e) {}
    }

    // Niveaux scolaires (fins) + catégorie large utilisée pour le filtrage côté ArtEtudes-<niveau>.html / etudes.html
    const NIVEAUX = [
        { code: 'tous', label: 'Tous niveaux', broad: 'tous' },
        { code: 'maternelle', label: 'Maternelle (PS/MS/GS)', broad: 'maternelle' },
        { code: 'cp', label: 'CP', broad: 'primaire' },
        { code: 'ce1', label: 'CE1', broad: 'primaire' },
        { code: 'ce2', label: 'CE2', broad: 'primaire' },
        { code: 'cm1', label: 'CM1', broad: 'primaire' },
        { code: 'cm2', label: 'CM2', broad: 'primaire' },
        { code: '6e', label: '6ème', broad: 'college' },
        { code: '5e', label: '5ème', broad: 'college' },
        { code: '4e', label: '4ème', broad: 'college' },
        { code: '3e', label: '3ème', broad: 'college' },
        { code: '2nde', label: '2nde', broad: 'lycee' },
        { code: '1re', label: '1ère', broad: 'lycee' },
        { code: 'terminale', label: 'Terminale', broad: 'lycee' }
    ];

    // Matières courantes (le professeur peut aussi saisir une matière libre : voir champ "Autre")
    const MATIERES = [
        { code: 'general', label: 'Général', icon: '🔹' },
        { code: 'mathematiques', label: 'Mathématiques', icon: '📐' },
        { code: 'francais', label: 'Français', icon: '📖' },
        { code: 'geographie', label: 'Géographie', icon: '🌍' },
        { code: 'histoire', label: 'Histoire', icon: '🏛️' },
        { code: 'sciences', label: 'Sciences', icon: '🔬' },
        { code: 'anglais', label: 'Anglais', icon: '🇬🇧' },
        { code: 'arts', label: 'Arts', icon: '🎨' },
        { code: 'eps', label: 'EPS / Sport', icon: '⚽' },
        { code: 'musique', label: 'Musique', icon: '🎵' },
        { code: 'informatique', label: 'Informatique', icon: '💻' }
    ];

    // Sections disponibles pour organiser les modules du dashboard professeur.
    const DEFAULT_SECTIONS = [
        { key: 'gestion-classe', label: 'Gestion de Classe', icon: '🎯', color: 'linear-gradient(135deg, #ff6b35, #f7931e)' },
        { key: 'analytics', label: 'Tableau de Bord Analytique', icon: '📊', color: 'linear-gradient(135deg, #059669, #047857)' },
        { key: 'contenu', label: 'Création de Contenu Pédagogique', icon: '📝', color: 'linear-gradient(135deg, #7c3aed, #6d28d9)' },
        { key: 'communication', label: 'Communication & Interaction', icon: '💬', color: 'linear-gradient(135deg, #dc2626, #b91c1c)' },
        { key: 'planification', label: 'Planification & Organisation', icon: '⏰', color: 'linear-gradient(135deg, #ea580c, #dc2626)' },
        { key: 'parents', label: 'Interface Parents & Contrôles', icon: '👨‍👩‍👧‍👦', color: 'linear-gradient(135deg, #0891b2, #0e7490)' },
        { key: 'workflow', label: 'Workflow Pédagogique', icon: '🔄', color: 'linear-gradient(135deg, #1f2937, #374151)' }
    ];

    // Modules d'origine repris de professeur.html, pour ne rien perdre au premier lancement.
    const DEFAULT_MODULES = [
        buildModule('gestion-eleves', 'gestion-classe', '👥', "Vue d'ensemble des élèves",
            'Gestion complète des élèves connectés avec statuts d\'activité en temps réel.',
            'Ce module vous permet de gérer tous vos élèves en temps réel. Vous pouvez voir qui est connecté, suivre leur activité, consulter leurs profils et gérer leurs permissions.',
            'actif', { eleves: false, parents: false }, true),

        buildModule('progression-eleves', 'analytics', '📈', 'Progression des élèves',
            'Suivi détaillé de la progression par matière avec graphiques interactifs.',
            'Suivez la progression détaillée de chaque élève avec des graphiques interactifs. Analyse par matière, points forts, difficultés et recommandations pédagogiques.',
            'actif', { eleves: false, parents: true }, true),

        buildModule('stats-chat-ia', 'analytics', '🤖', 'Statistiques Chat IA',
            "Analyse de l'utilisation du chat IA par les élèves et efficacité pédagogique.",
            "Analysez l'utilisation du chat IA par vos élèves : questions posées, sujets demandés, efficacité des réponses et impact sur l'apprentissage.",
            'pret', { eleves: false, parents: false }),

        buildModule('resultats-interrogations', 'analytics', '📝', 'Résultats des interrogations',
            'Tableau de bord des résultats des interrogations automatiques avec analyses.',
            'Consultez et analysez les résultats des interrogations automatiques : statistiques de réussite, questions problématiques, analyses comparatives.',
            'pret', { eleves: true, parents: true }),

        buildModule('studio-enregistrement', 'contenu', '🎬', "Studio d'enregistrement",
            'Studio simple pour enregistrer des leçons vidéo avec écran live et chat IA intégré.',
            "Enregistrez facilement vos leçons vidéo : capture d'écran, webcam, chat IA en direct et outils d'édition basiques.",
            'pret', { eleves: false, parents: false }),

        buildModule('gestion-lecons', 'contenu', '📹', 'Gestion des leçons vidéo',
            'Upload, organisation et mise à disposition des leçons enregistrées pour les élèves.',
            'Organisez et gérez toutes vos leçons vidéo : upload, catégorisation, programmation de diffusion, accès par classe, statistiques de visionnage.',
            'pret', { eleves: true, parents: false }),

        buildModule('creation-interrogations', 'contenu', '❓', "Création d'interrogations",
            'Outil de création d\'interrogations programmées avec correction automatique.',
            'Créez des interrogations programmées avec correction automatique : banque de questions, génération IA, correction instantanée.',
            'pret', { eleves: false, parents: false }),

        buildModule('gestion-devoirs', 'contenu', '📚', 'Gestion des devoirs',
            'Organisation des devoirs et gestion des échéances avec rappels automatiques.',
            'Organisez efficacement les devoirs de vos classes : création, assignation, suivi des remises, échéances, notation intégrée.',
            'pret', { eleves: true, parents: true }),

        buildModule('chat-prive-eleves', 'communication', '💬', 'Chat privé avec élèves',
            'Messagerie privée sécurisée pour communiquer individuellement avec chaque élève.',
            'Communiquez individuellement avec vos élèves via une messagerie sécurisée : conversations privées, partage de fichiers, historique.',
            'pret', { eleves: true, parents: false }),

        buildModule('notifications-parents', 'communication', '📱', 'Notifications parents',
            'Système de notifications push automatiques vers les parents des élèves.',
            'Notifiez automatiquement les parents : progrès, absences, devoirs, événements et résultats d\'évaluations.',
            'pret', { eleves: false, parents: true }),

        buildModule('calendrier-cours', 'planification', '📅', 'Calendrier des cours',
            'Planification complète des cours et activités avec gestion des horaires.',
            'Planifiez et organisez tous vos cours et activités : vues mensuelle/hebdomadaire/quotidienne, récurrences, synchronisation.',
            'pret', { eleves: true, parents: false }),

        buildModule('planning-art-classes', 'planification', '🎨', 'Planning Art Classes',
            "Gestion spécialisée des horaires pour les classes d'art et activités créatives.",
            "Planification spécialisée pour les cours d'art : gestion des matériels, réservation des espaces, suivi des projets artistiques.",
            'pret', { eleves: true, parents: false }),

        buildModule('planning-interrogations', 'planification', '📋', 'Planning interrogations IA',
            'Programmation automatique des interrogations avec IA intégrée.',
            "Programmation intelligente des évaluations : l'IA optimise la répartition, évite les surcharges, équilibre la charge de travail.",
            'pret', { eleves: false, parents: false }),

        buildModule('comptes-rendus-eleves', 'parents', '📄', 'Comptes rendus élèves',
            'Accès parental aux bulletins, notes et rapports détaillés des élèves.',
            'Génération automatique de bulletins et rapports détaillés : analyses personnalisées, graphiques de progression, recommandations.',
            'pret', { eleves: false, parents: true }),

        buildModule('suivi-temps-ecran', 'parents', '⏱️', "Suivi temps d'écran",
            "Monitoring du temps passé par chaque élève sur la plateforme éducative.",
            "Monitoring complet du temps passé sur la plateforme : statistiques, alertes de surcharge, recommandations de pauses.",
            'pret', { eleves: false, parents: true }),

        buildModule('controles-parentaux', 'parents', '🔒', 'Contrôles parentaux ACTV',
            'Paramètres de contrôle parental pour les activités et contenus accessibles.',
            'Paramètres avancés de contrôle parental : permissions, filtrage de contenu, limitation de temps, restrictions par âge.',
            'pret', { eleves: false, parents: true }),

        buildModule('workflow-lecons', 'workflow', '📹', 'Workflow Leçons',
            'Processus leçons enregistrées',
            'Automatisation complète du processus de création et diffusion des leçons, du brouillon à la publication.',
            'pret', { eleves: false, parents: false }),

        buildModule('automatisation-notes', 'workflow', '🤖', 'Automatisation Notes',
            'Correction automatique',
            'Système intelligent de correction automatique avec IA : QCM, réponses ouvertes, détection de plagiat, feedback personnalisé.',
            'pret', { eleves: false, parents: false }),

        buildModule('rapports-progression', 'workflow', '📊', 'Rapports Auto',
            'Génération rapports',
            "Génération automatique de rapports de progression : analyses statistiques, tendances d'apprentissage, recommandations.",
            'pret', { eleves: false, parents: false }),

        buildModule('backup-donnees', 'workflow', '💾', 'Sauvegarde',
            'Backup automatique',
            'Sauvegarde automatique et sécurisée de toutes les données pédagogiques, conforme RGPD.',
            'pret', { eleves: false, parents: false })
    ];

    function buildModule(id, section, icon, title, shortDescription, longDescription, status, audience, featured, extra) {
        extra = extra || {};
        return {
            id, section, icon, title, shortDescription, longDescription, status,
            audience: Object.assign({ eleves: false, parents: false }, audience || {}),
            featured: !!featured,
            niveau: extra.niveau || 'tous',
            matiere: extra.matiere || 'general',
            matiereLibre: extra.matiereLibre || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    function slugify(text) {
        return (text || '')
            .toString()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || ('module-' + Date.now());
    }

    function statusLabel(status) {
        return { actif: 'Actif', pret: 'Prêt', beta: 'Bêta', off: 'Désactivé' }[status] || 'Prêt';
    }

    function sectionInfo(sections, key) {
        return sections.find(s => s.key === key) || { key, label: key, icon: '🔹', color: 'linear-gradient(135deg,#555,#333)' };
    }

    function niveauInfo(code) {
        return NIVEAUX.find(n => n.code === code) || { code: code || 'tous', label: code || 'Tous niveaux', broad: 'tous' };
    }

    function matiereInfo(code, matiereLibre) {
        if (code === 'autre' && matiereLibre) return { code: 'autre', label: matiereLibre, icon: '📌' };
        return MATIERES.find(m => m.code === code) || { code: code || 'general', label: code || 'Général', icon: '🔹' };
    }

    // Un module de niveau "cp" doit s'afficher pour un élève dont le niveau large est "primaire", etc.
    // broadLevel attendu : 'maternelle' | 'primaire' | 'college' | 'lycee' (valeurs utilisées dans ArtEtudes-<niveau>.html / etudes.html)
    function niveauMatchesLevel(moduleNiveau, broadLevel) {
        const info = niveauInfo(moduleNiveau);
        return info.broad === 'tous' || info.broad === broadLevel;
    }

    // Charge les icônes disponibles, avec 3 niveaux de repli :
    //  1) window.znkManifest.loadIcons() — le vrai bridge Electron déjà en place dans l'app
    //     (preload.js / manifest-manager.js, catégorie "icons")
    //  2) fetch('icons-intro-manifest.json') — pratique pour tester hors Electron (navigateur simple)
    //  3) null — l'appelant utilisera alors sa propre liste d'icônes par défaut
    // Formats acceptés pour les items : chaînes ["🎯", ...], objets {icon|emoji|symbol|url|src|path|data, label?|name?},
    // ou objet-dictionnaire { cle: "🎯", ... }. Retourne une liste normalisée [{ value, label, isImage }].
    async function loadCustomIcons(fallbackPath) {
        // 1) Bridge Electron réel (znkManifest), si disponible
        if (global.window && global.window.znkManifest && typeof global.window.znkManifest.loadIcons === 'function') {
            try {
                const res = await global.window.znkManifest.loadIcons();
                if (res && res.success && Array.isArray(res.icons) && res.icons.length) {
                    const list = res.icons.map(item => normalizeIconEntry(item)).filter(Boolean);
                    if (list.length) return list;
                }
            } catch (e) {
                console.warn('ZNKManifest: znkManifest.loadIcons() indisponible, repli sur fetch', e);
            }
        }

        // 2) Fichier statique local (utile hors Electron, ex: aperçu navigateur)
        try {
            const res = await fetch(fallbackPath || 'icons-intro-manifest.json');
            if (!res.ok) return null;
            const data = await res.json();
            let list = [];
            if (Array.isArray(data)) {
                list = data.map(item => normalizeIconEntry(item));
            } else if (data && typeof data === 'object') {
                list = Object.entries(data).map(([key, val]) => normalizeIconEntry(val, key));
            }
            list = list.filter(Boolean);
            return list.length ? list : null;
        } catch (e) {
            return null; // fichier absent, invalide, ou bloqué (ouverture en file:// sans serveur)
        }
    }

    function normalizeIconEntry(item, fallbackLabel) {
        if (typeof item === 'string') {
            const isImage = /^(https?:|\.\/|\/|data:image)/.test(item) || /\.(png|svg|jpg|jpeg|gif|webp)$/i.test(item);
            return { value: item, label: fallbackLabel || item, isImage };
        }
        if (item && typeof item === 'object') {
            const value = item.icon || item.emoji || item.symbol || item.url || item.src || item.path || item.data || '';
            if (!value) return null;
            const isImage = !!(item.url || item.src || item.path) || /\.(png|svg|jpg|jpeg|gif|webp)$/i.test(value) || /^data:image/.test(value);
            return { value, label: item.label || item.name || fallbackLabel || value, isImage };
        }
        return null;
    }

    function seedDefaults() {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            sections: DEFAULT_SECTIONS,
            modules: DEFAULT_MODULES
        };
    }

    function getManifest() {
        try {
            const raw = global.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.modules)) return parsed;
            }
        } catch (e) { /* localStorage indisponible ou JSON corrompu */ }
        const seeded = seedDefaults();
        try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)); } catch (e) {}
        return seeded;
    }

    function saveManifest(manifest) {
        manifest.updatedAt = new Date().toISOString();
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
            writeThroughToElectron();
            return true;
        } catch (e) {
            console.error('ZNKManifest: impossible de sauvegarder', e);
            return false;
        }
    }

    function addModule(fields) {
        const manifest = getManifest();
        const id = fields.id || slugify(fields.title);
        const mod = buildModule(
            id,
            fields.section || 'gestion-classe',
            fields.icon || '🔹',
            fields.title || 'Nouveau module',
            fields.shortDescription || '',
            fields.longDescription || fields.shortDescription || '',
            fields.status || 'pret',
            fields.audience || { eleves: false, parents: false },
            !!fields.featured,
            { niveau: fields.niveau, matiere: fields.matiere, matiereLibre: fields.matiereLibre }
        );
        manifest.modules.push(mod);
        saveManifest(manifest);
        return mod;
    }

    function updateModule(id, patch) {
        const manifest = getManifest();
        const idx = manifest.modules.findIndex(mo => mo.id === id);
        if (idx === -1) return null;
        manifest.modules[idx] = Object.assign({}, manifest.modules[idx], patch, { updatedAt: new Date().toISOString() });
        saveManifest(manifest);
        return manifest.modules[idx];
    }

    function deleteModule(id) {
        const manifest = getManifest();
        manifest.modules = manifest.modules.filter(mo => mo.id !== id);
        saveManifest(manifest);
    }

    function resetToDefaults() {
        const seeded = seedDefaults();
        saveManifest(seeded);
        return seeded;
    }

    function exportManifestFile() {
        const manifest = getManifest();
        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'manifest-professeurs.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importManifestFile(file, mode) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result);
                    if (!parsed || !Array.isArray(parsed.modules)) throw new Error('Format invalide');
                    let manifest = parsed;
                    if (mode === 'merge') {
                        const current = getManifest();
                        const byId = {};
                        current.modules.forEach(mo => byId[mo.id] = mo);
                        parsed.modules.forEach(mo => byId[mo.id] = mo);
                        manifest = { version: 1, sections: parsed.sections || current.sections, modules: Object.values(byId) };
                    }
                    saveManifest(manifest);
                    resolve(manifest);
                } catch (e) { reject(e); }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    // Rendu HTML réutilisable d'une carte de module (thème sombre commun aux 4 pages).
    function moduleCardHTML(mo, sections, opts) {
        opts = opts || {};
        const sec = sectionInfo(sections, mo.section);
        const badgeColor = mo.status === 'actif' ? '#00ff88' : (mo.status === 'beta' ? '#f7931e' : (mo.status === 'off' ? '#666' : '#00ff88'));
        return `
            <div class="znk-module-card${mo.featured ? ' featured' : ''}" data-id="${mo.id}" onclick="${opts.onClick ? opts.onClick + `('${mo.id}')` : ''}">
                <div class="znk-module-header">
                    <div class="znk-module-icon" style="background:${sec.color}">${mo.icon}</div>
                    <div class="znk-module-title">${mo.title}</div>
                </div>
                <div class="znk-module-description">${mo.shortDescription}</div>
                <div class="znk-module-status" style="color:${badgeColor};border-color:${badgeColor}33;background:${badgeColor}22">
                    <span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;"></span>
                    ${statusLabel(mo.status)}
                </div>
            </div>`;
    }

    // =====================================================================
    // INTERROGATIONS (quiz) — création, publication, passage, résultats
    // =====================================================================

    function newQuizId() { return 'quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
    function newQuestionId() { return 'q-' + Math.random().toString(36).slice(2, 9); }
    function newAttemptId() { return 'att-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

    function getQuizzes() {
        try {
            const raw = global.localStorage.getItem(QUIZ_STORAGE_KEY);
            if (raw) {
                const tombstones = getTombstoneIds(QUIZ_TOMBSTONES_KEY);
                return JSON.parse(raw).filter(q => !tombstones.has(q.id));
            }
        } catch (e) {}
        return [];
    }

    function saveQuizzes(list) {
        try {
            global.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(list));
            // On n'écrit sur disque QUE les données du prof courant : on n'écrase jamais
            // le fichier d'un autre prof, même en cas de synchro P2P concurrente.
            if (currentProfId) {
                writeProfFileToElectron(currentProfId, list.filter(q => q.profId === currentProfId), getLessonsForProf(currentProfId));
            }
            writeThroughToElectron(); // legacy : garde un fichier unique en repli si l'app n'a pas encore les IPC partitionnés
            return true;
        } catch (e) { console.error('ZNKManifest: sauvegarde quiz impossible', e); return false; }
    }

    function getQuizzesForProf(profId) {
        return getQuizzes().filter(q => q.profId === profId);
    }

    function addQuiz(fields) {
        const quizzes = getQuizzes();
        const quiz = {
            id: newQuizId(),
            profId: fields.profId || currentProfId || 'local',
            title: fields.title || 'Nouvelle interrogation',
            niveau: fields.niveau || 'tous',
            matiere: fields.matiere || 'general',
            matiereLibre: fields.matiereLibre || '',
            // Lien structurel vers une leçon (terminal-lecons.html) : permet à
            // art-etudes-common.js d'assembler "leçon + quiz + visuel" dans les
            // tableaux de bord élèves (findQuizForLesson). Absent tant que le prof
            // n'a pas choisi de leçon dans le sélecteur "Lier à une leçon".
            lessonId: fields.lessonId || null,
            description: fields.description || '',
            timeLimitMinutes: fields.timeLimitMinutes || null,
            status: fields.status || 'brouillon', // brouillon | publie | archive
            audience: Object.assign({ eleves: true, parents: false }, fields.audience || {}),
            questions: (fields.questions || []).map(q => ({
                id: q.id || newQuestionId(),
                text: q.text || '',
                type: q.type || 'qcm', // 'qcm' | 'vrai_faux'
                options: q.type === 'vrai_faux' ? ['Vrai', 'Faux'] : (q.options && q.options.length ? q.options : ['', '']),
                correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
                points: typeof q.points === 'number' ? q.points : 1
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        quizzes.push(quiz);
        saveQuizzes(quizzes);
        return quiz;
    }

    function updateQuiz(id, patch) {
        const quizzes = getQuizzes();
        const idx = quizzes.findIndex(q => q.id === id);
        if (idx === -1) return null;
        quizzes[idx] = Object.assign({}, quizzes[idx], patch, { updatedAt: new Date().toISOString() });
        saveQuizzes(quizzes);
        return quizzes[idx];
    }

    function deleteQuiz(id) {
        saveQuizzes(getQuizzes().filter(q => q.id !== id));
        addTombstones(QUIZ_TOMBSTONES_KEY, [id]);
        // on conserve les résultats déjà enregistrés (historique), même si le quiz est supprimé
    }

    function getQuiz(id) {
        return getQuizzes().find(q => q.id === id) || null;
    }

    function quizTotalPoints(quiz) {
        return quiz.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }

    // --- Résultats / tentatives ---

    function getAttempts() {
        try {
            const raw = global.localStorage.getItem(ATTEMPTS_STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return [];
    }

    function saveAttempts(list) {
        try {
            global.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(list));
            writeThroughToElectron();
            return true;
        } catch (e) { console.error('ZNKManifest: sauvegarde résultats impossible', e); return false; }
    }

    // Corrige automatiquement les réponses et enregistre la tentative (nominative).
    function submitAttempt(quizId, studentName, answers) {
        const quiz = getQuiz(quizId);
        if (!quiz) return null;
        let score = 0;
        const total = quizTotalPoints(quiz);
        const corrected = quiz.questions.map(q => {
            const given = answers.find(a => a.questionId === q.id);
            const selectedIndex = given ? given.selectedIndex : null;
            const isCorrect = selectedIndex === q.correctIndex;
            if (isCorrect) score += (q.points || 1);
            return { questionId: q.id, selectedIndex, isCorrect };
        });
        const attempt = {
            id: newAttemptId(),
            quizId,
            quizTitle: quiz.title,
            studentName: studentName || 'Élève',
            niveau: quiz.niveau,
            matiere: quiz.matiere,
            answers: corrected,
            score,
            total,
            percent: total > 0 ? Math.round((score / total) * 100) : 0,
            completedAt: new Date().toISOString()
        };
        const attempts = getAttempts();
        attempts.push(attempt);
        saveAttempts(attempts);
        // Fichier dédié à CETTE tentative : jamais réécrit ensuite, donc jamais de collision
        // même si plusieurs élèves soumettent en même temps sur des appareils différents.
        writeAttemptFileToElectron(quizId, attempt);
        return attempt;
    }

    function getAttemptsForQuiz(quizId) {
        return getAttempts().filter(a => a.quizId === quizId);
    }

    function getAttemptsForStudent(studentName) {
        return getAttempts().filter(a => a.studentName === studentName);
    }

    // Statistiques agrégées pour un quiz (utilisées côté parents.html — pas de détail nominatif)
    function quizStats(quizId) {
        const attempts = getAttemptsForQuiz(quizId);
        if (attempts.length === 0) return { count: 0, average: 0, successRate: 0 };
        const avg = attempts.reduce((s, a) => s + a.percent, 0) / attempts.length;
        const successRate = Math.round((attempts.filter(a => a.percent >= 50).length / attempts.length) * 100);
        return { count: attempts.length, average: Math.round(avg), successRate };
    }

    // =====================================================================
    // LEÇONS — créées via terminal-lecons.html, affichées dans etudes.html
    // en complément des leçons "seed" statiques de znk-etudes-manifest.js.
    // Même logique de stockage que les interrogations (localStorage +
    // sync Electron), mais sans notion de "tentative" (pas de correction
    // automatique pour une leçon).
    //
    // Le niveau scolaire (maternelle/primaire/college/lycee) n'est PAS
    // stocké ici : il se déduit de la catégorie (categoryId) via
    // window.ZNK_ETUDES_MANIFEST.categoryById()/schoolLevelFromTargetAge()
    // si ce fichier est chargé sur la page — exactement comme pour les
    // leçons "seed", pour garder une seule source de vérité sur le niveau.
    // =====================================================================

    function newLessonId() { return 'lesson-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

    // ---- Tombstones : lecture/écriture + application au filtrage -------------
    function getTombstoneIds(key) {
        try {
            const raw = global.localStorage.getItem(key);
            const list = raw ? JSON.parse(raw) : [];
            return new Set((list || []).map(t => t.id));
        } catch (e) { return new Set(); }
    }
    function getTombstoneList(key) {
        try {
            const raw = global.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }
    function addTombstones(key, ids) {
        if (!ids || ids.length === 0) return;
        const list = getTombstoneList(key);
        const now = new Date().toISOString();
        const existingIds = new Set(list.map(t => t.id));
        ids.forEach(id => {
            if (!existingIds.has(id)) list.push({ id, deletedAt: now });
        });
        try { global.localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
    }
    // Union des deux listes de tombstones (par id, aucune "date la plus récente"
    // à comparer : une suppression est définitive, l'union suffit).
    function mergeTombstoneLists(localList, diskList) {
        const byId = {};
        (localList || []).forEach(t => { byId[t.id] = t; });
        (diskList || []).forEach(t => { if (!byId[t.id]) byId[t.id] = t; });
        return Object.values(byId);
    }

    function getLessons() {
        try {
            const raw = global.localStorage.getItem(LESSON_STORAGE_KEY);
            if (raw) {
                const tombstones = getTombstoneIds(LESSON_TOMBSTONES_KEY);
                return JSON.parse(raw).filter(l => !tombstones.has(l.id));
            }
        } catch (e) {}
        return [];
    }

    function saveLessons(list) {
        try {
            global.localStorage.setItem(LESSON_STORAGE_KEY, JSON.stringify(list));
            if (currentProfId) {
                writeProfFileToElectron(currentProfId, getQuizzesForProf(currentProfId), list.filter(l => l.profId === currentProfId));
            }
            writeThroughToElectron();
            return true;
        } catch (e) { console.error('ZNKManifest: sauvegarde leçons impossible', e); return false; }
    }

    function getLessonsForProf(profId) {
        return getLessons().filter(l => l.profId === profId);
    }

    function addLesson(fields) {
        const lessons = getLessons();
        const lesson = {
            id: fields.id || newLessonId(),
            profId: fields.profId || currentProfId || 'local',
            categoryId: fields.categoryId || 'general',
            title: fields.title || 'Nouvelle leçon',
            description: fields.description || '',
            instructor: fields.instructor || '',
            duration: fields.duration || '',
            order: typeof fields.order === 'number' ? fields.order : 0,
            content: fields.content || '',
            tags: Array.isArray(fields.tags) ? fields.tags : [],
            materials: Array.isArray(fields.materials) ? fields.materials : [],
            // Lien structurel réciproque vers une interrogation (terminal-interrogations.html) —
            // voir quiz.lessonId ci-dessus. findQuizForLesson() vérifie d'abord ce champ,
            // puis se rabat sur un quiz dont lessonId pointe vers cette leçon.
            quizId: fields.quizId || null,
            isPremium: !!fields.isPremium,
            status: fields.status || 'brouillon', // brouillon | publie
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        lessons.push(lesson);
        saveLessons(lessons);
        return lesson;
    }

    function updateLesson(id, patch) {
        const lessons = getLessons();
        const idx = lessons.findIndex(l => l.id === id);
        if (idx === -1) return null;
        lessons[idx] = Object.assign({}, lessons[idx], patch, { updatedAt: new Date().toISOString() });
        saveLessons(lessons);
        return lessons[idx];
    }

    function deleteLesson(id) {
        saveLessons(getLessons().filter(l => l.id !== id));
        addTombstones(LESSON_TOMBSTONES_KEY, [id]);
    }

    // Repart de zéro : vide UNIQUEMENT les leçons + interrogations DU PROF COURANT
    // (garde les tentatives/résultats déjà enregistrés par les élèves, pour ne jamais
    // perdre un historique de notes). Ne touche jamais aux leçons/interrogations des
    // AUTRES profs — correction du 21/07/2026 : la version précédente appelait
    // saveLessons([]) / saveQuizzes([]) sans filtre, ce qui effaçait la base entière,
    // tous professeurs confondus. Écrit immédiatement sur disque (flush) pour que ça
    // survive une navigation rapide.
    function wipeLessonsAndQuizzes() {
        if (!currentProfId) {
            console.warn('ZNKManifest.lessons.wipeAll : aucun profId actif — opération annulée par sécurité (pour éviter d\'effacer les données de tous les profs).');
            return;
        }
        const removedLessonIds = getLessons().filter(l => l.profId === currentProfId).map(l => l.id);
        const removedQuizIds = getQuizzes().filter(q => q.profId === currentProfId).map(q => q.id);
        saveLessons(getLessons().filter(l => l.profId !== currentProfId));
        saveQuizzes(getQuizzes().filter(q => q.profId !== currentProfId));
        addTombstones(LESSON_TOMBSTONES_KEY, removedLessonIds);
        addTombstones(QUIZ_TOMBSTONES_KEY, removedQuizIds);
        flushNow();
    }

    function getLesson(id) {
        return getLessons().find(l => l.id === id) || null;
    }

    // =====================================================================
    // Synchronisation fichier (Electron) — pour que TOUS les profils de
    // l'application (professeur / élèves / parents) partagent les mêmes
    // données, même hors ligne, indépendamment du localStorage par onglet.
    //
    // Cette couche est 100% optionnelle : si le pont Electron n'est pas
    // présent, tout continue de fonctionner uniquement via localStorage.
    //
    // Pour l'activer, exposer dans le preload.js de l'app :
    //   contextBridge.exposeInMainWorld('electronAPI', {
    //     ...vos méthodes existantes...
    //     znkReadData: () => ipcRenderer.invoke('znk:read-data'),
    //     znkWriteData: (json) => ipcRenderer.invoke('znk:write-data', json)
    //   });
    // Et dans le main.js :
    //   const { app, ipcMain } = require('electron');
    //   const fs = require('fs');
    //   const path = require('path');
    //   const ZNK_DATA_FILE = path.join(app.getPath('userData'), 'znk-data.json');
    //   ipcMain.handle('znk:read-data', () => {
    //     try { return fs.readFileSync(ZNK_DATA_FILE, 'utf-8'); } catch (e) { return null; }
    //   });
    //   ipcMain.handle('znk:write-data', (event, json) => {
    //     try { fs.writeFileSync(ZNK_DATA_FILE, json, 'utf-8'); return true; } catch (e) { return false; }
    //   });
    // =====================================================================

    function hasElectronBridge() {
        return !!(global.window && global.window.electronAPI &&
            typeof global.window.electronAPI.znkReadData === 'function' &&
            typeof global.window.electronAPI.znkWriteData === 'function');
    }

    // Pont "partitionné" (nouveau) — optionnel. À exposer côté preload.js :
    //   znkWriteProfData(profId, json)   -> écrit profs/<profId>.json (rien d'autre)
    //   znkReadAllProfData()             -> [{ profId, json }, ...] pour TOUS les fichiers profs/*.json
    //   znkWriteAttempt(quizId, attemptId, json) -> écrit attempts/<quizId>/<attemptId>.json (jamais réécrit)
    //   znkReadAllAttempts()              -> [json, ...] pour TOUTES les tentatives sur disque
    // Voir le squelette main.js fourni séparément.
    function hasPartitionedBridge() {
        return !!(global.window && global.window.electronAPI &&
            typeof global.window.electronAPI.znkWriteProfData === 'function' &&
            typeof global.window.electronAPI.znkReadAllProfData === 'function');
    }
    function hasPartitionedAttemptsBridge() {
        return !!(global.window && global.window.electronAPI &&
            typeof global.window.electronAPI.znkWriteAttempt === 'function' &&
            typeof global.window.electronAPI.znkReadAllAttempts === 'function');
    }

    let profWriteTimer = {};
    function writeProfFileToElectron(profId, profQuizzes, profLessons) {
        if (!hasPartitionedBridge()) return; // repli silencieux : writeThroughToElectron() (legacy) prend le relai
        clearTimeout(profWriteTimer[profId]);
        profWriteTimer[profId] = setTimeout(() => {
            try {
                global.window.electronAPI.znkWriteProfData(profId, JSON.stringify({
                    profId,
                    quizzes: profQuizzes,
                    lessons: profLessons || getLessonsForProf(profId),
                    savedAt: new Date().toISOString()
                }));
            } catch (e) { console.error('ZNKManifest: écriture fichier prof impossible', e); }
        }, 300);
    }

    function writeAttemptFileToElectron(quizId, attempt) {
        if (!hasPartitionedAttemptsBridge()) return; // repli silencieux sur l'ancien mode (déjà sauvegardé dans ATTEMPTS_STORAGE_KEY)
        try {
            global.window.electronAPI.znkWriteAttempt(quizId, attempt.id, JSON.stringify(attempt));
        } catch (e) { console.error('ZNKManifest: écriture fichier tentative impossible', e); }
    }

    // Lit TOUS les fichiers profs/*.json + attempts/**/*.json et reconstruit le cache localStorage
    // en fusionnant par id (jamais d'écrasement global : chaque fichier n'apporte que ses propres lignes).
    async function syncPartitioned() {
        if (!hasPartitionedBridge()) return false;
        try {
            const profFiles = await global.window.electronAPI.znkReadAllProfData(); // [{ profId, json }]
            const diskQuizzes = [];
            const diskLessons = [];
            (profFiles || []).forEach(f => {
                try {
                    const data = JSON.parse(f.json);
                    (data.quizzes || []).forEach(q => diskQuizzes.push(q));
                    (data.lessons || []).forEach(l => diskLessons.push(l));
                } catch (e) {}
            });
            // FUSION (jamais écrasement) : si cette fenêtre vient de créer des leçons/quiz
            // (ex. import-lecons-interrogations.html) et que l'écriture disque debouncée
            // de 300ms n'a pas encore eu le temps d'aboutir, un simple remplacement par le
            // contenu disque effacerait ces données toutes fraîches de la mémoire locale.
            // C'est exactement ce qui causait la disparition d'interrogations/leçons
            // fraîchement importées quand on enchaînait vite vers un autre outil.
            const mergedQuizzes = mergeById(getQuizzes(), diskQuizzes, 'updatedAt');
            const mergedLessons = mergeById(getLessons(), diskLessons, 'updatedAt');
            global.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(mergedQuizzes));
            global.localStorage.setItem(LESSON_STORAGE_KEY, JSON.stringify(mergedLessons));
            if (currentProfId) {
                writeProfFileToElectron(
                    currentProfId,
                    mergedQuizzes.filter(q => q.profId === currentProfId),
                    mergedLessons.filter(l => l.profId === currentProfId)
                );
            }

            if (hasPartitionedAttemptsBridge()) {
                const attemptFiles = await global.window.electronAPI.znkReadAllAttempts(); // [json, ...]
                const attemptsById = {};
                (attemptFiles || []).forEach(raw => {
                    try { const a = JSON.parse(raw); attemptsById[a.id] = a; } catch (e) {}
                });
                global.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(Object.values(attemptsById)));
            }

            global.window.dispatchEvent(new Event('znk-data-synced'));
            return true;
        } catch (e) {
            console.error('ZNKManifest: synchro partitionnée impossible', e);
            return false;
        }
    }

    function collectAllData() {
        return {
            manifest: getManifest(),
            quizzes: getQuizzes(),
            attempts: getAttempts(),
            lessons: getLessons(),
            lessonTombstones: getTombstoneList(LESSON_TOMBSTONES_KEY),
            quizTombstones: getTombstoneList(QUIZ_TOMBSTONES_KEY),
            savedAt: new Date().toISOString()
        };
    }

    let writeThroughTimer = null;
    // Regroupe les écritures rapprochées (debounce) pour éviter de spammer le disque.
    function writeThroughToElectron() {
        if (!hasElectronBridge()) return;
        clearTimeout(writeThroughTimer);
        writeThroughTimer = setTimeout(() => {
            try {
                global.window.electronAPI.znkWriteData(JSON.stringify(collectAllData()));
            } catch (e) { console.error('ZNKManifest: écriture fichier Electron impossible', e); }
        }, 300);
    }

    // Force l'écriture immédiate, sans attendre le debounce de 300ms — à utiliser
    // avant de fermer/naviguer (import en masse, etc.) pour ne jamais laisser une
    // sauvegarde en attente derrière soi. Couvre les DEUX ponts (partitionné + legacy),
    // alors que jusqu'ici seul le legacy était flushé par le filet de sécurité ci-dessous.
    function flushNow() {
        if (hasPartitionedBridge() && currentProfId) {
            clearTimeout(profWriteTimer[currentProfId]);
            try {
                global.window.electronAPI.znkWriteProfData(currentProfId, JSON.stringify({
                    profId: currentProfId,
                    quizzes: getQuizzesForProf(currentProfId),
                    lessons: getLessonsForProf(currentProfId),
                    savedAt: new Date().toISOString()
                }));
            } catch (e) { console.error('ZNKManifest: flush partitionné impossible', e); }
        }
        if (hasElectronBridge()) {
            clearTimeout(writeThroughTimer);
            try {
                global.window.electronAPI.znkWriteData(JSON.stringify(collectAllData()));
            } catch (e) { console.error('ZNKManifest: flush legacy impossible', e); }
        }
    }

    // Filet de sécurité : si la page se ferme ou navigue avant les 300ms du debounce
    // ci-dessus, on force l'écriture immédiatement plutôt que de perdre la sauvegarde
    // en attente. Couvrait uniquement le mode legacy avant correction — c'était la
    // cause principale de la disparition de leçons/quiz fraîchement créés en Electron.
    if (typeof global.window !== 'undefined' && typeof global.window.addEventListener === 'function') {
        global.window.addEventListener('beforeunload', flushNow);
    }

    function mergeById(localList, diskList, dateField) {
        const byId = {};
        (localList || []).forEach(item => { byId[item.id] = item; });
        (diskList || []).forEach(diskItem => {
            const localItem = byId[diskItem.id];
            if (!localItem) { byId[diskItem.id] = diskItem; return; }
            // On garde le plus récent des deux plutôt que d'écraser aveuglément :
            // protège contre une écriture disque en retard (debounce coupé par une
            // navigation) qui écraserait des données locales plus fraîches.
            const localDate = new Date(localItem[dateField] || 0).getTime();
            const diskDate = new Date(diskItem[dateField] || 0).getTime();
            if (diskDate > localDate) byId[diskItem.id] = diskItem;
        });
        return Object.values(byId);
    }

    // À appeler une fois au chargement de chaque page : si un fichier partagé existe,
    // on FUSIONNE avec le cache localStorage local (jamais d'écrasement aveugle) puis
    // on déclenche un événement 'znk-data-synced'.
    async function syncFromElectron() {
        if (hasPartitionedBridge()) {
            const ok = await syncPartitioned();
            if (ok) return true;
        }
        if (!hasElectronBridge()) return false;
        try {
            const raw = await global.window.electronAPI.znkReadData();
            if (!raw) { writeThroughToElectron(); return false; } // rien sur disque : on initialise avec l'état local
            const data = JSON.parse(raw);
            if (data.manifest) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data.manifest));
            // Tombstones en premier : les ids supprimés doivent être connus AVANT de
            // fusionner quizzes/leçons, pour qu'un id supprimé ailleurs ne soit jamais
            // réintroduit par la fusion ci-dessous (mergeById ne connaît que les updatedAt,
            // pas les suppressions).
            const mergedLessonTombstones = mergeTombstoneLists(getTombstoneList(LESSON_TOMBSTONES_KEY), data.lessonTombstones);
            global.localStorage.setItem(LESSON_TOMBSTONES_KEY, JSON.stringify(mergedLessonTombstones));
            const mergedQuizTombstones = mergeTombstoneLists(getTombstoneList(QUIZ_TOMBSTONES_KEY), data.quizTombstones);
            global.localStorage.setItem(QUIZ_TOMBSTONES_KEY, JSON.stringify(mergedQuizTombstones));
            const lessonTombstoneIds = new Set(mergedLessonTombstones.map(t => t.id));
            const quizTombstoneIds = new Set(mergedQuizTombstones.map(t => t.id));

            if (data.quizzes) {
                const merged = mergeById(getQuizzes(), data.quizzes, 'updatedAt').filter(q => !quizTombstoneIds.has(q.id));
                global.localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(merged));
            }
            if (data.attempts) {
                // Les tentatives n'ont pas de updatedAt (jamais modifiées après coup) : simple union par id.
                const merged = mergeById(getAttempts(), data.attempts, 'completedAt');
                global.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(merged));
            }
            if (data.lessons) {
                const merged = mergeById(getLessons(), data.lessons, 'updatedAt').filter(l => !lessonTombstoneIds.has(l.id));
                global.localStorage.setItem(LESSON_STORAGE_KEY, JSON.stringify(merged));
            }
            // On republie immédiatement l'état fusionné sur disque, pour que le fichier
            // ne reste jamais périmé plus longtemps que nécessaire.
            writeThroughToElectron();
            global.window.dispatchEvent(new Event('znk-data-synced'));
            return true;
        } catch (e) {
            console.error('ZNKManifest: lecture fichier Electron impossible', e);
            return false;
        }
    }

    // On fusionne plutôt que d'écraser : si un autre script a déjà posé des propriétés
    // sur window.ZNKManifest (ou le posera après), on ne perd rien de part et d'autre.
    global.ZNKManifest = Object.assign(global.ZNKManifest || {}, {
        STORAGE_KEY,
        DEFAULT_SECTIONS,
        NIVEAUX,
        MATIERES,
        get: getManifest,
        save: saveManifest,
        add: addModule,
        update: updateModule,
        remove: deleteModule,
        resetToDefaults,
        exportFile: exportManifestFile,
        importFile: importManifestFile,
        slugify,
        statusLabel,
        sectionInfo,
        niveauInfo,
        matiereInfo,
        niveauMatchesLevel,
        loadCustomIcons,
        moduleCardHTML,

        // Identité du prof actif dans cette fenêtre (nécessaire pour le partitionnement des données)
        setCurrentProf,
        getCurrentProf,
        knownProfs: getKnownProfs,

        // Interrogations (quiz)
        quiz: {
            list: getQuizzes,                 // TOUS les quiz (tous profs confondus) — utilisé côté élève
            listMine: () => getQuizzesForProf(currentProfId), // seulement les miens — utilisé côté prof
            listForProf: getQuizzesForProf,
            get: getQuiz,
            add: addQuiz,
            update: updateQuiz,
            remove: deleteQuiz,
            totalPoints: quizTotalPoints,
            submitAttempt,
            attemptsForQuiz: getAttemptsForQuiz,
            attemptsForStudent: getAttemptsForStudent,
            allAttempts: getAttempts,
            stats: quizStats
        },

        // Leçons
        lessons: {
            list: getLessons,                  // TOUTES les leçons créées via terminal-lecons.html (tous profs) — utilisé côté élève
            listMine: () => getLessonsForProf(currentProfId), // seulement les miennes — utilisé côté prof
            listForProf: getLessonsForProf,
            get: getLesson,
            add: addLesson,
            update: updateLesson,
            remove: deleteLesson,
            wipeAll: wipeLessonsAndQuizzes // vide MES leçons ET interrogations uniquement (repartir de zéro, sans toucher aux autres profs)
        },

        // Synchronisation fichier Electron (offline, partagée entre tous les profils de l'app)
        electron: {
            available: hasElectronBridge,
            availablePartitioned: hasPartitionedBridge,
            sync: syncFromElectron,
            flush: flushNow
        }
    });
})(window);
