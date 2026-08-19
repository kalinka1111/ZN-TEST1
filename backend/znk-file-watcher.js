// ============================================
// ZNK FILE WATCHER ENGINE
// Surveille un dossier partagé et génère
// automatiquement des publications ZNK
// ============================================

const chokidar = require('chokidar');
const fs = require('fs').promises;
const path = require('path');
const mammoth = require('mammoth');

// Configuration
const CONFIG = {
  // Dossier que vos users peuvent accéder
  watchFolder: '/Users/vous/Dropbox/ZNK-Submissions', // ou Google Drive, réseau local
  
  // Dossier de sortie ZNK
  znkOutput: '/Users/vous/znk-app/publications',
  
  // Templates ZNK
  templatesFolder: '/Users/vous/znk-app/templates',
  
  // Types de fichiers acceptés
  allowedExtensions: ['.docx', '.txt', '.md', '.jpg', '.jpeg', '.png', '.mp4', '.pdf'],
  
  // Auto-publish
  autoPublish: true
};

// Base de données des publications
const PUBLICATIONS_DB = './znk-publications.json';

// ============================================
// MOTEUR PRINCIPAL
// ============================================
class ZNKFileEngine {
  constructor() {
    this.watcher = null;
    this.publications = [];
    this.processing = new Set();
    
    this.init();
  }
  
  async init() {
    console.log('🚀 ZNK File Watcher Engine démarré');
    console.log(`📁 Surveillance: ${CONFIG.watchFolder}`);
    
    // Charger les publications existantes
    await this.loadPublications();
    
    // Démarrer la surveillance
    this.startWatching();
  }
  
  async loadPublications() {
    try {
      const data = await fs.readFile(PUBLICATIONS_DB, 'utf8');
      this.publications = JSON.parse(data);
      console.log(`📚 ${this.publications.length} publications chargées`);
    } catch (error) {
      this.publications = [];
      console.log('📚 Nouvelle base de publications créée');
    }
  }
  
  async savePublications() {
    await fs.writeFile(
      PUBLICATIONS_DB, 
      JSON.stringify(this.publications, null, 2)
    );
  }
  
  startWatching() {
    this.watcher = chokidar.watch(CONFIG.watchFolder, {
      ignored: /(^|[\/\\])\../, // Ignorer fichiers cachés
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    this.watcher
      .on('add', filePath => this.handleNewFile(filePath))
      .on('change', filePath => this.handleFileChange(filePath))
      .on('unlink', filePath => this.handleFileDelete(filePath))
      .on('ready', () => console.log('✅ Surveillance active'));
    
    console.log('👀 En attente de nouveaux fichiers...');
  }
  
  // ============================================
  // GESTION DES FICHIERS
  // ============================================
  async handleNewFile(filePath) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Vérifier si déjà en traitement
    if (this.processing.has(filePath)) return;
    
    // Vérifier l'extension
    if (!CONFIG.allowedExtensions.includes(ext)) {
      console.log(`⚠️  Type non supporté: ${filename}`);
      return;
    }
    
    console.log(`📥 Nouveau fichier détecté: ${filename}`);
    this.processing.add(filePath);
    
    try {
      await this.processFile(filePath);
    } catch (error) {
      console.error(`❌ Erreur: ${filename}`, error.message);
    } finally {
      this.processing.delete(filePath);
    }
  }
  
  async handleFileChange(filePath) {
    console.log(`🔄 Fichier modifié: ${path.basename(filePath)}`);
    await this.processFile(filePath);
  }
  
  async handleFileDelete(filePath) {
    const filename = path.basename(filePath);
    console.log(`🗑️  Fichier supprimé: ${filename}`);
    
    // Supprimer la publication correspondante
    const index = this.publications.findIndex(p => p.sourceFile === filePath);
    if (index !== -1) {
      this.publications.splice(index, 1);
      await this.savePublications();
      console.log(`🗑️  Publication supprimée: ${filename}`);
    }
  }
  
  // ============================================
  // ANALYSE ET GÉNÉRATION
  // ============================================
  async processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);
    
    console.log(`⚙️  Traitement: ${filename}`);
    
    let content = null;
    let metadata = {};
    
    // Extraire le contenu selon le type
    switch(ext) {
      case '.docx':
        content = await this.extractDocx(filePath);
        metadata = await this.analyzeDocx(content);
        break;
      case '.txt':
      case '.md':
        content = await fs.readFile(filePath, 'utf8');
        metadata = await this.analyzeText(content);
        break;
      case '.jpg':
      case '.jpeg':
      case '.png':
        metadata = await this.analyzeImage(filePath);
        break;
      case '.mp4':
        metadata = await this.analyzeVideo(filePath);
        break;
      case '.pdf':
        metadata = await this.analyzePdf(filePath);
        break;
    }
    
    // Détecter l'auteur depuis le nom de fichier
    const author = this.extractAuthor(filename);
    
    // Choisir le template approprié
    const template = await this.selectTemplate(metadata, ext);
    
    // Générer la publication ZNK
    const publication = await this.generatePublication({
      sourceFile: filePath,
      filename,
      content,
      metadata,
      author,
      template,
      createdAt: new Date().toISOString()
    });
    
    // Sauvegarder
    await this.savePublication(publication);
    
    console.log(`✅ Publication créée: ${publication.title}`);
    console.log(`   Template: ${template.name}`);
    console.log(`   Auteur: ${author}`);
  }
  
  // ============================================
  // EXTRACTION DE CONTENU
  // ============================================
  async extractDocx(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  
  async analyzeDocx(content) {
    // Extraire le titre (première ligne)
    const lines = content.split('\n').filter(l => l.trim());
    const title = lines[0] || 'Sans titre';
    
    // Compter les mots
    const wordCount = content.split(/\s+/).length;
    
    // Détecter le type de contenu
    const type = this.detectContentType(content);
    
    return {
      title,
      wordCount,
      type,
      preview: content.substring(0, 200) + '...'
    };
  }
  
  async analyzeText(content) {
    const lines = content.split('\n').filter(l => l.trim());
    const title = lines[0]?.replace(/^#\s*/, '') || 'Sans titre';
    
    return {
      title,
      wordCount: content.split(/\s+/).length,
      type: 'article',
      preview: content.substring(0, 200) + '...'
    };
  }
  
  async analyzeImage(filePath) {
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);
    
    return {
      title: filename.replace(path.extname(filename), ''),
      type: 'image',
      size: stats.size,
      path: filePath
    };
  }
  
  async analyzeVideo(filePath) {
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);
    
    return {
      title: filename.replace(path.extname(filename), ''),
      type: 'video',
      size: stats.size,
      duration: 'À déterminer', // Nécessite ffprobe
      path: filePath
    };
  }
  
  async analyzePdf(filePath) {
    const filename = path.basename(filePath);
    
    return {
      title: filename.replace('.pdf', ''),
      type: 'document',
      path: filePath
    };
  }
  
  // ============================================
  // INTELLIGENCE ARTIFICIELLE
  // ============================================
  detectContentType(content) {
    const lower = content.toLowerCase();
    
    if (lower.includes('recette') || lower.includes('ingrédient')) {
      return 'recipe';
    }
    if (lower.includes('tutoriel') || lower.includes('étape')) {
      return 'tutorial';
    }
    if (lower.includes('actualité') || lower.includes('news')) {
      return 'news';
    }
    
    return 'article';
  }
  
  extractAuthor(filename) {
    // Format attendu: "article-nomauteur.docx" ou "nomauteur-titre.docx"
    const parts = filename.split('-');
    if (parts.length > 1) {
      return parts[0].replace(/[^a-zA-Z0-9]/g, '');
    }
    return 'Anonyme';
  }
  
  async selectTemplate(metadata, fileExt) {
    // Logique de sélection du template
    const templates = {
      article: 'template-article.html',
      recipe: 'template-recipe.html',
      tutorial: 'template-tutorial.html',
      news: 'template-news.html',
      image: 'template-gallery.html',
      video: 'template-video.html',
      document: 'template-document.html'
    };
    
    const templateFile = templates[metadata.type] || templates.article;
    
    return {
      name: templateFile,
      path: path.join(CONFIG.templatesFolder, templateFile)
    };
  }
  
  // ============================================
  // GÉNÉRATION DE PUBLICATION ZNK
  // ============================================
  async generatePublication(data) {
    const { sourceFile, filename, content, metadata, author, template } = data;
    
    // Charger le template
    let templateHtml = await fs.readFile(template.path, 'utf8');
    
    // Remplacer les variables
    const publication = {
      id: Date.now().toString(),
      sourceFile,
      title: metadata.title,
      author,
      content: content || '',
      metadata,
      template: template.name,
      html: this.applyTemplate(templateHtml, {
        title: metadata.title,
        author,
        content: content || '',
        date: new Date().toLocaleDateString('fr-FR'),
        preview: metadata.preview || '',
        media: metadata.path || ''
      }),
      createdAt: data.createdAt,
      updatedAt: data.createdAt
    };
    
    return publication;
  }
  
  applyTemplate(template, vars) {
    let html = template;
    
    // Remplacer les variables {{variable}}
    Object.keys(vars).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, vars[key]);
    });
    
    return html;
  }
  
  async savePublication(publication) {
    // Vérifier si existe déjà
    const index = this.publications.findIndex(
      p => p.sourceFile === publication.sourceFile
    );
    
    if (index !== -1) {
      // Mettre à jour
      this.publications[index] = publication;
    } else {
      // Ajouter
      this.publications.push(publication);
    }
    
    // Sauvegarder dans la DB
    await this.savePublications();
    
    // Générer le fichier HTML dans ZNK
    const outputPath = path.join(
      CONFIG.znkOutput,
      `${publication.id}.html`
    );
    await fs.writeFile(outputPath, publication.html);
    
    // Notifier (webhook, email, etc.)
    if (CONFIG.autoPublish) {
      await this.notifyPublication(publication);
    }
  }
  
  async notifyPublication(publication) {
    console.log(`📢 Nouvelle publication disponible dans ZNK`);
    console.log(`   Titre: ${publication.title}`);
    console.log(`   Auteur: ${publication.author}`);
    console.log(`   URL: http://localhost:5000/publications/${publication.id}`);
  }
  
  // ============================================
  // API POUR ZNK
  // ============================================
  getPublications() {
    return this.publications;
  }
  
  getPublicationById(id) {
    return this.publications.find(p => p.id === id);
  }
  
  async deletePublication(id) {
    const index = this.publications.findIndex(p => p.id === id);
    if (index !== -1) {
      this.publications.splice(index, 1);
      await this.savePublications();
      return true;
    }
    return false;
  }
}

// ============================================
// SERVEUR EXPRESS POUR ZNK
// ============================================
const express = require('express');
const app = express();
const engine = new ZNKFileEngine();

app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/publications', (req, res) => {
  res.json(engine.getPublications());
});

app.get('/api/publications/:id', (req, res) => {
  const pub = engine.getPublicationById(req.params.id);
  if (pub) {
    res.json(pub);
  } else {
    res.status(404).json({ error: 'Publication non trouvée' });
  }
});

app.delete('/api/publications/:id', async (req, res) => {
  const success = await engine.deletePublication(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Publication non trouvée' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    watchFolder: CONFIG.watchFolder,
    publicationsCount: engine.getPublications().length,
    watching: true
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🌐 Serveur ZNK: http://localhost:${PORT}`);
});

// ============================================
// EXPORT
// ============================================
module.exports = { ZNKFileEngine, CONFIG };