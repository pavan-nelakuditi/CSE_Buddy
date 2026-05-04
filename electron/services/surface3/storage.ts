import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CICDConfig,
  LoadSurface3StateInput,
  SaveSurface3ConfigInput,
  Surface3LoadStateResult,
  Surface3PersistenceResult
} from '../../../src/shared/surface3.js';
import { getRequiredWorkspaceRoot } from '../workspace/state.js';
import { writeJson } from '../surface1/paths.js';

async function getSurface3Root(): Promise<string> {
  return path.resolve(await getRequiredWorkspaceRoot(), '.cse-buddy', 'surface3');
}

async function getServiceSurface3Dir(serviceKey: string): Promise<string> {
  return path.join(await getSurface3Root(), serviceKey);
}

async function getConfigPath(serviceKey: string): Promise<string> {
  return path.join(await getServiceSurface3Dir(serviceKey), 'cicd-config.json');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadSurface3State(input: LoadSurface3StateInput): Promise<Surface3LoadStateResult> {
  const configPath = await getConfigPath(input.serviceKey);
  const flowExists = await exists(input.flowPath);

  if (!(await exists(configPath))) {
    return { flowExists };
  }

  const raw = await readFile(configPath, 'utf8');
  return {
    config: JSON.parse(raw) as CICDConfig,
    configPath,
    flowExists
  };
}

export async function saveSurface3Config(input: SaveSurface3ConfigInput): Promise<Surface3PersistenceResult> {
  const configPath = await getConfigPath(input.config.serviceKey);
  await writeJson(configPath, input.config);
  return { configPath };
}
