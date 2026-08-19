// Minimal stub for ACTVWorkflowManager
window.ACTVWorkflowManager = function(opts) {
  this.externalStoragePath = opts && opts.externalStoragePath;
  this.externalStorage = { path: this.externalStoragePath };
};
window.ACTVWorkflowManager.prototype.init = async function() {
  console.log('ACTVWorkflowManager.init() stub');
  return Promise.resolve();
};
window.ACTVWorkflowManager.prototype.getStorageStats = async function() {
  return { total: 50*1024*1024*1024, used: 0 };
};
console.log('✅ actv-workflow-manager-v2 loaded (stub)');
