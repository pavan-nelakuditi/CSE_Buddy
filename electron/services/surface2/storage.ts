import path from 'node:path';

import type { ExportSurface2FlowInput, SaveSurface2DraftInput, Surface2PersistenceResult } from '../../../src/shared/surface2.js';
import { writeJson, writeText } from '../surface1/paths.js';

function getSurface2Root(): string {
  return path.resolve(process.cwd(), '.cse-buddy', 'surface2');
}

function getServiceSurface2Dir(serviceKey: string): string {
  return path.join(getSurface2Root(), serviceKey);
}

function getDraftPath(serviceKey: string): string {
  return path.join(getServiceSurface2Dir(serviceKey), 'draft-flow.json');
}

function getManifestPath(serviceKey: string): string {
  return path.join(getServiceSurface2Dir(serviceKey), 'flow.yaml');
}

export async function saveSurface2Draft(input: SaveSurface2DraftInput): Promise<Surface2PersistenceResult> {
  const draftPath = getDraftPath(input.draft.specContext.serviceKey);
  await writeJson(draftPath, input.draft);
  return { draftPath };
}

export async function exportSurface2Flow(input: ExportSurface2FlowInput): Promise<Surface2PersistenceResult> {
  const serviceKey = input.draft.specContext.serviceKey;
  const draftPath = getDraftPath(serviceKey);
  const manifestPath = getManifestPath(serviceKey);

  await writeJson(draftPath, input.draft);
  await writeText(manifestPath, input.manifestYaml);

  return {
    draftPath,
    manifestPath
  };
}
