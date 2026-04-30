import { ipcMain } from 'electron';

import { surface2Channels } from '../../src/shared/surface2-channels.js';
import type { ExportSurface2FlowInput, SaveSurface2DraftInput } from '../../src/shared/surface2.js';
import { exportSurface2Flow, saveSurface2Draft } from '../services/surface2/storage.js';

export function registerSurface2Ipc(): void {
  ipcMain.handle(surface2Channels.saveDraft, async (_event, input: SaveSurface2DraftInput) => saveSurface2Draft(input));
  ipcMain.handle(surface2Channels.exportFlow, async (_event, input: ExportSurface2FlowInput) => exportSurface2Flow(input));
}
