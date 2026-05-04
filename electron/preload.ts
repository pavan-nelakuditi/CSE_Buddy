import { contextBridge, ipcRenderer } from 'electron';

import type {
  AwsApiSummary,
  AwsConnectionResult,
  AwsGatewayType,
  AwsProfile,
  ImportAllAwsSpecsInput,
  ImportAllAwsSpecsResult,
  ImportAwsSpecInput,
  ImportUploadResult,
  SpecContext,
  Surface1Api
} from '../src/shared/surface1.js';
import { surface1Channels } from '../src/shared/surface1-channels.js';
import type { Surface2Api } from '../src/shared/surface2.js';
import { surface2Channels } from '../src/shared/surface2-channels.js';
import type { Surface3Api } from '../src/shared/surface3.js';
import { surface3Channels } from '../src/shared/surface3-channels.js';
import type { Surface4Api } from '../src/shared/surface4.js';
import { surface4Channels } from '../src/shared/surface4-channels.js';

const surface1Api: Surface1Api = {
  pickOpenApiFile: () => ipcRenderer.invoke(surface1Channels.pickOpenApiFile) as Promise<string | null>,
  importUploadedSpec: (filePath: string) =>
    ipcRenderer.invoke(surface1Channels.importUploadedSpec, filePath) as Promise<ImportUploadResult>,
  listAwsProfiles: () => ipcRenderer.invoke(surface1Channels.listAwsProfiles) as Promise<AwsProfile[]>,
  testAwsConnection: (profile: string | undefined, region: string) =>
    ipcRenderer.invoke(surface1Channels.testAwsConnection, profile, region) as Promise<AwsConnectionResult>,
  listAwsApis: (profile: string | undefined, region: string) =>
    ipcRenderer.invoke(surface1Channels.listAwsApis, profile, region) as Promise<AwsApiSummary[]>,
  listAwsStages: (profile: string | undefined, region: string, apiId: string, gatewayType: AwsGatewayType) =>
    ipcRenderer.invoke(surface1Channels.listAwsStages, profile, region, apiId, gatewayType) as Promise<string[]>,
  importAwsSpec: (input: ImportAwsSpecInput) =>
    ipcRenderer.invoke(surface1Channels.importAwsSpec, input) as Promise<SpecContext>,
  importAllAwsSpecs: (input: ImportAllAwsSpecsInput) =>
    ipcRenderer.invoke(surface1Channels.importAllAwsSpecs, input) as Promise<ImportAllAwsSpecsResult>,
  loadSpecContext: (specContextPath: string) =>
    ipcRenderer.invoke(surface1Channels.loadSpecContext, specContextPath) as Promise<SpecContext>
};

contextBridge.exposeInMainWorld('surface1', surface1Api);

const surface2Api: Surface2Api = {
  saveDraft: (input) => ipcRenderer.invoke(surface2Channels.saveDraft, input),
  exportFlow: (input) => ipcRenderer.invoke(surface2Channels.exportFlow, input)
};

const surface3Api: Surface3Api = {
  loadState: (input) => ipcRenderer.invoke(surface3Channels.loadState, input),
  saveConfig: (input) => ipcRenderer.invoke(surface3Channels.saveConfig, input)
};

const surface4Api: Surface4Api = {
  loadState: (input) => ipcRenderer.invoke(surface4Channels.loadState, input),
  generateArtifacts: (input) => ipcRenderer.invoke(surface4Channels.generateArtifacts, input),
  revealBundle: (serviceKey) => {
    if (!serviceKey) {
      throw new Error('Reveal bundle service key is unavailable.');
    }
    return ipcRenderer.invoke(surface4Channels.revealBundle, serviceKey);
  },
  openReadme: (serviceKey) => {
    if (!serviceKey) {
      throw new Error('Open README service key is unavailable.');
    }
    return ipcRenderer.invoke(surface4Channels.openReadme, serviceKey);
  }
};

contextBridge.exposeInMainWorld('surface2', surface2Api);
contextBridge.exposeInMainWorld('surface3', surface3Api);
contextBridge.exposeInMainWorld('surface4', surface4Api);
