import { describe, expect, it } from 'vitest';

import {
  buildCicdConfig,
  getSurface2FlowPath,
  validateEnvironmentRuntimes,
  validateEnvironmentSelection,
  validateGovernance
} from '../src/lib/surface3/config.js';
import type { SpecContext } from '../src/shared/surface1.js';

const SPEC_CONTEXT: SpecContext = {
  serviceKey: 'payments',
  source: 'upload',
  acquisition: {
    sourceLabel: 'Uploaded OpenAPI file',
    importedAt: '2026-04-27T12:00:00.000Z'
  },
  document: {
    name: 'Payments API',
    version: '1.0.0',
    format: 'openapi_3',
    originalPath: '/tmp/payments.yaml',
    normalizedPath: '/tmp/.cse-buddy/surface1/payments/normalized/openapi.yaml'
  },
  validation: {
    valid: true,
    errors: [],
    warnings: []
  },
  summary: {
    endpointCount: 3,
    pathCount: 2,
    operationCount: 3,
    tags: ['payments'],
    servers: ['https://api.example.com'],
    securitySchemes: ['bearerAuth'],
    excludedOperationCount: 0,
    syntheticOperationCount: 0
  },
  operations: []
};

describe('Surface 3 config builder', () => {
  it('builds onboarding-action-ready environment inputs', () => {
    const config = buildCicdConfig(
      SPEC_CONTEXT,
      [
        { slug: 'dev', label: 'Dev', baseUrl: 'https://dev-api.example.com' },
        { slug: 'prod', label: 'Prod', baseUrl: 'https://api.example.com' }
      ],
      {
        domain: 'payments',
        groupName: 'Payments Governance'
      }
    );

    expect(config.onboardingActionInputs.environmentsJson).toEqual(['dev', 'prod']);
    expect(config.onboardingActionInputs.envRuntimeUrlsJson).toEqual({
      dev: 'https://dev-api.example.com',
      prod: 'https://api.example.com'
    });
    expect(config.onboardingActionInputs.governanceMappingJson).toEqual({
      payments: 'Payments Governance'
    });
    expect(config.flowPath).toContain('/surface2/');
  });

  it('derives the Surface 2 flow path from any service-scoped .cse-buddy bundle path', () => {
    const generatedBundleContext: SpecContext = {
      ...SPEC_CONTEXT,
      document: {
        ...SPEC_CONTEXT.document,
        normalizedPath:
          '/tmp/workspace/.cse-buddy/surface4/payments/generated/api/openapi.yaml'
      }
    };

    expect(getSurface2FlowPath(SPEC_CONTEXT)).toBe('/tmp/.cse-buddy/surface2/payments/flow.yaml');
    expect(getSurface2FlowPath(generatedBundleContext)).toBe(
      '/tmp/workspace/.cse-buddy/surface2/payments/flow.yaml'
    );
  });

  it('validates environment strategy and optional governance inputs', () => {
    expect(validateEnvironmentSelection([])).toEqual(['Choose at least one environment for Surface 3.']);
    expect(
      validateEnvironmentRuntimes([{ slug: 'dev', label: 'Dev', baseUrl: 'notaurl' }])
    ).toEqual(['dev must be a valid URL.']);
    expect(validateGovernance(true, { domain: '', groupName: '' })[0]).toContain('domain key');
  });
});
