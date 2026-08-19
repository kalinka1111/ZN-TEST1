// Minimal stub for WhatsZNKAuth
window.WhatsZNKAuth = function() { this.user = null; };
window.WhatsZNKAuth.prototype.init = async function() { console.log('WhatsZNKAuth.init() stub'); return Promise.resolve(); };
window.WhatsZNKAuth.prototype.signIn = async function() { this.user = { id: 'stub' }; return this.user; };
console.log('✅ whatsnzk-auth loaded (stub)');
