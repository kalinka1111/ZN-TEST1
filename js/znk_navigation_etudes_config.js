/**
 * Configuration de navigation ZNK System
 * Connecte professeurs.html, etudes.html et parents.html
 */

const ZNK_NAVIGATION = {
    // Configuration des modules et leurs chemins
    modules: {
        'etudes': {
            name: 'Espace Élèves',
            path: './modules-etudes/etudes.html',
            icon: '📚',
            roles: ['eleve', 'professeur', 'parent']
        },
        'professeurs': {
            name: 'Espace Professeurs',
            path: './modules-etudes/professeurs.html',
            icon: '👨‍🏫',
            roles: ['professeur']
        },
        'parents': {
            name: 'Espace Parents',
            path: './modules-etudes/parents.html',
            icon: '👨‍👩‍👧‍👦',
            roles: ['parent']
        }
    },

    // Liens inter-modules pour les professeurs
    professeurLinks: {
        'gestion-eleves': {
            targetModule: 'etudes',
            description: 'Voir le dashboard élève'
        },
        'notifications-parents': {
            targetModule: 'parents',
            description: 'Accéder à l\'interface parents'
        }
    },

    // Liens inter-modules pour les élèves
    eleveLinks: {
        'prof-contact': {
            targetModule: 'professeurs',
            description: 'Contacter le professeur'
        }
    },

    // Liens inter-modules pour les parents
    parentLinks: {
        'view-student': {
            targetModule: 'etudes',
            description: 'Voir le dashboard de l\'enfant'
        },
        'contact-teacher': {
            targetModule: 'professeurs',
            description: 'Contacter le professeur'
        }
    },

    // Fonction de navigation entre modules
    navigateTo(moduleName, params = {}) {
        const module = this.modules[moduleName];
        if (!module) {
            console.error(`Module ${moduleName} non trouvé`);
            return;
        }

        // Construction de l'URL avec paramètres
        let url = module.path;
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += `?${queryString}`;
        }

        // Navigation
        if (window.parent && window.parent !== window) {
            // Si dans une iframe, communiquer avec le parent
            window.parent.postMessage({
                type: 'ZNK_NAVIGATE',
                module: moduleName,
                url: url
            }, '*');
        } else {
            // Navigation directe
            window.location.href = url;
        }
    },

    // Fonction pour obtenir les paramètres de l'URL
    getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },

    // Fonction pour vérifier les permissions de navigation
    canNavigateTo(moduleName, userRole) {
        const module = this.modules[moduleName];
        if (!module) return false;
        return module.roles.includes(userRole);
    }
};

// Export pour utilisation globale
if (typeof window !== 'undefined') {
    window.ZNK_NAVIGATION = ZNK_NAVIGATION;
}

/**
 * Gestionnaire de messages inter-modules
 * Permet la communication entre les différentes interfaces
 */
window.addEventListener('message', function(event) {
    // Vérifier l'origine pour la sécurité (en production)
    // if (event.origin !== window.location.origin) return;

    const data = event.data;
    
    switch(data.type) {
        case 'ZNK_NAVIGATE':
            // Gérer la navigation demandée par un module enfant
            if (data.url) {
                const moduleContainer = document.getElementById('moduleContainer');
                if (moduleContainer) {
                    moduleContainer.innerHTML = `
                        <iframe 
                            src="${data.url}" 
                            style="width:100%; height:100%; border:none;"
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                        ></iframe>
                    `;
                }
            }
            break;

        case 'ZNK_UPDATE_BADGE':
            // Mettre à jour les badges de notification
            updateNotificationBadge(data.module, data.count);
            break;

        case 'ZNK_SYNC_DATA':
            // Synchroniser les données entre modules
            syncModuleData(data.dataType, data.payload);
            break;
    }
});

/**
 * Fonctions utilitaires pour la navigation
 */

// Bouton de retour universel
function znkGoBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = './ZNKartEtudesDash.html';
    }
}

// Navigation vers le dashboard élève depuis professeur
function viewStudentDashboard(studentId) {
    ZNK_NAVIGATION.navigateTo('etudes', { studentId: studentId });
}

// Navigation vers l'interface parents depuis professeur
function openParentInterface(studentId) {
    ZNK_NAVIGATION.navigateTo('parents', { childId: studentId });
}

// Navigation vers le professeur depuis élève
function contactProfessor() {
    ZNK_NAVIGATION.navigateTo('professeurs', { action: 'contact' });
}

// Navigation vers le dashboard enfant depuis parents
function viewChildProgress(childId) {
    ZNK_NAVIGATION.navigateTo('etudes', { studentId: childId, parentView: true });
}

// Mise à jour des badges de notification
function updateNotificationBadge(moduleId, count) {
    const badge = document.querySelector(`[data-module="${moduleId}"] .notification-badge`);
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Synchronisation des données entre modules
function syncModuleData(dataType, payload) {
    console.log('Synchronisation des données:', dataType, payload);
    
    // Stocker dans localStorage pour partage entre modules
    try {
        const key = `znk_sync_${dataType}`;
        localStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data: payload
        }));
        
        // Notifier les autres modules
        window.postMessage({
            type: 'ZNK_DATA_SYNCED',
            dataType: dataType
        }, '*');
    } catch (e) {
        console.error('Erreur de synchronisation:', e);
    }
}

// Récupérer les données synchronisées
function getSyncedData(dataType) {
    try {
        const key = `znk_sync_${dataType}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Vérifier que les données ne sont pas trop anciennes (5 min)
            if (Date.now() - parsed.timestamp < 300000) {
                return parsed.data;
            }
        }
    } catch (e) {
        console.error('Erreur de récupération:', e);
    }
    return null;
}

/**
 * Système de breadcrumb pour la navigation
 */
function initBreadcrumb() {
    const breadcrumbContainer = document.createElement('div');
    breadcrumbContainer.id = 'znk-breadcrumb';
    breadcrumbContainer.style.cssText = `
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.05);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 14px;
        color: #a0a0a0;
    `;
    
    const params = ZNK_NAVIGATION.getUrlParams();
    const breadcrumb = ['ZNK Études'];
    
    // Ajouter le module actuel
    const currentPath = window.location.pathname;
    if (currentPath.includes('professeurs')) {
        breadcrumb.push('Professeurs');
    } else if (currentPath.includes('etudes')) {
        breadcrumb.push('Élèves');
    } else if (currentPath.includes('parents')) {
        breadcrumb.push('Parents');
    }
    
    // Ajouter les paramètres contextuels
    if (params.studentId) {
        breadcrumb.push(`Élève #${params.studentId}`);
    }
    if (params.childId) {
        breadcrumb.push(`Enfant #${params.childId}`);
    }
    
    breadcrumbContainer.innerHTML = breadcrumb.join(' › ');
    
    // Insérer après le header
    const header = document.querySelector('.header');
    if (header && header.nextSibling) {
        header.parentNode.insertBefore(breadcrumbContainer, header.nextSibling);
    }
}

// Initialiser au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBreadcrumb);
} else {
    initBreadcrumb();
}

console.log('✅ ZNK Navigation System initialisé');