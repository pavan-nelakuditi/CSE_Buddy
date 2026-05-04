import path from 'node:path';

import type { ExportSurface2FlowInput, SaveSurface2DraftInput, Surface2PersistenceResult } from '../../../src/shared/surface2.js';
import { getRequiredWorkspaceRoot } from '../workspace/state.js';
import { writeJson, writeText } from '../surface1/paths.js';

async function getSurface2Root(): Promise<string> {
  return path.resolve(await getRequiredWorkspaceRoot(), '.cse-buddy', 'surface2');
}

async function getServiceSurface2Dir(serviceKey: string): Promise<string> {
  return path.join(await getSurface2Root(), serviceKey);
}

async function getDraftPath(serviceKey: string): Promise<string> {
  return path.join(await getServiceSurface2Dir(serviceKey), 'draft-flow.json');
}

async function getManifestPath(serviceKey: string): Promise<string> {
  return path.join(await getServiceSurface2Dir(serviceKey), 'flow.yaml');
}

export async function saveSurface2Draft(input: SaveSurface2DraftInput): Promise<Surface2PersistenceResult> {
  const draftPath = await getDraftPath(input.draft.specContext.serviceKey);
  await writeJson(draftPath, input.draft);
  return { draftPath };
}

export async function exportSurface2Flow(input: ExportSurface2FlowInput): Promise<Surface2PersistenceResult> {
  const serviceKey = input.draft.specContext.serviceKey;
  const draftPath = await getDraftPath(serviceKey);
  const manifestPath = await getManifestPath(serviceKey);

  await writeJson(draftPath, input.draft);
  await writeText(manifestPath, input.manifestYaml);

  return {
    draftPath,
    manifestPath
  };
}
