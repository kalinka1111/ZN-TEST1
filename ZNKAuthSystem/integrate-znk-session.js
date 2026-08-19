/**
 * SCRIPT D'INTÉGRATION AUTOMATIQUE
 * Ajoute automatiquement les scripts ZNK à toutes vos pages HTML
 * 
 * Usage: node integrate-znk-session.js
 */

const fs = require('fs');
const path = require('path');

const ZNK_SCRIPTS = `
<!-- ZNK Session Management -->
<script src="/js/znk-session.js"></script>
<script src="/js/znk-user-widget.js"></script>
`;

const PAGES_TO_INTEGRATE = [
    'index.html',
    'auth-hub.html',
    'ZNKMembresDash.html',
    'ZNKadminDash.html',
    'ZNKvisiteurDash.html',
    'ZNKartEtudesDash.html',
    'ZNKSECURE.html',
    'ZNKStudiosDash.html',
    'archives.html',
    'nomad.html'
    // Ajouter toutes vos pages ici
];

const PROTECTED_PAGES = [
    'ZNKMembresDash.html',
    'ZNKadminDash.html',
    'ZNKSECURE.html',
    'archives.html',
    'nomad.html',
    FIDA-gestion.html
    // Pages nécessitant authentification
   
   'nomad.html',
   'ZNKMembresDash.html',
   'ZNKadminDash.html',
   'ZNKStudiosDash.html'
];

function integrateZNKSession() {
    console.log('🚀 Début de l\'intégration ZNK Session\n');
    
    let successCount = 0;
    let errorCount = 0;

    PAGES_TO_INTEGRATE.forEach(pagePath => {
        try {
            const fullPath = path.join(__dirname, pagePath);
            
            if (!fs.existsSync(fullPath)) {
                console.log(`⚠️  Fichier non trouvé: ${pagePath}`);
                errorCount++;
                return;
            }

            let html = fs.readFileSync(fullPath, 'utf-8');

            // Vérifier si déjà intégré
            if (html.includes('znk-session.js')) {
                console.log(`✓  Déjà intégré: ${pagePath}`);
                successCount++;
                return;
            }

            // Ajouter les scripts avant </head>
            if (html.includes('</head>')) {
                html = html.replace('</head>', `${ZNK_SCRIPTS}\n</head>`);
            } else {
                console.log(`⚠️  Pas de balise </head> dans: ${pagePath}`);
                errorCount++;
                return;
            }

            // Ajouter data-znk-protected si nécessaire
            const isProtected = PROTECTED_PAGES.some(p => pagePath.includes(p));
            if (isProtected && !html.includes('data-znk-protected')) {
                html = html.replace('<body', '<body data-znk-protected');
            }

            // Sauvegarder
            fs.writeFileSync(fullPath, html, 'utf-8');
            
            console.log(`✅ Intégré: ${pagePath}${isProtected ? ' (protégé)' : ''}`);
            successCount++;

        } catch (error) {
            console.error(`❌ Erreur sur ${pagePath}:`, error.message);
            errorCount++;
        }
    });

    console.log(`\n📊 Résumé:`);
    console.log(`   ✅ Succès: ${successCount}`);
    console.log(`   ❌ Erreurs: ${errorCount}`);
    console.log(`   📄 Total: ${PAGES_TO_INTEGRATE.length}\n`);
}

// Créer le dossier js si nécessaire
const jsDir = path.join(__dirname, 'js');
if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
    console.log('📁 Dossier /js créé\n');
}

// Lancer l'intégration
integrateZNKSession();

console.log('✨ Intégration terminée!\n');
console.log('📝 Prochaines étapes:');
console.log('   1. Vérifiez que les fichiers znk-session.js et znk-user-widget.js');
console.log('      sont bien dans le dossier /js/');
console.log('   2. Testez votre application');
console.log('   3. Vérifiez la console pour les logs ZNK Session Manager\n');