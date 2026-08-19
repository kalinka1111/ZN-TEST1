const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
    // Ne signer qu'en ad-hoc pour macOS — inutile et cassant sous Windows
    if (context.electronPlatformName !== 'darwin') {
        console.log('ℹ️ afterSign ignoré (plateforme non-macOS)');
        return;
    }

    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log('🔏 Signature ad-hoc automatique :', appPath);
    try {
        execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' });
        console.log('✅ Signature ad-hoc appliquée');
    } catch (error) {
        console.error('❌ Échec de la signature ad-hoc:', error.message);
        throw error;
    }
};
