import { describe, expect, it } from 'vitest';

import { validateSurface4Inputs } from '../src/lib/surface4/validate.js';
import type { SpecContext } from '../src/shared/surface1.js';
import type { CICDConfig } from '../src/shared/surface3.js';

const SPEC_CONTEXT: SpecContext = {
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
    normalizedPath: '/tmp/.cse-buddy/surface1/payments/normalized/openapi.yaml'
  },
  validation: {
    valid: true,
    errors: [],
    warnings: []
  },
  summary: {
    endpointCount: 2,
    pathCount: 1,
    operationCount: 2,
    tags: ['payments'],
    servers: [],
    securitySchemes: [],
    excludedOperationCount: 0,
    syntheticOperationCount: 0
  },
  operations: []
};

const CICD_CONFIG: CICDConfig = {
  serviceKey: 'payments',
  ciProvider: 'github',
  sourceSpecPath: '/tmp/.cse-buddy/surface1/payments/normalized/openapi.yaml',
  flowPath: '/tmp/.cse-buddy/surface2/payments/flow.yaml',
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

describe('Surface 4 validation', () => {
  it('accepts a coherent Surface 4 input set', () => {
    expect(validateSurface4Inputs(SPEC_CONTEXT, CICD_CONFIG)).toEqual([]);
  });

  it('rejects mismatched services and missing environment URLs', () => {
    const errors = validateSurface4Inputs(SPEC_CONTEXT, {
      ...CICD_CONFIG,
      serviceKey: 'orders',
      environments: [{ slug: 'prod', label: 'Prod', baseUrl: '' }]
    });

    expect(errors[0]).toContain('selected service');
    expect(errors[1]).toContain('runtime URL');
  });
});
