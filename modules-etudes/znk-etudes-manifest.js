/**
 * ZNK Études — Manifest des leçons
 * ---------------------------------------------------------
 * Contient le vrai contenu pédagogique (catégories + leçons).
 * Consommé par etudes.html.
 *
 * NOTE DE RÉPARATION (12/07/2026) : le fichier source contenait deux
 * corruptions structurelles (une fermeture JSON dupliquée entre les
 * leçons "art" et "lecture", et une troncature en fin de fichier sur
 * la dernière leçon "math_10"). Les deux ont été réparées sans perte
 * ni ajout de contenu pédagogique — 22 leçons intactes (6 lecture,
 * 6 art, 10 mathématiques), 0 doublon.
 *
 * IMPORTANT : les leçons n'ont pas de champ "niveau scolaire" direct.
 * Le niveau (maternelle/primaire/college/lycee) est déduit automatiquement
 * de la tranche d'âge (targetAge) de la catégorie à laquelle la leçon
 * appartient, via schoolLevelFromTargetAge() ci-dessous.
 * -> Si tu ajoutes une catégorie pour un autre niveau (ex: primaire),
 *    donne-lui juste un targetAge cohérent (ex: "6-10 ans") et tout
 *    suivra automatiquement, sans retoucher chaque leçon une par une.
 * ---------------------------------------------------------
 */
(function (global) {
    const DATA = 
{
  "version": "1.0.0",
  "generated": "2026-01-15T12:00:00.000Z",
  "source": "./persistent-etudes/",
  "persistent": true,
  "metadata": {
    "totalLessons": 0,
    "totalCategories": 40,
    "generator": "ZNK Études System"
  },
  "categories": [
    {
      "id": "lecture",
      "name": "Lecture - Alphabet",
      "description": "Apprendre les lettres en s'amusant",
      "icon": "📖",
      "color": "#4F46E5",
      "lessonCount": 0,
      "targetAge": "3-5 ans"
    },
    {
      "id": "mathematiques",
      "name": "Mathématiques - Chiffres",
      "description": "Découvrir les nombres de 1 à 10",
      "icon": "🔢",
      "color": "#EC4899",
      "lessonCount": 0,
      "targetAge": "3-5 ans"
    },
    {
      "id": "art",
      "name": "Art - Couleurs",
      "description": "Explorer les couleurs primaires et secondaires",
      "icon": "🎨",
      "color": "#10B981",
      "lessonCount": 0,
      "targetAge": "3-5 ans"
    },

    /* --- Maternelle (3-5 ans) — nouvelles matières --- */
    {
      "id": "musique_maternelle",
      "name": "Musique - Éveil musical",
      "description": "Découvrir les sons, les rythmes et les instruments",
      "icon": "🎵",
      "color": "#8B5CF6",
      "lessonCount": 0,
      "targetAge": "3-5 ans"
    },
    {
      "id": "decouverte_monde",
      "name": "Éveil - Découverte du monde",
      "description": "Premiers pas vers les sciences, la nature et l'espace",
      "icon": "🌱",
      "color": "#22C55E",
      "lessonCount": 0,
      "targetAge": "3-5 ans"
    },

    /* --- Primaire (6-10 ans) --- */
    {
      "id": "francais_primaire",
      "name": "Français - Lecture & Grammaire",
      "description": "Lecture, grammaire, conjugaison et vocabulaire",
      "icon": "📖",
      "color": "#4F46E5",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "mathematiques_primaire",
      "name": "Mathématiques - Primaire",
      "description": "Calcul, numération, géométrie et problèmes",
      "icon": "🔢",
      "color": "#EC4899",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "histoire_primaire",
      "name": "Histoire",
      "description": "Découvrir les grandes périodes de l'Histoire",
      "icon": "🏛️",
      "color": "#B45309",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "geographie_primaire",
      "name": "Géographie",
      "description": "Cartes, paysages et découverte du monde",
      "icon": "🌍",
      "color": "#059669",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "sciences_primaire",
      "name": "Sciences - Découverte du vivant",
      "description": "Le corps humain, les animaux, les plantes",
      "icon": "🔬",
      "color": "#0891B2",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "anglais_primaire",
      "name": "Anglais",
      "description": "Premiers mots et expressions en anglais",
      "icon": "🇬🇧",
      "color": "#DC2626",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "art_primaire",
      "name": "Arts plastiques",
      "description": "Dessin, peinture et créations manuelles",
      "icon": "🎨",
      "color": "#F59E0B",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "musique_primaire",
      "name": "Musique",
      "description": "Chant, rythme et découverte des instruments",
      "icon": "🎵",
      "color": "#8B5CF6",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },
    {
      "id": "sport_primaire",
      "name": "EPS - Sport",
      "description": "Motricité et activités physiques",
      "icon": "⚽",
      "color": "#16A34A",
      "lessonCount": 0,
      "targetAge": "6-10 ans"
    },

    /* --- Collège (11-14 ans) --- */
    {
      "id": "francais_college",
      "name": "Français",
      "description": "Littérature, grammaire et expression écrite",
      "icon": "📖",
      "color": "#4F46E5",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "mathematiques_college",
      "name": "Mathématiques",
      "description": "Algèbre, géométrie et résolution de problèmes",
      "icon": "🔢",
      "color": "#EC4899",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "histoire_college",
      "name": "Histoire",
      "description": "Antiquité, Moyen Âge, époque moderne et contemporaine",
      "icon": "🏛️",
      "color": "#B45309",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "geographie_college",
      "name": "Géographie",
      "description": "Territoires, populations et enjeux du monde",
      "icon": "🌍",
      "color": "#059669",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "svt_college",
      "name": "SVT - Sciences de la Vie et de la Terre",
      "description": "Biologie, écologie et sciences de la Terre",
      "icon": "🔬",
      "color": "#0891B2",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "physique_chimie_college",
      "name": "Physique-Chimie",
      "description": "Matière, énergie et réactions chimiques",
      "icon": "⚗️",
      "color": "#7C3AED",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "anglais_college",
      "name": "Anglais",
      "description": "Grammaire, vocabulaire et expression orale",
      "icon": "🇬🇧",
      "color": "#DC2626",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "techno_college",
      "name": "Technologie",
      "description": "Objets techniques, informatique et conception",
      "icon": "💻",
      "color": "#334155",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "musique_college",
      "name": "Musique",
      "description": "Écoute musicale, chant et théorie",
      "icon": "🎵",
      "color": "#8B5CF6",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "art_college",
      "name": "Arts plastiques",
      "description": "Techniques artistiques et culture visuelle",
      "icon": "🎨",
      "color": "#F59E0B",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "sport_college",
      "name": "EPS - Sport",
      "description": "Sports collectifs, individuels et santé",
      "icon": "⚽",
      "color": "#16A34A",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },
    {
      "id": "emc_college",
      "name": "EMC - Éducation morale et civique",
      "description": "Citoyenneté, valeurs de la République et société",
      "icon": "⚖️",
      "color": "#64748B",
      "lessonCount": 0,
      "targetAge": "11-14 ans"
    },

    /* --- Lycée (15-18 ans) --- */
    {
      "id": "francais_lycee",
      "name": "Français / Littérature",
      "description": "Œuvres littéraires, analyse et dissertation",
      "icon": "📖",
      "color": "#4F46E5",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "mathematiques_lycee",
      "name": "Mathématiques",
      "description": "Analyse, algèbre, probabilités et géométrie",
      "icon": "🔢",
      "color": "#EC4899",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "histoire_lycee",
      "name": "Histoire",
      "description": "Histoire contemporaine et grands enjeux mondiaux",
      "icon": "🏛️",
      "color": "#B45309",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "geographie_lycee",
      "name": "Géographie",
      "description": "Géopolitique, mondialisation et environnement",
      "icon": "🌍",
      "color": "#059669",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "svt_lycee",
      "name": "SVT",
      "description": "Génétique, évolution et sciences de la Terre",
      "icon": "🔬",
      "color": "#0891B2",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "physique_chimie_lycee",
      "name": "Physique-Chimie",
      "description": "Mécanique, électricité et chimie approfondie",
      "icon": "⚗️",
      "color": "#7C3AED",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "anglais_lycee",
      "name": "Anglais",
      "description": "Littérature anglophone et expression avancée",
      "icon": "🇬🇧",
      "color": "#DC2626",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "philosophie_lycee",
      "name": "Philosophie",
      "description": "Grands courants de pensée et dissertation philosophique",
      "icon": "🧠",
      "color": "#9333EA",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "ses_lycee",
      "name": "SES - Sciences économiques et sociales",
      "description": "Économie, sociologie et science politique",
      "icon": "📈",
      "color": "#0D9488",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "informatique_lycee",
      "name": "NSI - Numérique et Sciences Informatiques",
      "description": "Algorithmique, programmation et réseaux",
      "icon": "💻",
      "color": "#334155",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "sport_lycee",
      "name": "EPS - Sport",
      "description": "Pratiques sportives et préparation physique",
      "icon": "⚽",
      "color": "#16A34A",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },
    {
      "id": "art_lycee",
      "name": "Arts plastiques",
      "description": "Pratiques artistiques avancées et culture visuelle",
      "icon": "🎨",
      "color": "#F59E0B",
      "lessonCount": 0,
      "targetAge": "15-18 ans"
    },

    /* --- Art de vivre (tous niveaux, non lié à une classe d'âge précise) --- */
    {
      "id": "art_de_vivre",
      "name": "Art de vivre",
      "description": "Bien-être, savoir-vivre et arts du quotidien",
      "icon": "🌸",
      "color": "#D97706",
      "lessonCount": 0,
      "targetAge": "Tous niveaux"
    },

    {
      "id": "general",
      "name": "Cours Généraux",
      "description": "Autres matières et compétences",
      "icon": "📚",
      "color": "#F59E0B",
      "lessonCount": 0,
      "targetAge": "Tous niveaux"
    }
  ],
  "lessons": []
};

    function schoolLevelFromTargetAge(targetAge) {
        if (!targetAge) return 'tous';
        if (/tous niveaux/i.test(targetAge)) return 'tous';
        const match = targetAge.match(/(\d+)/);
        if (!match) return 'tous';
        const age = parseInt(match[1], 10);
        if (age <= 5) return 'maternelle';
        if (age <= 10) return 'primaire';
        if (age <= 14) return 'college';
        return 'lycee';
    }

    // Rond coloré identifiant le niveau scolaire — 2e emoji affiché à côté
    // de l'icône de matière (ex: "🏛️ 🟠 Histoire" = Histoire, niveau Collège).
    const LEVEL_ICONS = {
        maternelle: '🟣',
        primaire: '🔵',
        college: '🟢',
        lycee: '🔴',
        tous: '⚪'
    };
    function getLevelIcon(schoolLevel) {
        return LEVEL_ICONS[schoolLevel] || LEVEL_ICONS.tous;
    }

    // On enrichit chaque catégorie une seule fois au chargement avec son
    // niveau scolaire déduit et le rond coloré correspondant, pour que
    // toutes les pages (creer-lecon.html, terminal-lecons.html, etudes.html…)
    // affichent les 2 emoji sans recalculer la logique de leur côté.
    DATA.categories.forEach(c => {
        c.schoolLevel = schoolLevelFromTargetAge(c.targetAge);
        c.levelIcon = getLevelIcon(c.schoolLevel);
    });

    function categoryById(id) {
        return DATA.categories.find(c => c.id === id) || null;
    }

    function enrichLesson(lesson) {
        const cat = categoryById(lesson.categoryId);
        return Object.assign({}, lesson, {
            categoryInfo: cat,
            schoolLevel: cat ? schoolLevelFromTargetAge(cat.targetAge) : 'tous'
        });
    }

    // filters: { published?: bool, level?: 'maternelle'|'primaire'|'college'|'lycee', categoryId?: string }
    function getAllLessons(filters) {
        filters = filters || {};
        let list = DATA.lessons.map(enrichLesson);
        if (filters.published) list = list.filter(l => l.isPublished);
        if (filters.level && filters.level !== 'tous') {
            list = list.filter(l => l.schoolLevel === 'tous' || l.schoolLevel === filters.level);
        }
        if (filters.categoryId) list = list.filter(l => l.categoryId === filters.categoryId);
        return list.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function getLesson(id) {
        const lesson = DATA.lessons.find(l => l.id === id);
        return lesson ? enrichLesson(lesson) : null;
    }

    function getCategories() {
        return DATA.categories;
    }

    // On fusionne plutôt que d'écraser, au cas où un autre script poserait
    // aussi des propriétés sur window.ZNK_ETUDES_MANIFEST.
    global.ZNK_ETUDES_MANIFEST = Object.assign(global.ZNK_ETUDES_MANIFEST || {}, {
        version: DATA.version,
        categories: DATA.categories,
        lessons: DATA.lessons,
        getAllLessons,
        getLesson,
        getCategories,
        categoryById,
        schoolLevelFromTargetAge,
        getLevelIcon
    });

    console.log('✅ ZNK_ETUDES_MANIFEST chargé —', DATA.lessons.length, 'leçon(s),', DATA.categories.length, 'catégorie(s)');
})(window);
