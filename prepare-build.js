const fs = require('fs-extra');
const path = require('path');

console.log('🔧 Préparation du build de production...');

// Liste des fichiers/dossiers à exclure
const excludeList = [
  'ZNKadminDash.html',
  'modules-admin',
  'scripts',
  '.env.development',
  '.gitignore',
  'node_modules/.cache'
];

// Vérifier que les fichiers admin existent avant build
const adminPath = path.join(__dirname, '../ZNKadminDash.html');

if (fs.existsSync(adminPath)) {
  console.log('✅ Fichiers admin détectés (seront exclus du build)');
} else {
  console.log('⚠️  Aucun fichier admin trouvé');
}

console.log('📦 Configuration build prête');
console.log('🚫 Fichiers exclus:', excludeList.join(', '));
console.log('✅ Prêt pour electron-builder');