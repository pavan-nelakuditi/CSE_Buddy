import { ipcMain } from 'electron';

import { surface3Channels } from '../../src/shared/surface3-channels.js';
import type { LoadSurface3StateInput, SaveSurface3ConfigInput } from '../../src/shared/surface3.js';
import { loadSurface3State, saveSurface3Config } from '../services/surface3/storage.js';

export function registerSurface3Ipc(): void {
  ipcMain.handle(surface3Channels.loadState, async (_event, input: LoadSurface3StateInput) => loadSurface3State(input));
  ipcMain.handle(surface3Channels.saveConfig, async (_event, input: SaveSurface3ConfigInput) => saveSurface3Config(input));
}
