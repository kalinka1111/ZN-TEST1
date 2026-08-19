// ZNK Publishing Module - À intégrer dans archives.html
// Ce module permet de publier les workflows vers ACTV

class ZNKPublisher {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.isConnected = false;
    this.checkConnection();
  }

  // Vérifier la connexion au serveur
  async checkConnection() {
    try {
      const response = await fetch(`${this.serverUrl}/api/health`);
      const data = await response.json();
      
      if (data.status === 'ok') {
        this.isConnected = true;
        console.log('✅ Connecté au serveur ZNK Sync');
        this.showNotification('Serveur connecté', 'success');
      }
    } catch (error) {
      this.isConnected = false;
      console.warn('⚠️ Serveur non accessible:', error.message);
      this.showNotification('Serveur hors ligne - mode local', 'warning');
    }
  }

  // Publier un workflow vers ACTV
  async publishWorkflow(workflow, settings = {}) {
    if (!this.isConnected) {
      this.showNotification('Serveur non connecté', 'error');
      return { success: false, error: 'Server offline' };
    }

    try {
      // Préparer les données de publication
      const publishData = {
        workflow: {
          id: workflow.id || this.generateId(),
          name: workflow.name,
          title: workflow.name,
          description: settings.description || '',
          type: this.detectWorkflowType(workflow),
          duration: this.calculateDuration(workflow),
          thumbnail: this.generateThumbnail(workflow),
          files: workflow.files || [],
          metadata: {
            fileCount: workflow.files?.length || 0,
            totalSize: this.calculateTotalSize(workflow.files),
            createdAt: workflow.createdAt || new Date().toISOString()
          }
        },
        publishSettings: {
          visibility: settings.visibility || 'public',
          category: settings.category || 'general',
          tags: settings.tags || [],
          allowDownload: settings.allowDownload || false,
          ...settings
        }
      };

      // Envoyer au serveur
      const response = await fetch(`${this.serverUrl}/api/admin/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(publishData)
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification(
          `"${workflow.name}" publié avec succès!`, 
          'success'
        );
        console.log('📤 Workflow publié:', result.data);
      }

      return result;

    } catch (error) {
      console.error('❌ Erreur publication:', error);
      this.showNotification('Erreur lors de la publication', 'error');
      return { success: false, error: error.message };
    }
  }

  // Dépublier un workflow
  async unpublishWorkflow(workflowId) {
    try {
      const response = await fetch(
        `${this.serverUrl}/api/admin/unpublish/${workflowId}`,
        { method: 'DELETE' }
      );

      const result = await response.json();

      if (result.success) {
        this.showNotification('Workflow dépublié', 'success');
      }

      return result;

    } catch (error) {
      console.error('❌ Erreur dépublication:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtenir tous les workflows publiés (admin view)
  async getPublishedWorkflows() {
    try {
      const response = await fetch(`${this.serverUrl}/api/admin/published`);
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('❌ Erreur récupération:', error);
      return [];
    }
  }

  // Détecter le type de workflow
  detectWorkflowType(workflow) {
    if (!workflow.files || workflow.files.length === 0) {
      return 'other';
    }

    const extensions = workflow.files.map(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ext;
    });

    // Logique de détection
    if (extensions.some(e => ['mp4', 'avi', 'mov', 'mkv'].includes(e))) {
      return 'video';
    }
    if (extensions.some(e => ['mp3', 'wav', 'flac'].includes(e))) {
      return 'audio';
    }
    if (extensions.some(e => ['jpg', 'png', 'gif'].includes(e))) {
      return 'image';
    }
    if (extensions.some(e => ['pdf', 'doc', 'docx'].includes(e))) {
      return 'document';
    }

    return 'workflow';
  }

  // Calculer la durée estimée
  calculateDuration(workflow) {
    if (!workflow.files || workflow.files.length === 0) {
      return '0:00';
    }

    // Estimation basique: 5 secondes par fichier
    const totalSeconds = workflow.files.length * 5;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Calculer la taille totale
  calculateTotalSize(files) {
    if (!files) return 0;
    return files.reduce((total, file) => total + (file.size || 0), 0);
  }

  // Générer une miniature (gradient basé sur le type)
  generateThumbnail(workflow) {
    const type = this.detectWorkflowType(workflow);
    const gradients = {
      video: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
      audio: 'linear-gradient(45deg, #f093fb 0%, #f5576c 100%)',
      image: 'linear-gradient(45deg, #4facfe 0%, #00f2fe 100%)',
      document: 'linear-gradient(45deg, #43e97b 0%, #38f9d7 100%)',
      workflow: 'linear-gradient(45deg, #fa709a 0%, #fee140 100%)',
      other: 'linear-gradient(45deg, #a8edea 0%, #fed6e3 100%)'
    };

    return gradients[type] || gradients.other;
  }

  // Générer un ID unique
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Notification système
  showNotification(message, type = 'info') {
    // Utilise la fonction showNotification existante dans archives.html
    if (typeof showNotification === 'function') {
      showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // Créer une modal de publication
  createPublishModal(workflow) {
    return `
      <div class="modal show" id="publishModal">
        <div class="modal-content" style="max-width: 600px;">
          <div class="modal-header">
            <h3 class="modal-title">📤 Publier sur ACTV</h3>
            <button class="modal-close" onclick="closePublishModal()">✕</button>
          </div>

          <div style="padding: 20px;">
            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">
                Nom du workflow
              </label>
              <input 
                type="text" 
                id="publishTitle" 
                value="${workflow.name}"
                style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);"
              />
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">
                Description
              </label>
              <textarea 
                id="publishDescription" 
                rows="3"
                placeholder="Décrivez ce workflow..."
                style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); resize: vertical;"
              ></textarea>
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">
                Catégorie
              </label>
              <select 
                id="publishCategory"
                style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);"
              >
                <option value="general">Général</option>
                <option value="music">Musique</option>
                <option value="video">Vidéo</option>
                <option value="creative">Créatif</option>
                <option value="tech">Technique</option>
              </select>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <input 
                type="checkbox" 
                id="publishAllowDownload"
                style="width: 18px; height: 18px; cursor: pointer;"
              />
              <label for="publishAllowDownload" style="cursor: pointer; color: var(--text-primary);">
                Autoriser le téléchargement
              </label>
            </div>

            <div style="background: var(--bg-tertiary); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
                Aperçu de la publication
              </div>
              <div style="font-weight: 600; margin-bottom: 4px;">
                ${workflow.name}
              </div>
              <div style="font-size: 13px; color: var(--text-secondary);">
                ${workflow.files?.length || 0} fichiers • Type: ${this.detectWorkflowType(workflow)}
              </div>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button 
                class="btn" 
                onclick="closePublishModal()"
              >
                Annuler
              </button>
              <button 
                class="btn primary" 
                onclick="confirmPublish('${workflow.id}')"
              >
                📤 Publier
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Instance globale
const znkPublisher = new ZNKPublisher();

// Fonctions pour intégration dans archives.html

// Ouvrir la modal de publication
function openPublishModal(workflowId) {
  const workflow = appState.workflows.get(workflowId);
  
  if (!workflow) {
    showNotification('Workflow introuvable', 'error');
    return;
  }

  const modalHTML = znkPublisher.createPublishModal(workflow);
  
  // Supprimer anciennes modals
  document.querySelectorAll('#publishModal').forEach(m => m.remove());
  
  // Ajouter la nouvelle modal
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Fermer la modal
function closePublishModal() {
  document.getElementById('publishModal')?.remove();
}

// Confirmer la publication
async function confirmPublish(workflowId) {
  const workflow = appState.workflows.get(workflowId);
  
  const settings = {
    title: document.getElementById('publishTitle').value,
    description: document.getElementById('publishDescription').value,
    category: document.getElementById('publishCategory').value,
    allowDownload: document.getElementById('publishAllowDownload').checked
  };

  const result = await znkPublisher.publishWorkflow(workflow, settings);

  if (result.success) {
    closePublishModal();
  }
}

console.log('✅ ZNK Publisher Module chargé');