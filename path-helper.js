const path = require('path');
const { app } = require('electron');
const fs = require('fs');

function getAppPath() {
    if (app.isPackaged) {
        return path.dirname(require.main.filename);
    } else {
        return __dirname;
    }
}

function resolveAppPath(relativePath) {
    return path.join(getAppPath(), relativePath);
}

function findFile(filename, directories = ['', 'pages', 'views', 'dashboards']) {
    const basePath = getAppPath();
    const cleanFilename = filename.endsWith('.html') ? filename : `${filename}.html`;
    
    for (const dir of directories) {
        const testPath = path.join(basePath, dir, cleanFilename);
        
        if (fs.existsSync(testPath)) {
            return testPath;
        }
    }
    
    console.error(`[ZNK] Fichier non trouvé: ${cleanFilename}`);
    return null;
}

function toFileURL(filePath) {
    const normalized = path.normalize(filePath);
    return `file://${normalized.replace(/\\/g, '/')}`;
}

function fileExists(relativePath) {
    const fullPath = resolveAppPath(relativePath);
    return fs.existsSync(fullPath);
}

module.exports = {
    getAppPath,
    resolveAppPath,
    findFile,
    toFileURL,
    fileExists
};