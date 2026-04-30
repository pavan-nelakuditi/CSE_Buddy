import { describe, expect, it } from 'vitest';

import { generateDraftFlow } from '../src/lib/surface2/generator.js';
import { exportManifestYaml, validateFlow } from '../src/lib/surface2/manifest.js';
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
    normalizedPath: '/tmp/openapi.yaml'
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
  operations: [
    {
      operationId: 'createPayment',
      method: 'POST',
      path: '/payments',
      tags: ['payments'],
      summary: 'Create payment',
      fields: [
        {
          key: 'amount',
          label: 'amount',
          location: 'body',
          required: true,
          type: 'number',
          example: '42'
        }
      ],
      responseFields: [
        {
          key: 'paymentId',
          label: 'paymentId',
          jsonPath: '$.paymentId',
          type: 'string'
        }
      ]
    },
    {
      operationId: 'getPaymentById',
      method: 'GET',
      path: '/payments/{paymentId}',
      tags: ['payments'],
      summary: 'Get payment',
      fields: [
        {
          key: 'paymentId',
          label: 'paymentId',
          location: 'path',
          required: true,
          type: 'string'
        }
      ],
      responseFields: [
        {
          key: 'paymentId',
          label: 'paymentId',
          jsonPath: '$.paymentId',
          type: 'string'
        }
      ]
    },
    {
      operationId: 'listPayments',
      method: 'GET',
      path: '/payments',
      tags: ['payments'],
      summary: 'List payments',
      fields: [],
      responseFields: []
    }
  ]
};

describe('Surface 2 generator', () => {
  it('builds one happy-path smoke flow with supporting reads and bindings', () => {
    const result = generateDraftFlow(SPEC_CONTEXT);

    expect(result.pendingAmbiguity).toBeUndefined();
    expect(result.flow?.type).toBe('smoke');
    expect(result.flow?.steps.map((step) => step.operationId)).toEqual(['createPayment', 'getPaymentById']);
    expect(result.flow?.steps[1]?.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: 'paymentId',
          source: 'prior_output',
          variable: 'createPayment.paymentId'
        })
      ])
    );
  });

  it('exports a valid flow manifest yaml', () => {
    const result = generateDraftFlow(SPEC_CONTEXT);
    if (!result.flow) {
      throw new Error('Expected a generated flow.');
    }

    const draft = {
      specContext: SPEC_CONTEXT,
      flow: result.flow,
      overrides: result.overrides
    };

    expect(validateFlow(draft.flow, SPEC_CONTEXT.operations)).toEqual([]);
    expect(exportManifestYaml(draft)).toContain('type: smoke');
    expect(exportManifestYaml(draft)).toContain('operationId: createPayment');
  });
});
