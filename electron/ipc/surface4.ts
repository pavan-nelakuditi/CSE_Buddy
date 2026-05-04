import { ipcMain, shell } from 'electron';

import { surface4Channels } from '../../src/shared/surface4-channels.js';
import type { GenerateSurface4ArtifactsInput, LoadSurface4StateInput } from '../../src/shared/surface4.js';
import { generateSurface4Artifacts, getSurface4BundlePaths, loadSurface4State } from '../services/surface4/generator.js';

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
}
