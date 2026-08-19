// Minimal stub for ZNKExternalStorage used by the launcher
window.ZNKExternalStorage = {
  init: async function() { console.log('ZNKExternalStorage.init() stub'); return Promise.resolve(); },
  available: true,
  getStats: async function() { return { free: 1024*1024*1024, used: 0 }; }
};
console.log('✅ znk-external-storage loaded (stub)');
