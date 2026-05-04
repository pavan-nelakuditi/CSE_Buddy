const { contextBridge, ipcRenderer } = require('electron');

const workspaceChannels = {
  chooseWorkspace: 'workspace:choose',
  createWorkspace: 'workspace:create',
  openWorkspace: 'workspace:open',
  getWorkspaceState: 'workspace:get-state',
  clearWorkspace: 'workspace:clear',
  openPath: 'workspace:open-path',
  revealPath: 'workspace:reveal-path'
};

const surface1Channels = {
  pickOpenApiFile: 'surface1:pick-openapi-file',
  importUploadedSpec: 'surface1:import-uploaded-spec',
  listAwsProfiles: 'surface1:list-aws-profiles',
  testAwsConnection: 'surface1:test-aws-connection',
  listAwsApis: 'surface1:list-aws-apis',
  listAwsStages: 'surface1:list-aws-stages',
  importAwsSpec: 'surface1:import-aws-spec',
  importAllAwsSpecs: 'surface1:import-all-aws-specs',
  loadSpecContext: 'surface1:load-spec-context'
};

const surface2Channels = {
  saveDraft: 'surface2:save-draft',
  exportFlow: 'surface2:export-flow'
};

const surface3Channels = {
  loadState: 'surface3:load-state',
  saveConfig: 'surface3:save-config'
};

const surface4Channels = {
  loadState: 'surface4:load-state',
  generateArtifacts: 'surface4:generate-artifacts',
  revealBundle: 'surface4:reveal-bundle',
  openReadme: 'surface4:open-readme'
};

function requireTargetPath(targetPath, actionLabel) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new Error(`${actionLabel} path is unavailable.`);
  }
  return targetPath;
}

function normalizeServiceKey(serviceKey, actionLabel) {
  if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
    throw new Error(`${actionLabel} service key is unavailable.`);
  }
  return serviceKey;
}

contextBridge.exposeInMainWorld('workspace', {
  chooseWorkspace: () => ipcRenderer.invoke(workspaceChannels.chooseWorkspace),
  createWorkspace: () => ipcRenderer.invoke(workspaceChannels.createWorkspace),
  openWorkspace: (workspacePath) => ipcRenderer.invoke(workspaceChannels.openWorkspace, workspacePath),
  getWorkspaceState: () => ipcRenderer.invoke(workspaceChannels.getWorkspaceState),
  clearWorkspace: () => ipcRenderer.invoke(workspaceChannels.clearWorkspace),
  openPath: (targetPath) => ipcRenderer.invoke(workspaceChannels.openPath, requireTargetPath(targetPath, 'Open')),
  revealPath: (targetPath) => ipcRenderer.invoke(workspaceChannels.revealPath, requireTargetPath(targetPath, 'Reveal'))
});

contextBridge.exposeInMainWorld('surface1', {
  pickOpenApiFile: () => ipcRenderer.invoke(surface1Channels.pickOpenApiFile),
  importUploadedSpec: (filePath) => ipcRenderer.invoke(surface1Channels.importUploadedSpec, filePath),
  listAwsProfiles: () => ipcRenderer.invoke(surface1Channels.listAwsProfiles),
  testAwsConnection: (profile, region) => ipcRenderer.invoke(surface1Channels.testAwsConnection, profile, region),
  listAwsApis: (profile, region) => ipcRenderer.invoke(surface1Channels.listAwsApis, profile, region),
  listAwsStages: (profile, region, apiId, gatewayType) =>
    ipcRenderer.invoke(surface1Channels.listAwsStages, profile, region, apiId, gatewayType),
  importAwsSpec: (input) => ipcRenderer.invoke(surface1Channels.importAwsSpec, input),
  importAllAwsSpecs: (input) => ipcRenderer.invoke(surface1Channels.importAllAwsSpecs, input),
  loadSpecContext: (specContextPath) => ipcRenderer.invoke(surface1Channels.loadSpecContext, specContextPath)
});

contextBridge.exposeInMainWorld('surface2', {
  saveDraft: (input) => ipcRenderer.invoke(surface2Channels.saveDraft, input),
  exportFlow: (input) => ipcRenderer.invoke(surface2Channels.exportFlow, input)
});

contextBridge.exposeInMainWorld('surface3', {
  loadState: (input) => ipcRenderer.invoke(surface3Channels.loadState, input),
  saveConfig: (input) => ipcRenderer.invoke(surface3Channels.saveConfig, input)
});

contextBridge.exposeInMainWorld('surface4', {
  loadState: (input) => ipcRenderer.invoke(surface4Channels.loadState, input),
  generateArtifacts: (input) => ipcRenderer.invoke(surface4Channels.generateArtifacts, input),
  revealBundle: (serviceKey) => ipcRenderer.invoke(surface4Channels.revealBundle, normalizeServiceKey(serviceKey, 'Reveal bundle')),
  openReadme: (serviceKey) => ipcRenderer.invoke(surface4Channels.openReadme, normalizeServiceKey(serviceKey, 'Open README'))
});
