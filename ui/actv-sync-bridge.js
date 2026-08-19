// Minimal stub for ACTVSyncBridge
window.ACTVSyncBridge = function() {};
window.ACTVSyncBridge.prototype.init = async function() { console.log('ACTVSyncBridge.init() stub'); return Promise.resolve(); };
window.ACTVSyncBridge.prototype.handleStorageChange = function(e) { console.log('ACTVSyncBridge.handleStorageChange', e); };
console.log('✅ actv-sync-bridge loaded (stub)');
