import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../src/App.js';
import type { Surface1Api } from '../src/shared/surface1.js';
import type { Surface2Api } from '../src/shared/surface2.js';
import type { Surface3Api } from '../src/shared/surface3.js';
import type { Surface4Api } from '../src/shared/surface4.js';
import type { SpecContext } from '../src/shared/surface1.js';
import type { WorkspaceApi } from '../src/shared/workspace.js';

const mockSurface1: Surface1Api = {
  pickOpenApiFile: vi.fn(),
  importUploadedSpec: vi.fn(),
  listAwsProfiles: vi.fn(),
  testAwsConnection: vi.fn(),
  listAwsApis: vi.fn(),
  listAwsStages: vi.fn(),
  importAwsSpec: vi.fn(),
  importAllAwsSpecs: vi.fn(),
  loadSpecContext: vi.fn()
};

const mockSurface2: Surface2Api = {
  saveDraft: vi.fn(),
  exportFlow: vi.fn()
};

const mockSurface3: Surface3Api = {
  loadState: vi.fn(),
  saveConfig: vi.fn()
};

const mockSurface4: Surface4Api = {
  loadState: vi.fn(),
  generateArtifacts: vi.fn(),
  revealBundle: vi.fn(),
  openReadme: vi.fn(),
  exportBundle: vi.fn()
};

const mockWorkspace: WorkspaceApi = {
  chooseWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  getWorkspaceState: vi.fn(),
  clearWorkspace: vi.fn(),
  openPath: vi.fn(),
  revealPath: vi.fn()
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.workspace = mockWorkspace;
    window.surface1 = mockSurface1;
    window.surface2 = mockSurface2;
    window.surface3 = mockSurface3;
    window.surface4 = mockSurface4;
    vi.mocked(mockWorkspace.getWorkspaceState).mockResolvedValue({
      currentWorkspacePath: '/tmp/cse-buddy-workspace',
      recentWorkspaces: ['/tmp/cse-buddy-workspace']
    });
    vi.mocked(mockWorkspace.chooseWorkspace).mockResolvedValue({
      workspacePath: '/tmp/cse-buddy-workspace',
      state: {
        currentWorkspacePath: '/tmp/cse-buddy-workspace',
        recentWorkspaces: ['/tmp/cse-buddy-workspace']
      }
    });
    vi.mocked(mockWorkspace.createWorkspace).mockResolvedValue({
      workspacePath: '/tmp/cse-buddy-workspace',
      state: {
        currentWorkspacePath: '/tmp/cse-buddy-workspace',
        recentWorkspaces: ['/tmp/cse-buddy-workspace']
      }
    });
    vi.mocked(mockWorkspace.openWorkspace).mockResolvedValue({
      currentWorkspacePath: '/tmp/cse-buddy-workspace',
      recentWorkspaces: ['/tmp/cse-buddy-workspace']
    });
    vi.mocked(mockWorkspace.clearWorkspace).mockResolvedValue({
      recentWorkspaces: ['/tmp/cse-buddy-workspace']
    });
    vi.mocked(mockWorkspace.openPath).mockResolvedValue();
    vi.mocked(mockWorkspace.revealPath).mockResolvedValue();
    vi.mocked(mockSurface1.listAwsProfiles).mockResolvedValue([{ name: 'sandbox', source: 'config' }]);
    vi.mocked(mockSurface2.saveDraft).mockResolvedValue({ draftPath: '/tmp/draft-flow.json' });
    vi.mocked(mockSurface2.exportFlow).mockResolvedValue({
      draftPath: '/tmp/draft-flow.json',
      manifestPath: '/tmp/flow.yaml'
    });
    vi.mocked(mockSurface3.loadState).mockResolvedValue({ flowExists: true });
    vi.mocked(mockSurface3.saveConfig).mockResolvedValue({ configPath: '/tmp/cicd-config.json' });
    vi.mocked(mockSurface4.loadState).mockResolvedValue({
      flowExists: true,
      configExists: true,
      generatedRoot: '.cse-buddy/surface4/payments/generated',
      generatedSpecPath: '.cse-buddy/surface4/payments/generated/api/openapi.yaml',
      generatedFlowPath: '.cse-buddy/surface4/payments/generated/.cse-buddy/flows/payments/flow.yaml',
      expectedFiles: [
        '.cse-buddy/surface4/payments/generated/api/openapi.yaml',
        '.cse-buddy/surface4/payments/generated/.cse-buddy/flows/payments/flow.yaml',
        '.cse-buddy/surface4/payments/generated/.github/workflows/postman-pr-validation.yml',
        '.cse-buddy/surface4/payments/generated/.github/workflows/postman-smoke-flow-onboarding.yml',
        '.cse-buddy/surface4/payments/generated/POSTMAN_ONBOARDING.md'
      ]
    });
    vi.mocked(mockSurface4.generateArtifacts).mockResolvedValue({
      summaryPath: '/tmp/generation-summary.json',
      summary: {
        serviceKey: 'payments',
        generatedAt: '2026-04-30T00:00:00.000Z',
        files: ['/tmp/generated/api/openapi.yaml'],
        workflowPaths: ['/tmp/.github/workflows/postman-pr-validation.yml'],
        setupDocPath: '/tmp/POSTMAN_ONBOARDING.md',
        generatedRoot: '/tmp/generated',
        generatedSpecPath: '/tmp/generated/api/openapi.yaml',
        generatedFlowPath: '/tmp/generated/.cse-buddy/flows/payments/flow.yaml'
      }
    });
    vi.mocked(mockSurface4.revealBundle).mockResolvedValue();
    vi.mocked(mockSurface4.openReadme).mockResolvedValue();
    vi.mocked(mockSurface4.exportBundle).mockResolvedValue({
      targetDirectory: '/tmp/target-repo',
      copiedFiles: ['/tmp/target-repo/POSTMAN_ONBOARDING.md']
    });
  });

  it('shows the workspace picker when no workspace is active and opens a recent workspace', async () => {
    vi.mocked(mockWorkspace.getWorkspaceState).mockResolvedValue({
      recentWorkspaces: ['/tmp/demo-workspace']
    });
    vi.mocked(mockWorkspace.openWorkspace).mockResolvedValue({
      currentWorkspacePath: '/tmp/demo-workspace',
      recentWorkspaces: ['/tmp/demo-workspace']
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Choose a workspace' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /demo-workspace/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CSE Buddy' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Surface 1' })).toBeInTheDocument();
      expect(screen.getByText('/tmp/demo-workspace')).toBeInTheDocument();
    });
  });

  it('imports an uploaded spec and renders the summary', async () => {
    vi.mocked(mockSurface1.pickOpenApiFile).mockResolvedValue('/tmp/payments.yaml');
    vi.mocked(mockSurface1.importUploadedSpec).mockResolvedValue({
      selectedPath: '/tmp/payments.yaml',
      specContext: {
        serviceKey: 'payments-api',
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
        operations: []
      }
    });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /browse file/i }));
    await userEvent.click(await screen.findByRole('button', { name: /import file/i }));

    expect(await screen.findByText('Active service')).toBeInTheDocument();
    expect(screen.getByText('Generate a draft')).toBeInTheDocument();
  });

  it('moves from Surface 2 to Surface 3 after exporting flow.yaml', async () => {
    const specContext: SpecContext = {
      serviceKey: 'payments-api',
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
        endpointCount: 2,
        pathCount: 1,
        operationCount: 2,
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
              key: 'body.amount',
              label: 'amount',
              location: 'body',
              required: true,
              type: 'number',
              example: '10.99'
            }
          ],
          responseFields: [
            {
              key: 'id',
              label: 'id',
              jsonPath: '$.id',
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
              key: 'id',
              label: 'id',
              jsonPath: '$.id',
              type: 'string'
            }
          ]
        }
      ]
    };

    vi.mocked(mockSurface1.pickOpenApiFile).mockResolvedValue('/tmp/payments.yaml');
    vi.mocked(mockSurface1.importUploadedSpec).mockResolvedValue({
      selectedPath: '/tmp/payments.yaml',
      specContext
    });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /browse file/i }));
    await userEvent.click(await screen.findByRole('button', { name: /import file/i }));
    await userEvent.click(await screen.findByRole('button', { name: /generate smoke flow/i }));
    await userEvent.click(await screen.findByRole('button', { name: /review flow/i }));
    expect(await screen.findByRole('heading', { name: /review smoke flow/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /back to edit/i }));
    expect(await screen.findByRole('heading', { name: /operation library/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /review flow/i }));
    await userEvent.click(await screen.findByRole('button', { name: /confirm and export flow\.yaml/i }));

    await waitFor(() => {
      const brand = screen.getByRole('heading', { name: 'CSE Buddy' }).closest('.brand');
      expect(brand).not.toBeNull();
      expect(within(brand as HTMLElement).getByRole('heading', { name: 'Surface 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save cicd config/i })).toBeInTheDocument();
    });
  });

  it('moves from Surface 3 to Surface 4 after saving CICD config', async () => {
    const specContext: SpecContext = {
      serviceKey: 'payments-api',
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
        endpointCount: 2,
        pathCount: 1,
        operationCount: 2,
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
              key: 'body.amount',
              label: 'amount',
              location: 'body',
              required: true,
              type: 'number',
              example: '10.99'
            }
          ],
          responseFields: [
            {
              key: 'id',
              label: 'id',
              jsonPath: '$.id',
              type: 'string'
            }
          ]
        }
      ]
    };

    vi.mocked(mockSurface1.pickOpenApiFile).mockResolvedValue('/tmp/payments.yaml');
    vi.mocked(mockSurface1.importUploadedSpec).mockResolvedValue({
      selectedPath: '/tmp/payments.yaml',
      specContext
    });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /browse file/i }));
    await userEvent.click(await screen.findByRole('button', { name: /import file/i }));
    await userEvent.click(await screen.findByRole('button', { name: /generate smoke flow/i }));
    await userEvent.click(await screen.findByRole('button', { name: /review flow/i }));
    await userEvent.click(await screen.findByRole('button', { name: /confirm and export flow\.yaml/i }));
    await userEvent.type(await screen.findByLabelText(/dev runtime url/i), 'https://dev-api.example.com');
    await userEvent.type(screen.getByLabelText(/test runtime url/i), 'https://test-api.example.com');
    await userEvent.type(screen.getByLabelText(/stage runtime url/i), 'https://stage-api.example.com');
    await userEvent.type(screen.getByLabelText(/prod runtime url/i), 'https://api.example.com');
    const saveConfigButton = await screen.findByRole('button', { name: /save cicd config/i });
    await waitFor(() => {
      expect(saveConfigButton).toBeEnabled();
    });
    await userEvent.click(saveConfigButton);

    await waitFor(() => {
      const brand = screen.getByRole('heading', { name: 'CSE Buddy' }).closest('.brand');
      expect(brand).not.toBeNull();
      expect(within(brand as HTMLElement).getByRole('heading', { name: 'Surface 4' })).toBeInTheDocument();
      expect(
        within(brand as HTMLElement).getByText('Generate the staged GitHub onboarding bundle from the approved service inputs.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generate git artifacts/i })).toBeInTheDocument();
    });
  });

  it('renders bulk import results and opens an imported service', async () => {
    vi.mocked(mockSurface1.importAllAwsSpecs).mockResolvedValue({
      catalog: {
        source: 'aws_apigateway_bulk',
        importedAt: '2026-04-27T12:00:00.000Z',
        awsProfile: 'sandbox',
        awsRegion: 'us-east-1',
        totals: {
          detected: 2,
          imported: 1,
          skipped: 1,
          failed: 0
        },
        services: [
          {
            serviceKey: 'payments',
            serviceName: 'Payments',
            gatewayId: 'rest-1',
            gatewayType: 'REST',
            stage: 'prod',
            status: 'imported',
            normalizedPath: '/tmp/openapi.yaml',
            specContextPath: '/tmp/spec-context.json',
            warningCount: 1
          },
          {
            serviceKey: 'orders',
            serviceName: 'Orders',
            gatewayId: 'http-1',
            gatewayType: 'HTTP',
            status: 'skipped',
            warningCount: 0,
            errorSummary: 'No stages were found for this API.'
          }
        ]
      }
    });
    vi.mocked(mockSurface1.loadSpecContext).mockResolvedValue({
      serviceKey: 'payments',
      source: 'aws_apigateway',
      acquisition: {
        sourceLabel: 'AWS API Gateway import',
        importedAt: '2026-04-27T12:00:00.000Z',
        awsProfile: 'sandbox',
        awsRegion: 'us-east-1',
        gatewayId: 'rest-1',
        gatewayType: 'REST',
        stage: 'prod'
      },
      document: {
        name: 'Payments',
        version: '1.0.0',
        format: 'openapi_3',
        originalPath: '/tmp/source.yaml',
        normalizedPath: '/tmp/openapi.yaml'
      },
      validation: {
        valid: true,
        errors: [],
        warnings: ['No `servers` entries were found in the specification.']
      },
      summary: {
        endpointCount: 2,
        pathCount: 1,
        operationCount: 2,
        tags: [],
        servers: [],
        securitySchemes: [],
        excludedOperationCount: 0,
        syntheticOperationCount: 0
      },
      operations: []
    });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /import from aws api gateway/i }));
    await userEvent.click(await screen.findByRole('button', { name: /import all detected services/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /^import all detected services$/i })[1]!);

    expect(await screen.findByText('Bulk import catalog')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /open service/i })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Active service')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();
    });
  });
});
