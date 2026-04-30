import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

import { registerSurface1Ipc } from './ipc/surface1.js';
import { registerSurface2Ipc } from './ipc/surface2.js';
import { registerSurface3Ipc } from './ipc/surface3.js';
import { registerSurface4Ipc } from './ipc/surface4.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1100,
    minHeight: 800,
        show: false,
        backgroundColor: '#f5f0e8',
        webPreferences: {
      preload: path.resolve(process.cwd(), 'electron', 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false
        }
    });

  const rendererPath = path.resolve(process.cwd(), 'dist-renderer', 'index.html');
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    app.focus({ steal: true });
  });
  void win.loadFile(rendererPath);
  return win;
}

app.whenReady().then(() => {
  registerSurface1Ipc();
  registerSurface2Ipc();
  registerSurface3Ipc();
  registerSurface4Ipc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
