// ZNK System Configuration
// Fichier de configuration centralisé pour tous les modules

const ZNKConfig = {
  // ==================== SERVEUR ====================
  server: {
    // Port du serveur
    port: 3000,
    
    // Hôte (0.0.0.0 pour accepter toutes les connexions)
    host: '0.0.0.0',
    
    // URL du serveur (modifiez selon votre IP)
    // Exemples:
    // - Développement local: 'http://localhost:3000'
    // - Réseau local: 'http://192.168.1.100:3000'
    // - Ngrok: 'https://abc123.ngrok.io'
    url: 'http://localhost:3000',
    
    // Limites
    limits: {
      // Taille max des requêtes JSON (en MB)
      jsonSize: 10,
      
      // Nombre max de fichiers par workflow
      maxFiles: 100,
      
      // Taille max d'un fichier (en MB)
      maxFileSize: 500
    }
  },

  // ==================== SÉCURITÉ ====================
  security: {
    // Token d'authentification admin (changez-le!)
    adminToken: 'znk_admin_token_change_me_123',
    
    // CORS - Domaines autorisés
    corsOrigins: '*',  // ou ['http://localhost', 'http://192.168.1.100']
    
    // Activer l'authentification admin
    requireAuth: false  // Mettre à true en production
  },

  // ==================== STORAGE ====================
  storage: {
    // Dossier de stockage des workflows
    workflowsDir: './data/workflows',
    
    // Dossier de stockage des publications
    publishedDir: './data/published',
    
    // Nettoyer automatiquement les anciens fichiers
    autoCleanup: {
      enabled: false,
      daysToKeep: 30
    }
  },

  // ==================== ACTV ====================
  actv: {
    // Rafraîchissement automatique (en secondes)
    autoRefreshInterval: 30,
    
    // Nombre de workflows à afficher par page
    workflowsPerPage: 12,
    
    // Types de workflows supportés
    supportedTypes: ['video', 'audio', 'image', 'document', 'workflow'],
    
    // Catégories disponibles
    categories: [
      { id: 'general', name: 'Général', icon: '📂' },
      { id: 'music', name: 'Musique', icon: '🎵' },
      { id: 'video', name: 'Vidéo', icon: '🎥' },
      { id: 'creative', name: 'Créatif', icon: '🎨' },
      { id: 'tech', name: 'Technique', icon: '⚙️' },
      { id: 'entertainment', name: 'Divertissement', icon: '🎭' }
    ]
  },

  // ==================== ARCHIVES ====================
  archives: {
    // Activer la sauvegarde automatique
    autoSave: true,
    
    // Intervalle de sauvegarde (en secondes)
    autoSaveInterval: 300,  // 5 minutes
    
    // Formats de fichiers supportés
    supportedFormats: {
      video: ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'],
      document: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.md'],
      workflow: ['.json', '.xml', '.yml', '.yaml', '.workflow']
    }
  },

  // ==================== NOTIFICATIONS ====================
  notifications: {
    // Durée d'affichage (en millisecondes)
    duration: 4000,
    
    // Position
    position: 'top-right',  // top-right, top-left, bottom-right, bottom-left
    
    // Types de notifications
    types: {
      success: { icon: '✅', color: '#10b981' },
      error: { icon: '❌', color: '#ef4444' },
      warning: { icon: '⚠️', color: '#f59e0b' },
      info: { icon: 'ℹ️', color: '#3b82f6' }
    }
  },

  // ==================== PERFORMANCE ====================
  performance: {
    // Limiter les ressources pour Mac 2017 8Go RAM
    lowPowerMode: true,
    
    // Désactiver les animations lourdes
    reducedMotion: false,
    
    // Limiter le nombre d'éléments rendus
    maxRenderedItems: 50,
    
    // Utiliser le lazy loading
    lazyLoad: true
  },

  // ==================== LOGS ====================
  logs: {
    // Niveau de log (debug, info, warn, error)
    level: 'info',
    
    // Activer les logs en console
    console: true,
    
    // Sauvegarder les logs dans un fichier
    file: false,
    
    // Chemin du fichier de logs
    filePath: './logs/znk.log'
  },

  // ==================== DÉVELOPPEMENT ====================
  development: {
    // Mode développement
    enabled: true,
    
    // Données de démonstration
    useDemoData: true,
    
    // Recharger automatiquement
    hotReload: true
  },

  // ==================== API ====================
  api: {
    // Version de l'API
    version: '1.0.0',
    
    // Préfixe des routes
    prefix: '/api',
    
    // Timeout des requêtes (en millisecondes)
    timeout: 30000,
    
    // Retry automatique
    retry: {
      enabled: true,
      maxAttempts: 3,
      delay: 1000
    }
  },

  // ==================== FEATURES FLAGS ====================
  features: {
    // Fonctionnalités expérimentales
    experimental: {
      realtimeSync: false,
      cloudBackup: false,
      aiSuggestions: false
    },
    
    // Fonctionnalités activées
    enabled: {
      publish: true,
      comments: false,
      likes: false,
      sharing: false,
      analytics: false
    }
  }
};

// ==================== HELPERS ====================

// Obtenir l'URL complète du serveur
ZNKConfig.getServerUrl = function() {
  return this.server.url;
};

// Obtenir l'URL d'un endpoint
ZNKConfig.getEndpoint = function(path) {
  return `${this.getServerUrl()}${this.api.prefix}${path}`;
};

// Vérifier si une fonctionnalité est activée
ZNKConfig.isFeatureEnabled = function(feature) {
  return this.features.enabled[feature] || false;
};

// Obtenir la configuration pour un module spécifique
ZNKConfig.getModuleConfig = function(moduleName) {
  return this[moduleName] || {};
};

// Valider la configuration
ZNKConfig.validate = function() {
  const errors = [];

  // Vérifier l'URL du serveur
  if (!this.server.url) {
    errors.push('URL du serveur non définie');
  }

  // Vérifier le token admin si auth requise
  if (this.security.requireAuth && !this.security.adminToken) {
    errors.push('Token admin requis mais non défini');
  }

  // Vérifier le port
  if (this.server.port < 1 || this.server.port > 65535) {
    errors.push('Port invalide');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// Afficher la configuration
ZNKConfig.log = function() {
  console.log('📋 Configuration ZNK System:');
  console.log('  🌐 Serveur:', this.server.url);
  console.log('  🔒 Auth:', this.security.requireAuth ? 'Activée' : 'Désactivée');
  console.log('  💾 Storage:', this.storage.publishedDir);
  console.log('  🎯 Mode:', this.development.enabled ? 'Développement' : 'Production');
  console.log('  ⚡ Performance:', this.performance.lowPowerMode ? 'Économie' : 'Normal');
  
  const validation = this.validate();
  if (!validation.valid) {
    console.warn('⚠️ Erreurs de configuration:');
    validation.errors.forEach(err => console.warn('  -', err));
  } else {
    console.log('  ✅ Configuration valide');
  }
};

// ==================== AUTO-CONFIGURATION ====================

// Détecter automatiquement l'environnement
if (typeof window !== 'undefined') {
  // Côté client (navigateur)
  
  // Détecter localhost vs réseau
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    ZNKConfig.server.url = 'http://localhost:3000';
  } else {
    // Utiliser la même IP que la page actuelle
    ZNKConfig.server.url = `http://${window.location.hostname}:3000`;
  }
  
  console.log('🌐 Client ZNK chargé');
  ZNKConfig.log();
  
} else if (typeof module !== 'undefined' && module.exports) {
  // Côté serveur (Node.js)
  module.exports = ZNKConfig;
  console.log('⚙️ Configuration serveur ZNK chargée');
}

// ==================== EXPORT ====================

// Pour utilisation dans les modules
if (typeof window !== 'undefined') {
  window.ZNKConfig = ZNKConfig;
}