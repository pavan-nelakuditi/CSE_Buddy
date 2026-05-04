export type WorkspaceState = {
  currentWorkspacePath?: string;
  recentWorkspaces: string[];
};

export type WorkspaceSelectionResult = {
  workspacePath?: string;
  state: WorkspaceState;
};

export type WorkspaceApi = {
  chooseWorkspace: () => Promise<WorkspaceSelectionResult>;
  createWorkspace: () => Promise<WorkspaceSelectionResult>;
  openWorkspace: (workspacePath: string) => Promise<WorkspaceState>;
  getWorkspaceState: () => Promise<WorkspaceState>;
  clearWorkspace: () => Promise<WorkspaceState>;
  openPath: (targetPath: string) => Promise<void>;
  revealPath: (targetPath: string) => Promise<void>;
};

declare global {
  interface Window {
    workspace: WorkspaceApi;
  }
}
