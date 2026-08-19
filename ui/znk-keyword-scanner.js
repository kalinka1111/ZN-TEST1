// Minimal stub for ZNKKeywordScanner used by the launcher
window.ZNKKeywordScanner = {
  init: async function() {
    console.log('ZNKKeywordScanner.init() stub');
    return Promise.resolve();
  },
  scan: function(text) { return []; }
};
console.log('✅ znk-keyword-scanner loaded (stub)');
