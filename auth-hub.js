// Script JavaScript pour auth-hub.html (à remplacer dans votre fichier)

const isElectron = typeof require !== 'undefined';
let ipcRenderer = null;

if (isElectron) {
    try {
        ipcRenderer = require('electron').ipcRenderer;
        console.log('✅ Mode Electron détecté');
    } catch (e) {
        console.log('⚠️ IPC non disponible');
    }
}

// Comptes de test
const TEST_ACCOUNTS = {
    'admin@znk.system': { code: '1234', idZNK: '001234', role: 'admin' },
    'membre@echo.znk': { code: '5558', idZNK: 'ME5678', role: 'member' },
    'ecole@echo.znk': { code: '3456', idZNK: 'ET3456', role: 'ecole' },
    'test@echo.znk': { code: '9012', idZNK: 'VI9012', role: 'visitor' }
};

// Configuration des rôles
const ROLES_CONFIG = {
    admin: {
        prefix: '00',
        name: 'Administrateur',
        permissions: ['scan', 'create', 'organize', 'stats', 'modify_system'],
        dashboard: 'ZNKadminDash.html'
    },
    member: {
        prefix: 'ME',
        name: 'Membre',
        permissions: ['scan', 'create', 'organize', 'stats'],
        dashboard: 'ZNKMembresDash.html'
    },
    ecole: {
        prefix: 'ET',
        name: 'École',
        permissions: ['scan', 'create', 'organize', 'stats'],
        dashboard: 'ZNKartEtudesDash.html'
    },
    visitor: {
        prefix: 'VI',
        name: 'Visiteur',
        permissions: ['scan', 'create', 'stats'],
        dashboard: 'ZNKvisiteurDash.html'
    }
};

let enteredCode = '';

function initAuth() {
    document.querySelectorAll('.key').forEach(key => {
        key.addEventListener('click', handleKeyPress);
    });
    
    document.addEventListener('keydown', handlePhysicalKeyboard);
    document.getElementById('emailInput').addEventListener('input', detectUserInfo);
    document.getElementById('emailInput').addEventListener('blur', detectUserInfo);
    
    loadLastEmail();
}

function loadLastEmail() {
    const storedAccount = localStorage.getItem('znk_account');
    if (storedAccount) {
        try {
            const account = JSON.parse(storedAccount);
            document.getElementById('emailInput').value = account.email;
            detectUserInfo();
        } catch (e) {
            console.log('Pas de compte détecté');
        }
    }
}

function detectUserInfo() {
    const email = document.getElementById('emailInput').value.trim().toLowerCase();
    
    if (!email) {
        document.getElementById('userInfoBanner').style.display = 'none';
        return;
    }

    let userInfo = null;

    // Vérifier compte local
    const storedAccount = localStorage.getItem('znk_account');
    if (storedAccount) {
        try {
            const account = JSON.parse(storedAccount);
            if (account.email.toLowerCase() === email) {
                userInfo = {
                    idZNK: account.idZNK,
                    email: account.email,
                    role: detectRoleFromId(account.idZNK)
                };
            }
        } catch (e) {
            console.error('Erreur parsing account:', e);
        }
    }

    // Vérifier comptes de test
    if (!userInfo && TEST_ACCOUNTS[email]) {
        userInfo = TEST_ACCOUNTS[email];
        userInfo.email = email;
    }

    if (userInfo) {
        displayUserInfo(userInfo);
    } else {
        document.getElementById('userInfoBanner').style.display = 'none';
    }
}

function detectRoleFromId(idZNK) {
    const prefix = idZNK.substring(0, 2);
    
    switch(prefix) {
        case '00': return 'admin';
        case 'ME': return 'member';
        case 'ET': return 'ecole';
        case 'VI': return 'visitor';
        default: return 'visitor';
    }
}

function displayUserInfo(userInfo) {
    document.getElementById('displayIdZNK').textContent = userInfo.idZNK;
    document.getElementById('displayEmail').textContent = userInfo.email;
    
    const roleBadge = document.getElementById('displayRole');
    const roleConfig = ROLES_CONFIG[userInfo.role];
    
    roleBadge.textContent = roleConfig.name;
    roleBadge.className = 'role-badge ' + userInfo.role;
    
    document.getElementById('userInfoBanner').style.display = 'block';
}

function handleKeyPress(e) {
    const key = e.target.dataset.key;
    processKey(key);
}

function handlePhysicalKeyboard(e) {
    if (e.key >= '0' && e.key <= '9') {
        processKey(e.key);
    } else if (e.key === 'Backspace') {
        processKey('clear');
    } else if (e.key === 'Enter') {
        processKey('enter');
    }
}

function processKey(key) {
    if (key === 'clear') {
        enteredCode = '';
    } else if (key === 'enter') {
        loginUser();
    } else if (key >= '0' && key <= '9' && enteredCode.length < 4) {
        enteredCode += key;
    }
    updateCodeDisplay();
}

function updateCodeDisplay() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`dot${i}`);
        if (dot) {
            dot.classList.toggle('filled', i <= enteredCode.length);
        }
    }
}

async function loginUser() {
    const email = document.getElementById('emailInput').value.trim().toLowerCase();
    const code = enteredCode;

    if (!email) {
        showError('⚠️ Veuillez entrer votre email ZNK');
        return;
    }

    if (code.length !== 4) {
        showError('⚠️ Code à 4 chiffres requis');
        return;
    }

    console.log('🔐 Tentative de connexion:', email);

    let authenticated = false;
    let accountData = null;

    // MODE ELECTRON : Utiliser IPC pour vérifier dans la vraie DB
    if (isElectron && ipcRenderer) {
        try {
            console.log('📡 Authentification via IPC...');
            const result = await ipcRenderer.invoke('authenticate-user', { email, code });
            
            console.log('📡 Réponse IPC:', result);
            
            if (result.success) {
                authenticated = true;
                accountData = result.user;
                console.log('✅ Authentification IPC réussie:', accountData);
            } else {
                console.log('❌ Authentification IPC échouée:', result.error);
            }
        } catch (error) {
            console.error('❌ Erreur IPC:', error);
        }
    }

    // FALLBACK : Vérifier localStorage (mode web ou si IPC échoue)
    if (!authenticated) {
        console.log('🔍 Vérification localStorage...');
        
        const storedAccount = localStorage.getItem('znk_account');
        if (storedAccount) {
            try {
                const account = JSON.parse(storedAccount);
                if (account.email.toLowerCase() === email && account.code === code) {
                    authenticated = true;
                    accountData = account;
                    accountData.role = detectRoleFromId(account.idZNK);
                    console.log('✅ Compte trouvé dans localStorage');
                }
            } catch (e) {
                console.error('Erreur localStorage:', e);
            }
        }
    }

    // Vérifier comptes de test
    if (!authenticated && TEST_ACCOUNTS[email]) {
        console.log('🔍 Vérification comptes de test...');
        const testAccount = TEST_ACCOUNTS[email];
        if (testAccount.code === code) {
            authenticated = true;
            accountData = {
                idZNK: testAccount.idZNK,
                email: email,
                role: testAccount.role,
                prenom: email.split('@')[0],
                nom: 'Test',
                balance: 0,
                betis: 0
            };
            console.log('✅ Compte de test trouvé');
        }
    }

    // Authentifier
    if (authenticated && accountData) {
        const userId = accountData.idZNK || `user_${accountData.role}_${Date.now()}`;
        
        // SessionStorage (pour la session courante)
        sessionStorage.setItem('znk_authenticated', 'true');
        sessionStorage.setItem('znk_role', accountData.role);
        sessionStorage.setItem('znk_idZNK', accountData.idZNK);
        sessionStorage.setItem('znk_userData', JSON.stringify(accountData));
        
        const roleConfig = ROLES_CONFIG[accountData.role];
        sessionStorage.setItem('znk_permissions', JSON.stringify(roleConfig.permissions));
        
        // LocalStorage (pour persistance)
        localStorage.setItem('currentUserId', userId);
        localStorage.setItem('currentUserName', `${accountData.prenom || 'User'} ${accountData.nom || 'ZNK'}`);
        localStorage.setItem('znk_user_' + userId, JSON.stringify({
            id: userId,
            prenom: accountData.prenom || 'User',
            nom: accountData.nom || 'ZNK',
            role: accountData.role,
            idZNK: accountData.idZNK,
            email: accountData.email
        }));
        
        console.log('✅ Authentification réussie!');
        console.log('👤 Utilisateur:', accountData.email);
        console.log('🎭 Rôle:', accountData.role);
        console.log('📄 Dashboard:', roleConfig.dashboard);
        
        unlockApp(accountData.role, roleConfig.name, roleConfig.dashboard);
    } else {
        console.log('❌ Authentification échouée pour:', email);
        showError('❌ Email ou code incorrect');
        enteredCode = '';
        updateCodeDisplay();
    }
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message || 'Erreur de connexion';
    errorEl.classList.add('show');
    
    enteredCode = '';
    updateCodeDisplay();
    
    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 2500);
}

function unlockApp(role, roleName, dashboardFile) {
    const successMsg = document.getElementById('successMessage');
    successMsg.textContent = `✅ Bienvenue ${roleName}`;
    successMsg.style.display = 'block';
    
    setTimeout(() => {
        successMsg.style.display = 'none';
        document.getElementById('loadingOverlay').style.display = 'flex';
    }, 800);
    
    setTimeout(() => {
        redirectToHub(dashboardFile);
    }, 1500);
}

function redirectToHub(dashboardFile) {
    console.log('🚀 Redirection vers:', dashboardFile);
    
    if (isElectron && ipcRenderer) {
        // Mode Electron : utiliser IPC
        console.log('📡 Navigation via IPC...');
        ipcRenderer.send('navigate-to-module', dashboardFile);
        
        // Timeout de sécurité
        setTimeout(() => {
            console.log('⏱️ Timeout atteint, vérification...');
        }, 3000);
        
    } else {
        // Mode web : navigation directe
        console.log('🌐 Navigation web directe...');
        try {
            window.location.href = dashboardFile;
        } catch (error) {
            console.error('❌ Erreur navigation:', error);
            showError('Erreur: Impossible de charger ' + dashboardFile);
            document.getElementById('loadingOverlay').style.display = 'none';
        }
    }
}

// Écouter les événements IPC si disponibles
if (ipcRenderer) {
    ipcRenderer.on('navigation-success', (event, data) => {
        console.log('✅ Navigation réussie:', data);
        document.getElementById('loadingOverlay').style.display = 'none';
    });
    
    ipcRenderer.on('navigation-error', (event, error) => {
        console.error('❌ Erreur de navigation:', error);
        showError('Fichier non trouvé: ' + error.file);
        document.getElementById('loadingOverlay').style.display = 'none';
    });
    
    ipcRenderer.on('module-not-found', (event, data) => {
        console.error('⚠️ Module non trouvé:', data);
        showError('Module ' + data.module + ' non trouvé');
        document.getElementById('loadingOverlay').style.display = 'none';
    });
}

// API publique
window.ZNKAuth = {
    getCurrentRole: function() {
        return sessionStorage.getItem('znk_role');
    },
    isAuthenticated: function() {
        return sessionStorage.getItem('znk_authenticated') === 'true';
    },
    getPermissions: function() {
        return JSON.parse(sessionStorage.getItem('znk_permissions') || '[]');
    },
    logout: function() {
        sessionStorage.clear();
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('currentUserName');
        location.reload();
    },
    detectRole: detectRoleFromId
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    console.log('🔐 Système d\'authentification ZNK initialisé');
    
    if (ipcRenderer) {
        ipcRenderer.send('auth-screen-ready');
    }
});

// Easter egg
let logoClickCount = 0;
document.querySelector('.znk-logo').addEventListener('click', () => {
    logoClickCount++;
    if (logoClickCount === 3) {
        console.log('🔓 Mode développeur activé');
        document.getElementById('infoText').style.color = '#00ffff';
        logoClickCount = 0;
    }
    setTimeout(() => { logoClickCount = 0; }, 2000);
});

console.log('✅ Auth-hub ZNK chargé');