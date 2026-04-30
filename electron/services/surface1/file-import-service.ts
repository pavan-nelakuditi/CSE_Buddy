import { copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ImportUploadResult } from '../../../src/shared/surface1.js';
import { buildServiceKey, ensureServiceDirectories, getServicePaths, writeJson, writeText } from './paths.js';
import { normalizeOpenApiSpec } from './spec-normalizer.js';

export async function importUploadedSpec(filePath: string): Promise<ImportUploadResult> {
  const rawContent = await readFile(filePath, 'utf8');
  const normalized = normalizeOpenApiSpec(rawContent, filePath, 'upload');
  const extension = path.extname(filePath).toLowerCase() || '.yaml';
  const serviceKey = buildServiceKey(normalized.specContext.document.name);
  const servicePaths = getServicePaths(serviceKey);

  await ensureServiceDirectories(servicePaths);

  const originalPath = path.join(servicePaths.sourceDir, `original${extension}`);
  await copyFile(filePath, originalPath);
  await writeText(servicePaths.normalizedSpecPath, normalized.normalizedYaml);

  normalized.specContext.serviceKey = serviceKey;
  normalized.specContext.document.originalPath = originalPath;
  normalized.specContext.document.normalizedPath = servicePaths.normalizedSpecPath;

  await writeJson(servicePaths.specContextPath, normalized.specContext);

  return {
    selectedPath: filePath,
    specContext: normalized.specContext
  };
}
