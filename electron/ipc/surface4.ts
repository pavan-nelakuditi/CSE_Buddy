import { ipcMain } from 'electron';

import { surface4Channels } from '../../src/shared/surface4-channels.js';
import type { GenerateSurface4ArtifactsInput, LoadSurface4StateInput } from '../../src/shared/surface4.js';
import { generateSurface4Artifacts, loadSurface4State } from '../services/surface4/generator.js';

export function registerSurface4Ipc(): void {
  ipcMain.handle(surface4Channels.loadState, async (_event, input: LoadSurface4StateInput) => loadSurface4State(input));
  ipcMain.handle(surface4Channels.generateArtifacts, async (_event, input: GenerateSurface4ArtifactsInput) =>
    generateSurface4Artifacts(input)
  );
}
