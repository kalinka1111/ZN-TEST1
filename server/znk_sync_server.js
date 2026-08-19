// ZNK Sync Server - Serveur léger pour publication Admin → Users
// À placer dans: /votre-projet/server/server.js

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;

// Configuration
const WORKFLOWS_DIR = path.join(__dirname, '../data/workflows');
const PUBLISHED_DIR = path.join(__dirname, '../data/published');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Créer les dossiers si inexistants
async function initDirectories() {
  await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
  await fs.mkdir(PUBLISHED_DIR, { recursive: true });
  console.log('✅ Dossiers initialisés');
}

// ==================== ADMIN ROUTES ====================

// Publier un workflow (depuis archives.html)
app.post('/api/admin/publish', async (req, res) => {
  try {
    const { workflow, publishSettings } = req.body;
    
    if (!workflow || !workflow.id) {
      return res.status(400).json({ error: 'Workflow invalide' });
    }

    // Créer l'objet publié
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
      workflow: workflow // Workflow complet pour ACTV
    };

    // Sauvegarder dans le dossier published
    const filename = `${published.id}.json`;
    const filepath = path.join(PUBLISHED_DIR, filename);
    
    await fs.writeFile(filepath, JSON.stringify(published, null, 2));

    console.log(`📤 Workflow publié: ${published.title}`);
    
    res.json({ 
      success: true, 
      message: 'Workflow publié avec succès',
      data: published 
    });

  } catch (error) {
    console.error('❌ Erreur publication:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dépublier un workflow
app.delete('/api/admin/unpublish/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filepath = path.join(PUBLISHED_DIR, `${id}.json`);
    
    await fs.unlink(filepath);
    
    res.json({ 
      success: true, 
      message: 'Workflow dépublié' 
    });

  } catch (error) {
    console.error('❌ Erreur dépublication:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir tous les workflows publiés (admin view)
app.get('/api/admin/published', async (req, res) => {
  try {
    const files = await fs.readdir(PUBLISHED_DIR);
    const workflows = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(
          path.join(PUBLISHED_DIR, file), 
          'utf-8'
        );
        workflows.push(JSON.parse(content));
      }
    }

    res.json({ 
      success: true, 
      count: workflows.length,
      data: workflows 
    });

  } catch (error) {
    console.error('❌ Erreur récupération:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== USER ROUTES ====================

// Récupérer tous les workflows publiés (pour ACTV)
app.get('/api/public/workflows', async (req, res) => {
  try {
    const files = await fs.readdir(PUBLISHED_DIR);
    const workflows = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(
          path.join(PUBLISHED_DIR, file), 
          'utf-8'
        );
        const workflow = JSON.parse(content);
        
        // Ne retourner que les infos publiques
        workflows.push({
          id: workflow.id,
          title: workflow.title,
          description: workflow.description,
          type: workflow.type,
          duration: workflow.duration,
          thumbnail: workflow.thumbnail,
          publishedAt: workflow.publishedAt,
          views: workflow.views
        });
      }
    }

    // Trier par date de publication (plus récent d'abord)
    workflows.sort((a, b) => 
      new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    res.json({ 
      success: true, 
      count: workflows.length,
      data: workflows 
    });

  } catch (error) {
    console.error('❌ Erreur récupération publique:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer un workflow spécifique (pour lecture)
app.get('/api/public/workflows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filepath = path.join(PUBLISHED_DIR, `${id}.json`);
    
    const content = await fs.readFile(filepath, 'utf-8');
    const workflow = JSON.parse(content);

    // Incrémenter les vues
    workflow.views = (workflow.views || 0) + 1;
    await fs.writeFile(filepath, JSON.stringify(workflow, null, 2));

    res.json({ 
      success: true, 
      data: workflow 
    });

  } catch (error) {
    console.error('❌ Erreur récupération workflow:', error);
    res.status(404).json({ error: 'Workflow non trouvé' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'ZNK Sync Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ==================== DÉMARRAGE ====================

async function startServer() {
  await initDirectories();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ZNK Sync Server démarré');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`📱 Réseau: http://[VOTRE-IP]:${PORT}`);
    console.log('\n💡 Pour connaître votre IP locale:');
    console.log('   - macOS: ifconfig | grep "inet " | grep -v 127.0.0.1');
    console.log('   - Windows: ipconfig');
    console.log('\n✅ Serveur prêt à recevoir les publications\n');
  });
}

startServer().catch(console.error);

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('\n👋 Arrêt du serveur...');
  process.exit(0);
});