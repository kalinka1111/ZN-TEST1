/**
 * © 2025 ZNK (Zéro Neutralité Kinétique)
 * All rights reserved.
 *
 * Electron IPC Bridge for ZNK237
 * Exposes safe filesystem and system APIs to renderer via Electron's preload script
 * Use this in your Electron main process preload.js for sandbox security
 */

const { contextBridge, ipcMain } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/**
 * Preload script for Electron renderer process
 * Add to BrowserWindow config: webPreferences: { preload: 'path/to/preload.js' }
 */
function setupZNKBridge() {
  // External storage filesystem operations
  contextBridge.exposeInMainWorld('znkFS', {
    mkdir: (dirPath) => ipcMain.invoke('znk-fs-mkdir', dirPath),
    readFile: (filePath) => ipcMain.invoke('znk-fs-read', filePath),
    writeFile: (filePath, data) => ipcMain.invoke('znk-fs-write', filePath, data),
    readdir: (dirPath) => ipcMain.invoke('znk-fs-readdir', dirPath),
    stat: (filePath) => ipcMain.invoke('znk-fs-stat', filePath),
    unlink: (filePath) => ipcMain.invoke('znk-fs-unlink', filePath)
  });

  // System information
  contextBridge.exposeInMainWorld('znkSystem', {
    getStoragePath: () => ipcMain.invoke('znk-system-storage-path'),
    getAppVersion: () => ipcMain.invoke('znk-system-app-version'),
    getPlatform: () => process.platform,
    getEnv: () => process.env.NODE_ENV || 'production'
  });

  // Window controls
  contextBridge.exposeInMainWorld('znkWindow', {
    minimize: () => ipcMain.invoke('znk-window-minimize'),
    maximize: () => ipcMain.invoke('znk-window-maximize'),
    close: () => ipcMain.invoke('znk-window-close'),
    openDevTools: () => ipcMain.invoke('znk-window-devtools')
  });
}

/**
 * Main process IPC handlers
 * Call this in your Electron main.js after app.whenReady()
 */
function setupZNKHandlers(mainWindow, config = {}) {
  const STORAGE_PATH = config.storagePath || '/Volumes/ZNKdata/znk_storage';

  // ====================================================================
  // Filesystem handlers (with safety checks)
  // ====================================================================

  ipcMain.handle('znk-fs-mkdir', async (event, dirPath) => {
    try {
      if (!isPathSafe(dirPath, STORAGE_PATH)) {
        throw new Error('Path access denied');
      }
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('znk-fs-read', async (event, filePath) => {
    try {
      if (!isPathSafe(filePath, STORAGE_PATH)) {
        throw new Error('Path access denied');
      }
      const data = await fs.readFile(filePath, 'utf8');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('znk-fs-write', async (event, filePath, data) => {
    try {
      if (!isPathSafe(filePath, STORAGE_PATH)) {
        throw new Error('Path access denied');
      }
      await fs.writeFile(filePath, data, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('znk-fs-readdir', async (event, dirPath) => {
    try {
      if (!isPathSafe(dirPath, STORAGE_PATH)) {
        throw new Error('Path access denied');
      }
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      return { success: true, files: files.map(f => ({ name: f.name, isDir: f.isDirectory() })) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('znk-fs-stat', async (event, filePath) => {
    try {
      if (!isPathSafe(filePath, STORAGE_PATH)) {
        throw new Error('Path access denied');
      }
      const stat = await fs.stat(filePath);
      return { success: true, size: stat.size, mtime: stat.mtime.toISOString() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('znk-fs-unlink', async (event, filePath) => {
    try {
      if (!isPathSafe(filePath, STORAGE_PATH)) {
        throw new Error('Path access denied');
      }
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ====================================================================
  // System handlers
  // ====================================================================

  ipcMain.handle('znk-system-storage-path', () => STORAGE_PATH);
  ipcMain.handle('znk-system-app-version', () => '1.0.0');

  // ====================================================================
  // Window handlers
  // ====================================================================

  ipcMain.handle('znk-window-minimize', () => {
    mainWindow.minimize();
    return { success: true };
  });

  ipcMain.handle('znk-window-maximize', () => {
    mainWindow.maximize();
    return { success: true };
  });

  ipcMain.handle('znk-window-close', () => {
    mainWindow.close();
    return { success: true };
  });

  ipcMain.handle('znk-window-devtools', () => {
    mainWindow.webContents.toggleDevTools();
    return { success: true };
  });
}

/**
 * Security check: ensure path is within allowed storage directory
 */
function isPathSafe(filePath, allowedDir) {
  const normalized = path.normalize(filePath);
  const allowed = path.normalize(allowedDir);
  return normalized.startsWith(allowed);
}

/**
 * Export for use in Electron main.js
 */
module.exports = {
  setupZNKBridge,
  setupZNKHandlers
};

/**
 * Usage in Electron main.js:
 * 
 * const { setupZNKBridge, setupZNKHandlers } = require('./znk-electron-bridge.js');
 * 
 * app.whenReady().then(() => {
 *   const mainWindow = new BrowserWindow({
 *     webPreferences: {
 *       preload: path.join(__dirname, 'preload.js'),
 *       nodeIntegration: false,
 *       sandbox: true
 *     }
 *   });
 * 
 *   setupZNKHandlers(mainWindow, {
 *     storagePath: '/Volumes/ZNKdata/znk_storage'
 *   });
 * 
 *   mainWindow.loadFile('studios/znk237-launch.html');
 * });
 * 
 * In preload.js:
 * const { setupZNKBridge } = require('./znk-electron-bridge.js');
 * setupZNKBridge();
 */
