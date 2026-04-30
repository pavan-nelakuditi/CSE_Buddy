export type AwsGatewayType = 'REST' | 'HTTP';

export type OperationField = {
  key: string;
  label: string;
  location: 'path' | 'query' | 'header' | 'body';
  required: boolean;
  type: string;
  example?: string;
  description?: string;
};

export type ResponseField = {
  key: string;
  label: string;
  jsonPath: string;
  type: string;
  example?: string;
  description?: string;
};

export type SpecOperation = {
  operationId: string;
  syntheticOperationId?: boolean;
  method: string;
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  fields: OperationField[];
  responseFields: ResponseField[];
};

export type SpecContext = {
  serviceKey: string;
  source: 'upload' | 'aws_apigateway';
  acquisition: {
    sourceLabel: string;
    importedAt: string;
    awsProfile?: string;
    awsRegion?: string;
    gatewayId?: string;
    gatewayType?: AwsGatewayType;
    stage?: string;
  };
  document: {
    name: string;
    version: string;
    format: 'openapi_3';
    originalPath: string;
    normalizedPath: string;
  };
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  summary: {
    endpointCount: number;
    pathCount: number;
    operationCount: number;
    tags: string[];
    servers: string[];
    securitySchemes: string[];
    excludedOperationCount: number;
    syntheticOperationCount: number;
  };
  operations: SpecOperation[];
};

export type ServiceCatalogEntry = {
  serviceKey: string;
  serviceName: string;
  gatewayId: string;
  gatewayType: AwsGatewayType;
  stage?: string;
  status: 'imported' | 'skipped' | 'failed';
  normalizedPath?: string;
  specContextPath?: string;
  warningCount: number;
  errorSummary?: string;
};

export type ServiceCatalog = {
  source: 'aws_apigateway_bulk';
  importedAt: string;
  awsProfile?: string;
  awsRegion: string;
  totals: {
    detected: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  services: ServiceCatalogEntry[];
};

export type AwsProfile = {
  name: string;
  source: 'config' | 'credentials';
};

export type AwsConnectionResult = {
  accountId?: string;
  arn?: string;
  region: string;
  profile?: string;
};

export type AwsApiSummary = {
  id: string;
  name: string;
  gatewayType: AwsGatewayType;
};

export type ImportUploadResult = {
  selectedPath: string;
  specContext: SpecContext;
};

export type ImportAwsSpecInput = {
  profile?: string;
  region: string;
  gatewayId: string;
  gatewayType: AwsGatewayType;
  stage: string;
};

export type ImportAllAwsSpecsInput = {
  profile?: string;
  region: string;
};

export type ImportAllAwsSpecsResult = {
  catalog: ServiceCatalog;
};

export type Surface1Api = {
  pickOpenApiFile: () => Promise<string | null>;
  importUploadedSpec: (filePath: string) => Promise<ImportUploadResult>;
  listAwsProfiles: () => Promise<AwsProfile[]>;
  testAwsConnection: (profile: string | undefined, region: string) => Promise<AwsConnectionResult>;
  listAwsApis: (profile: string | undefined, region: string) => Promise<AwsApiSummary[]>;
  listAwsStages: (profile: string | undefined, region: string, apiId: string, gatewayType: AwsGatewayType) => Promise<string[]>;
  importAwsSpec: (input: ImportAwsSpecInput) => Promise<SpecContext>;
  importAllAwsSpecs: (input: ImportAllAwsSpecsInput) => Promise<ImportAllAwsSpecsResult>;
  loadSpecContext: (specContextPath: string) => Promise<SpecContext>;
};

declare global {
  interface Window {
    surface1: Surface1Api;
  }
}
