// ZNK Sync Server - Version Unifiée (P2P + Static Files + API)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// ==================== DEBUG INITIAL ====================
console.log('');
console.log('🔍 DEBUG CHEMINS SERVER:');
console.log('   __dirname:', __dirname);
console.log('   __filename:', __filename);
console.log('   process.cwd():', process.cwd());
console.log('   process.env.APP_ROOT:', process.env.APP_ROOT);
console.log('');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Configuration Socket.IO avec support pour les gros fichiers
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8 // 100 Mo
});

// ==================== CHEMINS INTELLIGENTS (CORRIGÉ) ====================

function getAppRoot() {
    // 🆕 PRIORITÉ 1 : Variable d'environnement passée par main.js
    if (process.env.APP_ROOT) {
        console.log('✅ APP_ROOT depuis env:', process.env.APP_ROOT);
        return process.env.APP_ROOT;
    }
    
    // PRIORITÉ 2 : Mode packagé (Production)
    if (process.env.ELECTRON_PACKAGED === 'true' || process.resourcesPath) {
        const prodPath = path.join(process.resourcesPath, 'app');
        console.log('✅ APP_ROOT mode production:', prodPath);
        return prodPath;
    }
    
    // PRIORITÉ 3 : Mode dev - __dirname est dans server/
    // Solution simple : remonter d'un niveau
    const devPath = path.join(__dirname, '..');
    console.log('✅ APP_ROOT mode dev (simple):', devPath);
    
    // Vérification rapide
    const hasPackageJson = fsSync.existsSync(path.join(devPath, 'package.json'));
    const hasIndex = fsSync.existsSync(path.join(devPath, 'index.html'));
    
    console.log('   package.json:', hasPackageJson ? '✅' : '❌');
    console.log('   index.html:', hasIndex ? '✅' : '❌');
    
    if (!hasPackageJson && !hasIndex) {
        console.warn('⚠️ Vérifiez la structure des dossiers !');
    }
    
    return devPath;
}

const APP_ROOT = getAppRoot();
const DATA_DIR = path.join(__dirname, 'data');
const WORKFLOWS_DIR = path.join(DATA_DIR, 'workflows');
const PUBLISHED_DIR = path.join(DATA_DIR, 'published');
const EXPOS_DIR = path.join(DATA_DIR, 'expos');
const BOOKS_DIR = path.join(DATA_DIR, 'books');

console.log('');
console.log('📁 CHEMINS FINAUX:');
console.log('   APP_ROOT:', APP_ROOT);
console.log('   DATA_DIR:', DATA_DIR);
console.log('');

// Vérifier que index.html existe
const indexPath = path.join(APP_ROOT, 'index.html');
if (fsSync.existsSync(indexPath)) {
    console.log('✅ index.html trouvé à:', indexPath);
} else {
    console.warn('⚠️ index.html NOT FOUND à:', indexPath);
    console.log('📂 Fichiers HTML dans APP_ROOT:');
    try {
        fsSync.readdirSync(APP_ROOT)
            .filter(f => f.endsWith('.html'))
            .forEach(f => console.log('   -', f));
    } catch (e) {
        console.error('❌ Impossible de lire APP_ROOT');
    }
}
console.log('');

// ==================== MIDDLEWARE ====================

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Logger (désactivé en prod)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        if (!req.url.includes('/socket.io')) {
            console.log('📥', req.method, req.url);
        }
        next();
    });
}

// ==================== SERVIR FICHIERS STATIQUES ====================

// Dossiers statiques principaux
const staticDirs = [
    'icons',
    'assets',
    'images',
    'css',
    'js',
    'fonts',
    'manifest',
    'media',
    'build'
];

console.log('📦 Configuration des dossiers statiques:');
staticDirs.forEach(dir => {
    const dirPath = path.join(APP_ROOT, dir);
    if (fsSync.existsSync(dirPath)) {
        app.use(`/${dir}`, express.static(dirPath));
        console.log(`   ✅ /${dir} → ${dirPath}`);
    } else {
        console.log(`   ⚠️  /${dir} non trouvé`);
    }
});
console.log('');

// Alias pour chemins alternatifs
const iconsPath = path.join(APP_ROOT, 'icons');
if (fsSync.existsSync(iconsPath)) {
    app.use('/assets/icons', express.static(iconsPath));
    console.log('✅ Alias: /assets/icons → icons/');
}

const imagesPath = path.join(APP_ROOT, 'images');
if (fsSync.existsSync(imagesPath)) {
    app.use('/assets/images', express.static(imagesPath));
    console.log('✅ Alias: /assets/images → images/');
}

// Servir tous les fichiers HTML à la racine
app.use(express.static(APP_ROOT));
console.log('✅ Static root:', APP_ROOT);
console.log('');

// ==================== INITIALISATION ====================

async function initDirectories() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
    await fs.mkdir(PUBLISHED_DIR, { recursive: true });
    await fs.mkdir(EXPOS_DIR, { recursive: true });
    await fs.mkdir(BOOKS_DIR, { recursive: true });
    console.log('✅ Dossiers de stockage initialisés');
}

// ==================== SYSTÈME P2P & SOCKETS ====================

const peers = new Map();

io.on('connection', (socket) => {
    console.log('🔌 Peer connected:', socket.id);
    peers.set(socket.id, { 
        id: socket.id, 
        connectedAt: new Date().toISOString() 
    });

    // Envoyer la liste des autres pairs
    socket.emit('peers-list', Array.from(peers.keys()).filter(id => id !== socket.id));
    socket.broadcast.emit('peer-joined', socket.id);

    // Signaling WebRTC
    socket.on('signal', ({ to, signal }) => {
        io.to(to).emit('signal', { from: socket.id, signal });
    });

    // Partage de publication P2P
    socket.on('share-publication', async (publication) => {
        try {
            const filePath = path.join(PUBLISHED_DIR, `${publication.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(publication, null, 2));
            socket.broadcast.emit('new-publication', publication);
            console.log(`✅ Publication ${publication.id} relayée via P2P`);
        } catch (error) {
            console.error('❌ Erreur partage P2P:', error);
        }
    });

    // Synchronisation globale
    socket.on('request-sync', async () => {
        try {
            const files = await fs.readdir(PUBLISHED_DIR);
            const publications = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const data = await fs.readFile(path.join(PUBLISHED_DIR, file), 'utf8');
                    publications.push(JSON.parse(data));
                }
            }
            socket.emit('sync-data', publications);
            console.log(`📤 Sync envoyé à ${socket.id}: ${publications.length} éléments`);
        } catch (error) {
            console.error('❌ Erreur sync:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Peer disconnected:', socket.id);
        peers.delete(socket.id);
        socket.broadcast.emit('peer-left', socket.id);
    });
});

// ==================== ROUTES ADMIN ====================

// Publier un workflow
app.post('/api/admin/publish', async (req, res) => {
    try {
        const { workflow, publishSettings } = req.body;
        if (!workflow || !workflow.id) {
            return res.status(400).json({ error: 'Workflow invalide' });
        }

        const published = {
            id: workflow.id,
            title: workflow.name || workflow.title,
            description: workflow.description || '',
            type: workflow.type || 'video',
            duration: workflow.duration || '0:00',
            thumbnail: workflow.thumbnail || null,
            publishedAt: new Date().toISOString(),
            publishedBy: 'admin',
            status: 'published',
            views: 0,
            settings: publishSettings || {},
            workflow: workflow,
            timestamp: Date.now()
        };

        const filepath = path.join(PUBLISHED_DIR, `${published.id}.json`);
        await fs.writeFile(filepath, JSON.stringify(published, null, 2));

        // Alerter tous les clients
        io.emit('new-publication', published);

        console.log(`📤 Workflow publié: ${published.title}`);
        res.json({ success: true, data: published });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dépublier / Supprimer
app.delete('/api/admin/unpublish/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filepath = path.join(PUBLISHED_DIR, `${id}.json`);
        await fs.unlink(filepath);
        
        io.emit('delete-publication', id);
        
        res.json({ success: true, message: 'Workflow dépublié' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Liste complète (Admin)
app.get('/api/admin/published', async (req, res) => {
    try {
        const files = await fs.readdir(PUBLISHED_DIR);
        const workflows = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(PUBLISHED_DIR, file), 'utf-8');
                workflows.push(JSON.parse(content));
            }
        }
        res.json({ success: true, count: workflows.length, data: workflows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ROUTES EXPOS (persistance serveur) ====================
// Une exposition = un artiste = un compte, identifiée par son "expoId"
// (le nom/pseudo de l'artiste, cf. expo-manager.html). Stockée ici en JSON sur
// disque au lieu du localStorage : reste visible au redémarrage de l'app ET
// consultable par les autres membres via le réseau (VPS), pas seulement en local.

// Autorise lettres/chiffres/espaces/tirets/underscores/points/accents courants ;
// bloque tout ce qui pourrait sortir du dossier EXPOS_DIR (../, /, etc.)
function sanitizeExpoId(rawId) {
    const id = String(rawId || '').trim();
    if (!id || id.includes('..') || /[\\/]/.test(id)) return null;
    return id;
}

// Publier / mettre à jour une exposition
app.post('/api/expos/:id', async (req, res) => {
    try {
        const expoId = sanitizeExpoId(req.params.id);
        if (!expoId) return res.status(400).json({ error: 'ID exposition invalide' });

        const expoData = req.body;
        if (!expoData || typeof expoData !== 'object') {
            return res.status(400).json({ error: 'Données exposition invalides' });
        }

        expoData.id = expoId;
        expoData.updatedAt = new Date().toISOString();

        const filepath = path.join(EXPOS_DIR, `${expoId}.json`);
        await fs.writeFile(filepath, JSON.stringify(expoData, null, 2));

        console.log(`🎨 Exposition publiée: ${expoId}`);
        res.json({ success: true, data: expoData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lire une exposition précise
app.get('/api/expos/:id', async (req, res) => {
    try {
        const expoId = sanitizeExpoId(req.params.id);
        if (!expoId) return res.status(400).json({ error: 'ID exposition invalide' });

        const filepath = path.join(EXPOS_DIR, `${expoId}.json`);
        const content = await fs.readFile(filepath, 'utf-8');
        res.json({ success: true, data: JSON.parse(content) });
    } catch (error) {
        res.status(404).json({ error: 'Exposition non trouvée' });
    }
});

// ==================== ROUTES LIVRES (ZNK Librairie) ====================
// Un livre publié depuis ZNK-LIVREmoi.html = un fichier JSON dans BOOKS_DIR,
// exactement la même mécanique que les expositions ci-dessus : stocké sur
// disque, identifié par un id choisi côté client, republier met à jour le
// même fichier. Reste visible au redémarrage du serveur et consultable par
// tous ceux qui accèdent au serveur (réseau local ou VPS).

function sanitizeBookId(rawId) {
    const id = String(rawId || '').trim();
    if (!id || id.includes('..') || /[\\/]/.test(id)) return null;
    return id;
}

// Publier / mettre à jour un livre
app.post('/api/books/:id', async (req, res) => {
    try {
        const bookId = sanitizeBookId(req.params.id);
        if (!bookId) return res.status(400).json({ error: 'ID livre invalide' });

        const book = req.body;
        if (!book || typeof book !== 'object') {
            return res.status(400).json({ error: 'Données livre invalides' });
        }

        book.id = bookId;
        book.publishedAt = new Date().toISOString();

        const filepath = path.join(BOOKS_DIR, `${bookId}.json`);
        await fs.writeFile(filepath, JSON.stringify(book, null, 2));

        // Alerte temps réel pour les onglets ZNK Librairie déjà ouverts (optionnel,
        // même mécanisme que io.emit('new-publication', ...) pour les workflows)
        io.emit('new-book', { id: bookId, title: book.title, author: book.author });

        console.log(`📚 Livre publié: ${book.title || bookId} (${bookId})`);
        res.json({ success: true, id: bookId, publishedAt: book.publishedAt });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Détail complet d'un livre (pages, images) — pour la visionneuse
app.get('/api/books/:id', async (req, res) => {
    try {
        const bookId = sanitizeBookId(req.params.id);
        if (!bookId) return res.status(400).json({ error: 'ID livre invalide' });

        const filepath = path.join(BOOKS_DIR, `${bookId}.json`);
        const content = await fs.readFile(filepath, 'utf-8');
        res.json({ success: true, book: JSON.parse(content) });
    } catch (error) {
        res.status(404).json({ error: 'Livre non trouvé' });
    }
});

// Liste allégée pour la galerie ZNK Librairie (pas le contenu complet des
// pages, pour ne pas faire transiter toutes les images d'un coup)
app.get('/api/books', async (req, res) => {
    try {
        const files = await fs.readdir(BOOKS_DIR);
        const books = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(BOOKS_DIR, file), 'utf-8');
                const b = JSON.parse(content);
                books.push({
                    id: b.id,
                    title: b.title,
                    author: b.author,
                    cover: b.cover,
                    pagesCount: (b.pages || []).length,
                    publishedAt: b.publishedAt
                });
            }
        }
        books.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        res.json({ success: true, books });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ROUTES PUBLIQUES ====================

// Liste pour flux public (ACTV)
app.get('/api/public/workflows', async (req, res) => {
    try {
        const files = await fs.readdir(PUBLISHED_DIR);
        const workflows = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(PUBLISHED_DIR, file), 'utf-8');
                const w = JSON.parse(content);
                workflows.push({
                    id: w.id,
                    title: w.title,
                    description: w.description,
                    type: w.type,
                    duration: w.duration,
                    thumbnail: w.thumbnail,
                    publishedAt: w.publishedAt,
                    views: w.views
                });
            }
        }
        workflows.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        res.json({ success: true, data: workflows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Détail workflow (incrémente vues)
app.get('/api/public/workflows/:id', async (req, res) => {
    try {
        const filepath = path.join(PUBLISHED_DIR, `${req.params.id}.json`);
        const content = await fs.readFile(filepath, 'utf-8');
        const workflow = JSON.parse(content);

        workflow.views = (workflow.views || 0) + 1;
        await fs.writeFile(filepath, JSON.stringify(workflow, null, 2));

        res.json({ success: true, data: workflow });
    } catch (error) {
        res.status(404).json({ error: 'Workflow non trouvé' });
    }
});

// Stats système
app.get('/api/stats', async (req, res) => {
    try {
        const files = await fs.readdir(PUBLISHED_DIR);
        res.json({
            status: 'online',
            total_publications: files.filter(f => f.endsWith('.json')).length,
            connected_peers: peers.size,
            version: '1.2.0-unified',
            app_root: APP_ROOT
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== FALLBACK & 404 ====================

// Fallback : chercher fichiers dans tous les sous-dossiers
app.use((req, res, next) => {
    const cleanPath = req.path.replace(/^\/+/, '');
    const filePath = path.join(APP_ROOT, cleanPath);
    
    if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()) {
        console.log('📄 Fallback serving:', cleanPath);
        return res.sendFile(filePath);
    }
    
    next();
});

// Page 404
app.use((req, res) => {
    console.log('❌ 404:', req.url);
    
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>404 - ZNK</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, sans-serif;
                    background: linear-gradient(135deg, #1a1a2e, #16213e);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .container {
                    background: rgba(0,0,0,0.8);
                    border: 2px solid #ff4444;
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 600px;
                    text-align: center;
                }
                h1 { color: #ff4444; margin-bottom: 20px; }
                code {
                    background: rgba(255,255,255,0.1);
                    padding: 5px 10px;
                    border-radius: 5px;
                    display: inline-block;
                    margin: 10px 0;
                    word-break: break-all;
                }
                button {
                    background: #00d4ff;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 10px;
                    color: #000;
                    font-weight: bold;
                    cursor: pointer;
                    margin: 10px;
                }
                .info {
                    margin-top: 20px;
                    padding: 15px;
                    background: rgba(255,193,7,0.1);
                    border: 1px solid #ffc107;
                    border-radius: 10px;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>❌ Fichier non trouvé</h1>
                <p>Chemin demandé :</p>
                <code>${req.url}</code>
                <div class="info">
                    <strong>📁 Racine serveur :</strong><br>
                    <code>${APP_ROOT}</code>
                </div>
                <button onclick="history.back()">← Retour</button>
                <button onclick="window.location.href='/'">🏠 Accueil</button>
            </div>
        </body>
        </html>
    `);
});

// ==================== DÉMARRAGE ====================

async function startServer() {
    await initDirectories();
    
    server.listen(PORT, '0.0.0.0', () => {
        console.log('╔═══════════════════════════════════════╗');
        console.log('║   🚀 ZNK UNIFIED SERVER               ║');
        console.log('╚═══════════════════════════════════════╝');
        console.log('');
        console.log(`🔡 Port: ${PORT}`);
        console.log(`🌐 Local: http://localhost:${PORT}`);
        console.log(`📁 Root: ${APP_ROOT}`);
        console.log(`📁 Data: ${DATA_DIR}`);
        console.log(`🔌 Socket.IO & P2P: Actifs`);
        console.log('');
        console.log('✅ Serveur prêt (Static + API + P2P)');
        console.log('');
    });
}

startServer().catch(console.error);

// Gestion arrêt
process.on('SIGTERM', () => {
    console.log('\n👋 Arrêt du serveur...');
    server.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n👋 Arrêt du serveur...');
    server.close();
    process.exit(0);
});