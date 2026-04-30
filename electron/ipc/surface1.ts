import { dialog, ipcMain } from 'electron';

import type { ImportAllAwsSpecsInput, ImportAwsSpecInput } from '../../src/shared/surface1.js';
import { surface1Channels } from '../../src/shared/surface1-channels.js';
import { importUploadedSpec } from '../services/surface1/file-import-service.js';
import { awsImportService } from '../services/surface1/aws-import-service.js';

export function registerSurface1Ipc(): void {
  ipcMain.handle(surface1Channels.pickOpenApiFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'OpenAPI files',
          extensions: ['yaml', 'yml', 'json']
        }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(surface1Channels.importUploadedSpec, async (_event, filePath: string) => importUploadedSpec(filePath));
  ipcMain.handle(surface1Channels.listAwsProfiles, async () => awsImportService.listProfiles());
  ipcMain.handle(surface1Channels.testAwsConnection, async (_event, profile: string | undefined, region: string) =>
    awsImportService.testConnection(profile, region)
  );
  ipcMain.handle(surface1Channels.listAwsApis, async (_event, profile: string | undefined, region: string) =>
    awsImportService.listApis(profile, region)
  );
  ipcMain.handle(
    surface1Channels.listAwsStages,
    async (_event, profile: string | undefined, region: string, apiId: string, gatewayType: 'REST' | 'HTTP') =>
      awsImportService.listStages(profile, region, apiId, gatewayType)
  );
  ipcMain.handle(surface1Channels.importAwsSpec, async (_event, input: ImportAwsSpecInput) => awsImportService.importAwsSpec(input));
  ipcMain.handle(surface1Channels.importAllAwsSpecs, async (_event, input: ImportAllAwsSpecsInput) =>
    awsImportService.importAllAwsSpecs(input)
  );
  ipcMain.handle(surface1Channels.loadSpecContext, async (_event, specContextPath: string) => awsImportService.loadSpecContext(specContextPath));
}
