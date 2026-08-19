// ACTV Loader Module - À intégrer dans actv.html
// Ce module charge les workflows publiés depuis le serveur

class ACTVLoader {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.workflows = [];
    this.refreshInterval = null;
    this.autoRefreshDelay = 30000; // 30 secondes
  }

  // Charger tous les workflows publiés
  async loadPublishedWorkflows() {
    try {
      const response = await fetch(`${this.serverUrl}/api/public/workflows`);
      const result = await response.json();

      if (result.success) {
        this.workflows = result.data;
        console.log(`✅ ${result.count} workflows chargés`);
        return this.workflows;
      }

      return [];

    } catch (error) {
      console.error('❌ Erreur chargement workflows:', error);
      return [];
    }
  }

  // Charger un workflow spécifique
  async loadWorkflow(workflowId) {
    try {
      const response = await fetch(
        `${this.serverUrl}/api/public/workflows/${workflowId}`
      );
      const result = await response.json();

      if (result.success) {
        return result.data;
      }

      return null;

    } catch (error) {
      console.error('❌ Erreur chargement workflow:', error);
      return null;
    }
  }

  // Démarrer le rafraîchissement automatique
  startAutoRefresh() {
    this.stopAutoRefresh();
    
    this.refreshInterval = setInterval(async () => {
      console.log('🔄 Rafraîchissement des workflows...');
      await this.loadAndRenderWorkflows();
    }, this.autoRefreshDelay);

    console.log('✅ Auto-refresh activé (30s)');
  }

  // Arrêter le rafraîchissement automatique
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Charger et afficher les workflows
  async loadAndRenderWorkflows() {
    const workflows = await this.loadPublishedWorkflows();
    
    if (workflows.length > 0) {
      this.renderWorkflows(workflows);
    }
  }

  // Afficher les workflows dans ACTV
  renderWorkflows(workflows) {
    const container = document.getElementById('popularShows');
    
    if (!container) {
      console.warn('⚠️ Container popularShows introuvable');
      return;
    }

    container.innerHTML = '';

    workflows.forEach((workflow, index) => {
      const showCard = this.createWorkflowCard(workflow, index);
      container.appendChild(showCard);
    });

    // Mettre à jour le statut du workflow central
    this.updateCentralDisplay(workflows.length);
  }

  // Créer une carte de workflow
  createWorkflowCard(workflow, index) {
    const card = document.createElement('div');
    card.className = 'show-card';
    card.onclick = () => this.playWorkflow(workflow.id);
    
    // Animation d'apparition progressive
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
      <div class="show-thumbnail" style="background: ${workflow.thumbnail}">
        <div class="play-btn"></div>
        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 4px 8px; border-radius: 4px; font-size: 10px;">
          ${this.getTypeEmoji(workflow.type)} ${workflow.type.toUpperCase()}
        </div>
      </div>
      <div class="show-title">${workflow.title}</div>
      <div class="show-stats">
        <span>👁️ ${this.formatViews(workflow.views)}</span>
        <span>⏱️ ${workflow.duration}</span>
      </div>
      <div style="font-size: 11px; color: #999; margin-top: 5px;">
        ${this.getTimeAgo(workflow.publishedAt)}
      </div>
    `;
    
    return card;
  }

  // Lire un workflow
  async playWorkflow(workflowId) {
    console.log(`▶️ Lecture workflow: ${workflowId}`);
    
    // Charger les détails complets
    const workflow = await this.loadWorkflow(workflowId);
    
    if (!workflow) {
      showNotification('Workflow introuvable', 'error');
      return;
    }

    showNotification(`Lecture: ${workflow.title}`, 'info');
    
    // Ici vous pouvez implémenter le lecteur de workflow
    // Par exemple, afficher une modal avec le contenu
    this.showWorkflowPlayer(workflow);
  }

  // Afficher le lecteur de workflow
  showWorkflowPlayer(workflow) {
    // Créer une modal de lecture
    const modal = document.createElement('div');
    modal.className = 'workflow-player-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div style="max-width: 900px; width: 100%; background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border-radius: 20px; padding: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 24px;">${workflow.title}</h2>
          <button onclick="this.closest('.workflow-player-modal').remove()" style="background: rgba(255,255,255,0.1); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 20px;">
            ✕
          </button>
        </div>

        <div style="background: ${workflow.thumbnail}; height: 400px; border-radius: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
          <div style="font-size: 80px;">▶️</div>
        </div>

        <div style="margin-bottom: 15px;">
          <strong>Description:</strong><br>
          ${workflow.description || 'Aucune description disponible'}
        </div>

        <div style="display: flex; gap: 20px; font-size: 14px; color: #ccc;">
          <span>📁 ${workflow.workflow.metadata.fileCount} fichiers</span>
          <span>💾 ${this.formatSize(workflow.workflow.metadata.totalSize)}</span>
          <span>👁️ ${workflow.views} vues</span>
        </div>

        ${workflow.workflow.files ? `
          <div style="margin-top: 20px; max-height: 200px; overflow-y: auto;">
            <strong>Fichiers inclus:</strong>
            <ul style="margin-top: 10px; padding-left: 20px;">
              ${workflow.workflow.files.map(f => `
                <li style="margin: 5px 0;">${f.name} (${this.formatSize(f.size)})</li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(modal);
  }

  // Mettre à jour l'affichage central
  updateCentralDisplay(count) {
    const statusElement = document.getElementById('workflowStatus');
    if (statusElement) {
      statusElement.textContent = `${count} workflow${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`;
    }
  }

  // Utilitaires de formatage
  getTypeEmoji(type) {
    const emojis = {
      video: '🎥',
      audio: '🎵',
      image: '🖼️',
      document: '📄',
      workflow: '⚙️',
      other: '📦'
    };
    return emojis[type] || '📦';
  }

  formatViews(views) {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views.toString();
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'À l\'instant';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `Il y a ${Math.floor(seconds / 86400)}j`;
    
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short' 
    });
  }
}

// Initialisation globale pour ACTV
const actvLoader = new ACTVLoader();

// Fonction d'initialisation à appeler au chargement de actv.html
async function initACTV() {
  console.log('🚀 Initialisation ACTV Loader...');
  
  // Charger les workflows initiaux
  await actvLoader.loadAndRenderWorkflows();
  
  // Démarrer le rafraîchissement automatique
  actvLoader.startAutoRefresh();
  
  console.log('✅ ACTV Loader prêt');
}

// Auto-démarrage si le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initACTV);
} else {
  initACTV();
}

console.log('✅ ACTV Loader Module chargé');