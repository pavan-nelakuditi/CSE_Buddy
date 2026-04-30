import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CICDConfig,
  LoadSurface3StateInput,
  SaveSurface3ConfigInput,
  Surface3LoadStateResult,
  Surface3PersistenceResult
} from '../../../src/shared/surface3.js';
import { writeJson } from '../surface1/paths.js';

function getSurface3Root(): string {
  return path.resolve(process.cwd(), '.cse-buddy', 'surface3');
}

function getServiceSurface3Dir(serviceKey: string): string {
  return path.join(getSurface3Root(), serviceKey);
}

function getConfigPath(serviceKey: string): string {
  return path.join(getServiceSurface3Dir(serviceKey), 'cicd-config.json');
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
  const configPath = getConfigPath(input.serviceKey);
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
  const configPath = getConfigPath(input.config.serviceKey);
  await writeJson(configPath, input.config);
  return { configPath };
}
