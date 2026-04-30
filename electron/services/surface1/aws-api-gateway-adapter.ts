import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  APIGatewayClient,
  GetExportCommand,
  GetRestApisCommand,
  GetStagesCommand as GetRestStagesCommand,
  paginateGetRestApis
} from '@aws-sdk/client-api-gateway';
import {
  ApiGatewayV2Client,
  ExportApiCommand,
  GetApisCommand,
  GetStagesCommand as GetHttpStagesCommand
} from '@aws-sdk/client-apigatewayv2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import type { AwsApiSummary, AwsConnectionResult, AwsGatewayType, AwsProfile } from '../../../src/shared/surface1.js';
import { getAwsHome } from './paths.js';

type AwsClients = {
  restClient: APIGatewayClient;
  httpClient: ApiGatewayV2Client;
  stsClient: STSClient;
};

type IniSections = Record<string, Record<string, string>>;

function parseIni(content: string): IniSections {
  const sections: IniSections = {};
  let currentSection = '';

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      sections[currentSection] = sections[currentSection] ?? {};
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1 || !currentSection) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    sections[currentSection] = sections[currentSection] ?? {};
    sections[currentSection][key] = value;
  }

  return sections;
}

async function readIniIfPresent(filePath: string): Promise<IniSections> {
  try {
    const content = await readFile(filePath, 'utf8');
    return parseIni(content);
  } catch {
    return {};
  }
}

function hasConfiguredCredentialHints(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.AWS_SESSION_TOKEN ||
      process.env.AWS_PROFILE ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_ROLE_ARN
  );
}

function createClients(region: string, profile?: string): AwsClients {
  const credentials = profile ? fromIni({ profile }) : undefined;
  const requestHandler = new NodeHttpHandler({
    connectionTimeout: 30_000,
    socketTimeout: 30_000
  });
  const shared = {
    region,
    credentials,
    maxAttempts: 3,
    requestHandler
  };

  return {
    restClient: new APIGatewayClient(shared),
    httpClient: new ApiGatewayV2Client(shared),
    stsClient: new STSClient(shared)
  };
}

async function readExportBody(body: unknown): Promise<string> {
  if (!body) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (typeof body === 'object') {
    const maybeTransformable = body as {
      transformToString?: () => Promise<string>;
      transformToByteArray?: () => Promise<Uint8Array>;
    };
    if (typeof maybeTransformable.transformToString === 'function') {
      return maybeTransformable.transformToString();
    }
    if (typeof maybeTransformable.transformToByteArray === 'function') {
      const bytes = await maybeTransformable.transformToByteArray();
      return new TextDecoder().decode(bytes);
    }
  }
  throw new Error('Unsupported export body returned by AWS SDK.');
}

function buildMissingCredentialsMessage(profile?: string): string {
  const configureCommand = profile ? `aws configure --profile ${profile}` : 'aws configure';
  const ssoCommand = profile ? `aws sso login --profile ${profile}` : 'aws sso login --profile <profile-name>';

  return [
    'No AWS credentials were detected for CSE Buddy.',
    profile
      ? `The selected profile "${profile}" could not be resolved or is not logged in.`
      : 'No default AWS credential source was available.',
    `Configure credentials with \`${configureCommand}\` or sign in with AWS SSO using \`${ssoCommand}\`.`,
    'CSE Buddy reads credentials from your local AWS SDK/CLI setup such as ~/.aws/config, ~/.aws/credentials, or standard AWS environment variables.'
  ].join(' ');
}

export function toUserFriendlyAwsError(error: unknown, profile?: string): Error {
  const rawMessage =
    error && typeof error === 'object'
      ? [((error as { name?: string }).name ?? '').trim(), ((error as { message?: string }).message ?? '').trim()]
          .filter(Boolean)
          .join(': ')
      : String(error);

  const lowered = rawMessage.toLowerCase();
  const missingCredentials =
    lowered.includes('could not load credentials') ||
    lowered.includes('credential is missing') ||
    lowered.includes('credentialsprovidererror') ||
    lowered.includes('could not find credentials') ||
    lowered.includes('unable to resolve credentials') ||
    lowered.includes('resolved credential object is not valid') ||
    lowered.includes('access key id') ||
    lowered.includes('secret access key');

  if (missingCredentials || (!hasConfiguredCredentialHints() && lowered.includes('profile'))) {
    return new Error(buildMissingCredentialsMessage(profile));
  }

  if (profile && lowered.includes('profile') && lowered.includes('could not be found')) {
    return new Error(buildMissingCredentialsMessage(profile));
  }

  return new Error(rawMessage || 'Unknown AWS error');
}

export function pickPreferredStage(stages: string[]): string | undefined {
  const priority = ['prod', 'production', '$default', 'main', 'staging', 'stage', 'dev', 'development'];
  const lowered = new Map(stages.map((stage) => [stage.toLowerCase(), stage]));
  for (const preferred of priority) {
    const match = lowered.get(preferred);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export async function listProfiles(): Promise<AwsProfile[]> {
  const awsHome = path.join(getAwsHome(), '.aws');
  const [configSections, credentialSections] = await Promise.all([
    readIniIfPresent(path.join(awsHome, 'config')),
    readIniIfPresent(path.join(awsHome, 'credentials'))
  ]);

  const profiles = new Map<string, AwsProfile>();

  for (const section of Object.keys(configSections)) {
    const name = section === 'default' ? 'default' : section.replace(/^profile\s+/, '');
    profiles.set(name, { name, source: 'config' });
  }
  for (const section of Object.keys(credentialSections)) {
    profiles.set(section, { name: section, source: 'credentials' });
  }

  return Array.from(profiles.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export async function testConnection(profile: string | undefined, region: string): Promise<AwsConnectionResult> {
  try {
    const { restClient, stsClient } = createClients(region, profile);
    await restClient.send(new GetRestApisCommand({ limit: 1 }));
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    return {
      accountId: identity.Account,
      arn: identity.Arn,
      region,
      profile
    };
  } catch (error) {
    throw toUserFriendlyAwsError(error, profile);
  }
}

export async function listApis(profile: string | undefined, region: string): Promise<AwsApiSummary[]> {
  try {
    const { restClient, httpClient } = createClients(region, profile);
    const restApis: AwsApiSummary[] = [];

    for await (const page of paginateGetRestApis({ client: restClient }, {})) {
      for (const item of page.items ?? []) {
        if (!item.id) {
          continue;
        }
        restApis.push({
          id: item.id,
          name: (item.name ?? '').trim() || item.id,
          gatewayType: 'REST'
        });
      }
    }

    const httpApis: AwsApiSummary[] = [];
    let nextToken: string | undefined;
    do {
      const response = await httpClient.send(new GetApisCommand({ NextToken: nextToken }));
      for (const item of response.Items ?? []) {
        if (!item.ApiId) {
          continue;
        }
        if (item.ProtocolType && item.ProtocolType.toUpperCase() !== 'HTTP') {
          continue;
        }
        httpApis.push({
          id: item.ApiId,
          name: (item.Name ?? '').trim() || item.ApiId,
          gatewayType: 'HTTP'
        });
      }
      nextToken = response.NextToken;
    } while (nextToken);

    return [...restApis, ...httpApis].sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    throw toUserFriendlyAwsError(error, profile);
  }
}

export async function listStages(
  profile: string | undefined,
  region: string,
  apiId: string,
  gatewayType: AwsGatewayType
): Promise<string[]> {
  try {
    const { restClient, httpClient } = createClients(region, profile);
    if (gatewayType === 'REST') {
      const response = await restClient.send(new GetRestStagesCommand({ restApiId: apiId }));
      return (response.item ?? [])
        .map((stage) => stage.stageName?.trim())
        .filter((stage): stage is string => Boolean(stage))
        .sort();
    }

    const response = await httpClient.send(new GetHttpStagesCommand({ ApiId: apiId }));
    return (response.Items ?? [])
      .map((stage) => stage.StageName?.trim())
      .filter((stage): stage is string => Boolean(stage))
      .sort();
  } catch (error) {
    throw toUserFriendlyAwsError(error, profile);
  }
}

export async function exportSpec(
  profile: string | undefined,
  region: string,
  gatewayId: string,
  gatewayType: AwsGatewayType,
  stage: string
): Promise<string> {
  try {
    const { restClient, httpClient } = createClients(region, profile);
    if (gatewayType === 'REST') {
      const response = await restClient.send(
        new GetExportCommand({
          restApiId: gatewayId,
          stageName: stage,
          exportType: 'oas30',
          accepts: 'application/yaml',
          parameters: {
            extensions: 'apigateway'
          }
        })
      );
      return readExportBody(response.body);
    }

    const response = await httpClient.send(
      new ExportApiCommand({
        ApiId: gatewayId,
        Specification: 'OAS30',
        OutputType: 'YAML',
        IncludeExtensions: true,
        StageName: stage
      })
    );
    return readExportBody(response.body);
  } catch (error) {
    throw toUserFriendlyAwsError(error, profile);
  }
}
