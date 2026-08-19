// user-storage-native.js
// Gestion des utilisateurs avec stockage local

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class UserStorage {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.usersFile = path.join(this.userDataPath, 'users.json');
        this.users = {};
        this.initialize();
    }

    initialize() {
        try {
            // Créer le dossier userData s'il n'existe pas
            if (!fs.existsSync(this.userDataPath)) {
                fs.mkdirSync(this.userDataPath, { recursive: true });
            }

            // Charger les utilisateurs existants
            if (fs.existsSync(this.usersFile)) {
                const data = fs.readFileSync(this.usersFile, 'utf8');
                this.users = JSON.parse(data);
                console.log('✅ Utilisateurs chargés:', Object.keys(this.users).length);
            } else {
                // Créer le fichier vide
                this.saveUsers();
                console.log('✅ Fichier users.json créé');
            }
        } catch (error) {
            console.error('❌ Erreur initialisation UserStorage:', error);
            this.users = {};
        }
    }

    saveUsers() {
        try {
            fs.writeFileSync(
                this.usersFile,
                JSON.stringify(this.users, null, 2),
                'utf8'
            );
            return true;
        } catch (error) {
            console.error('❌ Erreur sauvegarde users:', error);
            return false;
        }
    }

    createUser(userData) {
        try {
            const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            this.users[userId] = {
                id: userId,
                name: userData.name || 'Utilisateur',
                email: userData.email || '',
                pin: userData.pin || '',
                code: userData.code || '',
                avatar: userData.avatar || '',
                createdAt: new Date().toISOString(),
                ...userData
            };

            this.saveUsers();
            console.log('✅ Utilisateur créé:', userId);
            
            return {
                success: true,
                userId,
                user: this.users[userId]
            };
        } catch (error) {
            console.error('❌ Erreur création user:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    authenticateUser(email, code) {
        try {
            const user = Object.values(this.users).find(
                u => u.email === email && u.code === code
            );

            if (user) {
                return {
                    success: true,
                    user,
                    userId: user.id
                };
            }

            return {
                success: false,
                error: 'Identifiants incorrects'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    getUser(userId) {
        return this.users[userId] || null;
    }

    getAllUsers() {
        return Object.values(this.users);
    }

    updateUser(userId, updates) {
        if (!this.users[userId]) {
            return { success: false, error: 'Utilisateur introuvable' };
        }

        this.users[userId] = {
            ...this.users[userId],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.saveUsers();
        return { success: true, user: this.users[userId] };
    }

    deleteUser(userId) {
        if (!this.users[userId]) {
            return { success: false, error: 'Utilisateur introuvable' };
        }

        delete this.users[userId];
        this.saveUsers();
        return { success: true };
    }
}

// Singleton instance
let instance = null;

function getInstance() {
    if (!instance) {
        instance = new UserStorage();
    }
    return instance;
}

module.exports = { UserStorage, getInstance };