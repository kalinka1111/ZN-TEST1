/**
 * DEBUG ZNK237-APP
 * Lance l'app en mode debug pour voir ce qui se passe
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 DEBUG MODE ZNK237-APP\n');

// Copier les fichiers
require('fs').copyFileSync('znk-build-system/main-build.js', 'main-build.js');
require('fs').copyFileSync('znk-build-system/path-adapter.js', 'path-adapter.js');
require('fs').copyFileSync('znk-build-system/preload-build.js', 'preload-build.js');

// Backup et remplacer package.json
if (require('fs').existsSync('package.json')) {
  require('fs').copyFileSync('package.json', 'package.debug-backup.json');
}
require('fs').copyFileSync('znk-build-system/package-build.json', 'package.json');

console.log('📦 Fichiers copiés\n');
console.log('🚀 Lancement Electron...\n');
console.log('━'.repeat(50));

const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  shell: true
});

electron.on('close', (code) => {
  console.log('━'.repeat(50));
  console.log('\n🛑 Electron fermé (code:', code, ')\n');
  
  // Restore
  if (require('fs').existsSync('package.debug-backup.json')) {
    require('fs').copyFileSync('package.debug-backup.json', 'package.json');
    require('fs').unlinkSync('package.debug-backup.json');
  }
  
  // Clean
  require('fs').unlinkSync('main-build.js');
  require('fs').unlinkSync('path-adapter.js');
  require('fs').unlinkSync('preload-build.js');
  
  console.log('✅ Nettoyage terminé\n');
});
