import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderPrValidationWorkflow } from '../../../src/lib/surface4/templates/pr-validation.js';
import { renderSetupDoc } from '../../../src/lib/surface4/templates/setup-doc.js';
import { renderSmokeFlowOnboardingWorkflow } from '../../../src/lib/surface4/templates/smoke-flow-onboarding.js';
import { getSurface2FlowPath } from '../../../src/lib/surface3/config.js';
import {
  getGeneratedFlowRelativePath,
  getGeneratedOnboardingWorkflowRelativePath,
  getGeneratedPrWorkflowRelativePath,
  getGeneratedSetupDocRelativePath,
  getGeneratedSpecRelativePath
} from '../../../src/lib/surface4/paths.js';
import { validateSurface4Inputs } from '../../../src/lib/surface4/validate.js';
import type {
  GenerateSurface4ArtifactsInput,
  GenerateSurface4ArtifactsResult,
  LoadSurface4StateInput,
  Surface4GenerationSummary,
  Surface4LoadStateResult
} from '../../../src/shared/surface4.js';
import type { CICDConfig } from '../../../src/shared/surface3.js';
import { writeJson } from '../surface1/paths.js';
import { getRequiredWorkspaceRoot } from '../workspace/state.js';

async function getSurface4Root(): Promise<string> {
  return path.resolve(await getRequiredWorkspaceRoot(), '.cse-buddy', 'surface4');
}

async function getServiceSurface4Dir(serviceKey: string): Promise<string> {
  return path.join(await getSurface4Root(), serviceKey);
}

async function getSummaryPath(serviceKey: string): Promise<string> {
  return path.join(await getServiceSurface4Dir(serviceKey), 'generation-summary.json');
}

async function getGeneratedRoot(serviceKey: string): Promise<string> {
  return path.join(await getServiceSurface4Dir(serviceKey), 'generated');
}

async function getSurface3ConfigPath(serviceKey: string): Promise<string> {
  return path.resolve(await getRequiredWorkspaceRoot(), '.cse-buddy', 'surface3', serviceKey, 'cicd-config.json');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function withResolvedFlowPath(config: CICDConfig, flowPath: string): CICDConfig {
  if (config.flowPath === flowPath) {
    return config;
  }

  return {
    ...config,
    flowPath
  };
}

export async function loadSurface4State(input: LoadSurface4StateInput): Promise<Surface4LoadStateResult> {
  const configPath = await getSurface3ConfigPath(input.serviceKey);
  const summaryPath = await getSummaryPath(input.serviceKey);
  const generatedRoot = await getGeneratedRoot(input.serviceKey);
  const generatedSpecPath = path.join(generatedRoot, getGeneratedSpecRelativePath());
  const generatedFlowPath = path.join(generatedRoot, getGeneratedFlowRelativePath(input.serviceKey));
  const expectedFiles = [
    path.join(generatedRoot, getGeneratedSpecRelativePath()),
    path.join(generatedRoot, getGeneratedFlowRelativePath(input.serviceKey)),
    path.join(generatedRoot, getGeneratedPrWorkflowRelativePath()),
    path.join(generatedRoot, getGeneratedOnboardingWorkflowRelativePath()),
    path.join(generatedRoot, getGeneratedSetupDocRelativePath())
  ];

  const flowExists = await exists(input.flowPath);
  const configExists = await exists(configPath);
  const summaryExists = await exists(summaryPath);

  return {
    flowExists,
    configExists,
    ...(configExists
      ? {
          config: withResolvedFlowPath(await readJsonFile<CICDConfig>(configPath), input.flowPath),
          configPath
        }
      : {}),
    ...(summaryExists ? { summary: await readJsonFile<Surface4GenerationSummary>(summaryPath), summaryPath } : {}),
    generatedRoot,
    generatedSpecPath,
    generatedFlowPath,
    expectedFiles
  };
}

export async function generateSurface4Artifacts(input: GenerateSurface4ArtifactsInput): Promise<GenerateSurface4ArtifactsResult> {
  const errors = validateSurface4Inputs(input.specContext, input.config);
  if (errors.length > 0) {
    throw new Error(errors[0] ?? 'Surface 4 validation failed.');
  }

  const canonicalFlowPath = getSurface2FlowPath(input.specContext);
  const resolvedFlowPath = (await exists(canonicalFlowPath)) ? canonicalFlowPath : input.config.flowPath;

  if (!(await exists(resolvedFlowPath))) {
    throw new Error(`Surface 2 flow.yaml was not found at ${resolvedFlowPath}.`);
  }

  if (!(await exists(input.specContext.document.normalizedPath))) {
    throw new Error(`Normalized spec was not found at ${input.specContext.document.normalizedPath}.`);
  }

  const generatedRoot = await getGeneratedRoot(input.specContext.serviceKey);
  const generatedSpecPath = path.join(generatedRoot, getGeneratedSpecRelativePath());
  const generatedFlowPath = path.join(generatedRoot, getGeneratedFlowRelativePath(input.specContext.serviceKey));
  const prWorkflowPath = path.join(generatedRoot, getGeneratedPrWorkflowRelativePath());
  const onboardingWorkflowPath = path.join(generatedRoot, getGeneratedOnboardingWorkflowRelativePath());
  const setupDocPath = path.join(generatedRoot, getGeneratedSetupDocRelativePath());
  const summaryPath = await getSummaryPath(input.specContext.serviceKey);

  await mkdir(path.dirname(generatedSpecPath), { recursive: true });
  await mkdir(path.dirname(generatedFlowPath), { recursive: true });
  await copyFile(input.specContext.document.normalizedPath, generatedSpecPath);
  await copyFile(resolvedFlowPath, generatedFlowPath);
  await writeText(prWorkflowPath, renderPrValidationWorkflow({ repoSpecPath: getGeneratedSpecRelativePath() }));
  await writeText(
    onboardingWorkflowPath,
    renderSmokeFlowOnboardingWorkflow({
      config: input.config,
      repoSpecPath: getGeneratedSpecRelativePath(),
      repoFlowPath: getGeneratedFlowRelativePath(input.specContext.serviceKey)
    })
  );
  await writeText(
    setupDocPath,
    renderSetupDoc({
      serviceName: input.specContext.document.name,
      repoSpecPath: getGeneratedSpecRelativePath(),
      repoFlowPath: getGeneratedFlowRelativePath(input.specContext.serviceKey),
      config: input.config
    })
  );

  const summary: Surface4GenerationSummary = {
    serviceKey: input.specContext.serviceKey,
    generatedAt: new Date().toISOString(),
    files: [generatedSpecPath, generatedFlowPath, prWorkflowPath, onboardingWorkflowPath, setupDocPath],
    workflowPaths: [prWorkflowPath, onboardingWorkflowPath],
    setupDocPath,
    generatedRoot,
    generatedSpecPath,
    generatedFlowPath
  };

  await writeJson(summaryPath, summary);

  return {
    summaryPath,
    summary
  };
}

export async function getSurface4BundlePaths(serviceKey: string): Promise<{
  generatedRoot: string;
  setupDocPath: string;
}> {
  const generatedRoot = await getGeneratedRoot(serviceKey);
  return {
    generatedRoot,
    setupDocPath: path.join(generatedRoot, getGeneratedSetupDocRelativePath())
  };
}
