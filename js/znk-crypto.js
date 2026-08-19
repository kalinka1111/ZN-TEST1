// ZNK Crypto - Cryptage simple des publications
class ZNKCrypto {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
    }

    async encrypt(data) {
        try {
            const key = await this.getKey();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(JSON.stringify(data));
            
            const encrypted = await crypto.subtle.encrypt(
                { name: this.algorithm, iv },
                key,
                encoded
            );
            
            return {
                encrypted: true,
                iv: Array.from(iv),
                data: Array.from(new Uint8Array(encrypted)),
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('❌ Erreur cryptage:', error);
            throw error;
        }
    }

    async decrypt(encrypted) {
        if (!encrypted.encrypted) {
            return encrypted; // Pas crypté
        }
        
        try {
            const key = await this.getKey();
            const iv = new Uint8Array(encrypted.iv);
            const data = new Uint8Array(encrypted.data);
            
            const decrypted = await crypto.subtle.decrypt(
                { name: this.algorithm, iv },
                key,
                data
            );
            
            const decoded = new TextDecoder().decode(decrypted);
            return JSON.parse(decoded);
        } catch (error) {
            console.error('❌ Erreur décryptage:', error);
            throw error;
        }
    }

    async getKey() {
        let keyData = localStorage.getItem('znk_crypto_key');
        
        if (!keyData) {
            // Générer nouvelle clé
            const key = await crypto.subtle.generateKey(
                { name: this.algorithm, length: this.keyLength },
                true,
                ['encrypt', 'decrypt']
            );
            
            const exported = await crypto.subtle.exportKey('raw', key);
            keyData = Array.from(new Uint8Array(exported)).join(',');
            localStorage.setItem('znk_crypto_key', keyData);
            console.log('🔐 Nouvelle clé générée');
        }
        
        const keyArray = new Uint8Array(keyData.split(',').map(Number));
        return await crypto.subtle.importKey(
            'raw',
            keyArray,
            { name: this.algorithm },
            false,
            ['encrypt', 'decrypt']
        );
    }

    resetKey() {
        localStorage.removeItem('znk_crypto_key');
        console.log('🔐 Clé réinitialisée');
    }
}

// Instance globale
window.znkCrypto = new ZNKCrypto();