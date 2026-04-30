import { describe, expect, it } from 'vitest';

import { normalizeOpenApiSpec } from '../electron/services/surface1/spec-normalizer.js';

const VALID_SPEC = `
openapi: 3.0.3
info:
  title: Payments API
  version: 1.2.0
paths:
  /payments:
    post:
      operationId: createPayment
      tags: [payments]
      requestBody:
        content:
          application/json: {}
      responses:
        "201":
          description: created
  /payments/{paymentId}:
    get:
      operationId: getPaymentById
      tags: [payments]
      parameters:
        - in: path
          name: paymentId
          required: true
        - in: query
          name: expand
          schema:
            type: string
      responses:
        "200":
          description: ok
  /health:
    get:
      responses:
        "200":
          description: ok
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
servers:
  - url: https://api.example.com
`;

const NO_OPERATION_ID_SPEC = `
openapi: 3.0.3
info:
  title: Starter API
  version: 0.1.0
paths:
  /items:
    get:
      responses:
        "200":
          description: ok
    post:
      responses:
        "201":
          description: created
  /items/{itemId}:
    get:
      parameters:
        - in: path
          name: itemId
          required: true
          schema:
            type: string
      responses:
        "200":
          description: ok
`;

describe('normalizeOpenApiSpec', () => {
  it('extracts operation inventory and warnings', () => {
    const result = normalizeOpenApiSpec(VALID_SPEC, '/tmp/payments.yaml', 'upload');
    const createPayment = result.specContext.operations.find((operation) => operation.operationId === 'createPayment');
    const getPaymentById = result.specContext.operations.find((operation) => operation.operationId === 'getPaymentById');
    const syntheticHealth = result.specContext.operations.find((operation) => operation.syntheticOperationId);

    expect(result.specContext.serviceKey).toBe('payments-api');
    expect(result.specContext.document.name).toBe('Payments API');
    expect(result.specContext.summary.operationCount).toBe(3);
    expect(result.specContext.summary.excludedOperationCount).toBe(0);
    expect(result.specContext.summary.syntheticOperationCount).toBe(1);
    expect(createPayment?.method).toBe('POST');
    expect(getPaymentById?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'paymentId', location: 'path', required: true }),
        expect.objectContaining({ key: 'expand', location: 'query' })
      ])
    );
    expect(createPayment?.responseFields).toEqual([]);
    expect(syntheticHealth?.operationId).toBe('listHealth');
    expect(result.specContext.validation.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('assigned generated operationIds')])
    );
    expect(result.normalizedYaml).toContain('openapi: 3.0.3');
  });

  it('rejects non-openapi specs', () => {
    expect(() => normalizeOpenApiSpec('swagger: "2.0"', '/tmp/swagger.yaml', 'upload')).toThrow(/Swagger 2.0/);
    expect(() => normalizeOpenApiSpec('{"hello":"world"}', '/tmp/invalid.json', 'upload')).toThrow(/OpenAPI 3.x/);
  });

  it('synthesizes operationIds when the source spec does not define them', () => {
    const result = normalizeOpenApiSpec(NO_OPERATION_ID_SPEC, '/tmp/starter.yaml', 'upload');

    expect(result.specContext.operations.map((operation) => operation.operationId)).toEqual([
      'createItems',
      'getItemById',
      'listItems'
    ]);
    expect(result.specContext.operations.every((operation) => operation.syntheticOperationId)).toBe(true);
    expect(result.specContext.summary.syntheticOperationCount).toBe(3);
    expect(result.specContext.validation.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('assigned generated operationIds')])
    );
  });
});
