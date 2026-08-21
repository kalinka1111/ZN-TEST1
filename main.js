// main.js - ZNK System - Main process complet (modifié)
// Ajouts : handlers robustes pour persistance vidéo, notifications aux renderers,
// gestion des chemins file:// et sécurité, renforcement des retours IPC.
//
// NOTE: adapte les chemins si nécessaire pour ton environnement.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const pathHelper = require('./path-helper');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Construit une URL file:// correctement échappée (espaces, accents, etc.)
// via l'API native Node plutôt qu'un remplacement manuel de \ -> / qui ne
// gère aucun caractère spécial : cause silencieuse de médias qui ne chargent
// pas (le titre s'affiche car c'est du texte, mais <img>/<video>/<audio src=""> échoue).
const { pathToFileURL } = require('url');
function toFileUrl(p) {
    return pathToFileURL(p).href;
}
const { spawn } = require('child_process');
const os = require('os');
const ZNKUpdater = require('./updater');
const { getManifestManager } = require('./manifest-manager');
let manifestManager;

// ========================================
// FIX: userData identique en dev ET en build packagé
// ========================================
// En dev (npm start / electron .), Electron dérive app.getName() du champ
// "name" du package.json ("znk-app"). Dans le build packagé macOS,
// electron-builder écrit "productName" ("ZNK") dans l'Info.plist, et
// c'est CE nom qu'Electron lit -> app.getPath('userData') pointe alors
// vers un dossier DIFFÉRENT ("ZNK" au lieu de "znk-app"), ce qui rend
// invisibles, selon le contexte, les comptes (users.json) et le manifest
// vidéo (manifests/znk-video-manifest.json). On force donc explicitement
// le même nom dans les deux cas, AVANT toute lecture de app.getPath.
app.setPath('userData', path.join(app.getPath('appData'), 'ZNK'));
// setName conservé pour cohérence (menus, notifications système, etc.) — n'influence plus userData désormais grâce à setPath ci-dessus.
app.setName('ZNK');

// ========================================
// CONFIG PERSISTANTE : ZNK_REGISTRY_URL
// ========================================
// Problème résolu ici : sur Mac, une app lancée en double-cliquant l'icône
// (.app, Finder/Dock/Spotlight) N'HÉRITE PAS des variables d'environnement
// définies dans ~/.zshrc — ça ne marche qu'en lançant depuis un Terminal.
// Pour que ZNK_REGISTRY_URL soit toujours connu (dev ET version distribuée
// aux autres users), on ajoute un repli par fichier, stocké dans userData
// (donc conservé d'un lancement à l'autre, y compris après mise à jour de
// l'app) :
//   1) process.env.ZNK_REGISTRY_URL si déjà défini (utile en dev/Terminal,
//      priorité la plus haute pour pouvoir tester une autre adresse sans
//      toucher au fichier)
//   2) sinon la valeur sauvegardée dans znk-config.json (userData)
//   3) sinon l'adresse connue du VPS de production, en dur ci-dessous —
//      ainsi l'app fonctionne "out of the box" pour un nouvel utilisateur,
//      sans aucun réglage de sa part.
const ZNK_CONFIG_PATH = path.join(app.getPath('userData'), 'znk-config.json');
const ZNK_REGISTRY_URL_DEFAULT = 'http://194.5.157.167:5001';

function readZnkConfigFile() {
    try {
        if (fs.existsSync(ZNK_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(ZNK_CONFIG_PATH, 'utf8')) || {};
        }
    } catch (e) {
        console.warn('⚠️ znk-config.json illisible, ignoré:', e.message);
    }
    return {};
}

function writeZnkConfigFile(partial) {
    try {
        fs.mkdirSync(path.dirname(ZNK_CONFIG_PATH), { recursive: true });
        const current = readZnkConfigFile();
        const next = { ...current, ...partial };
        fs.writeFileSync(ZNK_CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
        return next;
    } catch (e) {
        console.error('❌ Écriture znk-config.json impossible:', e.message);
        return null;
    }
}

function resolveRegistryUrl() {
    if (process.env.ZNK_REGISTRY_URL) return process.env.ZNK_REGISTRY_URL;
    const fromFile = readZnkConfigFile().registryUrl;
    if (fromFile) return fromFile;
    return ZNK_REGISTRY_URL_DEFAULT;
}

// Même problème et même solution que ZNK_REGISTRY_URL ci-dessus : une app
// lancée en double-cliquant l'icône (.app packagée) n'hérite d'aucune
// variable d'environnement de shell (~/.zshrc, export ZNK_API_KEY=...).
// On persiste donc la clé dans znk-config.json (userData) via
// set-admin-api-key, à faire une seule fois par device (voir ce handler
// IPC plus bas). Contrairement à ZNK_REGISTRY_URL, pas de valeur par
// défaut en dur : une clé API n'a rien à faire codée dans le binaire.
function resolveApiKey() {
    if (process.env.ZNK_API_KEY) return process.env.ZNK_API_KEY;
    const fromFile = readZnkConfigFile().apiKey;
    if (fromFile) return fromFile;
    return null;
}
if (!process.env.ZNK_API_KEY) {
    const resolvedKey = resolveApiKey();
    if (resolvedKey) process.env.ZNK_API_KEY = resolvedKey;
}

// On fixe process.env.ZNK_REGISTRY_URL dès maintenant (si pas déjà défini)
// pour que TOUT le reste du code — y compris tout futur spawn de processus
// enfant qui hérite de process.env — voie la même valeur de façon cohérente,
// sans avoir à repasser par resolveRegistryUrl() partout.
if (!process.env.ZNK_REGISTRY_URL) {
    process.env.ZNK_REGISTRY_URL = resolveRegistryUrl();
}

// ========================================
// SEED : contenu vidéo initial embarqué dans le build (premier lancement)
// ========================================
// Au tout premier lancement (userData vierge), copie le manifest + les vidéos
// bundlés dans le build (assets/seed-manifests, assets/videos-seed) vers
// userData, pour que ACTV affiche du contenu même sans connexion. Les mises à
// jour ultérieures passeront par le VPS (znk-sync-client.js), pas par ce seed.
// Résolveur dédié au seed initial : cherche dans assets/ en dev (là où les
// dossiers seed-manifests/ et videos-seed/ sont réellement créés dans le
// projet), et à la racine de resourcesPath en build packagé (là où
// electron-builder les copie via extraResources, sans sous-dossier 'app').
function getSeedResourcePath(relativePath) {
    if (!app.isPackaged) {
        return path.join(__dirname, 'assets', relativePath);
    }
    return path.join(process.resourcesPath, relativePath);
}

// Pour les ressources à la racine du projet gérées par extraResources
// (persistent-audios/, bin/...) — PAS sous assets/, contrairement au seed.
// En dev : __dirname/relativePath. En build packagé : à côté de app.asar,
// jamais À L'INTÉRIEUR (où vivent les pages HTML type radio.html, d'où
// l'échec des fetch() relatifs une fois packagé).
function getResourcesPath(relativePath) {
    if (!app.isPackaged) {
        return path.join(__dirname, relativePath);
    }
    return path.join(process.resourcesPath, relativePath);
}

function seedInitialContentIfEmpty() {
    const manifestsFolder = path.join(app.getPath('userData'), 'manifests');
    const videoManifestPath = path.join(manifestsFolder, 'znk-video-manifest.json');
    const persistentVideosFolder = path.join(app.getPath('userData'), 'persistent-videos');

    console.log('🔎 [SEED] videoManifestPath:', videoManifestPath);
    console.log('🔎 [SEED] existe déjà ?', fs.existsSync(videoManifestPath));

    if (fs.existsSync(videoManifestPath)) {
        console.log('🔎 [SEED] Abandon : manifest déjà présent (pas un premier lancement).');
        return;
    }

    try {
        const seedManifestPath = getSeedResourcePath(path.join('seed-manifests', 'znk-video-manifest.json'));
        const seedVideosFolder = getSeedResourcePath('videos-seed');

        console.log('🔎 [SEED] seedManifestPath:', seedManifestPath, '| existe ?', fs.existsSync(seedManifestPath));
        console.log('🔎 [SEED] seedVideosFolder:', seedVideosFolder, '| existe ?', fs.existsSync(seedVideosFolder));

        if (fs.existsSync(seedManifestPath)) {
            fs.mkdirSync(manifestsFolder, { recursive: true });
            fs.copyFileSync(seedManifestPath, videoManifestPath);
            console.log('✅ Manifest vidéos initial copié depuis le pack bundlé');
        }
        if (fs.existsSync(seedVideosFolder)) {
            fs.mkdirSync(persistentVideosFolder, { recursive: true });
            fs.cpSync(seedVideosFolder, persistentVideosFolder, { recursive: true });
            console.log('✅ Vidéos persistantes initiales copiées depuis le pack bundlé');
        }
    } catch (error) {
        console.error('seedInitialContentIfEmpty error:', error);
    }

    // Images/documents de leçons (persistent-materials) : même logique que l'audio.
    try {
        const materialsFolder = path.join(app.getPath('userData'), 'persistent-materials');
        const seedMaterialsFolder = getSeedResourcePath('materials-seed');
        console.log('🔎 [SEED] seedMaterialsFolder:', seedMaterialsFolder, '| existe ?', fs.existsSync(seedMaterialsFolder));

        if (fs.existsSync(seedMaterialsFolder)) {
            fs.mkdirSync(materialsFolder, { recursive: true });
            const existing = fs.existsSync(materialsFolder) ? fs.readdirSync(materialsFolder) : [];
            if (existing.length === 0) {
                fs.cpSync(seedMaterialsFolder, materialsFolder, { recursive: true });
                console.log('✅ Matériaux de leçons initiaux copiés depuis le pack bundlé');
            }
        }
    } catch (error) {
        console.error('seedInitialContentIfEmpty (materials) error:', error);
    }

    // Audio persistant générique (pistes ajoutées via "add-audio") : copie
    // physique des fichiers, sans manifest — get-audio-url les retrouve par
    // nom directement dans le dossier, comme pour les vidéos.
    try {
        const audioFolder = path.join(app.getPath('userData'), 'persistent-audio');
        const seedAudioFolder = getSeedResourcePath('audio-seed');
        console.log('🔎 [SEED] seedAudioFolder:', seedAudioFolder, '| existe ?', fs.existsSync(seedAudioFolder));

        if (fs.existsSync(seedAudioFolder)) {
            fs.mkdirSync(audioFolder, { recursive: true });
            const existing = fs.existsSync(audioFolder) ? fs.readdirSync(audioFolder) : [];
            if (existing.length === 0) {
                fs.cpSync(seedAudioFolder, audioFolder, { recursive: true });
                console.log('✅ Audios persistants initiaux copiés depuis le pack bundlé');
            }
        }
    } catch (error) {
        console.error('seedInitialContentIfEmpty (audio) error:', error);
    }
    // main.js (pas via localStorage), donc seed direct fichier-à-fichier.
    try {
        const profDataPath = path.join(app.getPath('userData'), 'znk-professeur-data.json');
        console.log('🔎 [SEED] profDataPath:', profDataPath, '| existe déjà ?', fs.existsSync(profDataPath));

        if (!fs.existsSync(profDataPath)) {
            const seedProfDataPath = getSeedResourcePath(path.join('seed-manifests', 'znk-professeur-data-seed.json'));
            console.log('🔎 [SEED] seedProfDataPath:', seedProfDataPath, '| existe ?', fs.existsSync(seedProfDataPath));
            if (fs.existsSync(seedProfDataPath)) {
                fs.copyFileSync(seedProfDataPath, profDataPath);
                console.log('✅ Leçons initiales copiées depuis le pack bundlé');
            }
        }
    } catch (error) {
        console.error('seedInitialContentIfEmpty (leçons) error:', error);
    }
}

// Mode "classe locale" (école/village isolé, sans internet, sans Python) :
// voir la section NŒUD CLASSE LOCALE plus bas pour le câblage IPC.
const {
    startClassroomServer, stopClassroomServer, classroomAddEleve, classroomListEleves,
    classroomPublishDevoir, classroomListDevoirsSince, classroomRequest
} = require('./znk-classroom-server');
const { startClassroomAnnounce, stopClassroomAnnounce, discoverClassroomServer } = require('./znk-classroom-discovery');
let classroomInfo = null; // { port, classeId, nom, niveau, profId } si CE PC est le serveur de la classe


// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const copyFile = promisify(fs.copyFile);
const access = promisify(fs.access);

let mainWindow;
let userStorage;
let updater;

// ========================================
// UTILITAIRES FS
// ========================================
async function ensureDir(dirPath) {
    try {
        await access(dirPath);
    } catch {
        await mkdir(dirPath, { recursive: true });
    }
}

async function pathExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function copy(source, dest) {
    try {
        await ensureDir(path.dirname(dest));
        await copyFile(source, dest);
    } catch (error) {
        throw new Error(`Erreur copie ${source} vers ${dest}: ${error.message}`);
    }
}

// ========================================
// PATHS / CONFIG
// ========================================
const PATHS = {
    convertedVideos: null,
    persistentVideos: null,
    assetsVideos: null,
    persistentMaterials: null,
    whisperTemp: null // fichiers audio temporaires (webm -> wav) pour la transcription locale
};

const AUDIO_PATHS = {
    audioFolder: null,
    persistentAudio: null
};

const RADIO_PATHS = {
    userManifest: null,
    officialCache: null
};

function initializePaths() {
    PATHS.convertedVideos = path.join(app.getPath('userData'), 'converted-videos');
    PATHS.persistentVideos = path.join(app.getPath('userData'), 'persistent-videos');

    if (!app.isPackaged) {
        PATHS.assetsVideos = path.join(__dirname, 'assets', 'videos');
    } else {
        PATHS.assetsVideos = path.join(process.resourcesPath, 'app', 'assets', 'videos');
    }

    AUDIO_PATHS.audioFolder = path.join(__dirname, 'znkAudio');
    AUDIO_PATHS.persistentAudio = path.join(app.getPath('userData'), 'persistent-audio');

    // Manifeste radio MEMBRES : contrairement au catalogue admin (bundlé au
    // build via sync-to-build, donc légitimement dans process.resourcesPath),
    // ce que publie un membre est écrit À L'EXÉCUTION sur SA machine — il ne
    // doit donc jamais vivre dans process.resourcesPath (dossier du bundle,
    // non fiable en écriture runtime, et écrasé/figé au moment du build).
    // radio.html lit ce fichier via IPC (getRadioUserManifest), pas fetch(),
    // donc le déplacer vers userData ne casse rien côté lecture.
    RADIO_PATHS.userManifest = path.join(app.getPath('userData'), 'radio', 'user-audio-manifest.json');
    RADIO_PATHS.officialCache = path.join(app.getPath('userData'), 'radio', 'official-catalog-cache.json');

    PATHS.persistentMaterials = path.join(app.getPath('userData'), 'persistent-materials');
    PATHS.whisperTemp = path.join(app.getPath('userData'), 'whisper-temp');
}

async function initializeFolders() {
    initializePaths();
    seedInitialContentIfEmpty();

    for (const folder of Object.values(PATHS)) {
        if (folder) {
            try {
                await ensureDir(folder);
                console.log(`✅ Dossier créé/ok: ${folder}`);
            } catch (err) {
                console.warn('Erreur ensureDir PATHS:', folder, err && err.message);
            }
        }
    }

    for (const folder of Object.values(AUDIO_PATHS)) {
        if (folder) {
            try {
                await ensureDir(folder);
                console.log(`✅ Dossier audio créé/ok: ${folder}`);
            } catch (err) {
                console.warn('Erreur ensureDir AUDIO_PATHS:', folder, err && err.message);
            }
        }
    }
}

// ========================================
// CONVERSION PROFILES & FFMPEG
// ========================================
// crf: échelle VP9 (0-63, plus bas = meilleure qualité) — ne pas réutiliser les
// valeurs x264 (0-51), l'échelle et la perception ne correspondent pas.
// cpuUsed: vitesse d'encodage VP9 (0=lent/meilleure compression, 5=rapide/plus gros fichiers).
// videoBitrate reste un plafond indicatif (VBR contraint), b:v réel passé à 0 en mode CRF pur.
const CONVERSION_PROFILES = {
    light: { resolution: '1280x720', fps: 24, videoBitrate: '1000k', audioBitrate: '96k', cpuUsed: 4, crf: 34 },
    medium: { resolution: '1920x1080', fps: 30, videoBitrate: '1800k', audioBitrate: '128k', cpuUsed: 2, crf: 30 },
    high: { resolution: '1920x1080', fps: 30, videoBitrate: '3000k', audioBitrate: '160k', cpuUsed: 1, crf: 24 }
};

// Remplacer la fonction getAssetPath existante par celle-ci :

function getAssetPath(filename) {
    // En mode développement
    if (!app.isPackaged) {
        return path.join(__dirname, filename);
    }

    // En mode packagé
    // Les fichiers dans l'ASAR sont accessibles via __dirname
    const asarPath = path.join(__dirname, filename);

    // Si le fichier existe dans l'ASAR, l'utiliser
    if (fs.existsSync(asarPath)) {
        console.log(`✅ Asset trouvé dans ASAR: ${filename}`);
        return asarPath;
    }

    // Sinon, chercher dans extraResources/app
       const resourcePath = path.join(process.resourcesPath, 'app', filename);
    if (fs.existsSync(resourcePath)) {
        console.log(`✅ Asset trouvé dans extraResources: ${filename}`);
        return resourcePath;
    }


    // Fallback : retourner le chemin ASAR par défaut
    console.warn(`Asset non trouvé: ${filename}, utilisation du chemin ASAR`);
    return asarPath;
}

function getBinPath(binaryName) {
    // Les binaires sont toujours dans extraResources/bin
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', binaryName);
    }
    return path.join(__dirname, 'bin', binaryName);
}

// Nouvelle fonction pour les chemins assets spécifiques (vidéos, audio, etc.)
function getExtraResourcePath(relativePath) {
    if (!app.isPackaged) {
        return path.join(__dirname, relativePath);
    }
    return path.join(process.resourcesPath, 'app', relativePath);
}

// ⚠️ voir la définition originale d'initializePaths() plus haut dans ce
// fichier — c'est elle qui est réellement appelée ; une redéfinition
// dormante identique en pratique se trouvait ici, retirée pour éviter la confusion.

// ========================================
// TRANSCRIPTION VOCALE LOCALE (whisper.cpp) — 100% offline, pas de Python
// ========================================
// Binaire whisper-cli embarqué exactement comme ffmpeg ci-dessus : à placer
// dans bin/whisper-cli (mac) et bin/whisper-cli.exe (win), livré via
// extraResources dans electron-builder (même dossier "bin" que ffmpeg).
function getWhisperBinPath() {
    const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    return getBinPath(name);
}

// Binaires PyInstaller pour server.py et znk_p2p_protocol.py — même logique
// que whisper-cli/ffmpeg ci-dessus : évite toute dépendance à un Python
// installé sur la machine de l'utilisateur (voir startLocalIaServer et
// startP2PNode plus bas, qui basculent automatiquement sur ces binaires
// quand ils sont présents, et ne retombent sur `python3 script.py` que pour
// le développement local).
function getServerBinPath() {
    const name = process.platform === 'win32' ? 'znk-server.exe' : 'znk-server';
    return getBinPath(name);
}
function getP2PBinPath() {
    const name = process.platform === 'win32' ? 'znk-p2p-node.exe' : 'znk-p2p-node';
    return getBinPath(name);
}

// Modèle GGML (ex: ggml-small.bin) — plus embarqué dans l'installateur
// (l'ancien extraResources faisait dépasser la limite de 2 Go des
// installateurs Windows/NSIS). Téléchargé à la demande dans userData/models/
// depuis R2, puis réutilisé à chaque lancement suivant (mis en cache).
function getModelPath(filename) {
    return path.join(app.getPath('userData'), 'models', filename);
}

// Le modèle est hébergé en 2 morceaux sur R2 (250 Mo chacun, limite du
// dashboard web Cloudflare) : ggml-small.bin.part-aa et part-ab.
const ZNK_MODEL_PARTS = [
    'https://cdn.znk.systems/models/ggml-small.bin.part-aa',
    'https://cdn.znk.systems/models/ggml-small.bin.part-ab'
];

function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const file = fs.createWriteStream(destPath);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                reject(new Error(`Échec du téléchargement (HTTP ${response.statusCode}) : ${url}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            let downloaded = 0;

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                if (onProgress && totalSize > 0) {
                    onProgress(Math.round((downloaded / totalSize) * 100));
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => resolve(destPath));
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// Télécharge les morceaux du modèle s'il n'est pas déjà présent en cache
// local, les recolle en un seul fichier, puis nettoie les morceaux
// temporaires. Retourne le chemin local une fois le fichier prêt à l'emploi.
async function ensureModelDownloaded(filename, onProgress) {
    const destPath = getModelPath(filename);

    if (fs.existsSync(destPath)) {
        return destPath;
    }

    await ensureDir(path.dirname(destPath));

    console.log(`⬇️  Téléchargement du modèle ${filename} (${ZNK_MODEL_PARTS.length} morceaux)...`);

    const partPaths = [];
    for (let i = 0; i < ZNK_MODEL_PARTS.length; i++) {
        const partPath = `${destPath}.part-${i}`;
        await downloadFile(ZNK_MODEL_PARTS[i], partPath, (pct) => {
            if (onProgress) {
                // Progression globale répartie sur l'ensemble des morceaux
                const overall = Math.round(((i + pct / 100) / ZNK_MODEL_PARTS.length) * 100);
                onProgress(overall);
            }
        });
        partPaths.push(partPath);
        console.log(`✅ Morceau ${i + 1}/${ZNK_MODEL_PARTS.length} téléchargé.`);
    }

    // Recolle les morceaux dans l'ordre, en streaming (évite de tout
    // charger en mémoire d'un coup pour un fichier de ~490 Mo).
    console.log('🔧 Assemblage des morceaux...');
    const tempPath = `${destPath}.download`;
    const outStream = fs.createWriteStream(tempPath);
    for (const partPath of partPaths) {
        await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(partPath);
            readStream.pipe(outStream, { end: false });
            readStream.on('end', resolve);
            readStream.on('error', reject);
        });
    }
    outStream.end();
    await new Promise((resolve) => outStream.on('finish', resolve));

    // Nettoie les morceaux temporaires
    for (const partPath of partPaths) {
        fs.unlink(partPath, () => {});
    }

    return new Promise((resolve, reject) => {
        fs.rename(tempPath, destPath, (err) => {
            if (err) reject(err);
            else {
                console.log(`✅ Modèle ${filename} prêt (assemblé depuis ${ZNK_MODEL_PARTS.length} morceaux).`);
                resolve(destPath);
            }
        });
    });
}

function getFFmpegPathList() {
    const platform = process.platform;
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const paths = [getBinPath(ffmpegName)];
    if (platform === 'win32') {
        paths.push('C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\ffmpeg\\bin\\ffmpeg.exe', 'ffmpeg.exe');
    } else if (platform === 'darwin') {
        paths.push('/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg');
    } else {
        paths.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg');
    }
    return paths;
}

async function findFFmpeg() {
    const paths = getFFmpegPathList();
    for (const p of paths) {
        try {
            await new Promise((resolve, reject) => {
                const pr = spawn(p, ['-version']);
                pr.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
                pr.on('error', reject);
                setTimeout(() => reject(new Error('Timeout')), 5000);
            });
            return p;
        } catch (e) {
            continue;
        }
    }
    throw new Error('FFmpeg non trouvé');
}

async function convertVideo(inputPath, outputPath, profile, progressCallback) {
    const ffmpegPath = await findFFmpeg();
    const profileConfig = CONVERSION_PROFILES[profile];
    if (!profileConfig) throw new Error(`Profil inconnu: ${profile}`);

    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputPath,
            '-vf', `scale=${profileConfig.resolution}:force_original_aspect_ratio=decrease,fps=${profileConfig.fps}`,
            '-c:v', 'libvpx-vp9',
            '-crf', String(profileConfig.crf),
            '-b:v', profileConfig.videoBitrate, // plafond VBR ; retirer cette ligne + mettre '-b:v','0' pour du CRF pur (fichiers plus variables)
            '-cpu-used', String(profileConfig.cpuUsed),
            '-row-mt', '1',
            '-c:a', 'libopus',
            '-b:a', profileConfig.audioBitrate,
            '-pix_fmt', 'yuv420p',
            '-y', outputPath
        ];

        const ffmpeg = spawn(ffmpegPath, args);
        let duration = 0;

        ffmpeg.stderr.on('data', data => {
            const output = data.toString();
            const dur = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (dur) {
                const hours = parseInt(dur[1]); const minutes = parseInt(dur[2]); const seconds = parseFloat(dur[3]);
                duration = hours * 3600 + minutes * 60 + seconds;
            }
            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch && duration > 0) {
                const h = parseInt(timeMatch[1]); const m = parseInt(timeMatch[2]); const s = parseFloat(timeMatch[3]);
                const current = h * 3600 + m * 60 + s;
                const progress = Math.min(100, Math.floor((current / duration) * 100));
                progressCallback && progressCallback({ progress, currentTime: current, duration });
            }
        });

        ffmpeg.on('close', code => {
            if (code === 0) resolve({ success: true, outputPath });
            else reject(new Error(`Conversion échouée (code ${code})`));
        });

        ffmpeg.on('error', err => reject(err));
    });
}

// ========================================
// EXPORT VITESSE (ZNKVitesseVideo) — setpts (vidéo) + atempo (audio)
// ========================================
// atempo ne supporte que 0.5–2.0 par instance ffmpeg : on chaîne plusieurs
// atempo pour couvrir toute la plage 0.25×–4× exposée par le fader.
function buildAtempoFilter(speed) {
    const filters = [];
    let remaining = speed;
    if (remaining < 0.5 - 1e-9) {
        while (remaining < 0.5 - 1e-9) { filters.push('atempo=0.5'); remaining = remaining / 0.5; }
        filters.push(`atempo=${remaining.toFixed(6)}`);
    } else if (remaining > 2.0 + 1e-9) {
        while (remaining > 2.0 + 1e-9) { filters.push('atempo=2.0'); remaining = remaining / 2.0; }
        filters.push(`atempo=${remaining.toFixed(6)}`);
    } else {
        filters.push(`atempo=${remaining.toFixed(6)}`);
    }
    return filters.join(',');
}

async function changeVideoSpeed(inputPath, outputPath, speed, progressCallback, format = 'webm') {
    const ffmpegPath = await findFFmpeg();
    const atempo = buildAtempoFilter(speed);
    const vf = `setpts=PTS/${speed}`;

    const codecArgs = format === 'mp4'
        ? { v: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'], a: ['-c:a', 'aac'] }
        : { v: ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '1800k', '-cpu-used', '2', '-row-mt', '1', '-pix_fmt', 'yuv420p'], a: ['-c:a', 'libopus', '-b:a', '128k'] };

    const withAudioArgs = [
        '-y', '-i', inputPath,
        '-filter_complex', `[0:v]${vf}[v];[0:a]${atempo}[a]`,
        '-map', '[v]', '-map', '[a]',
        ...codecArgs.v, ...codecArgs.a,
        outputPath
    ];
    const noAudioArgs = [
        '-y', '-i', inputPath,
        '-filter_complex', `[0:v]${vf}[v]`,
        '-map', '[v]',
        ...codecArgs.v,
        '-an',
        outputPath
    ];

    function run(args, allowFallback) {
        return new Promise((resolve, reject) => {
            const ff = spawn(ffmpegPath, args);
            let duration = 0;
            let stderrBuf = '';

            ff.stderr.on('data', data => {
                const output = data.toString();
                stderrBuf += output;
                const dur = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (dur) {
                    const hours = parseInt(dur[1]); const minutes = parseInt(dur[2]); const seconds = parseFloat(dur[3]);
                    duration = hours * 3600 + minutes * 60 + seconds;
                }
                const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (timeMatch && duration > 0) {
                    const h = parseInt(timeMatch[1]); const m = parseInt(timeMatch[2]); const s = parseFloat(timeMatch[3]);
                    const current = h * 3600 + m * 60 + s;
                    const progress = Math.min(100, Math.floor((current / duration) * 100));
                    progressCallback && progressCallback({ progress, currentTime: current, duration });
                }
            });

            ff.on('close', code => {
                if (code === 0) return resolve({ success: true, outputPath });
                if (allowFallback) return resolve(run(noAudioArgs, false));
                reject(new Error(`Export vitesse échoué (code ${code}): ${stderrBuf.slice(-400)}`));
            });

            ff.on('error', err => reject(err));
        });
    }

    return run(withAudioArgs, true);
}

// ========================================
// EXPORT FONDU (ZNKFadeVideo) — xfade natif, deux vidéos -> un seul .mp4
// ========================================
// Toujours un fondu enchaîné classique ("fade"), jamais de passage par le
// noir/blanc : cohérent avec l'aperçu du renderer, qui ne fait qu'un simple
// crossfade d'opacité. Voir ZNKFadeVideo.html/transitionForIntensity pour
// la même décision côté ffmpeg.wasm.
function ffprobeDuration(ffmpegPath, filePath) {
    return new Promise((resolve, reject) => {
        const pr = spawn(ffmpegPath, ['-i', filePath]);
        let stderr = '';
        pr.stderr.on('data', d => { stderr += d.toString(); });
        pr.on('close', () => {
            const m = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (!m) return reject(new Error('Durée introuvable (ffmpeg -i): ' + stderr.slice(-300)));
            const h = parseInt(m[1]); const mi = parseInt(m[2]); const s = parseFloat(m[3]);
            resolve(h * 3600 + mi * 60 + s);
        });
        pr.on('error', reject);
    });
}

async function changeVideoFade(pathA, pathB, outputPath, { fadeDuration, progressCallback, format = 'webm' } = {}) {
    const ffmpegPath = await findFFmpeg();

    const [durA, durB] = await Promise.all([
        ffprobeDuration(ffmpegPath, pathA),
        ffprobeDuration(ffmpegPath, pathB)
    ]);

    const maxFade = Math.max(0.1, Math.min(durA, durB) - 0.05);
    const fd = Math.max(0.1, Math.min(Number(fadeDuration) || 1.5, maxFade));
    const offset = Math.max(0, durA - fd);
    const totalDuration = durA + durB - fd; // estimation pour la progression

    const filterComplex =
        `[0:v][1:v]xfade=transition=fade:duration=${fd.toFixed(3)}:offset=${offset.toFixed(3)}[vout];` +
        `[0:a][1:a]acrossfade=d=${fd.toFixed(3)}:curve1=tri:curve2=tri[aout]`;

    const codecArgs = format === 'mp4'
        ? { v: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'], a: ['-c:a', 'aac'] }
        : { v: ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '1800k', '-cpu-used', '2', '-row-mt', '1', '-pix_fmt', 'yuv420p'], a: ['-c:a', 'libopus', '-b:a', '128k'] };

    function run(withAudio) {
        return new Promise((resolve, reject) => {
            const args = withAudio
                ? ['-y', '-i', pathA, '-i', pathB,
                   '-filter_complex', filterComplex,
                   '-map', '[vout]', '-map', '[aout]',
                   ...codecArgs.v, ...codecArgs.a, outputPath]
                : ['-y', '-i', pathA, '-i', pathB,
                   '-filter_complex', `[0:v][1:v]xfade=transition=fade:duration=${fd.toFixed(3)}:offset=${offset.toFixed(3)}[vout]`,
                   '-map', '[vout]',
                   ...codecArgs.v,
                   '-an', outputPath];

            const ff = spawn(ffmpegPath, args);
            let stderrBuf = '';
            ff.stderr.on('data', data => {
                const output = data.toString();
                stderrBuf += output;
                const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (timeMatch && totalDuration > 0) {
                    const h = parseInt(timeMatch[1]); const m = parseInt(timeMatch[2]); const s = parseFloat(timeMatch[3]);
                    const current = h * 3600 + m * 60 + s;
                    const progress = Math.min(100, Math.floor((current / totalDuration) * 100));
                    progressCallback && progressCallback({ progress });
                }
            });
            ff.on('close', code => {
                if (code === 0) return resolve({ success: true, outputPath });
                if (withAudio) return resolve(run(false)); // repli sans audio si l'acrossfade échoue
                reject(new Error(`Export fondu échoué (code ${code}): ${stderrBuf.slice(-400)}`));
            });
            ff.on('error', reject);
        });
    }

    return run(true);
}

// ========================================
// EXPORT TRANSITIONS PHOTO (ZNKTransitions) — exécuteur ffmpeg générique
// ========================================
// Contrairement à changeVideoFade ci-dessus, ce handler ne connaît AUCUN
// détail des effets (tournoiement, vague, éclat, etc.) : le renderer
// construit lui-même la chaîne filter_complex complète (même fonction JS
// que pour le repli ffmpeg.wasm, donc zéro risque de divergence entre les
// deux moteurs) et main.js se contente de lancer un vrai ffmpeg avec.
// bgVideoPath (optionnel) : vidéo d'arrière-plan, fournie en 3ᵉ entrée
// ([2:v] dans le filterComplex) quand ZNKTransitions.html l'utilise comme
// fond (incrustation chroma key faite côté renderer). Bouclée automatiquement
// si plus courte que la transition (-stream_loop -1).
function runTransitionFFmpeg(pathA, pathB, outputPath, { durationA, durationB, totalDuration, filterComplex, bgVideoPath, progressCallback } = {}) {
    return new Promise(async (resolve, reject) => {
        let ffmpegPath;
        try { ffmpegPath = await findFFmpeg(); } catch (e) { return reject(e); }

        const args = [
            '-y',
            '-loop', '1', '-t', String(durationA), '-i', pathA,
            '-loop', '1', '-t', String(durationB), '-i', pathB,
        ];
        if (bgVideoPath) {
            args.push('-stream_loop', '-1', '-i', bgVideoPath);
        }
        args.push(
            '-filter_complex', filterComplex,
            '-map', '[vout]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-an', outputPath
        );

        const ff = spawn(ffmpegPath, args);
        let stderrBuf = '';
        ff.stderr.on('data', data => {
            const output = data.toString();
            stderrBuf += output;
            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch && totalDuration > 0) {
                const h = parseInt(timeMatch[1]); const m = parseInt(timeMatch[2]); const s = parseFloat(timeMatch[3]);
                const current = h * 3600 + m * 60 + s;
                const progress = Math.min(100, Math.floor((current / totalDuration) * 100));
                progressCallback && progressCallback({ progress });
            }
        });
        ff.on('close', code => {
            if (code === 0) return resolve({ success: true, outputPath });
            reject(new Error(`Export transition échoué (code ${code}): ${stderrBuf.slice(-500)}`));
        });
        ff.on('error', reject);
    });
}

// Conversion webm/opus (MediaRecorder) -> wav 16kHz mono, format attendu par
// whisper.cpp. Réutilise le même ffmpeg que convertVideo ci-dessus.
async function convertAudioToWav(inputPath, outputPath) {
    const ffmpegPath = await findFFmpeg();
    return new Promise((resolve, reject) => {
        const args = ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', outputPath];
        const ffmpeg = spawn(ffmpegPath, args);
        let stderr = '';
        ffmpeg.stderr.on('data', d => { stderr += d.toString(); });
        ffmpeg.on('close', code => {
            if (code === 0) resolve(outputPath);
            else reject(new Error(`Conversion audio échouée (code ${code}): ${stderr.slice(-400)}`));
        });
        ffmpeg.on('error', reject);
    });
}

// Transcription locale via whisper-cli (whisper.cpp), aucune connexion requise.
// Écrit un .txt à côté du .wav (-otxt / -of) plutôt que de parser stdout,
// pour ne pas dépendre du format des logs affichés par le binaire.
async function runWhisperTranscription(wavPath, { language = 'fr', modelFile = 'ggml-small.bin' } = {}) {
    const whisperBin = getWhisperBinPath();
    if (!fs.existsSync(whisperBin)) {
        throw new Error(`Binaire whisper-cli introuvable: ${whisperBin}`);
    }
    // Le modèle n'est plus embarqué dans l'installateur (trop volumineux
    // pour NSIS/Windows) — on le télécharge à la demande, une seule fois,
    // puis il reste en cache pour tous les usages suivants.
    const modelPath = await ensureModelDownloaded(modelFile);

    const outPrefix = wavPath.replace(/\.wav$/i, '');
    return new Promise((resolve, reject) => {
        const args = [
            '-m', modelPath,
            '-f', wavPath,
            '-l', language,
            '-nt',         // pas de timestamps dans le texte
            '-np',         // pas de logs de progression sur stdout/stderr
            '-otxt',       // écrit <outPrefix>.txt
            '-of', outPrefix,
            '-ng'          // désactive le GPU (Metal) — confirmé nécessaire sur les
                            // anciens GPU Intel (ex: Iris Plus 640, Mac 2017) : le calcul
                            // via Metal y échoue silencieusement (0 segment produit, sans
                            // erreur ni crash), le CPU pur fonctionne correctement.
        ];
        const wp = spawn(whisperBin, args);
        let stderr = '';
        wp.stderr.on('data', d => { stderr += d.toString(); });
        wp.on('close', async (code) => {
            try {
                const txtPath = `${outPrefix}.txt`;
                if (code === 0 && fs.existsSync(txtPath)) {
                    const text = (await fs.promises.readFile(txtPath, 'utf-8')).trim();
                    fs.promises.unlink(txtPath).catch(() => {});
                    resolve(text);
                } else {
                    reject(new Error(`whisper-cli a échoué (code ${code}): ${stderr.slice(-400)}`));
                }
            } catch (e) {
                reject(e);
            }
        });
        wp.on('error', reject);
    });
}

// ========================================
// NATIVE UI STATUS
// ========================================
function updateNativeConversionStatus({ progress = 0, fileName = '', state = 'progress' } = {}) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
        if (state === 'progress') mainWindow.setProgressBar(Math.max(0, Math.min(1, progress / 100)));
        else if (state === 'done' || state === 'idle') mainWindow.setProgressBar(-1);
        else if (state === 'error') mainWindow.setProgressBar(2);

        const baseTitle = 'ZNK SmartHub';
        if (state === 'progress') mainWindow.setTitle(`${baseTitle} — Conversion: ${fileName} — ${progress}%`);
        else if (state === 'done') mainWindow.setTitle(`${baseTitle} — Conversion terminée`);
        else if (state === 'error') mainWindow.setTitle(`${baseTitle} — Erreur conversion`);
        else mainWindow.setTitle(baseTitle);

        if (process.platform === 'darwin') {
            if (state === 'progress') app.dock.setBadge(String(Math.round(progress)) + '%');
            else if (state === 'done') app.dock.setBadge('');
            else if (state === 'error') app.dock.setBadge('!');
            else app.dock.setBadge('');
        }

    } catch (e) {
        console.warn('updateNativeConversionStatus failed', e);
    }
}

// ========================================
// WINDOW CREATION
// ========================================
function createWindow() {
    const allowLegacy = process.env.ZNK_ALLOW_LEGACY === '1';
    const webPreferences = {
        nodeIntegration: allowLegacy ? true : false,
        contextIsolation: allowLegacy ? false : true,
        enableRemoteModule: false,
        webSecurity: false
    };

    const preloadPath = getAssetPath('preload.js');
    console.log('🔎 [DIAG] preloadPath calculé:', preloadPath);
    console.log('🔎 [DIAG] fs.existsSync(preloadPath):', fs.existsSync(preloadPath));
    console.log('🔎 [DIAG] __dirname:', __dirname);
    console.log('🔎 [DIAG] contextIsolation:', webPreferences.contextIsolation, '| nodeIntegration:', webPreferences.nodeIntegration, '| ZNK_ALLOW_LEGACY:', process.env.ZNK_ALLOW_LEGACY);
    if (fs.existsSync(preloadPath)) {
        webPreferences.preload = preloadPath;
    } else {
        console.error('❌ [DIAG] preload.js INTROUVABLE à ce chemin — electronAPI ne sera JAMAIS injecté.');
    }
    // Nécessaire pour que les modules admin (ex: terminal-ZNK.html) chargés en <webview>
    // dans ZNKadminDash.html puissent recevoir leur propre preload (electronAPI).
    webPreferences.webviewTag = true;
    // Mémorisé pour le handler IPC 'get-preload-path' (utilisé par les <webview>)
    global.__znkPreloadPath = preloadPath;

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        webPreferences,
        backgroundColor: '#0a0a0a',
        title: 'ZNK SmartHub',
        show: false
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadFile(getAssetPath('index.html')).catch(err => {
        console.error('Erreur load index:', err);
        mainWindow.loadFile(getAssetPath('auth-hub.html'));
    });

    // window.open() (ex: openAdminPublish() dans radio.html, qui ouvre
    // admin-publish-radio.html / user-publish-radio.html dans une nouvelle
    // fenêtre) crée par défaut une fenêtre Electron SANS preload : le
    // popup n'hérite PAS des webPreferences de la fenêtre parente. Sans ce
    // handler, window.electronAPI est undefined dans ces popups, ce qui
    // cassait silencieusement makeAudioPersistent / radioSaveEmission et
    // laissait ces outils publier des émissions avec des pistes jamais
    // persistées correctement.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => ({
        action: 'allow',
        overrideBrowserWindowOptions: {
            webPreferences: {
                ...webPreferences,
                preload: preloadPath
            }
        }
    }));

    if (process.env.NODE_ENV === 'development') mainWindow.webContents.openDevTools();

    // Retirer l'entrée de menu ne suffit pas : Electron/Chromium garde par
    // défaut les raccourcis natifs (F12, Ctrl+Shift+I, Cmd+Opt+I) actifs
    // même sans accélérateur de menu. On les bloque explicitement hors
    // mode dev, et on ferme DevTools par sécurité s'il s'ouvre malgré tout
    // (ex: menu contextuel "Inspecter").
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (isDevMode()) return;
        const key = (input.key || '').toLowerCase();
        const isF12 = key === 'f12';
        const isCtrlShiftI = input.control && input.shift && key === 'i';
        const isCmdOptI = input.meta && input.alt && key === 'i';
        if (isF12 || isCtrlShiftI || isCmdOptI) event.preventDefault();
    });
    mainWindow.webContents.on('devtools-opened', () => {
        if (!isDevMode()) mainWindow.webContents.closeDevTools();
    });

    createMenu();
}

function isDevMode() {
    return process.env.NODE_ENV === 'development' || !app.isPackaged || fs.existsSync(path.join(__dirname, 'ZNKadminDash.html'));
}

function createMenu() {
    const isDev = isDevMode();
    const template = [
        {
            label: 'ZNK',
            submenu: [
                { label: 'Accueil', click: () => loadPage('index.html') },
                { label: 'Studios', click: () => loadPage('ZNKStudiosDash.html') },
                ...(isDev ? [{ type: 'separator' }, { label: '🔧 Admin Dashboard', click: () => loadPage('ZNKadminDash.html'), accelerator: 'CmdOrCtrl+Shift+A' }, { label: '🔑 Connexion Admin (comptes réels)', click: () => loadPage('modules-admin/auth-hub-admin.html'), accelerator: 'CmdOrCtrl+Shift+L' }] : []),
                { type: 'separator' },
                ...(isDev ? [{ label: '🛠️ DevTools', accelerator: 'F12', click: () => { const win = BrowserWindow.getFocusedWindow(); if (win) win.webContents.toggleDevTools(); } }] : []),
                { role: 'quit', label: 'Quitter' }
            ]
        },
        {
            label: 'Édition',
            submenu: [
                { role: 'undo', label: 'Annuler' },
                { role: 'redo', label: 'Rétablir' },
                { type: 'separator' },
                { role: 'cut', label: 'Couper' },
                { role: 'copy', label: 'Copier' },
                { role: 'paste', label: 'Coller' },
                { role: 'selectAll', label: 'Tout sélectionner' }
            ]
        },
        {
            label: 'Navigation',
            submenu: [
                { label: 'ZNKarchive', click: () => loadModule('znkarchive') },
                { label: 'ACTV', click: () => loadModule('actv') },
                { label: 'WhatsZNK', click: () => loadModule('whatsznk') }
            ]
        },
        { label: 'Aide', submenu: [{ label: 'Documentation' }, { type: 'separator' }, { label: 'À propos' }] }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function loadPage(pageName) {
    // Si la fenêtre a été fermée entre-temps (fréquent sur Mac : fermer la
    // fenêtre ne quitte pas l'appli), mainWindow pointe vers un objet détruit
    // et loadFile() plante avec "Object has been destroyed". On recrée la
    // fenêtre dans ce cas plutôt que de laisser l'appli crasher.
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.warn('⚠️ Fenêtre détruite — recréation avant navigation vers', pageName);
        createWindow();
        mainWindow.once('ready-to-show', () => loadPage(pageName));
        return;
    }
    const fullPath = path.join(__dirname, pageName);
    if (fs.existsSync(fullPath)) mainWindow.loadFile(fullPath);
    else console.error('Page introuvable:', pageName);
}

function loadModule(moduleName) {
    handleNavigation(null, moduleName);
}

function handleNavigation(event, moduleName) {
    let cleanModuleName = (moduleName || '').toString().trim().replace(/^\.?\//, '');
    if (!cleanModuleName) {
        if (event && event.reply) event.reply('navigation-error', { error: 'module empty' });
        return;
    }
    // Même garde que loadPage() : éviter le plantage "Object has been
    // destroyed" si la fenêtre a été fermée avant cette navigation (ex:
    // après une connexion réussie, si la fenêtre s'était refermée entre
    // temps). On recrée la fenêtre puis on relance la navigation.
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.warn('⚠️ Fenêtre détruite — recréation avant navigation vers', cleanModuleName);
        createWindow();
        mainWindow.once('ready-to-show', () => handleNavigation(event, cleanModuleName));
        return;
    }
    const validPath = pathHelper.findFile(cleanModuleName, ['', 'pages', 'views', 'dashboards']);
    if (validPath && fs.existsSync(validPath)) {
        mainWindow.loadFile(validPath).then(() => event && event.reply && event.reply('navigation-success', { module: cleanModuleName, path: validPath })).catch(err => event && event.reply && event.reply('navigation-error', { file: cleanModuleName, error: err.message }));
    } else {
        event && event.reply && event.reply('module-not-found', { module: cleanModuleName });
        setTimeout(() => {
            const authPath = getAssetPath('auth-hub.html');
            mainWindow.loadFile(fs.existsSync(authPath) ? authPath : getAssetPath('index.html'));
        }, 2000);
    }
}

// ========================================
// HELPERS IPC BROADCAST
// ========================================
function broadcastVideoPersisted(payload) {
    try {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('video-persisted', payload);
        }
        // also emit to all windows if necessary
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && win.webContents) win.webContents.send('video-persisted', payload);
        });
    } catch (e) {
        console.warn('broadcastVideoPersisted failed', e);
    }
}

// ========================================
// IPC HANDLERS - FILES / CONVERSION / PERSISTENCE
// ========================================
ipcMain.handle('select-files', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Vidéos', extensions: ['mp4','mov','avi','mkv','webm','flv','wmv','m4v'] }, { name:'Tous', extensions:['*'] }]
        });
        if (result.canceled) return { success: false, canceled: true };
        return { success: true, files: result.filePaths };
    } catch (err) {
        console.error('select-files error', err);
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle('convert-video', async (event, options) => {
    try {
        const { filePath, profile, fileName } = options;
        if (!fs.existsSync(filePath)) throw new Error('Fichier source introuvable');
        await ensureDir(PATHS.convertedVideos);
        const baseName = path.basename(fileName, path.extname(fileName));
        const outputFileName = `${baseName}_${profile}.webm`;
        const outputPath = path.join(PATHS.convertedVideos, outputFileName);

        const result = await convertVideo(filePath, outputPath, profile, progressData => {
            try { event.sender.send('conversion-progress', { fileName, ...progressData }); } catch (e) {}
            updateNativeConversionStatus({ progress: Math.round(progressData.progress || 0), fileName, state: 'progress' });
        });

        updateNativeConversionStatus({ progress: 100, fileName: outputFileName, state: 'done' });

        return { success: true, outputPath: result.outputPath, outputFileName };
    } catch (error) {
        console.error('convert-video error', error);
        updateNativeConversionStatus({ state: 'error' });
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('znk-speed-export', async (event, options) => {
    try {
        const { filePath, speed, fileName, format } = options || {};
        if (!filePath || !fs.existsSync(filePath)) throw new Error('Fichier source introuvable');
        const speedNum = Number(speed);
        if (!isFinite(speedNum) || speedNum < 0.25 || speedNum > 4) throw new Error('Vitesse invalide (0.25–4)');
        const outFormat = format === 'mp4' ? 'mp4' : 'webm';

        await ensureDir(PATHS.convertedVideos);
        const sourceName = fileName || path.basename(filePath);
        const baseName = path.basename(sourceName, path.extname(sourceName));
        const speedLabel = speedNum.toFixed(2);
        const outputFileName = `${baseName}_${speedLabel}x.${outFormat}`;
        const outputPath = path.join(PATHS.convertedVideos, outputFileName);

        const result = await changeVideoSpeed(filePath, outputPath, speedNum, progressData => {
            try { event.sender.send('speed-export-progress', { fileName: outputFileName, ...progressData }); } catch (e) {}
        }, outFormat);

        return { success: true, outputPath: result.outputPath, outputFileName };
    } catch (error) {
        console.error('znk-speed-export error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('znk-transition-export', async (event, options) => {
    try {
        const { filePathA, filePathB, fileNameA, fileNameB, durationA, durationB, totalDuration, filterComplex, isPreview, bgVideoPath } = options || {};
        if (!filePathA || !fs.existsSync(filePathA)) throw new Error('Photo A introuvable');
        if (!filePathB || !fs.existsSync(filePathB)) throw new Error('Photo B introuvable');
        if (!filterComplex) throw new Error('filterComplex manquant');
        if (bgVideoPath && !fs.existsSync(bgVideoPath)) throw new Error('Vidéo d\'arrière-plan introuvable');

        let outputPath, outputFileName;
        if (isPreview) {
            outputFileName = `znk-transition-preview-${Date.now()}.mp4`;
            outputPath = path.join(os.tmpdir(), outputFileName);
        } else {
            await ensureDir(PATHS.convertedVideos);
            const baseA = path.basename(fileNameA || filePathA, path.extname(fileNameA || filePathA));
            const baseB = path.basename(fileNameB || filePathB, path.extname(fileNameB || filePathB));
            outputFileName = `${baseA}_TRANS_${baseB}.mp4`;
            outputPath = path.join(PATHS.convertedVideos, outputFileName);
        }

        const result = await runTransitionFFmpeg(filePathA, filePathB, outputPath, {
            durationA, durationB, totalDuration, filterComplex, bgVideoPath,
            progressCallback: progressData => {
                if (isPreview) return;
                try { event.sender.send('transition-export-progress', { fileName: outputFileName, ...progressData }); } catch (e) {}
            }
        });

        return { success: true, outputPath: result.outputPath, outputFileName, isPreview: !!isPreview };
    } catch (error) {
        console.error('znk-transition-export error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('znk-fade-export', async (event, options) => {
    try {
        const { filePathA, filePathB, fileNameA, fileNameB, fadeDuration, format } = options || {};
        if (!filePathA || !fs.existsSync(filePathA)) throw new Error('Vidéo A introuvable');
        if (!filePathB || !fs.existsSync(filePathB)) throw new Error('Vidéo B introuvable');
        const outFormat = format === 'mp4' ? 'mp4' : 'webm';

        await ensureDir(PATHS.convertedVideos);
        const baseA = path.basename(fileNameA || filePathA, path.extname(fileNameA || filePathA));
        const baseB = path.basename(fileNameB || filePathB, path.extname(fileNameB || filePathB));
        const outputFileName = `${baseA}_FADE_${baseB}.${outFormat}`;
        const outputPath = path.join(PATHS.convertedVideos, outputFileName);

        const result = await changeVideoFade(filePathA, filePathB, outputPath, {
            fadeDuration,
            format: outFormat,
            progressCallback: progressData => {
                try { event.sender.send('fade-export-progress', { fileName: outputFileName, ...progressData }); } catch (e) {}
            }
        });

        return { success: true, outputPath: result.outputPath, outputFileName };
    } catch (error) {
        console.error('znk-fade-export error', error);
        return { success: false, error: error.message || String(error) };
    }
});

// ========================================
// EXPORT ANIMATION (ZNKAnim) — séquence d'images -> mp4 (ffmpeg natif)
// ========================================
// Le renderer (ZNKAnim.html) rend chaque frame de l'animation individuellement
// sur son canvas (pas de capture temps réel / MediaRecorder, qui donnait une
// durée d'export incorrecte et non déterministe). Il envoie ensuite ces
// images par lots (znk-anim-write-frame-batch), puis demande l'encodage final
// (znk-anim-finalize-export) qui lance ffmpeg en mode "image2" sur la
// séquence de fichiers : la durée de la vidéo produite est alors exactement
// nombre_d_images / fps, indépendamment de la vitesse de la machine.
const animExportSessions = new Map(); // sessionId -> temp dir path

function animSessionDir(sessionId){
    return path.join(os.tmpdir(), `znkanim-frames-${sessionId}`);
}

ipcMain.handle('znk-anim-write-frame-batch', async (event, options) => {
    try {
        const { sessionId, startIndex, frames } = options || {};
        if (!sessionId) throw new Error('sessionId manquant');
        if (!Array.isArray(frames) || !frames.length) throw new Error('Aucune image reçue');

        let dir = animExportSessions.get(sessionId);
        if (!dir) {
            dir = animSessionDir(sessionId);
            await ensureDir(dir);
            animExportSessions.set(sessionId, dir);
        }

        await Promise.all(frames.map((base64, i) => {
            const frameIndex = (startIndex || 0) + i + 1; // ffmpeg image2 commence à 1
            const frameName = `frame_${String(frameIndex).padStart(5, '0')}.jpg`;
            return fs.promises.writeFile(path.join(dir, frameName), Buffer.from(base64, 'base64'));
        }));

        return { success: true };
    } catch (error) {
        console.error('znk-anim-write-frame-batch error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('znk-anim-finalize-export', async (event, options) => {
    const { sessionId, fps, frameCount, fileName, format } = options || {};
    const dir = sessionId ? animExportSessions.get(sessionId) : null;
    try {
        if (!dir || !fs.existsSync(dir)) throw new Error('Session d\'export introuvable (images non reçues)');

        const ffmpegPath = await findFFmpeg();
        await ensureDir(PATHS.convertedVideos);
        const outFormat = format === 'mp4' ? 'mp4' : 'webm';

        const baseName = path.basename(fileName || 'ZNKAnim', path.extname(fileName || 'ZNKAnim'));
        const outputFileName = `${baseName}.${outFormat}`;
        const outputPath = path.join(PATHS.convertedVideos, outputFileName);
        const effectiveFps = fps || 30;

        await new Promise((resolve, reject) => {
            const args = outFormat === 'mp4'
                ? ['-y', '-framerate', String(effectiveFps), '-i', path.join(dir, 'frame_%05d.jpg'),
                   '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                   '-pix_fmt', 'yuv420p', '-r', String(effectiveFps),
                   '-movflags', '+faststart', outputPath]
                : ['-y', '-framerate', String(effectiveFps), '-i', path.join(dir, 'frame_%05d.jpg'),
                   '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '1800k', '-cpu-used', '2', '-row-mt', '1',
                   '-pix_fmt', 'yuv420p', '-r', String(effectiveFps),
                   outputPath];
            const ff = spawn(ffmpegPath, args);
            let stderrBuf = '';
            ff.stderr.on('data', data => {
                const output = data.toString();
                stderrBuf += output;
                const frameMatch = output.match(/frame=\s*(\d+)/);
                if (frameMatch && frameCount) {
                    const current = parseInt(frameMatch[1], 10);
                    const progress = Math.min(100, Math.floor((current / frameCount) * 100));
                    try { event.sender.send('anim-export-progress', { progress }); } catch (e) {}
                }
            });
            ff.on('close', code => code === 0 ? resolve() : reject(new Error(`Export ZNKAnim échoué (code ${code}): ${stderrBuf.slice(-500)}`)));
            ff.on('error', reject);
        });

        return { success: true, outputPath, outputFileName };
    } catch (error) {
        console.error('znk-anim-finalize-export error', error);
        return { success: false, error: error.message || String(error) };
    } finally {
        if (dir) {
            animExportSessions.delete(sessionId);
            fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    }
});

ipcMain.handle('open-output-folder', async () => {
    try { await ensureDir(PATHS.convertedVideos); await shell.openPath(PATHS.convertedVideos); return { success: true }; }
    catch (e) { console.error('open-output-folder', e); return { success: false, error: e.message }; }
});

// Ouvre un dossier/fichier/app arbitraire du disque via shell.openPath.
// Utilisé par les icônes targetType "folder"/"app" des hubs (ex: hub-admin-dash.html),
// qui ne peuvent plus faire require('electron').shell.openPath directement
// une fois contextIsolation:true / nodeIntegration:false (mode non-legacy).
// Retourne '' en cas de succès, sinon un message d'erreur (comportement natif de shell.openPath).
ipcMain.handle('open-path', async (event, targetPath) => {
    try { return await shell.openPath(targetPath); }
    catch (e) { console.error('open-path', e); return e.message || String(e); }
});

// Ouvre une URL externe dans le navigateur par défaut du système.
// Reçoit l'event envoyé par preload.js via ipcRenderer.send('open-external', url)
// (utilisé par les icônes targetType "external" des hubs).
ipcMain.on('open-external', (event, url) => {
    try { shell.openExternal(url); }
    catch (e) { console.error('open-external', e); }
});

// Transcription vocale locale (whisper.cpp), utilisée par ZNK-LIVREmoi.html
// (lecture à voix haute d'une page manuscrite) — aucune connexion requise.
// audioDataUrl : data URL "data:audio/webm;base64,...." fournie par le
// MediaRecorder du renderer.
ipcMain.handle('transcribe-audio', async (event, audioDataUrl) => {
    let webmPath, wavPath;
    try {
        if (!audioDataUrl || typeof audioDataUrl !== 'string') {
            throw new Error('audio manquant');
        }
        // Le navigateur (MediaRecorder) rapporte souvent un type du genre
        // "audio/webm;codecs=opus" plutôt que "audio/webm" tout court — la
        // regex doit donc tolérer un ou plusieurs paramètres avant ";base64,",
        // pas un seul. On ne se sert du media type nulle part ensuite (ffmpeg
        // détecte le contenu lui-même), donc pas besoin de le capturer précisément.
        const match = /^data:[^,]*?;base64,([\s\S]*)$/.exec(audioDataUrl);
        if (!match) throw new Error('format audio invalide (data URL attendue)');
        const base64Data = match[1];

        await ensureDir(PATHS.whisperTemp);
        const stamp = Date.now();
        webmPath = path.join(PATHS.whisperTemp, `rec-${stamp}.webm`);
        wavPath = path.join(PATHS.whisperTemp, `rec-${stamp}.wav`);

        await fs.promises.writeFile(webmPath, Buffer.from(base64Data, 'base64'));
        await convertAudioToWav(webmPath, wavPath);
        const text = await runWhisperTranscription(wavPath, { language: 'fr' });

        return { success: true, text };
    } catch (error) {
        console.error('transcribe-audio error', error);
        return { success: false, error: error.message || String(error) };
    } finally {
        // ZNK_KEEP_WHISPER_TEMP=1 conserve le .webm/.wav intermédiaire au lieu de le
        // supprimer — utile pour écouter le .wav et vérifier que la conversion ffmpeg
        // produit bien de l'audio audible (et pas du silence/bruit) avant whisper-cli.
        if (process.env.ZNK_KEEP_WHISPER_TEMP === '1') {
            console.log('[ZNK] fichiers audio temporaires conservés dans', PATHS.whisperTemp);
        } else {
            for (const p of [webmPath, wavPath]) {
                if (p) fs.promises.unlink(p).catch(() => {});
            }
        }
    }
});

ipcMain.handle('get-output-folder', async () => {
    try { await ensureDir(PATHS.convertedVideos); return { success: true, path: PATHS.convertedVideos }; }
    catch (e) { return { success: false, error: e.message }; }
});

// Liste les vidéos disponibles dans assets/videos-seed/ (dossier fige, livré
// avec l'appli — PAS userData). Utilisé par creer-lecon-admin.html : l'admin
// choisit une vidéo déjà présente dans ce dossier plutôt que d'en importer/
// enregistrer une nouvelle (qui, elle, reste propre à SA machine). Le contenu
// de videos-seed est le même sur toutes les installations (même build), donc
// une leçon admin qui référence un fichier de ce dossier s'affiche à
// l'identique dans toutes les écoles, sans dépendre de userData/persistent-videos.
ipcMain.handle('list-seed-videos', async () => {
    try {
        const seedVideosFolder = getSeedResourcePath('videos-seed');
        if (!fs.existsSync(seedVideosFolder)) {
            return { success: true, files: [] };
        }
        const entries = await readdir(seedVideosFolder);
        const files = entries
            .filter(f => !f.startsWith('.'))
            .map(f => {
                const p = path.join(seedVideosFolder, f);
                return { fileName: f, url: toFileUrl(p), path: p };
            });
        return { success: true, files };
    } catch (error) {
        console.error('list-seed-videos error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Robust make-video-persistent handler
ipcMain.handle('make-video-persistent', async (event, { sourcePath, videoId, fileName } = {}) => {
    try {
        if (!sourcePath) return { success: false, error: 'sourcePath manquant' };

        // Normalize fileName
        let inferredName = fileName || path.basename(sourcePath || '');
        if (!inferredName && sourcePath && sourcePath.startsWith('file://')) inferredName = path.basename(sourcePath.replace('file://', ''));

        // Reject blob: (cannot copy from blob URL in main process)
        if (String(sourcePath).startsWith('blob:')) {
            return { success: false, error: 'Impossible de copier une URL blob. Utilisez un chemin fichier natif (file.path) ou ouvrez le fichier via le dialogue.' };
        }

        // If sourcePath starts with file:// strip it
        if (String(sourcePath).startsWith('file://')) sourcePath = sourcePath.replace('file://', '');

        // ensure persistent folder exists
        await ensureDir(PATHS.persistentVideos);

        // sanitize filename
        const safeName = (inferredName || `video_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const destFileName = `${videoId || `vid_${Date.now()}`}_${safeName}`;
        const persistentPath = path.join(PATHS.persistentVideos, destFileName);

        // Copy file
        await copy(sourcePath, persistentPath);

        const fileUrl = toFileUrl(persistentPath);

        const payload = {
            success: true,
            persistentPath,
            path: persistentPath,
            fileName: safeName,
            url: fileUrl
        };

        // Broadcast to renderers to update their manifests
        broadcastVideoPersisted({
            videoId: videoId || null,
            fileName: safeName,
            path: persistentPath,
            url: fileUrl
        });

        console.log('make-video-persistent =>', payload);
        return payload;
    } catch (error) {
        console.error('make-video-persistent error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Résout dynamiquement l'URL réelle d'une piste audio persistante, plutôt
// que de faire confiance à l'URL figée stockée dans un manifest/émission
// (jamais portable d'une machine/d'un compte à l'autre — même défaut que
// get-video-url, corrigé de la même façon ici pour Radio).
// Résout dynamiquement l'URL réelle d'une image/document de leçon
// (persistent-materials), même défaut que vidéos/audio corrigé pareil.
ipcMain.handle('get-material-url', async (event, { fileName, titleHint } = {}) => {
    try {
        const files = await readdir(PATHS.persistentMaterials);

        if (fileName) {
            const exact = files.find(f => f === fileName || f.endsWith(`_${fileName}`) || f.includes(fileName));
            if (exact) {
                const p = path.join(PATHS.persistentMaterials, exact);
                return { success: true, url: toFileUrl(p), path: p };
            }
        }

        const stripExt = s => (s || '').replace(/\.[a-z0-9]{2,4}$/i, '');
        const normalize = s => (s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
        const hint = normalize(stripExt(titleHint) || stripExt(fileName));
        if (hint) {
            const byTitle = files.find(f => normalize(f.replace(/\.[a-z0-9]+$/i, '')) === hint);
            if (byTitle) {
                const p = path.join(PATHS.persistentMaterials, byTitle);
                return { success: true, url: toFileUrl(p), path: p };
            }
            const byPartial = files.find(f => {
                const nf = normalize(f.replace(/\.[a-z0-9]+$/i, ''));
                return nf.includes(hint) || hint.includes(nf);
            });
            if (byPartial) {
                const p = path.join(PATHS.persistentMaterials, byPartial);
                return { success: true, url: toFileUrl(p), path: p };
            }
        }

        return { success: false, error: 'Fichier introuvable' };
    } catch (error) {
        console.error('get-material-url error:', error);
        return { success: false, error: error.message };
    }
});

// Radio charge normalement ses manifests via fetch('./persistent-audios/...')
// — un chemin relatif qui casse une fois packagé (radio.html vit DANS
// app.asar, alors que persistent-audios/ vit À CÔTÉ, hors de l'archive).
// On les lit ici via fs, avec le bon chemin résolu, et radio.html préfère
// cet IPC quand électronAPI est disponible.
ipcMain.handle('radio:get-admin-manifest', async () => {
    try {
        let bundled = { emissions: [] };
        const p = getResourcesPath(path.join('persistent-audios', 'znk-audio-manifest.json'));
        if (fs.existsSync(p)) {
            try {
                bundled = JSON.parse(await fs.promises.readFile(p, 'utf-8')) || { emissions: [] };
            } catch (e) { /* manifest bundlé invalide : on repart avec vide */ }
        }

        // Fusion avec le cache VPS (radio:pull-official-catalog) : par id,
        // le cache VPS l'emporte s'il contient une version plus récente —
        // c'est ce qui permet d'ajouter des émissions au catalogue officiel
        // sans nouvelle release, voir radio:pull-official-catalog plus bas.
        let cached = { emissions: [] };
        if (fs.existsSync(RADIO_PATHS.officialCache)) {
            try {
                cached = JSON.parse(await fs.promises.readFile(RADIO_PATHS.officialCache, 'utf-8')) || { emissions: [] };
            } catch (e) { /* cache corrompu : on ignore, le bundle suffit */ }
        }

        const merged = [...(bundled.emissions || [])];
        for (const e of (cached.emissions || [])) {
            const idx = merged.findIndex(m => m.id === e.id);
            if (idx >= 0) merged[idx] = e; else merged.push(e);
        }

        return { success: true, json: JSON.stringify({ emissions: merged }) };
    } catch (error) {
        console.error('radio:get-admin-manifest error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('radio:get-user-manifest', async () => {
    try {
        const p = RADIO_PATHS.userManifest;
        if (!fs.existsSync(p)) return { success: false, error: 'Fichier introuvable' };
        const json = await fs.promises.readFile(p, 'utf-8');
        return { success: true, json };
    } catch (error) {
        console.error('radio:get-user-manifest error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-audio-url', async (event, { fileName, titleHint } = {}) => {
    try {
        const files = await readdir(AUDIO_PATHS.persistentAudio);

        if (fileName) {
            const exact = files.find(f => f === fileName || f.endsWith(`_${fileName}`) || f.includes(fileName));
            if (exact) {
                const p = path.join(AUDIO_PATHS.persistentAudio, exact);
                return { success: true, url: toFileUrl(p), path: p };
            }
        }

        const stripExt = s => (s || '').replace(/\.[a-z0-9]{2,4}$/i, '');
        const normalize = s => (s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
        const hint = normalize(stripExt(titleHint) || stripExt(fileName));
        if (hint) {
            const byTitle = files.find(f => normalize(f.replace(/\.[a-z0-9]+$/i, '')) === hint);
            if (byTitle) {
                const p = path.join(AUDIO_PATHS.persistentAudio, byTitle);
                return { success: true, url: toFileUrl(p), path: p };
            }
            const byPartial = files.find(f => {
                const nf = normalize(f.replace(/\.[a-z0-9]+$/i, ''));
                return nf.includes(hint) || hint.includes(nf);
            });
            if (byPartial) {
                const p = path.join(AUDIO_PATHS.persistentAudio, byPartial);
                return { success: true, url: toFileUrl(p), path: p };
            }
        }

        return { success: false, error: 'Fichier audio introuvable' };
    } catch (error) {
        console.error('get-audio-url error:', error);
        return { success: false, error: error.message };
    }
});

// ========================================
// BANQUE DE SONS — ZNK Studio musical (instruments : piano, guitare, harpe,
// balafon, flûte, tam-tam)
// ========================================
// Même logique que le seed vidéo/matériaux plus haut : en dev les fichiers
// vivent dans assets/sounds/ (à côté de assets/videos-seed, assets/materials-seed),
// en build packagé electron-builder les copie (via extraResources, même config
// que seed-manifests/videos-seed) à la racine de resourcesPath. On réutilise
// getSeedResourcePath() telle quelle plutôt que de dupliquer cette logique.
//
// Contenu attendu dans assets/sounds/ :
//   manifestsounds.json  -> { "piano": {"file":"piano_C4.wav","note":"C4"}, ... }
//   piano_C4.wav, guitare_E3.wav, harpe_C4.wav, balafon_C4.wav, flute_C4.wav, tamtam_C3.wav
//
// Ces fichiers sont statiques (fournis avec l'app, pas écrits à l'exécution) :
// contrairement à AUDIO_PATHS.persistentAudio (userData), ils ne passent donc
// jamais par ensureDir/PATHS — comme videos-seed/materials-seed.
ipcMain.handle('soundbank:load-manifest', async () => {
    try {
        const manifestPath = path.join(getSeedResourcePath('sounds'), 'manifestsounds.json');
        if (!fs.existsSync(manifestPath)) {
            return { success: false, error: 'manifestsounds.json introuvable dans assets/sounds' };
        }
        const raw = await fs.promises.readFile(manifestPath, 'utf-8');
        return { success: true, manifest: JSON.parse(raw) };
    } catch (error) {
        console.error('soundbank:load-manifest error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('soundbank:load-file', async (event, filename) => {
    try {
        // path.basename() empêche toute tentative de sortir du dossier sounds/
        // (ex: filename = "../../secret.txt") — le manifest ne doit référencer
        // que des noms de fichiers simples, jamais des chemins.
        const safeName = path.basename(String(filename || ''));
        const filePath = path.join(getSeedResourcePath('sounds'), safeName);
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'fichier introuvable: ' + safeName };
        }
        const buffer = await fs.promises.readFile(filePath);
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return { success: true, data: arrayBuffer };
    } catch (error) {
        console.error('soundbank:load-file error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-video-url', async (event, { videoId, fileName, titleHint } = {}) => {
    try {
        // fileName might be stored as `<videoId>_<original>` so try multiple strategies

        // 0) Le plus fiable quand disponible : fichier nommé `<videoId>_<...>`.
        if (videoId) {
            const files0 = await readdir(PATHS.persistentVideos);
            const byId = files0.find(f => f.startsWith(`${videoId}_`) || f === videoId);
            if (byId) {
                const p = path.join(PATHS.persistentVideos, byId);
                return { success: true, url: toFileUrl(p), path: p };
            }
        }

        // 1) direct look for PATHS.persistentVideos/<videoId>_<fileName>
        if (videoId && fileName) {
            const candidate = path.join(PATHS.persistentVideos, `${videoId}_${fileName}`);
            if (await pathExists(candidate)) return { success: true, url: toFileUrl(candidate), path: candidate };
        }

        // 2) list files and try to match either fileName substring or endsWith fileName
        const files = await readdir(PATHS.persistentVideos);
        const match = files.find(f => f === fileName || f.endsWith(`_${fileName}`) || f.includes(fileName));
        if (match) {
            const p = path.join(PATHS.persistentVideos, match);
            return { success: true, url: toFileUrl(p), path: p };
        }

        // 3) Fallback pour fichiers renommés proprement (sans id, nom/extension
        // possiblement changés) : correspondance par titre normalisé (minuscules,
        // sans accents/espaces/ponctuation), comparé au nom de fichier sans extension.
        const stripExt = s => (s || '').replace(/\.[a-z0-9]{2,4}$/i, '');
        const normalize = s => (s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
        const hint = normalize(stripExt(titleHint) || stripExt(fileName));
        if (hint) {
            const byTitle = files.find(f => normalize(f.replace(/\.[a-z0-9]+$/i, '')) === hint);
            if (byTitle) {
                const p = path.join(PATHS.persistentVideos, byTitle);
                return { success: true, url: toFileUrl(p), path: p };
            }
            // Correspondance partielle en dernier recours (inclusion dans un sens ou l'autre)
            const byPartial = files.find(f => {
                const nf = normalize(f.replace(/\.[a-z0-9]+$/i, ''));
                return nf.includes(hint) || hint.includes(nf);
            });
            if (byPartial) {
                const p = path.join(PATHS.persistentVideos, byPartial);
                return { success: true, url: toFileUrl(p), path: p };
            }
        }

        // 4) Dernier recours : vidéos admin référencées directement dans
        // assets/videos-seed/ (jamais copiées dans persistent-videos — voir
        // list-seed-videos). Même logique de correspondance (nom exact,
        // substring, titre normalisé) que pour persistent-videos ci-dessus.
        try {
            const seedVideosFolder = getSeedResourcePath('videos-seed');
            if (fs.existsSync(seedVideosFolder)) {
                const seedFiles = await readdir(seedVideosFolder);

                if (fileName) {
                    const seedMatch = seedFiles.find(f => f === fileName || f.endsWith(`_${fileName}`) || f.includes(fileName));
                    if (seedMatch) {
                        const p = path.join(seedVideosFolder, seedMatch);
                        return { success: true, url: toFileUrl(p), path: p };
                    }
                }

                const seedHint = normalize(stripExt(titleHint) || stripExt(fileName));
                if (seedHint) {
                    const seedByTitle = seedFiles.find(f => normalize(f.replace(/\.[a-z0-9]+$/i, '')) === seedHint);
                    if (seedByTitle) {
                        const p = path.join(seedVideosFolder, seedByTitle);
                        return { success: true, url: toFileUrl(p), path: p };
                    }
                    const seedByPartial = seedFiles.find(f => {
                        const nf = normalize(f.replace(/\.[a-z0-9]+$/i, ''));
                        return nf.includes(seedHint) || seedHint.includes(nf);
                    });
                    if (seedByPartial) {
                        const p = path.join(seedVideosFolder, seedByPartial);
                        return { success: true, url: toFileUrl(p), path: p };
                    }
                }
            }
        } catch (seedError) {
            console.warn('get-video-url: recherche dans videos-seed échouée:', seedError.message);
        }

        return { success: false, error: 'Fichier introuvable' };
    } catch (error) {
        console.error('get-video-url error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Return list in shape { success: true, videos: [...] } for compatibility
ipcMain.handle('list-persistent-videos', async () => {
    try {
        await ensureDir(PATHS.persistentVideos);
        const files = await readdir(PATHS.persistentVideos);
        const videos = files.filter(f => /\.(mp4|webm|mov)$/i.test(f)).map(f => {
            // try to parse videoId prefix
            let videoId = null;
            const m = f.match(/^(.+?)_(.+)$/);
            if (m) videoId = m[1];
            const p = path.join(PATHS.persistentVideos, f);
            return { videoId, fileName: f, path: p, url: toFileUrl(p) };
        });
        return { success: true, videos };
    } catch (error) {
        console.error('list-persistent-videos error:', error);
        return { success: false, error: error.message || String(error) };
    }
});
ipcMain.handle('get-video-file-info', async (event, { filePath }) => {
    try {
        if (!await pathExists(filePath)) {
            return { success: false, error: 'Fichier introuvable' };
        }
        const stats = await stat(filePath);
        return {
            success: true,
            size: (stats.size / (1024 * 1024)).toFixed(2), // MB
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('prepare-for-build', async () => {
    try {
        await ensureDir(PATHS.assetsVideos);
        await ensureDir(PATHS.persistentVideos);
        const files = await readdir(PATHS.persistentVideos);
        let copied = 0;
        const updatedVideos = [];

        for (const file of files) {
            if (!/\.(mp4|webm|mov)$/i.test(file)) continue;
            const src = path.join(PATHS.persistentVideos, file);
            const dest = path.join(PATHS.assetsVideos, file);
            await copy(src, dest);
            copied++;
            // try to extract videoId from filename prefix
            const m = file.match(/^(.+?)_(.+)$/);
            const videoId = m ? m[1] : null;
            updatedVideos.push({ videoId, fileName: file, path: dest, url: toFileUrl(dest) });
        }

        return { success: true, copied, assetsPath: PATHS.assetsVideos, updatedVideos };
    } catch (error) {
        console.error('prepare-for-build error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Generic save file handler
ipcMain.handle('save-file', async (event, { defaultPath = 'export.json', data = '', filters = [{ name: 'All', extensions: ['*'] }] } = {}) => {
    try {
        const res = await dialog.showSaveDialog(mainWindow, { title: 'Enregistrer le fichier', defaultPath, buttonLabel: 'Enregistrer', filters });
        if (res.canceled || !res.filePath) return { success: false, canceled: true };
        if (Buffer.isBuffer(data)) await fs.promises.writeFile(res.filePath, data);
        else await fs.promises.writeFile(res.filePath, String(data), 'utf8');
        return { success: true, path: res.filePath };
    } catch (err) {
        console.error('save-file error', err);
        return { success: false, error: err.message || String(err) };
    }
});

// ========================================
// AUDIO HANDLERS (inchangés, inclus pour continuité)
// ========================================
ipcMain.handle('select-audio-files', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Audio', extensions: ['mp3','wav','ogg','m4a','aac','flac'] }, { name: 'Tous', extensions: ['*'] }]
        });
        if (result.canceled) return { success: false, canceled: true };
        return { success: true, files: result.filePaths };
    } catch (error) {
        console.error('select-audio-files error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('scan-audio-folder', async () => {
    try {
        if (!await pathExists(AUDIO_PATHS.audioFolder)) { await ensureDir(AUDIO_PATHS.audioFolder); return { success:true, files: [], message: 'Dossier créé mais vide' }; }
        const files = await readdir(AUDIO_PATHS.audioFolder);
        const audioFiles = [];
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (['.mp3','.wav','.ogg','.m4a','.aac','.flac'].includes(ext)) {
                const filePath = path.join(AUDIO_PATHS.audioFolder, file);
                const stats = await stat(filePath);
                audioFiles.push({
                    id: `audio_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
                    title: path.basename(file, ext),
                    name: file,
                    filename: file,
                    path: filePath,
                    url: toFileUrl(filePath),
                    size: (stats.size / (1024*1024)).toFixed(2),
                    format: ext.replace('.',''),
                    addedAt: new Date().toISOString(),
                    persistent: false
                });
            }
        }
        return { success: true, files: audioFiles, folderPath: AUDIO_PATHS.audioFolder };
    } catch (error) {
        console.error('scan-audio-folder error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('import-audio-file', async (event, { sourcePath, metadata = {} } = {}) => {
    try {
        const filename = path.basename(sourcePath);
        const destPath = path.join(AUDIO_PATHS.audioFolder, filename);
        if (await pathExists(destPath)) return { success: false, error: 'Le fichier existe déjà', existingPath: destPath };
        await copy(sourcePath, destPath);
        const stats = await stat(destPath);
        const ext = path.extname(filename).toLowerCase();
        return { success: true, audio: { id: metadata.id || `audio_${Date.now()}`, title: metadata.title || path.basename(filename, ext), name: filename, filename, path: destPath, url: toFileUrl(destPath), size: (stats.size/(1024*1024)).toFixed(2), format: ext.replace('.',''), artist: metadata.artist || 'Artiste inconnu', album: metadata.album || 'Album inconnu', duration: metadata.duration || '0:00', addedAt: new Date().toISOString(), persistent: false } };
    } catch (error) {
        console.error('import-audio-file error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('make-audio-persistent', async (event, { sourcePath, audioId } = {}) => {
    try {
        const fileName = path.basename(sourcePath);
        const persistentPath = path.join(AUDIO_PATHS.persistentAudio, `${audioId || `audio_${Date.now()}`}_${fileName}`);
        await copy(sourcePath, persistentPath);
        return { success: true, persistentPath, fileName, url: toFileUrl(persistentPath) };
    } catch (error) {
        console.error('make-audio-persistent error', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Lit un fichier choisi via le dialogue natif (select-audio-files, qui ne
// renvoie qu'un CHEMIN — File.path n'existe plus côté renderer depuis
// Electron 32+) et le renvoie en base64 pour que le renderer puisse en faire
// un Blob et l'uploader vers le serveur local (voir user-publish-radio.html,
// LOCAL_SERVER/api/radio-emissions/mine/track/sync-push). Pas de copie disque
// ici contrairement à make-audio-persistent : ce fichier part directement au
// serveur, il n'a pas besoin d'être dupliqué en local au passage.
const AUDIO_MIME_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac' };
ipcMain.handle('read-audio-file', async (event, filePath) => {
    try {
        const buffer = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        return {
            success: true,
            base64: buffer.toString('base64'),
            mimeType: AUDIO_MIME_TYPES[ext] || 'application/octet-stream',
            filename: path.basename(filePath)
        };
    } catch (error) {
        console.error('read-audio-file error', error);
        return { success: false, error: error.message || String(error) };
    }
});

// ----------------------------------------------------------------------------
// SYNC CATALOGUE RADIO OFFICIEL <-> VPS
// Passe toujours par le server.py LOCAL (127.0.0.1, même port que le proxy IA)
// qui relaie vers le VPS avec ZNK_API_KEY — jamais stockée ni manipulée ici.
// Voir radio:get-admin-manifest plus haut pour la fusion avec le bundle build.
// ----------------------------------------------------------------------------
function getLocalServerBase() {
    const port = process.env.ZNK_IA_PORT || '5001';
    return `http://127.0.0.1:${port}`;
}

// Le renderer (radio.html) a besoin de connaître le domaine du VPS pour
// transformer les URLs relatives renvoyées par server.py (ex: /files/xxx.mp3)
// en URLs absolues jouables dans <audio>. ZNK_REGISTRY_URL est déjà dans
// process.env de CE process (hérité par server.py au spawn, voir plus bas
// "env: { ...process.env, ... }") — pas besoin de repasser par server.py,
// juste l'exposer tel quel via IPC.
ipcMain.handle('get-registry-url', () => resolveRegistryUrl());

// ========================================
// Accès admin caché (quadruple-clic sur le titre ZNK MEMBRE)
// ========================================
// La clé n'est comparée que via un hash SHA-256 : même en désarchivant le
// .asar, on ne trouve pas la clé en clair, seulement son empreinte.
// ⚠️ Ceci protège contre un accès accidentel/curieux, pas contre un attaquant
// déterminé prêt à décompiler l'app.
//
// Accès : dans auth-hub.html, identifiant "admin@admin.znk" + un code à
// EXACTEMENT 6 chiffres (le clavier numérique de l'app n'accepte que des
// chiffres dans ce champ, donc la "clé" doit être numérique, 6 chiffres).
const crypto = require('crypto');

// Choisissez un code à 6 chiffres (ex: 483920), puis générez son hash avec :
// node -e "console.log(require('crypto').createHash('sha256').update('483920').digest('hex'))"
// puis collez le résultat ci-dessous. Ne mettez JAMAIS le code en clair ici.
const ZNK_ADMIN_KEY_HASH = 'a0a0ccbcd768cb88f2a757ade7ae894043991c5dee364c4fcbf98a29ee91552d';

ipcMain.handle('verify-admin-key', (event, key) => {
    if (!key) return false;
    const inputHash = crypto.createHash('sha256').update(key).digest('hex');
    const isValid = inputHash === ZNK_ADMIN_KEY_HASH;

    if (isValid) {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (senderWindow) {
            senderWindow.loadFile(path.join(__dirname, 'ZNKadminDash.html'));
        }
    }
    return isValid;
});

// Permet à un futur écran de réglages de changer l'adresse du VPS sans
// toucher au code ni à une variable d'environnement. Écrit dans
// znk-config.json ET met à jour process.env pour un effet immédiat sur
// cette session (pas besoin de relancer l'app).
ipcMain.handle('set-registry-url', (event, url) => {
    if (typeof url !== 'string' || !url.trim()) {
        return { success: false, message: 'URL invalide' };
    }
    const trimmed = url.trim();
    const result = writeZnkConfigFile({ registryUrl: trimmed });
    if (!result) return { success: false, message: 'Écriture du fichier de config impossible' };
    process.env.ZNK_REGISTRY_URL = trimmed;
    return { success: true, registryUrl: trimmed };
});

// À appeler UNE FOIS par device admin (ex: depuis la console DevTools du
// dashboard : await window.electronAPI.setAdminApiKey('...')), avec la clé
// obtenue via POST /api/auth/provision sur le VPS. Persistée dans
// znk-config.json, donc survit aux relances et à un repackaging de l'app —
// contrairement à un simple `export ZNK_API_KEY=...` en shell qui ne
// s'applique pas à une .app lancée depuis le Finder/Dock.
ipcMain.handle('set-admin-api-key', (event, key) => {
    if (typeof key !== 'string' || !key.trim()) {
        return { success: false, message: 'Clé invalide' };
    }
    const trimmed = key.trim();
    const result = writeZnkConfigFile({ apiKey: trimmed });
    if (!result) return { success: false, message: 'Écriture du fichier de config impossible' };
    process.env.ZNK_API_KEY = trimmed;
    return { success: true };
});

// Cache "à la demande" d'une piste distante (radio user/communauté) après une
// première lecture réussie — implémente le principe sync-puis-offline côté
// LECTURE : une fois écoutée une fois (en ligne), une piste redevient
// disponible hors-ligne sans re-téléchargement. Contrairement au pull du
// catalogue officiel plus haut (qui télécharge TOUT le catalogue d'un coup
// via base64 JSON), ici on ne télécharge qu'à l'usage, piste par piste —
// le catalogue communautaire pouvant devenir bien plus gros.
ipcMain.handle('cache-audio-track', async (event, { url, fileName } = {}) => {
    try {
        if (!url || !fileName) return { success: false, error: 'url et fileName requis' };
        await ensureDir(AUDIO_PATHS.persistentAudio);
        const destPath = path.join(AUDIO_PATHS.persistentAudio, fileName);
        if (fs.existsSync(destPath)) return { success: true, alreadyCached: true, path: destPath, url: toFileUrl(destPath) };
        const res = await fetch(url);
        if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.promises.writeFile(destPath, buffer);
        return { success: true, path: destPath, url: toFileUrl(destPath) };
    } catch (error) {
        console.error('cache-audio-track error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('radio:pull-official-catalog', async () => {
    try {
        const res = await fetch(`${getLocalServerBase()}/api/radio-emissions/sync-pull`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.status !== 'success') {
            return { success: false, offline: !!(data && data.offline), error: (data && data.message) || `HTTP ${res.status}` };
        }

        await ensureDir(AUDIO_PATHS.persistentAudio);
        const localEmissions = [];

        for (const emission of (data.emissions || [])) {
            if (!emission || !emission.id) continue;
            const localTracks = [];

            for (const track of (emission.tracks || [])) {
                // Même convention de nom que make-audio-persistent :
                // <id>_<nom original> — permet à get-audio-url de retrouver
                // le fichier par nom sans dépendre du base64 une fois écrit.
                const originalName = track.filename || `${track.id}.mp3`;
                const persistedName = `${track.id}_${originalName}`;
                const persistedPath = path.join(AUDIO_PATHS.persistentAudio, persistedName);

                if (!fs.existsSync(persistedPath) && track.audioBase64) {
                    try {
                        await fs.promises.writeFile(persistedPath, Buffer.from(track.audioBase64, 'base64'));
                    } catch (writeErr) {
                        console.error('radio:pull-official-catalog écriture piste échouée:', track.id, writeErr.message);
                        continue; // on garde les autres pistes même si celle-ci échoue
                    }
                }

                // Jamais gardé en cache : le base64 ferait doubler l'espace
                // disque (fichier réel + copie texte dans le JSON) pour rien.
                localTracks.push({
                    id: track.id,
                    title: track.title,
                    artist: track.artist || '',
                    filename: persistedName,
                    duration: track.duration || '0:00',
                    url: toFileUrl(persistedPath)
                });
            }

            localEmissions.push({
                id: emission.id,
                name: emission.name,
                description: emission.description || '',
                coverImage: emission.coverImage || null,
                createdAt: emission.publishedAt || emission.createdAt || null,
                tracks: localTracks
            });
        }

        await ensureDir(path.dirname(RADIO_PATHS.officialCache));
        await fs.promises.writeFile(RADIO_PATHS.officialCache, JSON.stringify({ emissions: localEmissions }, null, 2), 'utf8');

        return { success: true, count: localEmissions.length };
    } catch (error) {
        console.error('radio:pull-official-catalog error:', error);
        return { success: false, offline: true, error: error.message || String(error) };
    }
});

ipcMain.handle('radio:push-official-catalog', async (event, { emission } = {}) => {
    try {
        if (!emission || !emission.id) return { success: false, error: 'emission invalide (id manquant)' };

        const tracks = [];
        for (const track of (emission.tracks || [])) {
            if (!track.path && !track.url) {
                return { success: false, error: `Piste "${track.title || track.id}" sans fichier local — republie-la d'abord via make-audio-persistent.` };
            }
            const localPath = track.path || decodeURIComponent(String(track.url).replace('file://', ''));
            const bytes = await fs.promises.readFile(localPath);
            tracks.push({
                id: track.id,
                title: track.title,
                artist: track.artist || '',
                filename: track.originalFilename || path.basename(localPath),
                duration: track.duration || '0:00',
                audioBase64: bytes.toString('base64')
            });
        }

        const payload = {
            name: emission.name,
            description: emission.description || '',
            coverImage: emission.coverImage || null,
            tracks
        };

        const res = await fetch(`${getLocalServerBase()}/api/radio-emissions/${encodeURIComponent(emission.id)}/sync-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.status !== 'success') {
            return { success: false, offline: !!(data && data.offline), error: (data && data.message) || `HTTP ${res.status}` };
        }

        return { success: true, publishedAt: data.publishedAt };
    } catch (error) {
        console.error('radio:push-official-catalog error:', error);
        return { success: false, offline: true, error: error.message || String(error) };
    }
});

// ----------------------------------------------------------------------------
// ARTFLOW — publication des vidéos (visible par tous). Même schéma que
// radio:push-official-catalog ci-dessus : main.js parle au server.py LOCAL
// (127.0.0.1), qui relaie vers le VPS avec ZNK_API_KEY. main.js ne connaît
// jamais cette clé.
// ----------------------------------------------------------------------------

ipcMain.handle('artflow:publish-post', async (event, { post } = {}) => {
    try {
        if (!post || !post.id) return { success: false, error: 'post invalide (id manquant)' };
        const res = await fetch(`${getLocalServerBase()}/api/artflow-posts/mine/sync-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(post)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.status !== 'success') {
            return { success: false, offline: !!(data && data.offline), error: (data && data.message) || `HTTP ${res.status}` };
        }
        return { success: true, publishedAt: data.publishedAt, post: data.post };
    } catch (error) {
        console.error('artflow:publish-post error:', error);
        return { success: false, offline: true, error: error.message || String(error) };
    }
});

// ----------------------------------------------------------------------------
// CATALOGUE UNIFIÉ ADMIN (ZNKadminDash > manager-actv, etc.) — même schéma que
// radio:push-official-catalog / artflow:publish-post ci-dessus. Existe pour
// les modules chargés en <webview> (manager-actv.html, etc.) : une <webview>
// Electron est un process de rendu séparé, sans window.parent ni postMessage
// utilisables vers l'hôte — l'IPC vers ce process principal est le SEUL pont
// possible. main.js parle au server.py LOCAL (127.0.0.1), qui relaie vers le
// VPS avec ZNK_API_KEY (voir resolveApiKey plus haut) — main.js manipule la
// clé pour la persister via set-admin-api-key, mais ne l'envoie jamais
// lui-même sur le réseau ; seul server.py le fait.
// ----------------------------------------------------------------------------
ipcMain.handle('admin-content:publish', async (event, { item } = {}) => {
    try {
        if (!item || !item.id) return { success: false, error: 'item invalide (id manquant)' };
        const res = await fetch(`${getLocalServerBase()}/api/admin-content/${encodeURIComponent(item.id)}/sync-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.status !== 'success') {
            return { success: false, offline: !!(data && data.offline), error: (data && data.message) || `HTTP ${res.status}` };
        }
        return { success: true, publishedAt: data.publishedAt };
    } catch (error) {
        console.error('admin-content:publish error:', error);
        return { success: false, offline: true, error: error.message || String(error) };
    }
});

ipcMain.handle('artflow:upload-video', async (event, { postId, filePath, fileName } = {}) => {
    try {
        if (!postId || !filePath) return { success: false, error: 'postId et filePath requis' };
        if (!fs.existsSync(filePath)) return { success: false, error: 'Fichier vidéo introuvable' };

        const bytes = await fs.promises.readFile(filePath);
        const form = new FormData();
        form.append('post_id', postId);
        form.append('file', new Blob([bytes]), fileName || path.basename(filePath));

        const res = await fetch(`${getLocalServerBase()}/api/artflow-posts/mine/video/sync-push`, {
            method: 'POST',
            body: form
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.status !== 'success') {
            return { success: false, offline: !!(data && data.offline), error: (data && data.message) || `HTTP ${res.status}` };
        }
        return { success: true, url: data.url, filename: data.filename, size: data.size };
    } catch (error) {
        console.error('artflow:upload-video error:', error);
        return { success: false, offline: true, error: error.message || String(error) };
    }
});

ipcMain.handle('list-persistent-audio', async () => {
    try {
        const files = await readdir(AUDIO_PATHS.persistentAudio);
        const audioFiles = files.filter(f => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f)).map(f => ({ fileName: f, path: path.join(AUDIO_PATHS.persistentAudio, f), url: toFileUrl(path.join(AUDIO_PATHS.persistentAudio, f)) }));
        return { success: true, files: audioFiles };
    } catch (error) {
        console.error('list-persistent-audio error', error);
        return { success: false, error: error.message || String(error) };
    }
});

// ========================================
// MATÉRIELS DE LEÇON — images et documents (terminal-lecons.html)
// Même logique que make-video-persistent / make-audio-persistent : on copie
// un fichier natif (chemin réel sur disque, via <input type="file">.path)
// vers un dossier persistant de l'app.
// ========================================
ipcMain.handle('make-material-persistent', async (event, { sourcePath, materialId, fileName, type } = {}) => {
    try {
        if (!sourcePath) return { success: false, error: 'sourcePath manquant' };
        if (String(sourcePath).startsWith('blob:')) {
            return { success: false, error: 'Impossible de copier une URL blob. Sélectionnez le fichier via <input type="file"> (chemin natif requis).' };
        }
        if (String(sourcePath).startsWith('file://')) sourcePath = sourcePath.replace('file://', '');
        if (!fs.existsSync(sourcePath)) return { success: false, error: 'Fichier source introuvable: ' + sourcePath };

        await ensureDir(PATHS.persistentMaterials);

        const inferredName = fileName || path.basename(sourcePath);
        const safeName = inferredName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const safeType = (type || 'file').replace(/[^a-zA-Z0-9_-]/g, '_');
        const destFileName = `${safeType}_${materialId || Date.now()}_${safeName}`;
        const persistentPath = path.join(PATHS.persistentMaterials, destFileName);

        await copy(sourcePath, persistentPath);

        const fileUrl = toFileUrl(persistentPath);
        console.log('make-material-persistent =>', persistentPath);
        return { success: true, persistentPath, path: persistentPath, fileName: safeName, url: fileUrl };
    } catch (error) {
        console.error('make-material-persistent error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// ========================================
// PERSISTANCE ADMIN (ZNKAdminPersistence dans ZNKadminDash.html)
// ========================================
ipcMain.handle('save-persistent-content', async (event, { content, targetPath } = {}) => {
    try {
        if (!content) return { success: false, error: 'content manquant' };
        const folderName = (targetPath || './persistent-content/')
            .replace(/^\.\/?/, '')
            .replace(/\/$/, '');
        const destDir = path.join(app.getPath('userData'), folderName);
        await ensureDir(destDir);

        const fileName = `${content.id || Date.now()}.json`;
        const destPath = path.join(destDir, fileName);
        await fs.promises.writeFile(destPath, JSON.stringify(content, null, 2), 'utf8');

        return { success: true, path: destPath };
    } catch (error) {
        console.error('save-persistent-content error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('save-manifest', async (event, { type, manifest } = {}) => {
    try {
        if (!type || !manifest) return { success: false, error: 'type ou manifest manquant' };
        const destDir = path.join(app.getPath('userData'), 'manifests');
        await ensureDir(destDir);
        const destPath = path.join(destDir, `${type}-manifest.json`);
        await fs.promises.writeFile(destPath, JSON.stringify(manifest, null, 2), 'utf8');
        return { success: true, path: destPath };
    } catch (error) {
        console.error('save-manifest error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('sync-to-build', async (event, { sourcePaths, buildPath } = {}) => {
    try {
        if (!sourcePaths || !buildPath) return { success: false, error: 'sourcePaths ou buildPath manquant' };
        const resolvedBuildPath = path.isAbsolute(buildPath) ? buildPath : path.join(__dirname, buildPath);
        let filesCopied = 0;
        const errors = [];

        for (const [key, relSrc] of Object.entries(sourcePaths)) {
            try {
                const srcDir = path.isAbsolute(relSrc) ? relSrc : path.join(app.getPath('userData'), relSrc.replace(/^\.\/?/, '').replace(/\/$/, ''));
                if (!(await pathExists(srcDir))) continue;

                const destDir = path.join(resolvedBuildPath, key);
                await ensureDir(destDir);

                const files = await readdir(srcDir);
                for (const file of files) {
                    const src = path.join(srcDir, file);
                    const dest = path.join(destDir, file);
                    const s = await stat(src);
                    if (s.isFile()) {
                        await copy(src, dest);
                        filesCopied++;
                    }
                }
            } catch (innerErr) {
                errors.push(`${key}: ${innerErr.message}`);
            }
        }

        return { success: true, filesCopied, errors: errors.length ? errors : undefined };
    } catch (error) {
        console.error('sync-to-build error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// ========================================
// RADIO — émissions par utilisateur (znk-publish-radio.html / radio.html)
// ========================================
// radio.html lit ces 2 fichiers en fetch() RELATIF à sa propre position, donc
// ils doivent être écrits à la racine de l'app (__dirname), pas dans userData
// (contrairement au reste du système de manifests interne) :
//   - admin  → ./persistent-audios/znk-audio-manifest.json
//   - user   → ./users/manifests/user-audio-manifest.json
// Les deux fichiers regroupent les émissions de TOUS les comptes du même rôle
// dans un seul tableau { emissions: [...] } : on fait donc un upsert par
// id/userId plutôt qu'un écrasement complet, pour ne pas effacer les
// émissions publiées par d'autres comptes.
async function upsertEmission(filePath, emission) {
    await ensureDir(path.dirname(filePath));

    let data = { emissions: [] };
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.emissions)) data = parsed;
    } catch (e) {
        // fichier absent ou invalide : on repart sur { emissions: [] }
    }

    // Clé = emission.id, PAS userId : un admin peut publier plusieurs
    // émissions (plusieurs id, même userId) — les indexer par userId les
    // ferait s'écraser entre elles. userId sert seulement à retrouver "les
    // émissions de cet utilisateur", pas à identifier UNE émission précise.
    const key = emission.id;
    const idx = data.emissions.findIndex(e => e.id === key);
    if (idx >= 0) {
        data.emissions[idx] = { ...data.emissions[idx], ...emission };
    } else {
        data.emissions.push(emission);
    }

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { count: data.emissions.length };
}

ipcMain.handle('radio:save-emission', async (event, { role, emission } = {}) => {
    try {
        if (!emission || !emission.id) return { success: false, error: 'emission invalide (id manquant)' };

        const filePath = role === 'admin'
            ? getResourcesPath(path.join('persistent-audios', 'znk-audio-manifest.json'))
            : RADIO_PATHS.userManifest;

        const { count } = await upsertEmission(filePath, emission);
        console.log(`✅ Émission radio sauvée (${role}) :`, emission.id, `— ${count} émission(s) au total`);
        return { success: true, path: filePath, count };
    } catch (error) {
        console.error('radio:save-emission error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('radio:delete-emission', async (event, { role, emissionId } = {}) => {
    try {
        if (!emissionId) return { success: false, error: 'emissionId manquant' };
        const filePath = role === 'admin'
            ? getResourcesPath(path.join('persistent-audios', 'znk-audio-manifest.json'))
            : RADIO_PATHS.userManifest;

        let data = { emissions: [] };
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.emissions)) data = parsed;
        } catch (e) { /* rien à supprimer */ }

        data.emissions = data.emissions.filter(e => e.id !== emissionId);
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true, count: data.emissions.length };
    } catch (error) {
        console.error('radio:delete-emission error:', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Sauvegarder une vidéo dans le manifest après make-video-persistent
ipcMain.handle('manifest:save-video', async (event, videoData) => {
    try {
        const manifest = await manifestManager.addItem('videos', videoData);
        console.log('✅ Vidéo sauvée dans manifest:', videoData.id);
        return { success: true, videos: manifest.items };
    } catch (error) {
        console.error('manifest:save-video error:', error);
        return { success: false, error: error.message };
    }
});

// Charger toutes les vidéos du manifest
// Seed des émissions ACTV (localStorage côté renderer) : les émissions sont
// écrites uniquement en localStorage par znk-publish-studio.html, jamais sur
// disque — ce handler sert un JSON bundlé pour que actv.html puisse
// initialiser localStorage.znk_actv_emissions au tout premier lancement.
// Même logique que seed:get-actv-emissions, pour le roster/manifest curés de
// gallery.html (localStorage znk_gallery_roster + znk_gallery_manifest) —
// sans ça, gallery.html retombe sur sa démo "Amara Bello" codée en dur.
ipcMain.handle('seed:get-gallery-curated', async () => {
    try {
        const seedPath = getSeedResourcePath(path.join('seed-manifests', 'znk-gallery-curated-seed.json'));
        if (!fs.existsSync(seedPath)) return { success: false };
        const json = await fs.promises.readFile(seedPath, 'utf-8');
        return { success: true, json };
    } catch (error) {
        console.error('seed:get-gallery-curated error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('seed:get-actv-emissions', async () => {
    try {
        const seedPath = getSeedResourcePath(path.join('seed-manifests', 'znk-actv-emissions-seed.json'));
        if (!fs.existsSync(seedPath)) return { success: false };
        const json = await fs.promises.readFile(seedPath, 'utf-8');
        return { success: true, json };
    } catch (error) {
        console.error('seed:get-actv-emissions error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('manifest:load-videos', async () => {
    try {
        const manifest = await manifestManager.readManifest('videos');
        // Les chemins stockés dans le manifest sont figés au moment de la
        // création (machine/compte d'origine) — jamais portables d'une
        // installation à l'autre. On les recalcule systématiquement à partir
        // du filename + du dossier userData courant, plutôt que de faire
        // confiance à path/persistentPath/url stockés.
        const videos = (manifest.items || []).map(item => {
            if (!item.filename) return item; // rien à recalculer sans nom de fichier
            const realPath = path.join(PATHS.persistentVideos, item.filename);
            return {
                ...item,
                path: realPath,
                persistentPath: realPath,
                url: toFileUrl(realPath)
            };
        });
        return { success: true, videos };
    } catch (error) {
        console.error('manifest:load-videos error:', error);
        return { success: false, error: error.message, videos: [] };
    }
});

// Supprimer une vidéo du manifest
ipcMain.handle('manifest:remove-video', async (event, videoId) => {
    try {
        const manifest = await manifestManager.removeItem('videos', videoId);
        return { success: true, videos: manifest.items };
    } catch (error) {
        console.error('manifest:remove-video error:', error);
        return { success: false, error: error.message };
    }
});

// Sauvegarder un audio dans le manifest
ipcMain.handle('manifest:save-audio', async (event, audioData) => {
    try {
        const manifest = await manifestManager.addItem('music', audioData);
        console.log('✅ Audio sauvé dans manifest:', audioData.id);
        return { success: true, audio: manifest.items };
    } catch (error) {
        console.error('manifest:save-audio error:', error);
        return { success: false, error: error.message };
    }
});

// Charger tous les audios du manifest
ipcMain.handle('manifest:load-audio', async () => {
    try {
        const manifest = await manifestManager.readManifest('music');
        // Même correctif que pour les vidéos : le chemin stocké est figé au
        // moment de la création (userData d'origine) — jamais portable.
        // On le recalcule à partir du filename + du dossier userData courant.
        const audio = (manifest.items || []).map(item => {
            if (!item.filename) return item;
            const realPath = path.join(AUDIO_PATHS.persistentAudio, item.filename);
            return {
                ...item,
                path: realPath,
                persistentPath: realPath,
                url: toFileUrl(realPath)
            };
        });
        return { success: true, audio };
    } catch (error) {
        console.error('manifest:load-audio error:', error);
        return { success: false, error: error.message, audio: [] };
    }
});

// Sauvegarder une icône dans le manifest
ipcMain.handle('manifest:save-icon', async (event, iconData) => {
    try {
        const manifest = await manifestManager.addItem('icons', iconData);
        return { success: true, icons: manifest.items };
    } catch (error) {
        console.error('manifest:save-icon error:', error);
        return { success: false, error: error.message };
    }
});
// Charger toutes les icônes du manifest
ipcMain.handle('manifest:load-icons', async () => {
    try {
        const manifest = await manifestManager.readManifest('icons');
        return { success: true, icons: manifest.items };
    } catch (error) {
        console.error('manifest:load-icons error:', error);
        return { success: false, error: error.message, icons: [] };
    }
});

// ========================================
// ZNK AUTO EXECUTOR - Terminal Admin/Build réel
// ========================================
// Plusieurs "canaux" indépendants (ex: 'main' pour le terminal classique,
// 'server' pour un process de fond type `python3 server.py`), chacun avec
// son propre process actif. Ça permet de lancer un serveur long-running
// sur un canal sans bloquer les commandes sur les autres canaux.
const activeTerminalProcesses = new Map(); // channelId -> child process

ipcMain.handle('terminal:select-workspace', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Choisir le dossier de travail (workspace)'
        });
        if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
        return { success: true, path: result.filePaths[0] };
    } catch (error) {
        console.error('terminal:select-workspace error', error);
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('terminal:get-default-workspace', async () => {
    try {
        const defaultPath = app.isPackaged ? app.getPath('userData') : __dirname;
        return { success: true, path: defaultPath };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
});

ipcMain.handle('terminal:list-directory', async (event, { dirPath } = {}) => {
    try {
        const target = (dirPath && fs.existsSync(dirPath)) ? dirPath : __dirname;
        const entries = await fs.promises.readdir(target, { withFileTypes: true });
        const items = entries
            .filter(e => !e.name.startsWith('.'))
            .map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
            .sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name));
        return { success: true, items, path: target };
    } catch (error) {
        console.error('terminal:list-directory error', error);
        return { success: false, error: error.message || String(error) };
    }
});

// Exécute une commande réelle (shell) et streame stdout/stderr vers le renderer.
// Réservé au mode Admin/Dev pour éviter qu'un build packagé grand public expose un shell.
// `channelId` isole les process : deux canaux différents peuvent tourner en parallèle
// (ex: 'main' pour des commandes ponctuelles, 'server' pour `python3 server.py` en fond).
ipcMain.handle('terminal:execute', async (event, { command, cwd, requestId, channelId } = {}) => {
    const channel = channelId || 'main';

    if (!isDevMode()) {
        return { success: false, error: 'Exécution de commandes désactivée hors du mode Admin/Dev.' };
    }
    if (!command || !String(command).trim()) {
        return { success: false, error: 'Commande vide' };
    }
    if (activeTerminalProcesses.has(channel)) {
        return { success: false, error: `Une commande est déjà en cours d’exécution sur le canal "${channel}".` };
    }

    const workdir = (cwd && fs.existsSync(cwd)) ? cwd : app.getPath('userData');
    const isWin = process.platform === 'win32';
    const shellCmd = isWin ? 'cmd.exe' : '/bin/bash';
    const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-lc', command];

    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(shellCmd, shellArgs, { cwd: workdir, windowsHide: true });
        } catch (err) {
            resolve({ success: false, error: err.message || String(err) });
            return;
        }

        activeTerminalProcesses.set(channel, child);

        const send = (chan, payload) => {
            try {
                if (event.sender && !event.sender.isDestroyed()) event.sender.send(chan, { requestId, channelId: channel, ...payload });
            } catch (e) { /* renderer peut être fermé */ }
        };

        child.stdout.on('data', data => send('terminal-output', { type: 'stdout', data: data.toString() }));
        child.stderr.on('data', data => send('terminal-output', { type: 'stderr', data: data.toString() }));

        child.on('error', err => {
            activeTerminalProcesses.delete(channel);
            resolve({ success: false, error: err.message || String(err) });
        });

        child.on('close', code => {
            activeTerminalProcesses.delete(channel);
            resolve({ success: code === 0, code, cwd: workdir, channelId: channel });
        });
    });
});

// Permet d'annuler la commande en cours sur un canal donné (bouton Stop côté UI)
ipcMain.handle('terminal:kill', async (event, { channelId } = {}) => {
    const channel = channelId || 'main';
    try {
        const child = activeTerminalProcesses.get(channel);
        if (child) {
            child.kill();
            activeTerminalProcesses.delete(channel);
            return { success: true };
        }
        return { success: false, error: `Aucun processus en cours sur le canal "${channel}"` };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
});

// Chemin du preload à donner aux <webview> (ex: modules admin embarqués dans ZNKadminDash.html)
// pour qu'ils reçoivent, eux aussi, window.electronAPI.
ipcMain.handle('get-preload-path', () => {
    const p = global.__znkPreloadPath || getAssetPath('preload.js');
    return toFileUrl(p);
});

// ========================================
// ZNK PROFESSEUR - Données partagées (modules, interrogations, résultats)
// ========================================
// Fichier JSON unique, indépendant du manifestManager existant (vidéos/audio/icônes),
// pour ne rien risquer de casser sur ce système déjà en place.
// Stocké dans userData => partagé par toutes les fenêtres/pages de CETTE installation,
// persiste hors ligne, survit aux mises à jour de l'app.
const ZNK_PROF_DATA_FILE = path.join(app.getPath('userData'), 'znk-professeur-data.json');

ipcMain.handle('znk:read-data', async () => {
    try {
        if (!fs.existsSync(ZNK_PROF_DATA_FILE)) return null;
        return await fs.promises.readFile(ZNK_PROF_DATA_FILE, 'utf-8');
    } catch (error) {
        console.error('znk:read-data error:', error);
        return null;
    }
});

ipcMain.handle('znk:write-data', async (event, json) => {
    try {
        await ensureDir(path.dirname(ZNK_PROF_DATA_FILE));
        await fs.promises.writeFile(ZNK_PROF_DATA_FILE, json, 'utf-8');
        return true;
    } catch (error) {
        console.error('znk:write-data error:', error);
        return false;
    }
});

// ========================================
// ZNK NOMAD - Ledger partagé (comptes, wallets, cartes, PIN, mailbox)
// ========================================
// BUG CORRIGÉ (2026-08-06) : auth-hub.html / ZNKSECURE.html / nomad.html
// appellent tous window.electronAPI.znkNomadReadData() / znkNomadWriteData()
// en s'attendant à lire/écrire znk-nomad-ledger.json — mais AUCUN handler IPC
// 'znk-nomad:*' n'existait dans main.js (seuls 'znk:read-data'/'znk:write-data'
// existaient, et ils pointent vers znk-professeur-data.json, un fichier différent).
// Résultat concret : tout appel à electronAPI.znkNomadWriteData échouait
// silencieusement (catch dans znkLedgerSave), et CHAQUE écriture — création
// d'ID, changement de code d'accès (PIN), édition de compte bancaire —
// retombait uniquement sur localStorage. D'où "impossible de changer le code,
// ça ne marche qu'en local" : le PIN changeait bien dans la fenêtre ouverte,
// mais jamais dans le vrai fichier partagé lu par les autres pages/fenêtres.
// Stocké dans userData => partagé par toutes les fenêtres/pages de cette
// installation, persiste hors ligne, survit aux mises à jour de l'app.
const ZNK_NOMAD_LEDGER_FILE = path.join(app.getPath('userData'), 'znk-nomad-ledger.json');

ipcMain.handle('znk-nomad:read-data', async () => {
    try {
        if (!fs.existsSync(ZNK_NOMAD_LEDGER_FILE)) return null;
        return await fs.promises.readFile(ZNK_NOMAD_LEDGER_FILE, 'utf-8');
    } catch (error) {
        console.error('znk-nomad:read-data error:', error);
        return null;
    }
});

ipcMain.handle('znk-nomad:write-data', async (event, json) => {
    try {
        await ensureDir(path.dirname(ZNK_NOMAD_LEDGER_FILE));
        await fs.promises.writeFile(ZNK_NOMAD_LEDGER_FILE, json, 'utf-8');
        return true;
    } catch (error) {
        console.error('znk-nomad:write-data error:', error);
        return false;
    }
});

// ========================================
// NAVIGATION IPC — 'navigate-to-module'
// ========================================
// auth-hub.html et auth-hub-admin.html envoient ce message via
// ipcRenderer.send('navigate-to-module', targetPage) après une connexion
// réussie, et affichent leur loadingOverlay en attendant la réponse
// ('navigation-success' / 'navigation-error' / 'module-not-found').
// Sans ce handler, le message part dans le vide : personne ne répond jamais,
// l'overlay reste affiché indéfiniment (écran noir silencieux, sans erreur
// console), et handleNavigation() — qui existe déjà et fait le travail —
// n'est jamais appelée pour cette voie de navigation.
ipcMain.on('navigate-to-module', (event, moduleName) => handleNavigation(event, moduleName));

// ========================================
// DEBUG HANDLERS
// ========================================
ipcMain.handle('debug-ping', async () => ({ ok: true, time: new Date().toISOString() }));
ipcMain.handle('debug-paths', async () => ({ isPackaged: app.isPackaged, userData: app.getPath('userData'), convertedVideos: PATHS.convertedVideos, persistentVideos: PATHS.persistentVideos, assetsVideos: PATHS.assetsVideos, preloadPathExists: fs.existsSync(getAssetPath('preload.js')) }));
ipcMain.on('znk-preload-log', (event, msg) => console.log('[PRELOAD_LOG]', msg));

// ========================================
// USER / AUTH HANDLERS (extraits)
// ========================================
ipcMain.handle('create-user', async (event, userData) => {
    try { const result = userStorage.createUser(userData); return { success: true, data: result }; } catch (error) { console.error('create-user', error); return { success: false, error: error.message || String(error) }; }
});
ipcMain.handle('authenticate-user', async (event, { email, code }) => {
    try { return userStorage.authenticateUser(email, code); } catch (error) { console.error('authenticate-user', error); return { success: false, error: error.message || String(error) }; }
});
// ⚠️ Ces deux handlers manquaient : preload.js expose getUserData/updateUserData
// et znk-session.js les appelle (loadUserData, updateProfile), mais personne
// ne répondait côté main process. Résultat : les mises à jour de profil (ex.
// la photo) n'étaient jamais écrites dans users.json — elles vivaient
// uniquement dans le cache localStorage du renderer, qui se faisait écraser
// par les données (obsolètes) de users.json à chaque nouvelle authentification.
ipcMain.handle('get-user-data', async (event, userId) => {
    try { return userStorage.getUser(userId); } catch (error) { console.error('get-user-data', error); return { error: error.message || String(error) }; }
});
ipcMain.on('update-user-data', (event, userId, updates) => {
    try { userStorage.updateUser(userId, updates); } catch (error) { console.error('update-user-data', error); }
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));
ipcMain.handle('is-dev-mode', () => isDevMode());

// ========================================
// SERVEUR IA LOCAL (server.py) — lancement automatique
// ========================================
// ⚠️ Réservé au mode Admin/Dev : les utilisateurs grand public n'ont ni Python,
// ni Ollama installés, et n'en ont pas besoin pour l'instant. isDevMode() est
// déjà utilisé ailleurs pour gater terminal:execute — même garde ici.
// Si un jour ça doit tourner aussi pour des utilisateurs finaux, il faudra
// un vrai critère explicite (ex: réglage utilisateur "Activer l'IA locale"),
// pas seulement isDevMode() — voir la remarque à ce sujet plus bas.
let iaServerProcess = null;

function startLocalIaServer() {
    if (!isDevMode()) {
        console.log('ℹ️ Serveur IA local non démarré (mode Admin/Dev désactivé)');
        return;
    }

    const serverPath = path.join(__dirname, 'server.py');
    const bundledServerBin = getServerBinPath();
    const hasBundledBin = fs.existsSync(bundledServerBin);

    if (!hasBundledBin && !fs.existsSync(serverPath)) {
        console.log('ℹ️ Ni binaire znk-server ni server.py trouvés, démarrage auto ignoré');
        return;
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const spawnCmd = hasBundledBin ? bundledServerBin : pythonCmd;
    const spawnArgs = hasBundledBin ? [] : ['server.py'];

    try {
        // PORT=5001 par défaut car le port 5000 est souvent squatté par
        // AirPlay Receiver sur macOS — doit matcher la constante SERVER
        // dans modules-admin/ZNKOMia.html.
        iaServerProcess = spawn(spawnCmd, spawnArgs, {
            cwd: __dirname,
            windowsHide: true,
            env: { ...process.env, PORT: process.env.ZNK_IA_PORT || '5001' }
        });
    } catch (err) {
        console.warn('⚠️ Impossible de démarrer server.py:', err.message);
        return;
    }

    iaServerProcess.on('error', (err) => {
        // Cas typique (hors binaire empaqueté) : Python n'est pas installé sur cette machine.
        console.warn(`⚠️ server.py n'a pas pu démarrer (${hasBundledBin ? 'binaire znk-server' : pythonCmd + ' introuvable ?'}):`, err.message);
        iaServerProcess = null;
    });

    iaServerProcess.stdout.on('data', d => console.log('[server.py]', d.toString().trim()));
    iaServerProcess.stderr.on('data', d => console.warn('[server.py]', d.toString().trim()));

    iaServerProcess.on('close', (code) => {
        console.log(`server.py arrêté (code ${code})`);
        iaServerProcess = null;
    });

    console.log(`🐍 server.py lancé automatiquement (mode Admin/Dev, via ${hasBundledBin ? 'binaire empaqueté' : pythonCmd})`);
}

function stopLocalIaServer() {
    if (iaServerProcess) {
        iaServerProcess.kill();
        iaServerProcess = null;
    }
}

// ========================================
// NŒUD P2P ZNK (znk_p2p_protocol.py) — LAN + registre VPS, scope "P2P actif par classe"
// ========================================
// Contrairement au serveur IA (dev/admin uniquement), ce nœud doit tourner pour
// TOUS les comptes (élèves, profs, membres...) dès qu'on connaît leur classe/niveau.
// On ne le démarre donc pas ici au boot de l'app (la classe n'est connue qu'après
// connexion, côté renderer) : c'est auth-hub.html qui appelle 'znk-p2p:start' juste
// après une authentification réussie, via ipcRenderer.invoke.
let p2pProcess = null;
const ZNK_P2P_PORT = parseInt(process.env.ZNK_P2P_PORT || '9876', 10);

function startP2PNode({ classeId } = {}) {
    if (p2pProcess) {
        console.log('ℹ️ Nœud P2P déjà démarré — mise à jour de la classe uniquement');
        return setP2PClasse(classeId);
    }

    const scriptPath = path.join(__dirname, 'znk_p2p_protocol.py');
    const bundledP2PBin = getP2PBinPath();
    const hasBundledBin = fs.existsSync(bundledP2PBin);

    if (!hasBundledBin && !fs.existsSync(scriptPath)) {
        console.log('ℹ️ Ni binaire znk-p2p-node ni znk_p2p_protocol.py trouvés, nœud P2P non démarré');
        return { success: false, error: 'znk-p2p-node/znk_p2p_protocol.py introuvable' };
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    // Le script/binaire accepte (port, classe_id) en argv — voir son bloc __main__.
    // ⚠️ Il génère encore son propre user_id (uuid aléatoire à chaque démarrage) ;
    // si vous voulez que ce nœud soit identifié par le vrai idZNK de la personne
    // connectée (pour que la messagerie privée cible un ID stable), il faudra
    // ajouter un 3e argument userId dans znk_p2p_protocol.py et le lire ici depuis
    // accountData.idZNK / eleve.loginId — non fait pour l'instant.
    const scriptArgs = [String(ZNK_P2P_PORT)];
    if (classeId) scriptArgs.push(classeId);
    const spawnCmd = hasBundledBin ? bundledP2PBin : pythonCmd;
    const spawnArgs = hasBundledBin ? scriptArgs : [scriptPath, ...scriptArgs];

    try {
        p2pProcess = spawn(spawnCmd, spawnArgs, {
            cwd: __dirname,
            windowsHide: true
        });
    } catch (err) {
        console.warn('⚠️ Impossible de démarrer znk_p2p_protocol.py:', err.message);
        p2pProcess = null;
        return { success: false, error: err.message };
    }

    p2pProcess.stdout.on('data', d => console.log('[znk-p2p]', d.toString().trim()));
    p2pProcess.stderr.on('data', d => console.warn('[znk-p2p]', d.toString().trim()));

    p2pProcess.on('error', (err) => {
        // Cas typique (hors binaire empaqueté) : Python n'est pas installé sur cette machine.
        console.warn(`⚠️ znk_p2p_protocol.py n'a pas pu démarrer (${hasBundledBin ? 'binaire znk-p2p-node' : pythonCmd + ' introuvable ?'}):`, err.message);
        p2pProcess = null;
    });

    p2pProcess.on('close', (code) => {
        console.log(`znk_p2p_protocol.py arrêté (code ${code})`);
        p2pProcess = null;
    });

    console.log(`📡 Nœud P2P ZNK lancé (port ${ZNK_P2P_PORT}${classeId ? `, classe ${classeId}` : ''})`);
    return { success: true };
}

// Change la classe d'un nœud déjà démarré SANS le redémarrer (évite de perdre les
// pairs déjà découverts) : envoie "classe <id>" sur son entrée standard — voir la
// boucle de commandes dans le bloc __main__ de znk_p2p_protocol.py.
function setP2PClasse(classeId) {
    if (!p2pProcess || !p2pProcess.stdin || p2pProcess.stdin.destroyed) {
        console.log('ℹ️ Nœud P2P non démarré, classe non appliquée:', classeId);
        return { success: false, error: 'Nœud P2P non démarré' };
    }
    try {
        p2pProcess.stdin.write(`classe ${classeId || ''}\n`);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
}

function stopP2PNode() {
    if (p2pProcess) {
        try { p2pProcess.stdin.write('quit\n'); } catch (e) { /* ignore */ }
        p2pProcess.kill();
        p2pProcess = null;
    }
}

ipcMain.handle('znk-p2p:start', async (event, { classeId } = {}) => {
    return startP2PNode({ classeId });
});

ipcMain.handle('znk-p2p:set-classe', async (event, { classeId } = {}) => {
    return setP2PClasse(classeId);
});

ipcMain.handle('znk-p2p:stop', async () => {
    stopP2PNode();
    return { success: true };
});

// ========================================
// NŒUD CLASSE LOCALE (école/village isolé, sans internet, sans Python)
// ========================================
// Modèle "prof = serveur local de sa classe" : contrairement au nœud P2P
// (znk_p2p_protocol.py, pair-à-pair générique, dépend de Python), ici le PC du
// prof fait tourner un petit serveur HTTP Node (znk-classroom-server.js) qui est
// la SEULE source de vérité pour les comptes élèves / devoirs / soumissions de
// SA classe. Les PC élèves le trouvent automatiquement sur le réseau local via
// un broadcast UDP (znk-classroom-discovery.js), fonctionne sans aucun accès
// Internet. Un élève sans réseau (chez lui) continue de travailler sur son
// cache local ; dès qu'il retrouve le réseau de l'école, 'sync-manifest'
// rattrape uniquement ce qui manque dans un sens comme dans l'autre.

// Démarré par le PC du PROF (depuis auth-hub.html, après connexion en tant qu'enseignant)
ipcMain.handle('znk-classroom:start', async (event, { classeId, nom, niveau, profId, port } = {}) => {
    const dataDir = app.getPath('userData');
    const resultatServeur = await startClassroomServer({ dataDir, port: port || 8765, classeId, nom, niveau, profId });
    if (!resultatServeur.success) return resultatServeur;

    const resultatAnnonce = await startClassroomAnnounce({
        classeId, nom, niveau, profId, httpPort: resultatServeur.port
    });

    classroomInfo = { port: resultatServeur.port, classeId, nom, niveau, profId };
    return { success: true, server: resultatServeur, announce: resultatAnnonce };
});

ipcMain.handle('znk-classroom:stop', async () => {
    stopClassroomAnnounce();
    const res = stopClassroomServer();
    classroomInfo = null;
    return res;
});

ipcMain.handle('znk-classroom:add-eleve', async (event, eleve) => {
    try { return { success: true, data: classroomAddEleve(eleve) }; }
    catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('znk-classroom:list-eleves', async () => {
    try { return { success: true, data: classroomListEleves() }; }
    catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('znk-classroom:publish-devoir', async (event, devoir) => {
    try { return { success: true, data: classroomPublishDevoir(devoir) }; }
    catch (e) { return { success: false, error: e.message }; }
});

// Utilisé par le PROF lui-même (interface locale, pas de réseau nécessaire)
ipcMain.handle('znk-classroom:list-devoirs', async (event, { since } = {}) => {
    try { return { success: true, data: classroomListDevoirsSince(since) }; }
    catch (e) { return { success: false, error: e.message }; }
});

// Démarré par le PC de l'ÉLÈVE : cherche le serveur du prof sur le réseau local
ipcMain.handle('znk-classroom:discover', async (event, { timeoutMs } = {}) => {
    const trouve = await discoverClassroomServer({ timeoutMs: timeoutMs || 3000 });
    return { success: true, data: trouve }; // data === null si rien trouvé dans le délai
});

// Les 4 handlers suivants sont utilisés par le PC de l'ÉLÈVE pour parler au
// serveur du prof (serverInfo = { ip, port } renvoyé par 'znk-classroom:discover').
ipcMain.handle('znk-classroom:login', async (event, { serverInfo, loginId, pin }) => {
    try {
        const { status, data } = await classroomRequest(serverInfo, '/api/login', 'POST', { loginId, pin });
        return { success: status === 200, status, data };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('znk-classroom:get-devoirs', async (event, { serverInfo, since }) => {
    try {
        const q = since ? `?since=${encodeURIComponent(since)}` : '';
        const { status, data } = await classroomRequest(serverInfo, `/api/devoirs${q}`, 'GET');
        return { success: status === 200, status, data };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('znk-classroom:submit', async (event, { serverInfo, payload }) => {
    try {
        const { status, data } = await classroomRequest(serverInfo, '/api/soumissions', 'POST', payload);
        return { success: status === 201, status, data };
    } catch (e) { return { success: false, error: e.message }; }
});

// Le cœur du mode hors-ligne : envoie ce que l'élève connaît déjà / a en attente,
// reçoit en retour uniquement les devoirs nouveaux et les accusés de réception.
ipcMain.handle('znk-classroom:sync-manifest', async (event, { serverInfo, manifest }) => {
    try {
        const { status, data } = await classroomRequest(serverInfo, '/api/sync/manifest', 'POST', manifest);
        return { success: status === 200, status, data };
    } catch (e) { return { success: false, error: e.message }; }
});

// Arrêt propre si l'app se ferme pendant que ce PC est serveur de classe
app.on('before-quit', () => {
    if (classroomInfo) {
        stopClassroomAnnounce();
        stopClassroomServer();
    }
});

// ========================================
// MIGRATION: vidéos persistentes legacy -> manifestManager
// ========================================
// Avant le passage à manifest-manager.js, les vidéos persistentes étaient
// décrites par un fichier "znk-videos-manifest.json" (pluriel, clé "videos",
// chemins RELATIFS "./persistent-videos/xxx.mp4") rangé DANS le dossier du
// projet (persistent-videos/). Le nouveau système lit exclusivement
// userData/manifests/znk-video-manifest.json (singulier, clé "items"),
// initialement vide -> les vidéos existantes devenaient invisibles dans
// ACTV. Cette migration ne tourne qu'UNE fois : dès que le nouveau manifest
// contient au moins une entrée, elle se désactive d'elle-même.
async function migrateLegacyVideoManifest() {
    try {
        const current = await manifestManager.readManifest('videos');
        if (current.items && current.items.length > 0) {
            return; // déjà migré (ou déjà alimenté normalement) -> rien à faire
        }

        const legacyManifestPath = getExtraResourcePath(path.join('persistent-videos', 'znk-videos-manifest.json'));
        if (!fs.existsSync(legacyManifestPath)) {
            console.log('ℹ️ Pas de manifest vidéo legacy trouvé, migration ignorée:', legacyManifestPath);
            return;
        }

        const legacy = JSON.parse(fs.readFileSync(legacyManifestPath, 'utf-8'));
        const legacyVideos = legacy.videos || [];
        if (legacyVideos.length === 0) return;

        console.log(`🔄 Migration de ${legacyVideos.length} vidéo(s) legacy vers le nouveau manifest...`);
        await ensureDir(PATHS.persistentVideos);

        const legacyFolder = getExtraResourcePath('persistent-videos');
        let copiees = 0;

        for (const v of legacyVideos) {
            try {
                const srcFile = path.join(legacyFolder, v.filename);
                const destFile = path.join(PATHS.persistentVideos, v.filename);

                if (!fs.existsSync(destFile) && fs.existsSync(srcFile)) {
                    await copy(srcFile, destFile);
                }

                await manifestManager.addItem('videos', {
                    id: v.id,
                    title: v.title,
                    description: v.description,
                    filename: v.filename,
                    size: v.size,
                    type: v.type,
                    dashboard: v.dashboard || 'actv',
                    category: v.category || 'general',
                    persistent: true,
                    path: destFile,
                    url: destFile,
                    persistentPath: destFile,
                    addedAt: v.addedAt || new Date().toISOString()
                });
                copiees++;
            } catch (e) {
                console.warn(`⚠️ Migration échouée pour ${v.filename}:`, e.message);
            }
        }

        console.log(`✅ Migration terminée: ${copiees}/${legacyVideos.length} vidéo(s) migrée(s)`);
    } catch (error) {
        console.error('❌ Erreur migration manifest vidéo legacy:', error);
    }
}

// ========================================
// LIFECYCLE
// ========================================
// Autorise explicitement caméra/micro pour WhatsZNK (appels vidéo/audio) —
// sans ça, Electron peut refuser silencieusement selon la version/contexte,
// même avec les entitlements macOS en place.
app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });
});

app.whenReady().then(async () => {
    await initializeFolders();
    
    // Initialiser UserStorage
    const { getInstance } = require('./user-storage-native'); // Ajouter l'import de getInstance
    userStorage = getInstance();
    
    // Initialiser ManifestManager
    manifestManager = getManifestManager();
    await manifestManager.initialize();

    // Migration ponctuelle des vidéos legacy (voir plus haut) — ne fait rien
    // si déjà migré ou si aucun ancien manifest n'est trouvé.
    await migrateLegacyVideoManifest();
    
    createWindow();
    startLocalIaServer();

    // Updater optional
    try {
        updater = new ZNKUpdater();
        await updater.initialize();
        console.log('✅ Updater initialisé');
    } catch (e) {
        console.warn('Updater non initialisé:', e && e.message);
    }

    console.log('ZNK SmartHub démarré', { 
        isPackaged: app.isPackaged, 
        userData: app.getPath('userData') 
    });

    findFFmpeg()
        .then(ff => console.log('FFmpeg:', ff))
        .catch(e => console.warn('FFmpeg indisponible:', e.message));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
    if (updater && updater.cleanup) updater.cleanup();
    stopLocalIaServer();
    stopP2PNode();
});

// ========================================
// ERREURS NON CAPTURÉES
// ========================================
process.on('uncaughtException', err => console.error('uncaughtException', err));
process.on('unhandledRejection', (reason) => console.error('unhandledRejection', reason));

console.log('✅ main.js chargé');