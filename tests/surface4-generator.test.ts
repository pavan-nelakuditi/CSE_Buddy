import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateSurface4Artifacts, loadSurface4State } from '../electron/services/surface4/generator.js';
import type { SpecContext } from '../src/shared/surface1.js';
import type { CICDConfig } from '../src/shared/surface3.js';

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

describe('Surface 4 generator', () => {
  it('writes a service-scoped generated bundle and a generation summary', async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), 'surface4-generator-'));
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace);

      const normalizedSpecPath = path.join(workspace, '.cse-buddy', 'surface1', 'payments', 'normalized', 'openapi.yaml');
      const flowPath = path.join(workspace, '.cse-buddy', 'surface2', 'payments', 'flow.yaml');
      const configPath = path.join(workspace, '.cse-buddy', 'surface3', 'payments', 'cicd-config.json');

      mkdirSync(path.dirname(normalizedSpecPath), { recursive: true });
      mkdirSync(path.dirname(flowPath), { recursive: true });
      mkdirSync(path.dirname(configPath), { recursive: true });

      writeFileSync(
        normalizedSpecPath,
        [
          'openapi: 3.0.3',
          'info:',
          '  title: Payments API',
          '  version: 1.0.0',
          'paths: {}'
        ].join('\n'),
        'utf8'
      );
      writeFileSync(
        flowPath,
        [
          'flows:',
          '  - name: Payments API happy path',
          '    type: smoke',
          '    steps: []'
        ].join('\n'),
        'utf8'
      );

      const specContext: SpecContext = {
        serviceKey: 'payments',
        source: 'upload',
        acquisition: {
          sourceLabel: 'Uploaded OpenAPI file',
          importedAt: '2026-04-30T12:00:00.000Z'
        },
        document: {
          name: 'Payments API',
          version: '1.0.0',
          format: 'openapi_3',
          originalPath: '/tmp/source.yaml',
          normalizedPath: normalizedSpecPath
        },
        validation: {
          valid: true,
          errors: [],
          warnings: []
        },
        summary: {
          endpointCount: 0,
          pathCount: 0,
          operationCount: 0,
          tags: [],
          servers: [],
          securitySchemes: [],
          excludedOperationCount: 0,
          syntheticOperationCount: 0
        },
        operations: []
      };

      const config: CICDConfig = {
        serviceKey: 'payments',
        ciProvider: 'github',
        sourceSpecPath: normalizedSpecPath,
        flowPath: path.join(workspace, '.cse-buddy', 'surface4', 'payments', 'generated', '.cse-buddy', 'flows', 'payments', 'flow.yaml'),
        prStrategy: {
          runSpecLint: true,
          runGovernanceChecks: true,
          blockOnFailure: true
        },
        mergeStrategy: {
          targetBranch: 'main',
          trigger: 'merge_to_main',
          runFullOnboarding: true
        },
        environments: [{ slug: 'prod', label: 'Prod', baseUrl: 'https://api.example.com' }],
        onboardingActionInputs: {
          environmentsJson: ['prod'],
          envRuntimeUrlsJson: {
            prod: 'https://api.example.com'
          }
        }
      };

      writeJson(configPath, config);

      const result = await generateSurface4Artifacts({ specContext, config });

      const generatedRoot = path.join(workspace, '.cse-buddy', 'surface4', 'payments', 'generated');
      expect(readFileSync(path.join(generatedRoot, 'api', 'openapi.yaml'), 'utf8')).toContain('Payments API');
      expect(readFileSync(path.join(generatedRoot, '.cse-buddy', 'flows', 'payments', 'flow.yaml'), 'utf8')).toContain('Payments API happy path');
      expect(readFileSync(path.join(generatedRoot, '.github', 'workflows', 'postman-pr-validation.yml'), 'utf8')).toContain('Postman PR Validation');
      expect(readFileSync(path.join(generatedRoot, '.github', 'workflows', 'postman-smoke-flow-onboarding.yml'), 'utf8')).toContain('postman-smoke-flow-action');
      expect(readFileSync(path.join(generatedRoot, 'README.md'), 'utf8')).toContain('POSTMAN_API_KEY');
      expect(result.summary.files.length).toBe(5);
      expect(result.summary.generatedRoot).toContain('/.cse-buddy/surface4/payments/generated');

      const loadedState = await loadSurface4State({
        serviceKey: 'payments',
        flowPath
      });
      expect(loadedState.summaryPath).toBe(result.summaryPath);
      expect(loadedState.summary?.serviceKey).toBe('payments');
      expect(loadedState.configExists).toBe(true);
      expect(loadedState.flowExists).toBe(true);
      expect(loadedState.config?.flowPath).toBe(flowPath);
      expect(loadedState.generatedSpecPath).toContain('/.cse-buddy/surface4/payments/generated/api/openapi.yaml');
      expect(loadedState.generatedFlowPath).toContain('/.cse-buddy/surface4/payments/generated/.cse-buddy/flows/payments/flow.yaml');
    } finally {
      process.chdir(previousCwd);
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
