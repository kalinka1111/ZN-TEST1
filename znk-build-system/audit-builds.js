/**
 * ZNK BUILD AUDIT
 * Analyse tous tes builds existants pour comprendre leur rôle
 */

const fs = require('fs');
const path = require('path');

class BuildAuditor {
  constructor() {
    this.root = process.cwd();
    this.builds = [];
  }

  audit() {
    console.log('🔍 AUDIT DES BUILDS ZNK237-APP\n');
    console.log('═'.repeat(70));
    
    this.scanElectronDir();
    this.scanBuildDir();
    this.scanBuildFiles();
    this.scanRoot();
    
    console.log('\n' + '═'.repeat(70));
    this.printSummary();
    this.printRecommendations();
  }

  scanElectronDir() {
    const electronPath = path.join(this.root, 'electron');
    
    console.log('\n📁 DOSSIER: electron/\n');
    
    if (!fs.existsSync(electronPath)) {
      console.log('   ❌ Dossier non trouvé\n');
      return;
    }

    const files = fs.readdirSync(electronPath);
    const analysis = {
      name: 'electron/',
      type: 'Build principal',
      files: [],
      hasMain: false,
      hasPreload: false,
      hasPackageJson: false,
      hasBuildScripts: false
    };

    // Analyser les fichiers
    files.forEach(file => {
      const filePath = path.join(electronPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        if (file === 'main.js' || file.includes('main')) {
          analysis.hasMain = true;
          analysis.files.push(`✅ ${file} (Main process)`);
        } else if (file.includes('preload')) {
          analysis.hasPreload = true;
          analysis.files.push(`✅ ${file} (Preload script)`);
        } else if (file === 'package.json') {
          analysis.hasPackageJson = true;
          const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          analysis.files.push(`✅ package.json (main: ${pkg.main})`);
        } else if (file.includes('build') && (file.endsWith('.sh') || file.endsWith('.bat'))) {
          analysis.hasBuildScripts = true;
          analysis.files.push(`✅ ${file} (Build script)`);
        } else {
          analysis.files.push(`   ${file}`);
        }
      }
    });

    analysis.files.forEach(f => console.log(`   ${f}`));
    
    console.log('\n   📊 Évaluation:');
    if (analysis.hasMain && analysis.hasPreload) {
      console.log('   ✅ Build COMPLET et FONCTIONNEL');
      console.log('   💡 C\'est probablement ton build principal actuel');
    } else {
      console.log('   ⚠️  Build INCOMPLET');
    }

    this.builds.push(analysis);
  }

  scanBuildDir() {
    const buildPath = path.join(this.root, 'build');
    
    console.log('\n📁 DOSSIER: build/\n');
    
    if (!fs.existsSync(buildPath)) {
      console.log('   ❌ Dossier non trouvé\n');
      return;
    }

    const files = fs.readdirSync(buildPath);
    const analysis = {
      name: 'build/',
      type: 'Build alternatif',
      files: [],
      purpose: 'À déterminer'
    };

    if (files.length === 0) {
      console.log('   📂 Dossier vide\n');
      return;
    }

    files.forEach(file => {
      const filePath = path.join(buildPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        analysis.files.push(`📁 ${file}/`);
      } else {
        analysis.files.push(`   ${file}`);
      }
    });

    analysis.files.slice(0, 10).forEach(f => console.log(`   ${f}`));
    if (analysis.files.length > 10) {
      console.log(`   ... et ${analysis.files.length - 10} autres fichiers`);
    }

    this.builds.push(analysis);
  }

  scanBuildFiles() {
    const buildFilesPath = path.join(this.root, 'build-files');
    
    console.log('\n📁 DOSSIER: build-files/\n');
    
    if (!fs.existsSync(buildFilesPath)) {
      console.log('   ❌ Dossier non trouvé\n');
      return;
    }

    const files = fs.readdirSync(buildFilesPath);
    const analysis = {
      name: 'build-files/',
      type: 'Build généré',
      files: []
    };

    files.forEach(file => {
      analysis.files.push(`   ${file}`);
    });

    analysis.files.forEach(f => console.log(`   ${f}`));
    
    console.log('\n   💡 Ce sont les fichiers générés par build-generator');

    this.builds.push(analysis);
  }

  scanRoot() {
    console.log('\n📁 RACINE DU PROJET\n');
    
    const htmlFiles = fs.readdirSync(this.root)
      .filter(f => f.endsWith('.html'));
    
    const mainJsAtRoot = fs.existsSync(path.join(this.root, 'main.js'));
    const preloadAtRoot = fs.existsSync(path.join(this.root, 'preload.js'));
    
    console.log('   Fichiers HTML:');
    htmlFiles.forEach(file => {
      console.log(`   📄 ${file}`);
    });
    
    console.log('\n   Fichiers Electron:');
    if (mainJsAtRoot) console.log('   ⚠️  main.js (doublon avec electron/ ?)');
    if (preloadAtRoot) console.log('   ⚠️  preload.js (doublon avec electron/ ?)');
    
    if (!mainJsAtRoot && !preloadAtRoot) {
      console.log('   ✅ Pas de doublons');
    }
  }

  printSummary() {
    console.log('\n📊 RÉSUMÉ DES BUILDS\n');
    
    let hasWorkingBuild = false;
    
    this.builds.forEach(build => {
      if (build.hasMain && build.hasPreload) {
        console.log(`✅ ${build.name} → Build FONCTIONNEL`);
        hasWorkingBuild = true;
      } else if (build.files && build.files.length > 0) {
        console.log(`📦 ${build.name} → ${build.type}`);
      }
    });
    
    if (!hasWorkingBuild) {
      console.log('\n⚠️  AUCUN BUILD FONCTIONNEL DÉTECTÉ');
    }
  }

  printRecommendations() {
    console.log('\n💡 RECOMMANDATIONS\n');
    console.log('═'.repeat(70));
    
    const hasElectronBuild = this.builds.some(b => b.name === 'electron/' && b.hasMain);
    const hasBuildFiles = fs.existsSync(path.join(this.root, 'build-files'));
    
    if (hasElectronBuild) {
      console.log('\n✅ Tu as un build fonctionnel dans electron/\n');
      console.log('OPTION 1: Utiliser ton build existant (RECOMMANDÉ)');
      console.log('   → node audit-organize.js');
      console.log('   → Organise et documente tes builds actuels');
      console.log('');
      console.log('OPTION 2: Créer un build unifié');
      console.log('   → node create-unified-build.js');
      console.log('   → Combine le meilleur de tous tes builds');
    } else {
      console.log('\n⚠️  Aucun build complet trouvé\n');
      console.log('SOLUTION: Créer un build à partir de zéro');
      console.log('   → node setup-wizard.js');
    }
    
    console.log('\n═'.repeat(70));
  }
}

// Exécution
if (require.main === module) {
  const auditor = new BuildAuditor();
  auditor.audit();
}

module.exports = BuildAuditor;