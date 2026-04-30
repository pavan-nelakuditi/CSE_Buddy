import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AwsApiSummary,
  ImportAllAwsSpecsInput,
  ImportAllAwsSpecsResult,
  ImportAwsSpecInput,
  ServiceCatalogEntry,
  SpecContext
} from '../../../src/shared/surface1.js';
import { buildServiceCatalog } from './service-catalog-builder.js';
import { buildServiceKey, ensureServiceDirectories, getBulkCatalogPath, getServicePaths, writeJson, writeText } from './paths.js';
import { normalizeOpenApiSpec } from './spec-normalizer.js';
import { exportSpec, listApis, listProfiles, listStages, pickPreferredStage, testConnection } from './aws-api-gateway-adapter.js';

async function persistSpecContext(
  specYaml: string,
  sourceFileName: string,
  sourcePathLabel: string,
  source: SpecContext['source'],
  serviceNameHint?: string,
  serviceKeyHint?: string
): Promise<SpecContext> {
  const normalized = normalizeOpenApiSpec(specYaml, sourcePathLabel, source);
  const serviceKey = serviceKeyHint ?? buildServiceKey(serviceNameHint ?? normalized.specContext.document.name);
  const servicePaths = getServicePaths(serviceKey);

  await ensureServiceDirectories(servicePaths);
  const sourcePath = path.join(servicePaths.sourceDir, sourceFileName);
  await writeText(sourcePath, specYaml);
  await writeText(servicePaths.normalizedSpecPath, normalized.normalizedYaml);

  normalized.specContext.serviceKey = serviceKey;
  normalized.specContext.document.originalPath = sourcePath;
  normalized.specContext.document.normalizedPath = servicePaths.normalizedSpecPath;

  await writeJson(servicePaths.specContextPath, normalized.specContext);
  return normalized.specContext;
}

export async function importAwsSpec(input: ImportAwsSpecInput): Promise<SpecContext> {
  const specYaml = await exportSpec(input.profile, input.region, input.gatewayId, input.gatewayType, input.stage);
  const specContext = await persistSpecContext(
    specYaml,
    'aws-export.yaml',
    `aws://${input.region}/${input.gatewayId}/${input.stage}`,
    'aws_apigateway',
    input.gatewayId,
    buildServiceKey(input.gatewayId, input.stage)
  );

  specContext.acquisition = {
    sourceLabel: 'AWS API Gateway import',
    importedAt: new Date().toISOString(),
    awsProfile: input.profile,
    awsRegion: input.region,
    gatewayId: input.gatewayId,
    gatewayType: input.gatewayType,
    stage: input.stage
  };

  const stored = getServicePaths(buildServiceKey(input.gatewayId, input.stage));
  await writeJson(stored.specContextPath, specContext);
  return specContext;
}

async function buildCatalogEntryForImportedService(
  api: AwsApiSummary,
  profile: string | undefined,
  region: string,
  stage: string
): Promise<ServiceCatalogEntry> {
  const specYaml = await exportSpec(profile, region, api.id, api.gatewayType, stage);
  const serviceKey = buildServiceKey(api.name, api.id);
  const specContext = await persistSpecContext(
    specYaml,
    'aws-export.yaml',
    `aws://${region}/${api.id}/${stage}`,
    'aws_apigateway',
    api.name,
    serviceKey
  );

  specContext.acquisition = {
    sourceLabel: 'AWS API Gateway import',
    importedAt: new Date().toISOString(),
    awsProfile: profile,
    awsRegion: region,
    gatewayId: api.id,
    gatewayType: api.gatewayType,
    stage
  };

  const servicePaths = getServicePaths(serviceKey);
  await writeJson(servicePaths.specContextPath, specContext);

  return {
    serviceKey,
    serviceName: specContext.document.name,
    gatewayId: api.id,
    gatewayType: api.gatewayType,
    stage,
    status: 'imported',
    normalizedPath: specContext.document.normalizedPath,
    specContextPath: servicePaths.specContextPath,
    warningCount: specContext.validation.warnings.length
  };
}

export async function importAllAwsSpecs(input: ImportAllAwsSpecsInput): Promise<ImportAllAwsSpecsResult> {
  const apis = await listApis(input.profile, input.region);
  const entries: ServiceCatalogEntry[] = [];

  for (const api of apis) {
    try {
      const stages = await listStages(input.profile, input.region, api.id, api.gatewayType);
      const selectedStage = stages.length === 1 ? stages[0] : pickPreferredStage(stages);

      if (!selectedStage) {
        entries.push({
          serviceKey: buildServiceKey(api.name, api.id),
          serviceName: api.name,
          gatewayId: api.id,
          gatewayType: api.gatewayType,
          status: 'skipped',
          warningCount: 0,
          errorSummary: stages.length === 0 ? 'No stages were found for this API.' : 'No deterministic stage match was available.'
        });
        continue;
      }

      entries.push(await buildCatalogEntryForImportedService(api, input.profile, input.region, selectedStage));
    } catch (error) {
      entries.push({
        serviceKey: buildServiceKey(api.name, api.id),
        serviceName: api.name,
        gatewayId: api.id,
        gatewayType: api.gatewayType,
        status: 'failed',
        stage: undefined,
        warningCount: 0,
        errorSummary: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const catalog = buildServiceCatalog(input.region, input.profile, entries);
  await writeJson(getBulkCatalogPath(), catalog);
  return { catalog };
}

export async function loadSpecContext(specContextPath: string): Promise<SpecContext> {
  const content = await readFile(specContextPath, 'utf8');
  return JSON.parse(content) as SpecContext;
}

export const awsImportService = {
  listProfiles,
  testConnection,
  listApis,
  listStages,
  importAwsSpec,
  importAllAwsSpecs,
  loadSpecContext
};
