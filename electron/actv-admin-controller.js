/**
 * ACTV Admin Controller
 * Gère l'authentification admin et le contrôle de la télévision ZNK
 */

class ACTVAdminController {
    constructor(options = {}) {
        this.isAuthenticated = false;
        this.adminUser = null;
        this.sasAuthPath = options.sasAuthPath || './mecanismes/sas/';
        this.currentModule = 'actv-regie';
        this.workflowManager = null;
        this.cameraCore = null;
        this.isLive = false;
        this.currentShow = null;
        
        console.log('[ACTV Admin] Controller initialized');
    }

    /**
     * Authentifier en tant qu'admin
     */
    async authenticate(username, password) {
        try {
            console.log('[ACTV Admin] Authenticating:', username);

            // Appel SAS (à adapter selon votre système)
            const response = await fetch(`${this.sasAuthPath}login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role: 'admin' })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Vérifier que c'est un admin
                if (data.role !== 'admin') {
                    this.showError('Accès refusé - Admin requis');
                    return false;
                }

                this.isAuthenticated = true;
                this.adminUser = data;
                
                // Sauvegarder le token
                localStorage.setItem('znk_admin_token', data.token);
                localStorage.setItem('znk_admin_user', JSON.stringify(data));
                
                console.log('[ACTV Admin] ✅ Authenticated:', this.adminUser.username);
                this.showSuccess(`Bienvenue Admin ${data.username}`);
                
                return true;
            } else {
                this.showError('Authentification échouée');
                return false;
            }

        } catch (error) {
            console.error('[ACTV Admin] Auth error:', error);
            
            // Mode développement: accepter sans SAS
            if (error.message.includes('Failed to fetch')) {
                console.warn('[ACTV Admin] SAS non disponible - Mode développement');
                this.isAuthenticated = true;
                this.adminUser = {
                    username: 'admin',
                    role: 'admin',
                    token: 'dev-token-' + Date.now()
                };
                localStorage.setItem('znk_admin_user', JSON.stringify(this.adminUser));
                return true;
            }
            
            return false;
        }
    }

    /**
     * Vérifier l'authentification au démarrage
     */
    async checkAuthentication() {
        const token = localStorage.getItem('znk_admin_token');
        const userStr = localStorage.getItem('znk_admin_user');

        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                this.adminUser = user;
                this.isAuthenticated = true;
                
                console.log('[ACTV Admin] Restored auth:', user.username);
                return true;
            } catch (e) {
                console.warn('[ACTV Admin] Invalid stored auth');
            }
        }

        return false;
    }

    /**
     * Initialiser après auth réussie
     */
    async initialize(workflowManager, cameraCore) {
        if (!this.isAuthenticated) {
            console.error('[ACTV Admin] Not authenticated');
            return false;
        }

        this.workflowManager = workflowManager;
        this.cameraCore = cameraCore;

        console.log('[ACTV Admin] Initialization started');
        
        // Charger les workflows sauvegardés
        const workflows = await this.workflowManager.loadAllWorkflows();
        console.log('[ACTV Admin] Workflows chargés:', workflows.length);

        return true;
    }

    /**
     * Démarrer un enregistrement de workflow
     */
    async startWorkflowRecording(workflowName) {
        if (!this.isAuthenticated) {
            this.showError('Admin requis');
            return false;
        }

        try {
            const workflow = {
                id: 'workflow_' + Date.now(),
                name: workflowName,
                admin: this.adminUser.username,
                createdAt: new Date().toISOString(),
                status: 'recording',
                duration: 0,
                recordings: []
            };

            // Démarrer la caméra
            if (this.cameraCore) {
                this.cameraCore.startRecording();
                this.showSuccess(`Enregistrement: ${workflowName}`);
            }

            // Sauvegarder dans le manager
            this.currentShow = workflow;
            
            return workflow;

        } catch (error) {
            console.error('[ACTV Admin] Recording error:', error);
            this.showError('Erreur enregistrement');
            return false;
        }
    }

    /**
     * Arrêter l'enregistrement
     */
    async stopWorkflowRecording() {
        if (!this.currentShow) {
            this.showError('Aucun enregistrement actif');
            return false;
        }

        try {
            // Arrêter la caméra
            if (this.cameraCore) {
                this.cameraCore.stopRecording();
            }

            // Sauvegarder le workflow
            this.currentShow.status = 'saved';
            this.currentShow.duration = Date.now() - new Date(this.currentShow.createdAt).getTime();

            if (this.workflowManager) {
                await this.workflowManager.saveWorkflow(this.currentShow);
                this.showSuccess(`Workflow sauvegardé: ${this.currentShow.name}`);
            }

            return this.currentShow;

        } catch (error) {
            console.error('[ACTV Admin] Stop recording error:', error);
            this.showError('Erreur lors de l\'arrêt');
            return false;
        }
    }

    /**
     * Diffuser un workflow en direct
     */
    async broadcastWorkflow(workflowId) {
        if (!this.isAuthenticated) {
            this.showError('Admin requis');
            return false;
        }

        try {
            const workflow = await this.workflowManager.getWorkflow(workflowId);
            
            if (!workflow) {
                this.showError('Workflow non trouvé');
                return false;
            }

            this.isLive = true;
            this.currentShow = workflow;

            // Diffuser aux spectateurs
            this.broadcastToViewers(workflow);

            this.showSuccess(`🔴 EN DIRECT: ${workflow.name}`);
            return true;

        } catch (error) {
            console.error('[ACTV Admin] Broadcast error:', error);
            this.showError('Erreur de diffusion');
            return false;
        }
    }

    /**
     * Arrêter la diffusion
     */
    stopBroadcast() {
        this.isLive = false;
        this.showSuccess('Diffusion arrêtée');
    }

    /**
     * Envoyer le workflow aux spectateurs
     */
    broadcastToViewers(workflow) {
        // Via WebSocket ou polling
        const broadcastData = {
            type: 'actv-broadcast',
            workflow: workflow,
            timestamp: Date.now(),
            admin: this.adminUser.username
        };

        // Émettre localement d'abord
        window.dispatchEvent(new CustomEvent('actv-workflow-updated', {
            detail: broadcastData
        }));

        // Sauvegarder en base (localStorage pour dev)
        localStorage.setItem('znk_current_broadcast', JSON.stringify(broadcastData));

        console.log('[ACTV Admin] Broadcast envoyé:', workflow.name);
    }

    /**
     * Afficher les notifications
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            font-weight: 500;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => notif.remove(), 3000);
    }

    /**
     * Déconnexion
     */
    logout() {
        this.isAuthenticated = false;
        this.adminUser = null;
        this.isLive = false;
        localStorage.removeItem('znk_admin_token');
        localStorage.removeItem('znk_admin_user');
        
        console.log('[ACTV Admin] Logged out');
        window.location.href = './';
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.ACTVAdminController = ACTVAdminController;
}
