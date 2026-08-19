/**
 * ZNK SESSION MANAGER
 * Compatible avec auth-hub.html et navigation Electron
 */

class ZNKSession {
    constructor() {
        this.currentUser = null;
        this.isElectron = typeof window.electronAPI !== 'undefined';
        // Les pages consommatrices peuvent faire `await window.ZNKSession.ready`
        // pour être sûres que la session (si elle existe) est chargée avant de
        // lire getCurrentUser() — évite une race au premier rendu.
        this.ready = this.init();
    }

    async init() {
        console.log('🔐 ZNK Session Manager initialisé');
        
        // ✅ CORRECTION: Lire depuis localStorage au lieu de sessionStorage
        const userId = localStorage.getItem('currentUserId');
        
        if (userId) {
            console.log('👤 UserId trouvé:', userId);
            await this.loadUserData(userId);
        } else {
            console.warn('⚠️ Pas de session active');
        }
    }

    /**
     * Normalise un enregistrement utilisateur venant de sources hétérogènes
     * (inscription.html écrit idZNK/email, d'autres modules attendent id/emailZnk).
     * Garantit que id, emailZnk et whatsznk existent toujours en sortie.
     */
    normalizeUser(raw) {
        if (!raw) return raw;
        const user = { ...raw };
        user.id = user.id || user.idZNK;
        user.idZNK = user.idZNK || user.id;
        user.emailZnk = user.emailZnk || user.email;
        user.email = user.email || user.emailZnk;
        user.whatsznk = user.whatsznk || user.idZNK || user.id;
        return user;
    }

    /**
     * Charger les données complètes de l'utilisateur
     */
    async loadUserData(userId) {
        try {
            // ✅ NOUVEAU: D'abord essayer de charger depuis localStorage
            const cachedData = localStorage.getItem('znk_user_' + userId);
            if (cachedData) {
                this.currentUser = this.normalizeUser(JSON.parse(cachedData));
                console.log('✅ Utilisateur chargé depuis cache:', this.currentUser.prenom, this.currentUser.nom);
                this.updateUI();
                return this.currentUser;
            }
            
            // Si Electron, essayer de charger depuis le main process
            if (this.isElectron && window.electronAPI && window.electronAPI.getUserData) {
                const userData = await window.electronAPI.getUserData(userId);
                if (userData && !userData.error) {
                    this.currentUser = this.normalizeUser(userData);
                    console.log('✅ Utilisateur chargé depuis Electron:', userData.prenom, userData.nom);
                    
                    // Mettre en cache
                    localStorage.setItem('znk_user_' + userId, JSON.stringify(this.currentUser));
                    
                    this.updateUI();
                    return this.currentUser;
                }
            }
        } catch (error) {
            console.error('❌ Erreur chargement utilisateur:', error);
        }
        
        return null;
    }

    /**
     * Obtenir l'utilisateur actuel
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Vérifier si l'utilisateur est connecté
     */
    isLoggedIn() {
        return this.currentUser !== null;
    }

    /**
     * Obtenir tous les utilisateurs (pour sélection)
     */
    async getAllUsers() {
        if (!this.isElectron || !window.electronAPI || !window.electronAPI.getAllUsers) {
            return [];
        }
        return await window.electronAPI.getAllUsers();
    }

    /**
     * Connexion utilisateur avec PIN
     */
    async login(userId, pin) {
        if (!this.isElectron || !window.electronAPI) {
            console.warn('⚠️ Mode web - connexion simulée');
            return true;
        }

        try {
            const result = await window.electronAPI.verifyUserPin(userId, pin);
            
            if (result.valid) {
                const userData = await this.loadUserData(userId);
                if (userData) {
                    localStorage.setItem('currentUserId', userId);
                    localStorage.setItem('currentUserName', `${userData.prenom} ${userData.nom}`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('❌ Erreur connexion:', error);
            return false;
        }
    }

    /**
     * Ouvre une session directement à partir d'un objet utilisateur déjà
     * connu (ex: juste après la création de compte dans inscription.html,
     * ou connexion en mode web sans electronAPI). Contrairement à login(),
     * ne nécessite pas de vérification PIN côté Electron.
     */
    setSession(userData) {
        const user = this.normalizeUser(userData);
        if (!user || !user.id) {
            console.warn('⚠️ setSession: utilisateur invalide (id manquant)');
            return false;
        }

        this.currentUser = user;
        localStorage.setItem('currentUserId', user.id);
        localStorage.setItem('currentUserName', `${user.prenom || ''} ${user.nom || ''}`.trim());
        localStorage.setItem('znk_user_' + user.id, JSON.stringify(user));

        // ⚠️ Sans ceci, setSession() ne touchait QUE le cache localStorage.
        // La vraie source de vérité (users.json, via userStorage côté main
        // process) n'était jamais mise à jour, et venait écraser ce cache
        // au prochain login/authenticate-user — d'où la photo (et tout
        // changement fait via setSession) qui disparaissait au redémarrage.
        if (this.isElectron && window.electronAPI && window.electronAPI.updateUserData) {
            window.electronAPI.updateUserData(user.id, user);
        }

        this.updateUI();
        console.log('✅ Session ouverte pour:', user.prenom, user.nom, `(${user.id})`);
        return true;
    }

    /**
     * Déconnexion
     */
    logout() {
        this.currentUser = null;
        localStorage.clear();
        console.log('👋 Utilisateur déconnecté');
        
        // Rediriger vers l'intro/auth
        window.location.href = '/index.html';
    }

    /**
     * Changer d'utilisateur
     */
    switchUser() {
        this.logout();
    }

    /**
     * Mettre à jour l'interface avec les infos utilisateur
     */
    updateUI() {
        if (!this.currentUser) return;

        // Mettre à jour l'avatar
        const avatarElements = document.querySelectorAll('[data-znk-avatar]');
        avatarElements.forEach(el => {
            const p = this.currentUser.prenom || '?';
            const n = this.currentUser.nom || '';
            const initials = `${p[0] || '?'}${n[0] || ''}`.toUpperCase();
            
            if (el.tagName === 'IMG') {
                el.onerror = () => {
                    el.outerHTML = `<div style="width:100%;height:100%;background:linear-gradient(135deg,#00ffff,#0080ff);display:flex;align-items:center;justify-content:center;font-weight:bold;color:#000;border-radius:inherit;">${initials}</div>`;
                };
            } else {
                el.textContent = initials;
                el.style.background = 'linear-gradient(135deg, #00ffff, #0080ff)';
                el.style.color = '#000';
            }
        });

        // Mettre à jour le nom
        const nameElements = document.querySelectorAll('[data-znk-username]');
        nameElements.forEach(el => {
            el.textContent = `${this.currentUser.prenom} ${this.currentUser.nom}`;
        });

        // Mettre à jour le rôle
        const roleElements = document.querySelectorAll('[data-znk-role]');
        roleElements.forEach(el => {
            el.textContent = this.getRoleDisplay(this.currentUser.role);
        });

        // Mettre à jour le WhatsZNK
        const whatsznkElements = document.querySelectorAll('[data-znk-whatsznk]');
        whatsznkElements.forEach(el => {
            el.textContent = this.currentUser.whatsznk || this.currentUser.idZNK;
        });

        // Mettre à jour l'email ZNK
        const emailElements = document.querySelectorAll('[data-znk-email]');
        emailElements.forEach(el => {
            el.textContent = this.currentUser.emailZnk || this.currentUser.email;
        });
    }

    /**
     * Obtenir l'affichage du rôle
     */
    getRoleDisplay(role) {
        const roles = {
            'admin': '⚡ Administrateur',
            'member': '🎨 Membre',
            'ecole': '🎓 École',
            'visitor': '👤 Visiteur',
            'visiteur': '👤 Visiteur',
            'Artiste': '🎨 Artiste',
            'eleve': '🎓 Élève',
            'mecene': '💎 Mécène'
        };
        return roles[role] || role;
    }

    /**
     * Sauvegarder les modifications du profil
     */
    async updateProfile(updates) {
        if (!this.currentUser) return false;

        try {
            if (this.isElectron && window.electronAPI && window.electronAPI.updateUserData) {
                await window.electronAPI.updateUserData(this.currentUser.id, updates);
            }
            
            // Mettre à jour le cache local
            this.currentUser = { ...this.currentUser, ...updates };
            localStorage.setItem('znk_user_' + this.currentUser.id, JSON.stringify(this.currentUser));
            
            // Recharger les données
            await this.loadUserData(this.currentUser.id);
            
            console.log('✅ Profil mis à jour');
            return true;
        } catch (error) {
            console.error('❌ Erreur mise à jour profil:', error);
            return false;
        }
    }

    /**
     * Obtenir les statistiques utilisateur
     */
    async getUserStats() {
        if (!this.isElectron || !window.electronAPI) return null;
        return await window.electronAPI.getUsersStats();
    }

    /**
     * Protéger une page (rediriger si pas connecté)
     */
    requireAuth() {
        if (!this.isLoggedIn()) {
            console.warn('⚠️ Accès refusé - redirection vers authentification');
            window.location.href = '/auth-hub.html';
            return false;
        }
        return true;
    }

    /**
     * Créer un bouton de déconnexion automatiquement
     */
    addLogoutButton(container) {
        const btn = document.createElement('button');
        btn.className = 'znk-logout-btn';
        btn.innerHTML = '🚪 Changer d\'utilisateur';
        btn.onclick = () => this.switchUser();
        
        btn.style.cssText = `
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(0, 255, 255, 0.3);
            border-radius: 12px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
        `;
        
        btn.onmouseover = () => {
            btn.style.background = 'rgba(0, 255, 255, 0.2)';
            btn.style.borderColor = '#00ffff';
        };
        
        btn.onmouseout = () => {
            btn.style.background = 'rgba(255, 255, 255, 0.1)';
            btn.style.borderColor = 'rgba(0, 255, 255, 0.3)';
        };
        
        if (typeof container === 'string') {
            document.querySelector(container)?.appendChild(btn);
        } else {
            container?.appendChild(btn);
        }
    }
}

// Créer l'instance globale
window.ZNKSession = new ZNKSession();

// Auto-initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 ZNK Session Manager prêt');
    
    // Si on est sur une page protégée, vérifier l'auth
    if (document.body.hasAttribute('data-znk-protected')) {
        window.ZNKSession.requireAuth();
    }
    
    // Mettre à jour l'UI si utilisateur connecté
    if (window.ZNKSession.isLoggedIn()) {
        window.ZNKSession.updateUI();
    }
});

// Export pour utilisation dans d'autres scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZNKSession;
}