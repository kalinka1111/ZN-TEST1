// user-storage.js - Gestion persistante des utilisateurs avec electron-store

const Store = require('electron-store');
const crypto = require('crypto');

// Configuration du store avec schéma de validation
const schema = {
    users: {
        type: 'object',
        additionalProperties: {
            type: 'object',
            properties: {
                idZNK: { type: 'string' },
                email: { type: 'string' },
                prenom: { type: 'string' },
                nom: { type: 'string' },
                role: { type: 'string', enum: ['admin', 'member', 'ecole', 'visitor'] },
                codeHash: { type: 'string' }, // Code hashé, jamais en clair
                balance: { type: 'number', default: 0 },
                betis: { type: 'number', default: 0 },
                createdAt: { type: 'string' },
                lastLogin: { type: 'string' }
            },
            required: ['idZNK', 'email', 'codeHash', 'role']
        }
    },
    settings: {
        type: 'object',
        properties: {
            lastUsedEmail: { type: 'string' },
            theme: { type: 'string', default: 'dark' }
        }
    }
};

// Initialiser le store avec chiffrement
const store = new Store({
    schema,
    encryptionKey: 'znk-smartHub-2025-secure-key', // EN PRODUCTION: Utiliser une clé générée
    name: 'znk-users',
    defaults: {
        users: {},
        settings: {
            lastUsedEmail: '',
            theme: 'dark'
        }
    }
});

// Utilitaire : Hasher un code PIN de manière sécurisée
function hashCode(code, salt = null) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.pbkdf2Sync(code, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

// Utilitaire : Vérifier un code PIN
function verifyCode(code, storedHash, salt) {
    const { hash } = hashCode(code, salt);
    return hash === storedHash;
}

// Générer un ID ZNK unique
function generateIdZNK(role) {
    const prefixes = {
        admin: '00',
        member: 'ME',
        ecole: 'ET',
        visitor: 'VI'
    };
    
    const prefix = prefixes[role] || 'VI';
    const random = Math.floor(1000 + Math.random() * 9000); // 4 chiffres
    return `${prefix}${random}`;
}

// API de gestion des utilisateurs
class UserStorage {
    
    // Créer un nouvel utilisateur
    static createUser(userData) {
        const { email, code, prenom, nom, role = 'visitor' } = userData;
        
        // Validation
        if (!email || !code || !prenom || !nom) {
            throw new Error('Données incomplètes');
        }
        
        if (code.length !== 4 || !/^\d{4}$/.test(code)) {
            throw new Error('Le code doit contenir 4 chiffres');
        }
        
        // Vérifier si l'email existe déjà
        if (this.getUserByEmail(email)) {
            throw new Error('Cet email est déjà utilisé');
        }
        
        // Générer ID unique
        const idZNK = generateIdZNK(role);
        
        // Hasher le code
        const { hash, salt } = hashCode(code);
        
        // Créer l'utilisateur
        const user = {
            idZNK,
            email: email.toLowerCase(),
            prenom,
            nom,
            role,
            codeHash: hash,
            codeSalt: salt,
            balance: 0,
            betis: 0,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        // Sauvegarder
        const users = store.get('users', {});
        users[idZNK] = user;
        store.set('users', users);
        
        console.log('✅ Utilisateur créé:', idZNK);
        return { success: true, idZNK, email: user.email };
    }
    
    // Authentifier un utilisateur
    static authenticateUser(email, code) {
        const user = this.getUserByEmail(email);
        
        if (!user) {
            return { success: false, error: 'Utilisateur non trouvé' };
        }
        
        // Vérifier le code
        const isValid = verifyCode(code, user.codeHash, user.codeSalt);
        
        if (!isValid) {
            return { success: false, error: 'Code incorrect' };
        }
        
        // Mettre à jour la dernière connexion
        user.lastLogin = new Date().toISOString();
        this.updateUser(user.idZNK, { lastLogin: user.lastLogin });
        
        console.log('✅ Authentification réussie:', user.email);
        
        // Retourner les données sans le hash
        const { codeHash, codeSalt, ...safeUser } = user;
        return { success: true, user: safeUser };
    }
    
    // Récupérer un utilisateur par email
    static getUserByEmail(email) {
        const users = store.get('users', {});
        const normalizedEmail = email.toLowerCase();
        
        return Object.values(users).find(u => u.email === normalizedEmail);
    }
    
    // Récupérer un utilisateur par ID
    static getUserById(idZNK) {
        const users = store.get('users', {});
        const user = users[idZNK];
        
        if (user) {
            const { codeHash, codeSalt, ...safeUser } = user;
            return safeUser;
        }
        return null;
    }
    
    // Mettre à jour un utilisateur
    static updateUser(idZNK, updates) {
        const users = store.get('users', {});
        
        if (!users[idZNK]) {
            throw new Error('Utilisateur non trouvé');
        }
        
        // Ne pas permettre la modification de certains champs sensibles
        const { codeHash, codeSalt, idZNK: _, role, createdAt, ...safeUpdates } = updates;
        
        users[idZNK] = {
            ...users[idZNK],
            ...safeUpdates
        };
        
        store.set('users', users);
        console.log('✅ Utilisateur mis à jour:', idZNK);
        return true;
    }
    
    // Changer le code PIN
    static changeCode(idZNK, oldCode, newCode) {
        const users = store.get('users', {});
        const user = users[idZNK];
        
        if (!user) {
            throw new Error('Utilisateur non trouvé');
        }
        
        // Vérifier l'ancien code
        if (!verifyCode(oldCode, user.codeHash, user.codeSalt)) {
            throw new Error('Ancien code incorrect');
        }
        
        // Valider le nouveau code
        if (newCode.length !== 4 || !/^\d{4}$/.test(newCode)) {
            throw new Error('Le nouveau code doit contenir 4 chiffres');
        }
        
        // Hasher le nouveau code
        const { hash, salt } = hashCode(newCode);
        
        users[idZNK].codeHash = hash;
        users[idZNK].codeSalt = salt;
        
        store.set('users', users);
        console.log('✅ Code changé pour:', idZNK);
        return true;
    }
    
    // Supprimer un utilisateur
    static deleteUser(idZNK) {
        const users = store.get('users', {});
        
        if (!users[idZNK]) {
            throw new Error('Utilisateur non trouvé');
        }
        
        delete users[idZNK];
        store.set('users', users);
        console.log('✅ Utilisateur supprimé:', idZNK);
        return true;
    }
    
    // Lister tous les utilisateurs (sans données sensibles)
    static getAllUsers() {
        const users = store.get('users', {});
        
        return Object.values(users).map(user => {
            const { codeHash, codeSalt, ...safeUser } = user;
            return safeUser;
        });
    }
    
    // Obtenir les statistiques
    static getStats() {
        const users = this.getAllUsers();
        
        const stats = {
            total: users.length,
            byRole: {
                admin: users.filter(u => u.role === 'admin').length,
                member: users.filter(u => u.role === 'member').length,
                ecole: users.filter(u => u.role === 'ecole').length,
                visitor: users.filter(u => u.role === 'visitor').length
            },
            recentLogins: users
                .filter(u => u.lastLogin)
                .sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin))
                .slice(0, 5)
        };
        
        return stats;
    }
    
    // Sauvegarder les paramètres
    static saveSettings(settings) {
        store.set('settings', { ...store.get('settings', {}), ...settings });
    }
    
    // Récupérer les paramètres
    static getSettings() {
        return store.get('settings', {});
    }
    
    // Réinitialiser toutes les données (DANGER)
    static reset() {
        store.clear();
        console.log('⚠️ Toutes les données ont été effacées');
    }
    
    // Exporter les données (pour backup)
    static exportData() {
        return {
            users: this.getAllUsers(), // Sans les hashes
            settings: this.getSettings(),
            exportedAt: new Date().toISOString()
        };
    }
}

// Initialiser les comptes de test en développement
function initTestAccounts() {
    const testAccounts = [
        { email: 'admin@znk.system', code: '1234', prenom: 'Admin', nom: 'ZNK', role: 'admin' },
        { email: 'membre@echo.znk', code: '5678', prenom: 'Membre', nom: 'Test', role: 'member' },
        { email: 'ecole@echo.znk', code: '3456', prenom: 'École', nom: 'Test', role: 'ecole' },
        { email: 'test@echo.znk', code: '9012', prenom: 'Visiteur', nom: 'Test', role: 'visitor' }
    ];
    
    testAccounts.forEach(account => {
        try {
            if (!UserStorage.getUserByEmail(account.email)) {
                UserStorage.createUser(account);
            }
        } catch (error) {
            console.log('Compte de test déjà existant:', account.email);
        }
    });
}

// En développement, créer les comptes de test
if (process.env.NODE_ENV !== 'production') {
    initTestAccounts();
}

module.exports = UserStorage;