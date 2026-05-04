import { dialog, ipcMain, shell } from 'electron';

import { workspaceChannels } from '../../src/shared/workspace-channels.js';
import { clearWorkspace, finalizeWorkspaceSelection, getWorkspaceState, openWorkspace } from '../services/workspace/state.js';

export function registerWorkspaceIpc(): void {
  ipcMain.handle(workspaceChannels.chooseWorkspace, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open CSE Buddy workspace'
    });

    return finalizeWorkspaceSelection(result.canceled ? undefined : result.filePaths[0]);
  });

  ipcMain.handle(workspaceChannels.createWorkspace, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Create or choose a CSE Buddy workspace'
    });

    return finalizeWorkspaceSelection(result.canceled ? undefined : result.filePaths[0]);
  });

  ipcMain.handle(workspaceChannels.openWorkspace, async (_event, workspacePath: string) => openWorkspace(workspacePath));
  ipcMain.handle(workspaceChannels.getWorkspaceState, async () => getWorkspaceState());
  ipcMain.handle(workspaceChannels.clearWorkspace, async () => clearWorkspace());
  ipcMain.handle(workspaceChannels.openPath, async (_event, targetPath: string) => {
    const message = await shell.openPath(targetPath);
    if (message) {
      throw new Error(message);
    }
  });
  ipcMain.handle(workspaceChannels.revealPath, async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
  });
}
