import { dialog, ipcMain, shell } from 'electron';

import { surface4Channels } from '../../src/shared/surface4-channels.js';
import type { GenerateSurface4ArtifactsInput, LoadSurface4StateInput } from '../../src/shared/surface4.js';
import { exportSurface4Bundle, generateSurface4Artifacts, getSurface4BundlePaths, loadSurface4State } from '../services/surface4/generator.js';

export function registerSurface4Ipc(): void {
  ipcMain.handle(surface4Channels.loadState, async (_event, input: LoadSurface4StateInput) => loadSurface4State(input));
  ipcMain.handle(surface4Channels.generateArtifacts, async (_event, input: GenerateSurface4ArtifactsInput) =>
    generateSurface4Artifacts(input)
  );
  ipcMain.handle(surface4Channels.revealBundle, async (_event, serviceKey: string) => {
    if (!serviceKey) {
      throw new Error('Reveal bundle service key is unavailable.');
    }
    const { generatedRoot } = await getSurface4BundlePaths(serviceKey);
    shell.showItemInFolder(generatedRoot);
  });
  ipcMain.handle(surface4Channels.openReadme, async (_event, serviceKey: string) => {
    if (!serviceKey) {
      throw new Error('Open README service key is unavailable.');
    }
    const { setupDocPath } = await getSurface4BundlePaths(serviceKey);
    const message = await shell.openPath(setupDocPath);
    if (message) {
      throw new Error(message);
    }
  });
  ipcMain.handle(surface4Channels.exportBundle, async (_event, serviceKey: string) => {
    if (!serviceKey) {
      throw new Error('Export bundle service key is unavailable.');
    }

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose target repo or folder for generated bundle'
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        copiedFiles: []
      };
    }

    return exportSurface4Bundle(serviceKey, result.filePaths[0]);
  });
}
