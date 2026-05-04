import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = vi.hoisted(() => ({
  appDataPath: ''
}));

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key !== 'userData') {
        throw new Error(`Unexpected Electron app path request: ${key}`);
      }
      return electronState.appDataPath;
    }
  }
}));

import { clearWorkspace, getWorkspaceState, openWorkspace } from '../electron/services/workspace/state.js';

describe('workspace state', () => {
  let appDataPath: string;
  let workspaceOne: string;
  let workspaceTwo: string;

  beforeEach(() => {
    appDataPath = mkdtempSync(path.join(os.tmpdir(), 'cse-buddy-appdata-'));
    workspaceOne = mkdtempSync(path.join(os.tmpdir(), 'cse-buddy-workspace-'));
    workspaceTwo = mkdtempSync(path.join(os.tmpdir(), 'cse-buddy-workspace-'));
    electronState.appDataPath = appDataPath;
  });

  afterEach(() => {
    electronState.appDataPath = '';
    rmSync(appDataPath, { recursive: true, force: true });
    rmSync(workspaceOne, { recursive: true, force: true });
    rmSync(workspaceTwo, { recursive: true, force: true });
  });

  it('persists the current workspace and reorders recent workspaces', async () => {
    await openWorkspace(workspaceOne);
    await openWorkspace(workspaceTwo);
    await openWorkspace(workspaceOne);

    const state = await getWorkspaceState();
    expect(state.currentWorkspacePath).toBe(workspaceOne);
    expect(state.recentWorkspaces).toEqual([workspaceOne, workspaceTwo]);
  });

  it('clears the active workspace while keeping recent workspaces', async () => {
    await openWorkspace(workspaceOne);
    const cleared = await clearWorkspace();

    expect(cleared.currentWorkspacePath).toBeUndefined();
    expect(cleared.recentWorkspaces).toEqual([workspaceOne]);
  });
});
