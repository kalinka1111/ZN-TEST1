/**
 * DIAGNOSTIC BUILD MAC
 * Identifie pourquoi le build Mac échoue
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class MacBuildDiagnostic {
  constructor() {
    this.root = process.cwd();
    this.issues = [];
  }

  diagnose() {
    console.log('🔍 DIAGNOSTIC BUILD MAC\n');
    console.log('═'.repeat(70));
    console.log('');

    this.checkPlatform();
    this.checkPackageJson();
    this.checkXcode();
    this.checkCodeSigning();
    this.checkIconFile();
    this.checkDiskSpace();
    this.readBuildLogs();
    
    console.log('\n' + '═'.repeat(70));
    this.printSummary();
    this.printSolutions();
  }

  checkPlatform() {
    console.log('💻 Plateforme:\n');
    
    const platform = process.platform;
    const arch = process.arch;
    
    console.log(`   OS: ${platform}`);
    console.log(`   Architecture: ${arch}`);
    
    if (platform !== 'darwin') {
      console.log('   ⚠️  Tu n\'es PAS sur Mac !');
      console.log('   💡 Le build Mac doit être fait sur macOS\n');
      this.issues.push({
        type: 'CRITICAL',
        message: 'Build Mac impossible sur ' + platform,
        solution: 'Utilise un Mac ou un service cloud (GitHub Actions, CircleCI)'
      });
    } else {
      console.log('   ✅ macOS détecté\n');
    }
  }

  checkPackageJson() {
    console.log('📦 Configuration package.json:\n');
    
    const pkgPath = path.join(this.root, 'electron/package.json');
    
    if (!fs.existsSync(pkgPath)) {
      console.log('   ❌ electron/package.json non trouvé\n');
      this.issues.push({
        type: 'ERROR',
        message: 'package.json manquant',
        solution: 'Crée electron/package.json'
      });
      return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    
    // Vérifier la config Mac
    if (!pkg.build) {
      console.log('   ❌ Pas de config "build"\n');
      this.issues.push({
        type: 'ERROR',
        message: 'Configuration build manquante',
        solution: 'Ajoute la section "build" dans package.json'
      });
      return;
    }

    if (!pkg.build.mac) {
      console.log('   ⚠️  Pas de config "build.mac"\n');
      this.issues.push({
        type: 'WARNING',
        message: 'Configuration Mac manquante',
        solution: 'Ajoute "mac" dans build'
      });
    } else {
      console.log('   ✅ Config Mac présente');
      console.log('      target:', pkg.build.mac.target || 'dmg');
      console.log('      icon:', pkg.build.mac.icon || 'non défini');
      
      // Vérifier code signing
      if (pkg.build.mac.identity === null) {
        console.log('      identity: null (pas de signature)');
      } else if (pkg.build.mac.identity) {
        console.log('      identity:', pkg.build.mac.identity);
      } else {
        console.log('      ⚠️  identity non définie (signature automatique)');
      }
    }
    
    console.log('');
  }

  checkXcode() {
    if (process.platform !== 'darwin') {
      return;
    }

    console.log('🔨 Xcode / Command Line Tools:\n');
    
    try {
      const xcodePath = execSync('xcode-select -p', { encoding: 'utf-8' }).trim();
      console.log(`   ✅ Installé: ${xcodePath}`);
      
      // Vérifier la version
      try {
        const xcodeVersion = execSync('xcodebuild -version', { encoding: 'utf-8' }).split('\n')[0];
        console.log(`   ✅ Version: ${xcodeVersion}`);
      } catch (e) {
        console.log('   ⚠️  xcodebuild non disponible');
      }
    } catch (error) {
      console.log('   ❌ Command Line Tools non installés');
      this.issues.push({
        type: 'ERROR',
        message: 'Xcode Command Line Tools manquants',
        solution: 'Installe: xcode-select --install'
      });
    }
    
    console.log('');
  }

  checkCodeSigning() {
    if (process.platform !== 'darwin') {
      return;
    }

    console.log('🔐 Code Signing:\n');
    
    try {
      const identities = execSync('security find-identity -v -p codesigning', { encoding: 'utf-8' });
      
      if (identities.includes('0 valid identities found')) {
        console.log('   ⚠️  Aucun certificat de signature trouvé');
        console.log('   💡 Build possible SANS signature (pour tests)\n');
        this.issues.push({
          type: 'WARNING',
          message: 'Pas de certificat de signature',
          solution: 'Désactive la signature pour les tests (voir solutions)'
        });
      } else {
        console.log('   ✅ Certificats disponibles:');
        const lines = identities.split('\n').filter(l => l.includes('Developer ID'));
        lines.forEach(line => console.log('      ' + line.trim()));
        console.log('');
      }
    } catch (error) {
      console.log('   ⚠️  Impossible de vérifier les certificats\n');
    }
  }

  checkIconFile() {
    console.log('🎨 Icône Mac (.icns):\n');
    
    const pkgPath = path.join(this.root, 'electron/package.json');
    
    if (!fs.existsSync(pkgPath)) {
      console.log('   ⚠️  Impossible de vérifier (package.json manquant)\n');
      return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const iconPath = pkg.build?.mac?.icon;
    
    if (!iconPath) {
      console.log('   ⚠️  Pas d\'icône configurée');
      console.log('   💡 Le build utilisera l\'icône par défaut d\'Electron\n');
      return;
    }

    // Résoudre le chemin depuis electron/
    const fullIconPath = path.join(this.root, 'electron', iconPath);
    
    console.log('   Fichier:', iconPath);
    console.log('   Chemin:', fullIconPath);
    
    if (fs.existsSync(fullIconPath)) {
      const stats = fs.statSync(fullIconPath);
      console.log('   ✅ Fichier trouvé');
      console.log('      Taille:', Math.round(stats.size / 1024), 'KB\n');
    } else {
      console.log('   ❌ Fichier INTROUVABLE\n');
      this.issues.push({
        type: 'ERROR',
        message: 'Icône .icns manquante: ' + iconPath,
        solution: 'Crée l\'icône ou supprime la référence'
      });
    }
  }

  checkDiskSpace() {
    if (process.platform !== 'darwin') {
      return;
    }

    console.log('💾 Espace disque:\n');
    
    try {
      const df = execSync('df -h .', { encoding: 'utf-8' });
      const lines = df.split('\n');
      if (lines.length > 1) {
        console.log('   ' + lines[0]);
        console.log('   ' + lines[1]);
        
        const parts = lines[1].split(/\s+/);
        const available = parts[3];
        const percent = parts[4];
        
        const availableGB = parseFloat(available);
        if (availableGB < 5) {
          console.log('   ⚠️  Moins de 5GB disponibles');
          this.issues.push({
            type: 'WARNING',
            message: 'Peu d\'espace disque disponible',
            solution: 'Libère de l\'espace (au moins 5GB recommandé)'
          });
        }
      }
    } catch (error) {
      console.log('   ⚠️  Impossible de vérifier\n');
    }
    
    console.log('');
  }

  readBuildLogs() {
    console.log('📋 Logs de build:\n');
    
    const logPaths = [
      'electron/dist/.build/builder-debug.yml',
      'electron/dist/.build/builder-effective-config.yaml',
      'dist/.build/builder-debug.yml'
    ];
    
    let foundLogs = false;
    
    for (const logPath of logPaths) {
      const fullPath = path.join(this.root, logPath);
      if (fs.existsSync(fullPath)) {
        console.log(`   📄 Trouvé: ${logPath}`);
        foundLogs = true;
      }
    }
    
    if (!foundLogs) {
      console.log('   ℹ️  Aucun log de build trouvé');
      console.log('   💡 Lance un build pour générer des logs\n');
    } else {
      console.log('   💡 Examine ces fichiers pour les erreurs détaillées\n');
    }
  }

  printSummary() {
    console.log('📊 RÉSUMÉ\n');
    
    if (this.issues.length === 0) {
      console.log('   ✅ Aucun problème majeur détecté\n');
      return;
    }

    const critical = this.issues.filter(i => i.type === 'CRITICAL');
    const errors = this.issues.filter(i => i.type === 'ERROR');
    const warnings = this.issues.filter(i => i.type === 'WARNING');
    
    if (critical.length > 0) {
      console.log(`   🔴 ${critical.length} problème(s) CRITIQUE(s)`);
    }
    if (errors.length > 0) {
      console.log(`   🟠 ${errors.length} erreur(s)`);
    }
    if (warnings.length > 0) {
      console.log(`   🟡 ${warnings.length} avertissement(s)`);
    }
    
    console.log('');
  }

  printSolutions() {
    if (this.issues.length === 0) {
      console.log('💡 PROCHAINES ÉTAPES\n');
      console.log('   Tout semble bon ! Pour builder:\n');
      console.log('   cd electron');
      console.log('   npm run build-mac\n');
      console.log('   Si ça échoue encore, lance:');
      console.log('   npm run build-mac -- --trace\n');
      return;
    }

    console.log('🔧 SOLUTIONS\n');
    console.log('═'.repeat(70));
    
    this.issues.forEach((issue, i) => {
      console.log(`\n${i + 1}. ${issue.message}`);
      console.log(`   💡 ${issue.solution}`);
    });
    
    console.log('\n' + '═'.repeat(70));
    console.log('\n🚀 BUILD MAC SANS SIGNATURE (POUR TESTS)\n');
    console.log('   node fix-mac-build-no-sign.js\n');
  }
}

// Exécution
if (require.main === module) {
  const diagnostic = new MacBuildDiagnostic();
  diagnostic.diagnose();
}

module.exports = MacBuildDiagnostic;