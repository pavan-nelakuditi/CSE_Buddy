import { describe, expect, it } from 'vitest';

import { buildServiceCatalog } from '../electron/services/surface1/service-catalog-builder.js';

describe('buildServiceCatalog', () => {
  it('summarizes imported, skipped, and failed services', () => {
    const catalog = buildServiceCatalog('us-east-1', 'sandbox', [
      {
        serviceKey: 'payments',
        serviceName: 'Payments',
        gatewayId: 'rest-1',
        gatewayType: 'REST',
        stage: 'prod',
        status: 'imported',
        warningCount: 1,
        normalizedPath: '/tmp/openapi.yaml',
        specContextPath: '/tmp/spec-context.json'
      },
      {
        serviceKey: 'orders',
        serviceName: 'Orders',
        gatewayId: 'http-2',
        gatewayType: 'HTTP',
        status: 'skipped',
        warningCount: 0,
        errorSummary: 'No stages'
      },
      {
        serviceKey: 'billing',
        serviceName: 'Billing',
        gatewayId: 'rest-3',
        gatewayType: 'REST',
        status: 'failed',
        warningCount: 0,
        errorSummary: 'Export failed'
      }
    ]);

    expect(catalog.totals).toEqual({
      detected: 3,
      imported: 1,
      skipped: 1,
      failed: 1
    });
  });
});
