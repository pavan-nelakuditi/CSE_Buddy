import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { getSurface2FlowPath } from '../lib/surface3/config.js';
import type { SpecContext } from '../shared/surface1.js';
import type { CICDConfig } from '../shared/surface3.js';
import type { Surface4LoadStateResult } from '../shared/surface4.js';

type Props = {
  specContext: SpecContext;
};

type ManifestEntry = {
  label: string;
  description: string;
  path: string;
};

function createErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeGeneratedFile(filePath: string): ManifestEntry {
  if (filePath.endsWith('/api/openapi.yaml')) {
    return {
      label: 'Normalized spec',
      description: 'The OpenAPI file Surface 1 validated and staged for onboarding.',
      path: filePath
    };
  }
  if (filePath.endsWith('/flow.yaml')) {
    return {
      label: 'Smoke flow',
      description: 'The approved Surface 2 happy-path flow used by the smoke-flow action.',
      path: filePath
    };
  }
  if (filePath.endsWith('/postman-pr-validation.yml')) {
    return {
      label: 'PR validation workflow',
      description: 'Runs Postman lint and governance checks on pull requests.',
      path: filePath
    };
  }
  if (filePath.endsWith('/postman-smoke-flow-onboarding.yml')) {
    return {
      label: 'Onboarding workflow',
      description: 'Chains bootstrap, smoke-flow apply, and repo-sync for the service.',
      path: filePath
    };
  }
  if (filePath.endsWith('/README.md')) {
    return {
      label: 'Bundle README',
      description: 'Guides a first-time user through secrets, workflows, and a safe first run.',
      path: filePath
    };
  }

  return {
    label: 'Generated file',
    description: 'Staged as part of the Surface 4 bundle.',
    path: filePath
  };
}

export function Surface4Workspace({ specContext }: Props): ReactElement {
  const [state, setState] = useState<Surface4LoadStateResult | null>(null);
  const [status, setStatus] = useState('Load Surface 3 config to prepare Git artifact generation.');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');

  useEffect(() => {
    setState(null);
    setStatus('Load Surface 3 config to prepare Git artifact generation.');
    setError('');
    setLoading('');

    if (!window.surface4) {
      setError('Surface 4 bridge is unavailable. Restart the app after rebuilding Electron.');
      return;
    }

    void (async () => {
      try {
        setLoading('Loading Surface 4 state...');
        const nextState = await window.surface4.loadState({
          serviceKey: specContext.serviceKey,
          flowPath: getSurface2FlowPath(specContext)
        });
        setState(nextState);
        if (!nextState.flowExists) {
          setStatus('Export flow.yaml in Surface 2 before generating Surface 4 artifacts.');
        } else if (!nextState.configExists) {
          setStatus('Save Surface 3 config before generating Surface 4 artifacts.');
        } else if (nextState.summaryPath) {
          setStatus('A generated Git bundle already exists for this service.');
        } else {
          setStatus('Surface 4 is ready to generate the GitHub onboarding bundle.');
        }
      } catch (loadError) {
        setError(createErrorMessage(loadError));
      } finally {
        setLoading('');
      }
    })();
  }, [specContext]);

  async function handleGenerate(): Promise<void> {
    if (!state?.config) {
      setError('Save Surface 3 config before generating Surface 4 artifacts.');
      return;
    }
    if (!state.flowExists) {
      setError('Export flow.yaml in Surface 2 before generating Surface 4 artifacts.');
      return;
    }
    if (!window.surface4) {
      setError('Surface 4 bridge is unavailable. Restart the app after rebuilding Electron.');
      return;
    }

    try {
      setLoading('Generating Surface 4 Git artifacts...');
      const result = await window.surface4.generateArtifacts({
        specContext,
        config: state.config as CICDConfig
      });
      setState((current) =>
        current
          ? {
              ...current,
              summary: result.summary,
              summaryPath: result.summaryPath
            }
          : current
      );
      setStatus('Git bundle generated.');
      setError('');
    } catch (generationError) {
      setError(createErrorMessage(generationError));
    } finally {
      setLoading('');
    }
  }

  async function handleRevealGeneratedBundle(): Promise<void> {
    try {
      setError('');
      await window.surface4.revealBundle(specContext.serviceKey);
    } catch (revealError) {
      setError(createErrorMessage(revealError));
    }
  }

  async function handleOpenGeneratedReadme(): Promise<void> {
    try {
      setError('');
      await window.surface4.openReadme(specContext.serviceKey);
    } catch (openError) {
      setError(createErrorMessage(openError));
    }
  }

  async function handleExportBundle(): Promise<void> {
    try {
      setLoading('Exporting generated bundle...');
      setError('');
      const result = await window.surface4.exportBundle(specContext.serviceKey);
      if (!result.targetDirectory) {
        setStatus('Bundle export canceled.');
      } else {
        setStatus(`Bundle exported to ${result.targetDirectory} (${result.copiedFiles.length} files).`);
      }
    } catch (exportError) {
      setError(createErrorMessage(exportError));
    } finally {
      setLoading('');
    }
  }

  const ready = Boolean(state?.flowExists && state?.configExists && state?.config);
  const manifestEntries = (state?.expectedFiles ?? []).map(describeGeneratedFile);
  const generatedEntries = (state?.summary?.files ?? []).map(describeGeneratedFile);
  const generatedRoot = state?.summary?.generatedRoot ?? state?.generatedRoot ?? `.cse-buddy/surface4/${specContext.serviceKey}/generated`;
  const setupDocPath = state?.summary?.setupDocPath ?? `${generatedRoot}/README.md`;
  const environmentLabels = state?.config?.environments.map((environment) => environment.label).join(', ');

  return (
    <section className="panel surface4-shell">
      <div className="panel-header">
        <div>
          <h2>Surface 4</h2>
          <p>Generate local GitHub workflow artifacts from the approved spec, flow, and CI/CD config.</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="primary" onClick={() => void handleGenerate()} disabled={!ready}>
            Generate Git artifacts
          </button>
          {state?.summary ? (
            <>
              <button type="button" onClick={() => void handleRevealGeneratedBundle()}>
                Reveal bundle
              </button>
              <button type="button" onClick={() => void handleOpenGeneratedReadme()}>
                Open README
              </button>
              <button type="button" className="primary" onClick={() => void handleExportBundle()}>
                Export to folder
              </button>
            </>
          ) : null}
        </div>
      </div>

      <p className="status-line surface4-status">{status}</p>
      {loading ? <p className="status-line">{loading}</p> : null}
      {error ? <p className="status-line error">{error}</p> : null}

      <div className="surface-guide-grid">
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">1</span>
            <div>
              <strong>Confirm readiness</strong>
              <p>Make sure the flow and CICD config are both available.</p>
            </div>
          </div>
        </div>
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">2</span>
            <div>
              <strong>Review the bundle</strong>
              <p>Check the staged spec, flow, and workflow files.</p>
            </div>
          </div>
        </div>
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">3</span>
            <div>
              <strong>Generate artifacts</strong>
              <p>Create the staged GitHub onboarding bundle.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="surface4-grid">
        <section className="surface4-column">
          {state?.summary ? (
            <>
              <h3>Generated bundle</h3>
              <div className="surface4-card-list">
                <div className="surface4-card">
                  <strong>Files location</strong>
                  <p>The full onboarding bundle has been staged for this service here.</p>
                  <code>{generatedRoot}</code>
                  <div className="inline-actions">
                    <button type="button" onClick={() => void handleRevealGeneratedBundle()}>
                      Reveal bundle
                    </button>
                  </div>
                </div>
                <div className="surface4-card">
                  <strong>README</strong>
                  <p>Open this first for the workflow steps, secrets, and first-run guidance.</p>
                  <code>{setupDocPath}</code>
                  <div className="inline-actions">
                    <button type="button" onClick={() => void handleOpenGeneratedReadme()}>
                      Open README
                    </button>
                  </div>
                </div>
              </div>

              <h3>Next steps</h3>
              <div className="surface4-card">
                <ul className="surface4-list">
                  <li>Open the generated <code>README.md</code> in the staged bundle.</li>
                  <li>Use <code>Export to folder</code> to place the repo-ready files into a new or existing service repo.</li>
                  <li>Add the required GitHub secrets: <code>POSTMAN_API_KEY</code> and <code>POSTMAN_ACCESS_TOKEN</code>.</li>
                  <li>Review the generated workflows and staged service files before copying them into a target repo.</li>
                  <li>Use a safe first run with <code>repo_write_mode=commit-only</code> before switching to push-based automation.</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <h3>Readiness</h3>
              <div className="surface4-card-list">
                <div className="surface4-card">
                  <strong>Surface 2 flow</strong>
                  <p>{state?.flowExists ? 'flow.yaml is available.' : 'flow.yaml has not been exported yet.'}</p>
                </div>
                <div className="surface4-card">
                  <strong>Surface 3 config</strong>
                  <p>{state?.configExists ? 'Onboarding config is available.' : 'Onboarding config has not been saved yet.'}</p>
                </div>
                <div className="surface4-card">
                  <strong>Generated root</strong>
                  <code>{generatedRoot}</code>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="surface4-column">
          <h3>{state?.summary ? 'Bundle contents' : 'Files to generate'}</h3>
          <div className="surface4-card surface4-manifest-card">
            <div className="surface4-manifest">
              {(state?.summary ? generatedEntries : manifestEntries).map((entry) => (
                <div key={entry.path} className="surface4-manifest-row">
                  <div>
                    <strong>{entry.label}</strong>
                    <p>{entry.description}</p>
                    <code>{entry.path}</code>
                  </div>
                  <span className={`surface4-file-pill ${state?.summary ? 'generated' : ''}`}>{state?.summary ? 'generated' : 'staged'}</span>
                </div>
              ))}
            </div>
          </div>

          <h3>Onboarding summary</h3>
          <div className="surface4-card">
            <p><strong>Environments</strong></p>
            <p>{environmentLabels || 'No environments selected yet.'}</p>
            <p><strong>Governance mapping</strong></p>
            <p>{state?.config?.governance ? 'Included' : 'Not included'}</p>
          </div>
        </section>
      </div>
    </section>
  );
}
