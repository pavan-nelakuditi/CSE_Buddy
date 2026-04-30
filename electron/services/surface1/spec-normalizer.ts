import { extname } from 'node:path';
import { parse, stringify } from 'yaml';

import type { OperationField, ResponseField, SpecContext, SpecOperation } from '../../../src/shared/surface1.js';
import { buildServiceKey } from './paths.js';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';
type SchemaObject = Record<string, unknown>;

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, Record<string, Record<string, unknown>>>;
  tags?: Array<{ name?: string }>;
  servers?: Array<{ url?: string }>;
  security?: unknown[];
  components?: {
    securitySchemes?: Record<string, unknown>;
  };
};

export type NormalizedSpec = {
  specContext: SpecContext;
  normalizedYaml: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDocument(content: string, sourcePath: string): OpenApiDocument {
  const extension = extname(sourcePath).toLowerCase();
  try {
    if (extension === '.json') {
      return JSON.parse(content) as OpenApiDocument;
    }
    return parse(content) as OpenApiDocument;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse specification file: ${detail}`);
  }
}

function resolveRef(document: OpenApiDocument, ref: string): SchemaObject | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  let current: unknown = document;
  for (const part of ref.slice(2).split('/')) {
    if (!isObject(current) || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return isObject(current) ? current : undefined;
}

function normalizeStringArray(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort();
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function singularize(value: string): string {
  if (value.endsWith('ies')) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith('ses')) {
    return value.slice(0, -2);
  }
  if (value.endsWith('s') && !value.endsWith('ss')) {
    return value.slice(0, -1);
  }
  return value;
}

function buildSyntheticOperationId(method: string, routePath: string): string {
  const segments = routePath.split('/').filter(Boolean);
  const staticSegments = segments.filter((segment) => !segment.startsWith('{'));
  const paramSegments = segments
    .filter((segment) => segment.startsWith('{') && segment.endsWith('}'))
    .map((segment) => segment.slice(1, -1));
  const hasPathParams = paramSegments.length > 0;

  const normalizedStaticSegments = [...staticSegments];
  if (hasPathParams && normalizedStaticSegments.length > 0) {
    normalizedStaticSegments[normalizedStaticSegments.length - 1] = singularize(
      normalizedStaticSegments[normalizedStaticSegments.length - 1] ?? 'resource'
    );
  }

  const resourceName = toPascalCase(normalizedStaticSegments.join(' ')) || 'Root';
  const primaryResource = normalizedStaticSegments[normalizedStaticSegments.length - 1] ?? '';
  const primaryResourceToken = toPascalCase(primaryResource);

  const suffix =
    paramSegments.length > 0
      ? `By${paramSegments
          .map((name) => {
            const candidate = toPascalCase(name);
            if (primaryResourceToken && candidate === `${primaryResourceToken}Id`) {
              return 'Id';
            }
            return candidate;
          })
          .join('And')}`
      : '';

  const verbByMethod: Record<string, string> = {
    GET: hasPathParams ? 'get' : 'list',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
    HEAD: 'head',
    OPTIONS: 'options',
    TRACE: 'trace'
  };

  return `${verbByMethod[method] ?? method.toLowerCase()}${resourceName}${suffix}`;
}

function uniquifyOperationId(candidate: string, usedIds: Map<string, number>): string {
  const seen = usedIds.get(candidate) ?? 0;
  usedIds.set(candidate, seen + 1);
  if (seen === 0) {
    return candidate;
  }
  return `${candidate}${seen + 1}`;
}

function collectSchemaFields(
  document: OpenApiDocument,
  schema: unknown,
  location: OperationField['location'],
  prefix = ''
): OperationField[] {
  if (!schema) return [];

  if (isObject(schema) && typeof schema.$ref === 'string') {
    return collectSchemaFields(document, resolveRef(document, schema.$ref), location, prefix);
  }

  if (!isObject(schema)) return [];

  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? new Set(schema.required.map((item) => String(item))) : new Set<string>();

  return Object.entries(properties).flatMap(([key, value]) => {
    const fieldKey = prefix ? `${prefix}.${key}` : key;

    if (isObject(value) && (isObject(value.properties) || typeof value.$ref === 'string')) {
      const nested = collectSchemaFields(document, value, location, fieldKey);
      if (nested.length > 0) {
        return nested;
      }
    }

    const type = isObject(value) && typeof value.type === 'string' ? value.type : 'object';
    const example = isObject(value) && value.example !== undefined ? String(value.example) : undefined;
    const description = isObject(value) && typeof value.description === 'string' ? value.description : undefined;

    return [
      {
        key: fieldKey,
        label: fieldKey,
        location,
        required: required.has(key),
        type,
        example,
        description
      }
    ];
  });
}

function collectResponseFields(
  document: OpenApiDocument,
  schema: unknown,
  pathPrefix = '$',
  labelPrefix = ''
): ResponseField[] {
  if (!schema) return [];

  if (isObject(schema) && typeof schema.$ref === 'string') {
    return collectResponseFields(document, resolveRef(document, schema.$ref), pathPrefix, labelPrefix);
  }

  if (!isObject(schema)) return [];

  if (schema.type === 'array') {
    const itemPrefix = `${pathPrefix}[0]`;
    const label = labelPrefix ? `${labelPrefix}[]` : 'items[]';
    return collectResponseFields(document, schema.items, itemPrefix, label);
  }

  const properties = isObject(schema.properties) ? schema.properties : {};
  return Object.entries(properties).flatMap(([key, value]) => {
    const jsonPath = `${pathPrefix}.${key}`;
    const label = labelPrefix ? `${labelPrefix}.${key}` : key;

    if (isObject(value) && (value.type === 'object' || value.type === 'array' || typeof value.$ref === 'string')) {
      const nested = collectResponseFields(document, value, jsonPath, label);
      const type = typeof value.type === 'string' ? value.type : typeof value.$ref === 'string' ? 'object' : 'object';
      const example = value.example !== undefined ? String(value.example) : undefined;
      const description = typeof value.description === 'string' ? value.description : undefined;
      const parent: ResponseField = {
        key: label,
        label,
        jsonPath,
        type,
        example,
        description
      };
      return nested.length > 0 ? [parent, ...nested] : [parent];
    }

    const type = isObject(value) && typeof value.type === 'string' ? value.type : 'object';
    const example = isObject(value) && value.example !== undefined ? String(value.example) : undefined;
    const description = isObject(value) && typeof value.description === 'string' ? value.description : undefined;

    return [
      {
        key: label,
        label,
        jsonPath,
        type,
        example,
        description
      }
    ];
  });
}

function extractParameterFields(document: OpenApiDocument, operation: SchemaObject): OperationField[] {
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  return parameters
    .filter(isObject)
    .map((parameter) => {
      const resolved = typeof parameter.$ref === 'string' ? resolveRef(document, parameter.$ref) ?? parameter : parameter;
      const schema = isObject(resolved.schema) ? resolved.schema : {};
      return {
        key: String(resolved.name ?? ''),
        label: String(resolved.name ?? ''),
        location: String(resolved.in ?? 'query') as OperationField['location'],
        required: Boolean(resolved.required),
        type: typeof schema.type === 'string' ? schema.type : 'string',
        example:
          resolved.example !== undefined
            ? String(resolved.example)
            : schema.example !== undefined
              ? String(schema.example)
              : undefined,
        description: typeof resolved.description === 'string' ? resolved.description : undefined
      };
    })
    .filter((field) => field.key);
}

function extractRequestBodyFields(document: OpenApiDocument, operation: SchemaObject): OperationField[] {
  const requestBody = isObject(operation.requestBody) ? operation.requestBody : undefined;
  const content = requestBody && isObject(requestBody.content) ? requestBody.content : undefined;
  const jsonBody = content && isObject(content['application/json']) ? content['application/json'] : undefined;
  const schema = jsonBody && isObject(jsonBody.schema) ? jsonBody.schema : undefined;
  return collectSchemaFields(document, schema, 'body');
}

function extractResponseFields(document: OpenApiDocument, operation: SchemaObject): ResponseField[] {
  const responses = isObject(operation.responses) ? operation.responses : {};
  const response =
    (isObject(responses['200']) && responses['200']) ||
    (isObject(responses['201']) && responses['201']) ||
    Object.values(responses).find((candidate) => isObject(candidate));

  if (!isObject(response)) {
    return [];
  }

  const content = isObject(response.content) ? response.content : {};
  const jsonBody =
    (isObject(content['application/json']) && content['application/json']) ||
    (isObject(content['application/problem+json']) && content['application/problem+json']);

  if (!isObject(jsonBody)) {
    return [];
  }

  const schema = isObject(jsonBody.schema) ? jsonBody.schema : undefined;
  return collectResponseFields(document, schema);
}

function extractOperations(document: OpenApiDocument): {
  operations: SpecOperation[];
  missingOperationIdCount: number;
  excludedOperationCount: number;
  syntheticOperationCount: number;
  duplicateAdjustedCount: number;
} {
  const pathsObject = isObject(document.paths) ? document.paths : {};
  let excludedOperationCount = 0;
  let missingOperationIdCount = 0;
  let syntheticOperationCount = 0;
  let duplicateAdjustedCount = 0;
  const usedOperationIds = new Map<string, number>();

  const operations = Object.entries(pathsObject).flatMap(([routePath, pathItem]) => {
    if (!isObject(pathItem)) return [];

    return Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.includes(method.toLowerCase() as HttpMethod))
      .flatMap(([method, operation]) => {
        if (!isObject(operation)) return [];
        const normalizedMethod = method.toUpperCase();
        const providedOperationId = typeof operation.operationId === 'string' ? operation.operationId.trim() : '';
        let operationId = providedOperationId;
        let syntheticOperationId = false;

        if (!operationId) {
          missingOperationIdCount += 1;
          syntheticOperationId = true;
          operationId = buildSyntheticOperationId(normalizedMethod, routePath);
        }

        const uniqueOperationId = uniquifyOperationId(operationId, usedOperationIds);
        if (uniqueOperationId !== operationId) {
          duplicateAdjustedCount += 1;
          syntheticOperationId = true;
          operationId = uniqueOperationId;
        }
        if (syntheticOperationId) {
          syntheticOperationCount += 1;
        }

        const tags = Array.isArray(operation.tags) ? operation.tags.map((tag) => String(tag)) : ['Untagged'];
        const summary =
          typeof operation.summary === 'string' && operation.summary.trim()
            ? operation.summary
            : `${normalizedMethod} ${routePath}`;
        const description = typeof operation.description === 'string' ? operation.description : undefined;

        return [
          {
            operationId,
            ...(syntheticOperationId ? { syntheticOperationId: true } : {}),
            method: normalizedMethod,
            path: routePath,
            tags,
            summary,
            description,
            fields: [...extractParameterFields(document, operation), ...extractRequestBodyFields(document, operation)],
            responseFields: extractResponseFields(document, operation)
          }
        ];
      });
  });

  operations.sort((left, right) => {
    const tagCompare = (left.tags[0] ?? '').localeCompare(right.tags[0] ?? '');
    if (tagCompare !== 0) return tagCompare;
    return left.operationId.localeCompare(right.operationId);
  });

  return {
    operations,
    missingOperationIdCount,
    excludedOperationCount,
    syntheticOperationCount,
    duplicateAdjustedCount
  };
}

export function normalizeOpenApiSpec(content: string, sourcePath: string, source: SpecContext['source']): NormalizedSpec {
  const parsed = parseDocument(content, sourcePath);
  if (parsed.swagger) {
    throw new Error('Swagger 2.0 is not supported in Surface 1. Please provide or export an OpenAPI 3.x specification.');
  }
  if (!parsed.openapi || !parsed.openapi.startsWith('3.')) {
    throw new Error('Surface 1 accepts OpenAPI 3.x documents only.');
  }

  const pathsObject = parsed.paths ?? {};
  const pathEntries = Object.entries(pathsObject);
  if (pathEntries.length === 0) {
    throw new Error('The OpenAPI document must contain at least one path.');
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const { operations, missingOperationIdCount, excludedOperationCount, syntheticOperationCount, duplicateAdjustedCount } =
    extractOperations(parsed);

  if (operations.length === 0) {
    throw new Error('The OpenAPI document must contain at least one endpoint operation.');
  }

  const operationIds = operations.map((operation) => operation.operationId);
  const duplicateOperationIds = operationIds.filter((operationId, index) => operationIds.indexOf(operationId) !== index);

  const servers = normalizeStringArray((parsed.servers ?? []).map((server) => server.url));
  const securitySchemes = Object.keys(parsed.components?.securitySchemes ?? {}).sort();
  const tagSet = new Set<string>(normalizeStringArray((parsed.tags ?? []).map((tag) => tag.name)));
  for (const operation of operations) {
    for (const tag of operation.tags) {
      tagSet.add(tag);
    }
  }

  if (servers.length === 0) {
    warnings.push('No `servers` entries were found in the specification.');
  }
  if (securitySchemes.length === 0 && !(parsed.security?.length)) {
    warnings.push('No security or auth definitions were found in the specification.');
  }
  if (missingOperationIdCount > 0) {
    warnings.push(
      `${missingOperationIdCount} operation(s) were assigned generated operationIds because the source spec did not define them.`
    );
  }
  if (duplicateAdjustedCount > 0) {
    warnings.push(
      `${duplicateAdjustedCount} operationId value(s) were adjusted to keep every operationId unique for flow generation.`
    );
  }
  if (duplicateOperationIds.length > 0) {
    warnings.push(`Duplicate operationId values were found: ${normalizeStringArray(duplicateOperationIds).join(', ')}`);
  }

  const normalizedYaml = stringify(parsed);
  const title = parsed.info?.title?.trim() || 'Imported API';
  const version = parsed.info?.version?.trim() || '0.0.0';
  const serviceKey = buildServiceKey(title);

  return {
    normalizedYaml,
    specContext: {
      serviceKey,
      source,
      acquisition: {
        sourceLabel: source === 'upload' ? 'Uploaded OpenAPI file' : 'AWS API Gateway import',
        importedAt: new Date().toISOString()
      },
      document: {
        name: title,
        version,
        format: 'openapi_3',
        originalPath: sourcePath,
        normalizedPath: ''
      },
      validation: {
        valid: errors.length === 0,
        errors,
        warnings
      },
      summary: {
        endpointCount: operations.length,
        pathCount: pathEntries.length,
        operationCount: operations.length,
        tags: Array.from(tagSet).sort(),
        servers,
        securitySchemes,
        excludedOperationCount,
        syntheticOperationCount
      },
      operations
    }
  };
}
