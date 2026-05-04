import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import type { WorkspaceSelectionResult, WorkspaceState } from '../../../src/shared/workspace.js';

type PersistedWorkspaceState = WorkspaceState;

const DEFAULT_STATE: WorkspaceState = {
  recentWorkspaces: []
};

function getWorkspaceStatePath(): string {
  return path.join(app.getPath('userData'), 'workspace-state.json');
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRecentWorkspaces(currentWorkspacePath: string | undefined, recentWorkspaces: string[]): string[] {
  const seen = new Set<string>();
  const ordered = [currentWorkspacePath, ...recentWorkspaces].filter((value): value is string => Boolean(value));
  const normalized: string[] = [];

  for (const workspacePath of ordered) {
    if (seen.has(workspacePath)) {
      continue;
    }
    seen.add(workspacePath);
    normalized.push(workspacePath);
  }

  return normalized.slice(0, 8);
}

async function readPersistedState(): Promise<WorkspaceState> {
  const statePath = getWorkspaceStatePath();
  if (!(await exists(statePath))) {
    return DEFAULT_STATE;
  }

  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as PersistedWorkspaceState;
    return {
      currentWorkspacePath: parsed.currentWorkspacePath,
      recentWorkspaces: normalizeRecentWorkspaces(parsed.currentWorkspacePath, parsed.recentWorkspaces ?? [])
    };
  } catch {
    return DEFAULT_STATE;
  }
}

async function writePersistedState(state: WorkspaceState): Promise<void> {
  const statePath = getWorkspaceStatePath();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

async function pathIsUsableDirectory(workspacePath: string): Promise<boolean> {
  return exists(workspacePath);
}

async function saveWorkspace(workspacePath: string | undefined, recentWorkspaces: string[]): Promise<WorkspaceState> {
  const nextState: WorkspaceState = {
    currentWorkspacePath: workspacePath,
    recentWorkspaces: normalizeRecentWorkspaces(workspacePath, recentWorkspaces)
  };
  await writePersistedState(nextState);
  return nextState;
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  const state = await readPersistedState();
  if (state.currentWorkspacePath && !(await pathIsUsableDirectory(state.currentWorkspacePath))) {
    return saveWorkspace(undefined, state.recentWorkspaces.filter((workspacePath) => workspacePath !== state.currentWorkspacePath));
  }

  return state;
}

export async function openWorkspace(workspacePath: string): Promise<WorkspaceState> {
  if (!(await pathIsUsableDirectory(workspacePath))) {
    throw new Error(`Workspace folder does not exist: ${workspacePath}`);
  }

  const current = await readPersistedState();
  return saveWorkspace(workspacePath, current.recentWorkspaces);
}

export async function finalizeWorkspaceSelection(workspacePath: string | undefined): Promise<WorkspaceSelectionResult> {
  if (!workspacePath) {
    return {
      state: await getWorkspaceState()
    };
  }

  return {
    workspacePath,
    state: await openWorkspace(workspacePath)
  };
}

export async function clearWorkspace(): Promise<WorkspaceState> {
  const current = await readPersistedState();
  return saveWorkspace(undefined, current.recentWorkspaces);
}

export async function getRequiredWorkspaceRoot(): Promise<string> {
  const state = await getWorkspaceState();
  if (!state.currentWorkspacePath) {
    throw new Error('Choose a workspace before using CSE Buddy.');
  }
  return state.currentWorkspacePath;
}
