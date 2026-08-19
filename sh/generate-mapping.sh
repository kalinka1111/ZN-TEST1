#!/bin/bash

OUTPUT="js/znk-module-mapping-complete.js"
mkdir -p js

cat > "$OUTPUT" << 'JSEOF'
// ZNK237-APP MODULE MAPPING - Auto-généré
(function () {
    window.moduleMapping = window.moduleMapping || {};
    const ROOT = './';

    Object.assign(window.moduleMapping, {
        // === DASHBOARDS PRINCIPAUX ===
        'index': ROOT + 'index.html',
        'auth-hub': ROOT + 'auth-hub.html',
        'inscription': ROOT + 'inscription.html',
        'admin-dash': ROOT + 'ZNKadminDash.html',
        'membres-dash': ROOT + 'ZNKMembresDash.html',
        'art-etudes-dash': ROOT + 'ZNKartEtudesDash.html',
        'visiteur-dash': ROOT + 'ZNKvisiteurDash.html',

        // === MODULES STANDARDS ===
JSEOF

# Scanner le dossier modules/
if [ -d "modules" ]; then
    find modules -name "*.html" | sort | while read file; do
        name=$(basename "$file" .html)
        echo "        'module-$name': ROOT + '$file'," >> "$OUTPUT"
    done
fi

cat >> "$OUTPUT" << 'JSEOF'

        // === MODULES ADMIN ===
JSEOF

# Scanner le dossier modules-admin/
if [ -d "modules-admin" ]; then
    find modules-admin -name "*.html" | sort | while read file; do
        name=$(basename "$file" .html)
        echo "        'admin-$name': ROOT + '$file'," >> "$OUTPUT"
    done
fi

cat >> "$OUTPUT" << 'JSEOF'

        // === ASSETS & MANIFESTS ===
        'manifest-icons-b64': ROOT + 'icons/manifest-icon-b64.json',
        'icons-intro-manifest': ROOT + 'icons/icons-intro-manifest.json',
        'assets-manifest-b64': ROOT + 'assets/icons/manifest-icon-b64.json',
        'assets-icons-intro': ROOT + 'assets/icons/icons-intro-manifest.json'
    });

    console.log('✅ ZNK237 moduleMapping initialisé:', Object.keys(window.moduleMapping).length, 'entrées');
    
    // Helper pour charger un module
    window.loadModule = function(moduleKey) {
        const path = window.moduleMapping[moduleKey];
        if (!path) {
            console.error('❌ Module non trouvé:', moduleKey);
            return null;
        }
        return path;
    };
})();
JSEOF

echo "✅ Fichier créé: $OUTPUT"
ls -lh "$OUTPUT"
wc -l "$OUTPUT"
