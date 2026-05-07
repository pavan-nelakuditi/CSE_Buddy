import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Surface2Workspace } from './components/Surface2Workspace.js';
import { Surface3Workspace } from './components/Surface3Workspace.js';
import { Surface4Workspace } from './components/Surface4Workspace.js';
import type {
  AwsApiSummary,
  AwsGatewayType,
  AwsProfile,
  ServiceCatalog,
  ServiceCatalogEntry,
  SpecContext
} from './shared/surface1.js';
import type { WorkspaceState } from './shared/workspace.js';

type AwsMode = 'single' | 'bulk';
type SourceMode = 'upload' | 'aws';
type CatalogFilter = 'all' | 'imported' | 'warnings' | 'skipped' | 'failed';
type SurfaceId = 'surface1' | 'surface2' | 'surface3' | 'surface4';
type SurfaceStage = 'current' | 'ready' | 'blocked' | 'complete';
type AwsConnectionFeedback = {
  loading: string;
  message: string;
  error: string;
  summary: string;
};

const DEFAULT_REGION = 'us-east-1';
const EMPTY_AWS_CONNECTION_FEEDBACK: AwsConnectionFeedback = {
  loading: '',
  message: '',
  error: '',
  summary: ''
};
const SURFACE_OVERVIEW: Record<SurfaceId, { title: string; description: string }> = {
  surface1: {
    title: 'Surface 1',
    description: 'Acquire and normalize one OpenAPI spec per service before the flow engine takes over.'
  },
  surface2: {
    title: 'Surface 2',
    description: 'Draft, refine, and export the happy-path smoke flow for the active service.'
  },
  surface3: {
    title: 'Surface 3',
    description: 'Save runtime URLs and onboarding configuration for merge-to-main automation.'
  },
  surface4: {
    title: 'Surface 4',
    description: 'Generate the staged GitHub onboarding bundle from the approved service inputs.'
  }
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderSpecSummary(specContext: SpecContext): ReactElement {
  return (
    <div className="summary-card">
      <h3>{specContext.document.name}</h3>
      <dl className="summary-grid">
        <div>
          <dt>Version</dt>
          <dd>{specContext.document.version}</dd>
        </div>
        <div>
          <dt>Endpoints</dt>
          <dd>{specContext.summary.endpointCount}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{specContext.acquisition.sourceLabel}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{specContext.document.format}</dd>
        </div>
        {specContext.acquisition.awsRegion ? (
          <>
            <div>
              <dt>Region</dt>
              <dd>{specContext.acquisition.awsRegion}</dd>
            </div>
            <div>
              <dt>Gateway</dt>
              <dd>{specContext.acquisition.gatewayId}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{specContext.acquisition.gatewayType}</dd>
            </div>
            <div>
              <dt>Stage</dt>
              <dd>{specContext.acquisition.stage}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <div className="path-block">
        <strong>Normalized file</strong>
        <code>{specContext.document.normalizedPath}</code>
      </div>
      <div className="warnings-block">
        <strong>Warnings</strong>
        {specContext.validation.warnings.length > 0 ? (
          <ul>
            {specContext.validation.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p>No warnings. The spec is ready for Surface 2.</p>
        )}
      </div>
    </div>
  );
}

function getWorkspaceName(workspacePath: string): string {
  const trimmedPath = workspacePath.replace(/[\\/]+$/, '');
  const segments = trimmedPath.split(/[/\\]/);
  return segments[segments.length - 1] || workspacePath;
}

function matchesFilter(entry: ServiceCatalogEntry, filter: CatalogFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'warnings') {
    return entry.warningCount > 0;
  }
  return entry.status === filter;
}

function getProgressSteps(
  activeSpecContext: SpecContext | null,
  currentSurface: SurfaceId
): Array<{
  id: SurfaceId;
  title: string;
  description: string;
  state: SurfaceStage;
}> {
  if (!activeSpecContext) {
    return [
      {
        id: 'surface1',
        title: 'Surface 1',
        description: 'Import and normalize a service spec.',
        state: 'current'
      },
      {
        id: 'surface2',
        title: 'Surface 2',
        description: 'Draft the happy-path smoke flow.',
        state: 'blocked'
      },
      {
        id: 'surface3',
        title: 'Surface 3',
        description: 'Save environment and onboarding config.',
        state: 'blocked'
      },
      {
        id: 'surface4',
        title: 'Surface 4',
        description: 'Generate the GitHub onboarding bundle.',
        state: 'blocked'
      }
    ];
  }

  const stateFor = (surfaceId: SurfaceId): SurfaceStage => {
    if (surfaceId === currentSurface) {
      return 'current';
    }

    const order: SurfaceId[] = ['surface1', 'surface2', 'surface3', 'surface4'];
    return order.indexOf(surfaceId) < order.indexOf(currentSurface) ? 'complete' : 'ready';
  };

  return [
    {
      id: 'surface1',
      title: 'Surface 1',
      description: 'Spec intake complete for this service.',
      state: stateFor('surface1')
    },
    {
      id: 'surface2',
      title: 'Surface 2',
      description: 'Generate and refine the smoke flow.',
      state: stateFor('surface2')
    },
    {
      id: 'surface3',
      title: 'Surface 3',
      description: 'Save runtime URLs after flow export.',
      state: stateFor('surface3')
    },
    {
      id: 'surface4',
      title: 'Surface 4',
      description: 'Build the staged Git artifact bundle.',
      state: stateFor('surface4')
    }
  ];
}

export default function App(): ReactElement {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState<string>('Loading workspace...');
  const [workspaceError, setWorkspaceError] = useState<string>('');
  const [currentSurface, setCurrentSurface] = useState<SurfaceId>('surface1');
  const [sourceMode, setSourceMode] = useState<SourceMode>('upload');
  const [awsMode, setAwsMode] = useState<AwsMode>('single');
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [apis, setApis] = useState<AwsApiSummary[]>([]);
  const [selectedApiId, setSelectedApiId] = useState<string>('');
  const [selectedGatewayType, setSelectedGatewayType] = useState<AwsGatewayType>('REST');
  const [stages, setStages] = useState<string[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedUploadPath, setSelectedUploadPath] = useState<string>('');
  const [singleResult, setSingleResult] = useState<SpecContext | null>(null);
  const [bulkCatalog, setBulkCatalog] = useState<ServiceCatalog | null>(null);
  const [selectedCatalogSpec, setSelectedCatalogSpec] = useState<SpecContext | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
  const [awsConnectionFeedback, setAwsConnectionFeedback] = useState<AwsConnectionFeedback>(EMPTY_AWS_CONNECTION_FEEDBACK);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<string>('');
  const awsConnectionRequestId = useRef(0);
  const activeWorkspacePath = workspaceState?.currentWorkspacePath;

  function clearAwsConnectionFeedback(): void {
    awsConnectionRequestId.current += 1;
    setAwsConnectionFeedback(EMPTY_AWS_CONNECTION_FEEDBACK);
  }

  function resetWorkspaceSession(): void {
    setCurrentSurface('surface1');
    setSelectedUploadPath('');
    setSingleResult(null);
    setBulkCatalog(null);
    setSelectedCatalogSpec(null);
    setCatalogFilter('all');
    setApis([]);
    setSelectedApiId('');
    setSelectedGatewayType('REST');
    setStages([]);
    setSelectedStage('');
    clearAwsConnectionFeedback();
    setMessage('');
    setError('');
    setLoading('');
  }

  useEffect(() => {
    if (!window.workspace) {
      setWorkspaceError('Workspace bridge is unavailable. Restart the app after rebuilding Electron.');
      setWorkspaceLoading('');
      return;
    }
    void (async () => {
      try {
        setWorkspaceState(await window.workspace.getWorkspaceState());
      } catch (err) {
        setWorkspaceError(formatError(err));
      } finally {
        setWorkspaceLoading('');
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeWorkspacePath) {
      setProfiles([]);
      return;
    }
    if (!window.surface1) {
      setError('Surface 1 bridge is unavailable. Restart the app after rebuilding Electron.');
      return;
    }
    void (async () => {
      try {
        setProfiles(await window.surface1.listAwsProfiles());
      } catch (err) {
        setError(formatError(err));
      }
    })();
  }, [activeWorkspacePath]);

  const selectedApi = useMemo(
    () => apis.find((api) => api.id === selectedApiId),
    [apis, selectedApiId]
  );

  const filteredCatalogEntries = useMemo(
    () => bulkCatalog?.services.filter((entry) => matchesFilter(entry, catalogFilter)) ?? [],
    [bulkCatalog, catalogFilter]
  );
  const activeSpecContext = selectedCatalogSpec ?? singleResult;
  const progressSteps = useMemo(() => getProgressSteps(activeSpecContext, currentSurface), [activeSpecContext, currentSurface]);
  const surfaceOverview = SURFACE_OVERVIEW[currentSurface];

  const profileValue = selectedProfile || undefined;

  useEffect(() => {
    if (!activeWorkspacePath) {
      setCurrentSurface('surface1');
      return;
    }

    if (!activeSpecContext) {
      setCurrentSurface('surface1');
      return;
    }

    setCurrentSurface((current) => (current === 'surface1' ? 'surface2' : current));
  }, [activeSpecContext]);

  async function handleChooseWorkspace(): Promise<void> {
    setWorkspaceLoading('Opening workspace...');
    setWorkspaceError('');

    try {
      const result = await window.workspace.chooseWorkspace();
      setWorkspaceState(result.state);
      if (result.workspacePath) {
        resetWorkspaceSession();
        setMessage(`Workspace ready: ${getWorkspaceName(result.workspacePath)}.`);
      }
    } catch (err) {
      setWorkspaceError(formatError(err));
    } finally {
      setWorkspaceLoading('');
    }
  }

  async function handleCreateWorkspace(): Promise<void> {
    setWorkspaceLoading('Creating workspace...');
    setWorkspaceError('');

    try {
      const result = await window.workspace.createWorkspace();
      setWorkspaceState(result.state);
      if (result.workspacePath) {
        resetWorkspaceSession();
        setMessage(`Workspace ready: ${getWorkspaceName(result.workspacePath)}.`);
      }
    } catch (err) {
      setWorkspaceError(formatError(err));
    } finally {
      setWorkspaceLoading('');
    }
  }

  async function handleOpenRecentWorkspace(workspacePath: string): Promise<void> {
    setWorkspaceLoading('Opening workspace...');
    setWorkspaceError('');

    try {
      const nextState = await window.workspace.openWorkspace(workspacePath);
      setWorkspaceState(nextState);
      resetWorkspaceSession();
      setMessage(`Workspace ready: ${getWorkspaceName(workspacePath)}.`);
    } catch (err) {
      setWorkspaceError(formatError(err));
    } finally {
      setWorkspaceLoading('');
    }
  }

  async function handleClearWorkspace(): Promise<void> {
    setWorkspaceLoading('Closing workspace...');
    setWorkspaceError('');

    try {
      const nextState = await window.workspace.clearWorkspace();
      setWorkspaceState(nextState);
      resetWorkspaceSession();
      setProfiles([]);
    } catch (err) {
      setWorkspaceError(formatError(err));
    } finally {
      setWorkspaceLoading('');
    }
  }

  async function handleOpenWorkspaceFolder(): Promise<void> {
    if (!activeWorkspacePath) {
      return;
    }

    try {
      setWorkspaceError('');
      await window.workspace.openPath(activeWorkspacePath);
    } catch (err) {
      setWorkspaceError(formatError(err));
    }
  }

  async function handlePickUpload(): Promise<void> {
    clearAwsConnectionFeedback();
    setError('');
    setMessage('');
    setSingleResult(null);
    const filePath = await window.surface1.pickOpenApiFile();
    if (filePath) {
      setSelectedUploadPath(filePath);
    }
  }

  async function handleUploadImport(): Promise<void> {
    clearAwsConnectionFeedback();
    if (!selectedUploadPath) {
      setError('Choose an OpenAPI file before importing.');
      return;
    }
    setLoading('Importing OpenAPI file...');
    setError('');
    setMessage('');
    setBulkCatalog(null);
    setSelectedCatalogSpec(null);
    try {
      const result = await window.surface1.importUploadedSpec(selectedUploadPath);
      setSingleResult(result.specContext);
      setMessage('Uploaded spec imported successfully.');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading('');
    }
  }

  async function handleTestConnection(): Promise<void> {
    const requestId = awsConnectionRequestId.current + 1;
    awsConnectionRequestId.current = requestId;
    setAwsConnectionFeedback({
      loading: 'Testing AWS access...',
      message: '',
      error: '',
      summary: ''
    });
    setLoading('');
    setError('');
    setMessage('');
    try {
      const result = await window.surface1.testAwsConnection(profileValue, region);
      if (requestId !== awsConnectionRequestId.current) {
        return;
      }
      setAwsConnectionFeedback({
        loading: '',
        message: 'AWS connection validated.',
        error: '',
        summary: `Connected to ${result.region} as ${result.arn ?? 'unknown identity'}${result.accountId ? ` (account ${result.accountId})` : ''}.`
      });
    } catch (err) {
      if (requestId !== awsConnectionRequestId.current) {
        return;
      }
      setAwsConnectionFeedback({
        loading: '',
        message: '',
        error: formatError(err),
        summary: ''
      });
    } finally {
      if (requestId === awsConnectionRequestId.current) {
        setAwsConnectionFeedback((current) => ({ ...current, loading: '' }));
      }
    }
  }

  async function handleLoadApis(): Promise<void> {
    setLoading('Loading APIs...');
    setError('');
    setMessage('');
    setSelectedApiId('');
    setStages([]);
    setSelectedStage('');
    try {
      const loadedApis = await window.surface1.listAwsApis(profileValue, region);
      setApis(loadedApis);
      setMessage(`Loaded ${loadedApis.length} REST/HTTP API(s).`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading('');
    }
  }

  async function handleLoadStages(): Promise<void> {
    if (!selectedApi) {
      setError('Select an API before loading stages.');
      return;
    }
    setLoading('Loading stages...');
    setError('');
    setMessage('');
    try {
      const loadedStages = await window.surface1.listAwsStages(profileValue, region, selectedApi.id, selectedApi.gatewayType);
      setStages(loadedStages);
      setSelectedStage(loadedStages[0] ?? '');
      setMessage(loadedStages.length > 0 ? `Loaded ${loadedStages.length} stage(s).` : 'No stages found for the selected API.');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading('');
    }
  }

  async function handleImportSingleAws(): Promise<void> {
    if (!selectedApi) {
      setError('Select an API before importing.');
      return;
    }
    if (!selectedStage) {
      setError('Choose a stage before importing this service.');
      return;
    }

    setLoading('Importing AWS API spec...');
    setError('');
    setMessage('');
    setBulkCatalog(null);
    setSelectedCatalogSpec(null);

    try {
      const specContext = await window.surface1.importAwsSpec({
        profile: profileValue,
        region,
        gatewayId: selectedApi.id,
        gatewayType: selectedApi.gatewayType,
        stage: selectedStage
      });
      setSingleResult(specContext);
      setMessage('AWS API Gateway spec imported successfully.');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading('');
    }
  }

  async function handleImportAllAws(): Promise<void> {
    setLoading('Importing all detected AWS API Gateway specs...');
    setError('');
    setMessage('');
    setSingleResult(null);
    setSelectedCatalogSpec(null);
    try {
      const result = await window.surface1.importAllAwsSpecs({
        profile: profileValue,
        region
      });
      setBulkCatalog(result.catalog);
      setMessage(`Bulk import completed. ${result.catalog.totals.imported} service(s) imported.`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading('');
    }
  }

  async function handleOpenImportedService(specContextPath: string | undefined): Promise<void> {
    if (!specContextPath) {
      return;
    }
    setLoading('Opening imported service...');
    setError('');
    try {
      const specContext = await window.surface1.loadSpecContext(specContextPath);
      setSelectedCatalogSpec(specContext);
      setMessage('Imported service ready for Surface 2.');
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading('');
    }
  }

  if (workspaceLoading && !workspaceState && !workspaceError) {
    return (
      <div className="workspace-launch-shell">
        <section className="workspace-launch-card">
          <p className="eyebrow">CSE Buddy</p>
          <h1>Preparing your workspace</h1>
          <p>{workspaceLoading}</p>
        </section>
      </div>
    );
  }

  if (!activeWorkspacePath) {
    return (
      <div className="workspace-launch-shell">
        <section className="workspace-launch-card">
          <p className="eyebrow">CSE Buddy</p>
          <h1>Choose a workspace</h1>
          <p>
            CSE Buddy keeps each service import, smoke flow, onboarding config, and generated Git bundle inside the
            workspace you choose here.
          </p>

          <div className="launch-actions">
            <button type="button" className="primary" onClick={handleChooseWorkspace}>
              Open workspace
            </button>
            <button type="button" onClick={handleCreateWorkspace}>
              Create workspace
            </button>
          </div>

          {workspaceLoading ? <p className="status-line">{workspaceLoading}</p> : null}
          {workspaceError ? <p className="status-line error">{workspaceError}</p> : null}

          <div className="workspace-recent-list">
            <div className="panel-header">
              <div>
                <h2>Recent workspaces</h2>
                <p>Pick up where you left off.</p>
              </div>
            </div>
            {workspaceState?.recentWorkspaces.length ? (
              <div className="workspace-recent-stack">
                {workspaceState.recentWorkspaces.map((workspacePath) => (
                  <button
                    key={workspacePath}
                    type="button"
                    className="workspace-recent-item"
                    onClick={() => handleOpenRecentWorkspace(workspacePath)}
                  >
                    <strong>{getWorkspaceName(workspacePath)}</strong>
                    <span>{workspacePath}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No workspaces yet. Open a project folder or create a fresh one to begin.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand">
          <h1>CSE Buddy</h1>
          <div className="brand-surface">
            <p className="eyebrow" id="current-surface-label">Current surface</p>
            <h2 id="current-surface-title" aria-describedby="current-surface-label">
              {surfaceOverview.title}
            </h2>
          </div>
          <p>{surfaceOverview.description}</p>
        </div>

        <div className="selection-card">
          <h2>Choose input source</h2>
          <div className="segmented">
            <button
              className={sourceMode === 'upload' ? 'active' : ''}
              onClick={() => setSourceMode('upload')}
              type="button"
            >
              Upload OpenAPI
            </button>
            <button
              className={sourceMode === 'aws' ? 'active' : ''}
              onClick={() => setSourceMode('aws')}
              type="button"
            >
              Import from AWS API Gateway
            </button>
          </div>
        </div>

        {sourceMode === 'upload' ? (
          <section className="panel">
            <h2>Upload OpenAPI file</h2>
            <p>Select a local `.yaml`, `.yml`, or `.json` OpenAPI 3.x file.</p>
            <div className="sequence-stack">
              <div className="sequence-card">
                <div className="sequence-card-top">
                  <span className="sequence-badge">1</span>
                  <div>
                    <strong>Select a source file</strong>
                    <p>Choose the OpenAPI document you want Surface 1 to normalize.</p>
                  </div>
                </div>
                <div className="inline-actions">
                  <button type="button" className="upload-browse-button" onClick={handlePickUpload}>
                    Browse file
                  </button>
                </div>
                <label className="field">
                  <span>Selected file</span>
                  <input value={selectedUploadPath} placeholder="No file selected yet" readOnly />
                </label>
              </div>

              <div className="sequence-card">
                <div className="sequence-card-top">
                  <span className="sequence-badge">2</span>
                  <div>
                    <strong>Import and validate</strong>
                    <p>Normalize the spec and prepare it for Surface 2.</p>
                  </div>
                </div>
                <div className="inline-actions">
                  <button type="button" className="primary" onClick={handleUploadImport}>
                    Import file
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>AWS import</h2>
                <p>Use your local AWS profile to export one API or bulk import one spec per detected service.</p>
              </div>
              <div className="segmented compact">
                <button
                  className={awsMode === 'single' ? 'active' : ''}
                  onClick={() => setAwsMode('single')}
                  type="button"
                >
                  Import one service
                </button>
                <button
                  className={awsMode === 'bulk' ? 'active' : ''}
                  onClick={() => setAwsMode('bulk')}
                  type="button"
                >
                  Import all detected services
                </button>
              </div>
            </div>

            <div className="sequence-stack">
              <div className="sequence-card">
                <div className="sequence-card-top">
                  <span className="sequence-badge">1</span>
                  <div>
                    <strong>Connect to AWS</strong>
                    <p>Use an existing local profile or the default credential chain.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>AWS profile</span>
                    <select
                      value={selectedProfile}
                      onChange={(event) => {
                        setSelectedProfile(event.target.value);
                        clearAwsConnectionFeedback();
                      }}
                    >
                      <option value="">Use default credential chain</option>
                      {profiles.map((profile) => (
                        <option key={profile.name} value={profile.name}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Region</span>
                    <input
                      value={region}
                      onChange={(event) => {
                        setRegion(event.target.value);
                        clearAwsConnectionFeedback();
                      }}
                      placeholder="us-east-1"
                    />
                  </label>
                </div>

                <div className="inline-actions">
                  <button type="button" onClick={handleTestConnection}>
                    Test access
                  </button>
                </div>

                {awsConnectionFeedback.loading ? <p className="status-line">{awsConnectionFeedback.loading}</p> : null}
                {awsConnectionFeedback.summary ? <p className="status-line success">{awsConnectionFeedback.summary}</p> : null}
                {awsConnectionFeedback.message ? <p className="status-line success">{awsConnectionFeedback.message}</p> : null}
                {awsConnectionFeedback.error ? <p className="status-line error">{awsConnectionFeedback.error}</p> : null}
              </div>

              <div className="sequence-card">
                <div className="sequence-card-top">
                  <span className="sequence-badge">2</span>
                  <div>
                    <strong>Discover services</strong>
                    <p>Load the APIs available in the selected account and region.</p>
                  </div>
                </div>
                <div className="inline-actions">
                  <button type="button" onClick={handleLoadApis}>
                    Load APIs
                  </button>
                  {awsMode === 'bulk' ? (
                    <button type="button" className="primary" onClick={handleImportAllAws}>
                      Import all detected services
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {awsMode === 'single' ? (
              <>
                <div className="sequence-card">
                  <div className="sequence-card-top">
                    <span className="sequence-badge">3</span>
                    <div>
                      <strong>Select one service</strong>
                      <p>Choose the API and stage you want Surface 1 to import.</p>
                    </div>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      <span>API</span>
                      <select
                        value={selectedApiId}
                        onChange={(event) => {
                          const api = apis.find((item) => item.id === event.target.value);
                          setSelectedApiId(event.target.value);
                          setSelectedGatewayType(api?.gatewayType ?? 'REST');
                          setStages([]);
                          setSelectedStage('');
                        }}
                      >
                        <option value="">Select an API</option>
                        {apis.map((api) => (
                          <option key={api.id} value={api.id}>
                            {api.name} ({api.gatewayType})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Gateway type</span>
                      <input value={selectedGatewayType} readOnly />
                    </label>
                  </div>

                  <div className="inline-actions">
                    <button type="button" onClick={handleLoadStages}>
                      Load stages
                    </button>
                  </div>

                  <label className="field">
                    <span>Stage</span>
                    <select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value)}>
                      <option value="">Select a stage</option>
                      {stages.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="inline-actions">
                    <button type="button" className="primary" onClick={handleImportSingleAws}>
                      Import selected service
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        )}

        {loading ? <p className="status-line">{loading}</p> : null}
        {message ? <p className="status-line success">{message}</p> : null}
        {error ? <p className="status-line error">{error}</p> : null}
      </aside>

      <main className="workspace">
        <section className="workspace-banner">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>{getWorkspaceName(activeWorkspacePath)}</h2>
            <p>{activeWorkspacePath}</p>
          </div>
          <div className="inline-actions">
            <button type="button" onClick={() => void handleOpenWorkspaceFolder()}>
              Open workspace folder
            </button>
            <button type="button" onClick={handleChooseWorkspace}>
              Open another workspace
            </button>
            <button type="button" onClick={handleCreateWorkspace}>
              Create workspace
            </button>
            <button type="button" onClick={handleClearWorkspace}>
              Close workspace
            </button>
          </div>
        </section>

        <section className="progress-strip">
          {progressSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`progress-step ${step.state}`}
              disabled={step.state === 'blocked'}
              onClick={() => setCurrentSurface(step.id)}
            >
              <div className="progress-step-top">
                <span className="progress-count">0{index + 1}</span>
                <span className={`progress-state ${step.state}`}>{step.state}</span>
              </div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </button>
          ))}
        </section>

        <section className="hero">
          <div>
            <p className="eyebrow">Surface 1 outcome</p>
            <h2>One normalized OpenAPI spec per service</h2>
            <p>
              Upload a spec directly or export it from AWS API Gateway. Every successful import writes a normalized YAML
              file plus a structured `SpecContext` ready for Surface 2.
            </p>
          </div>
          <div className="hero-stats">
            <div>
              <span>Profiles detected</span>
              <strong>{profiles.length}</strong>
            </div>
            <div>
              <span>APIs loaded</span>
              <strong>{apis.length}</strong>
            </div>
            <div>
              <span>Bulk imported</span>
              <strong>{bulkCatalog?.totals.imported ?? 0}</strong>
            </div>
          </div>
        </section>

        {currentSurface === 'surface1' && singleResult ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Single-service import summary</h2>
                <p>This service can move directly into Surface 2.</p>
              </div>
            </div>
            {renderSpecSummary(singleResult)}
          </section>
        ) : null}

        {currentSurface === 'surface1' && bulkCatalog ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Bulk import catalog</h2>
                <p>
                  Imported {bulkCatalog.totals.imported} of {bulkCatalog.totals.detected} detected services in {bulkCatalog.awsRegion}.
                </p>
              </div>
              <div className="segmented compact">
                {(['all', 'imported', 'warnings', 'skipped', 'failed'] as CatalogFilter[]).map((filter) => (
                  <button
                    key={filter}
                    className={catalogFilter === filter ? 'active' : ''}
                    onClick={() => setCatalogFilter(filter)}
                    type="button"
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="catalog-summary">
              <div>
                <span>Detected</span>
                <strong>{bulkCatalog.totals.detected}</strong>
              </div>
              <div>
                <span>Imported</span>
                <strong>{bulkCatalog.totals.imported}</strong>
              </div>
              <div>
                <span>Skipped</span>
                <strong>{bulkCatalog.totals.skipped}</strong>
              </div>
              <div>
                <span>Failed</span>
                <strong>{bulkCatalog.totals.failed}</strong>
              </div>
            </div>

            <div className="catalog-table">
              <div className="catalog-row header">
                <span>Service</span>
                <span>Type</span>
                <span>Stage</span>
                <span>Status</span>
                <span>Warnings</span>
                <span>Action</span>
              </div>
              {filteredCatalogEntries.map((entry) => (
                <div className="catalog-row" key={entry.serviceKey}>
                  <span>
                    <strong>{entry.serviceName}</strong>
                    <small>{entry.gatewayId}</small>
                    {entry.errorSummary ? <em>{entry.errorSummary}</em> : null}
                  </span>
                  <span>{entry.gatewayType}</span>
                  <span>{entry.stage ?? 'n/a'}</span>
                  <span className={`pill ${entry.status}`}>{entry.status}</span>
                  <span>{entry.warningCount}</span>
                  <span>
                    <button
                      type="button"
                      disabled={entry.status !== 'imported'}
                      onClick={() => handleOpenImportedService(entry.specContextPath)}
                    >
                      Open service
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {currentSurface === 'surface1' && selectedCatalogSpec ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Selected imported service</h2>
                <p>This service is ready to enter Surface 2.</p>
              </div>
            </div>
            {renderSpecSummary(selectedCatalogSpec)}
          </section>
        ) : null}

        {activeSpecContext && currentSurface !== 'surface1' ? (
          <section className="panel active-service-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Active service</p>
                <h2>{activeSpecContext.document.name}</h2>
                <p>{activeSpecContext.acquisition.sourceLabel} • {activeSpecContext.document.version}</p>
              </div>
              <div className="active-service-meta">
                <span>{activeSpecContext.summary.operationCount} operations</span>
                <span>{activeSpecContext.summary.endpointCount} endpoints</span>
              </div>
            </div>
          </section>
        ) : null}

        {activeSpecContext && currentSurface === 'surface2' ? (
          <Surface2Workspace specContext={activeSpecContext} onExportSuccess={() => setCurrentSurface('surface3')} />
        ) : null}
        {activeSpecContext && currentSurface === 'surface3' ? (
          <Surface3Workspace specContext={activeSpecContext} onSaveSuccess={() => setCurrentSurface('surface4')} />
        ) : null}
        {activeSpecContext && currentSurface === 'surface4' ? <Surface4Workspace specContext={activeSpecContext} /> : null}
      </main>
    </div>
  );
}
