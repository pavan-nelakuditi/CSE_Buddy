import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { SpecContext } from '../shared/surface1.js';
import type { GovernanceConfig } from '../shared/surface3.js';
import {
  buildCicdConfig,
  DEFAULT_ENVIRONMENT_ORDER,
  formatEnvironmentLabel,
  getSurface2FlowPath,
  validateEnvironmentRuntimes,
  validateEnvironmentSelection,
  validateGovernance
} from '../lib/surface3/config.js';

type Props = {
  specContext: SpecContext;
  onSaveSuccess?: () => void;
};

function createErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Surface3Workspace({ specContext, onSaveSuccess }: Props): ReactElement {
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(['dev', 'test', 'stage', 'prod']);
  const [runtimeUrls, setRuntimeUrls] = useState<Record<string, string>>({
    dev: '',
    test: '',
    stage: '',
    prod: ''
  });
  const [governanceEnabled, setGovernanceEnabled] = useState(false);
  const [governance, setGovernance] = useState<GovernanceConfig>({
    domain: '',
    groupName: ''
  });
  const [flowReady, setFlowReady] = useState(false);
  const [status, setStatus] = useState('Confirm the default CI strategy, then add environment URLs for merge-to-main onboarding.');
  const [error, setError] = useState('');

  const environments = useMemo(
    () =>
      selectedEnvironments.map((slug) => ({
        slug,
        label: formatEnvironmentLabel(slug),
        baseUrl: runtimeUrls[slug] ?? ''
      })),
    [runtimeUrls, selectedEnvironments]
  );

  const config = useMemo(
    () => buildCicdConfig(specContext, environments, governanceEnabled ? governance : undefined),
    [environments, governance, governanceEnabled, specContext]
  );

  useEffect(() => {
    setSelectedEnvironments(['dev', 'test', 'stage', 'prod']);
    setRuntimeUrls({
      dev: '',
      test: '',
      stage: '',
      prod: ''
    });
    setGovernanceEnabled(false);
    setGovernance({
      domain: '',
      groupName: ''
    });
    setFlowReady(false);
    setStatus('Confirm the default CI strategy, then add environment URLs for merge-to-main onboarding.');
    setError('');

    if (!window.surface3) {
      setError('Surface 3 bridge is unavailable. Restart the app after rebuilding Electron.');
      return;
    }

    void (async () => {
      try {
        const state = await window.surface3.loadState({
          serviceKey: specContext.serviceKey,
          flowPath: getSurface2FlowPath(specContext)
        });
        setFlowReady(state.flowExists);
        if (!state.flowExists) {
          setStatus('Export flow.yaml in Surface 2 before saving Surface 3 onboarding config.');
        }
        if (state.config) {
          const existingConfig = state.config;
          setSelectedEnvironments(existingConfig.environments.map((environment) => environment.slug));
          setRuntimeUrls((current) => ({
            ...current,
            ...Object.fromEntries(existingConfig.environments.map((environment) => [environment.slug, environment.baseUrl]))
          }));
          if (existingConfig.governance) {
            setGovernanceEnabled(true);
            setGovernance(existingConfig.governance);
          }
          setStatus(state.flowExists ? 'Loaded saved onboarding config.' : 'Saved onboarding config found, but Surface 2 flow.yaml is missing.');
        }
      } catch (loadError) {
        setError(createErrorMessage(loadError));
      }
    })();
  }, [specContext]);

  function toggleEnvironment(slug: string): void {
    setSelectedEnvironments((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  }

  async function handleSave(): Promise<void> {
    if (!flowReady) {
      setError('Export flow.yaml in Surface 2 before saving Surface 3 onboarding config.');
      return;
    }

    const selectionErrors = validateEnvironmentSelection(selectedEnvironments);
    const runtimeErrors = validateEnvironmentRuntimes(environments);
    const governanceErrors = validateGovernance(governanceEnabled, governance);
    const errors = [...selectionErrors, ...runtimeErrors, ...governanceErrors];

    if (errors.length > 0) {
      setError(errors[0] ?? 'Surface 3 validation failed.');
      return;
    }

    if (!window.surface3) {
      setError('Surface 3 bridge is unavailable. Restart the app after rebuilding Electron.');
      return;
    }

    try {
      const result = await window.surface3.saveConfig({ config });
      setStatus('Onboarding config saved.');
      setError('');
      onSaveSuccess?.();
    } catch (saveError) {
      setError(createErrorMessage(saveError));
    }
  }

  return (
    <section className="panel surface3-shell">
      <div className="panel-header">
        <div>
          <h2>Surface 3</h2>
          <p>Confirm the recommended GitHub strategy and generate onboarding-action-ready environment inputs.</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="primary" onClick={() => void handleSave()} disabled={!flowReady}>
            Save CICD config
          </button>
        </div>
      </div>

      <p className="status-line surface3-status">{status}</p>
      {error ? <p className="status-line error">{error}</p> : null}

      <div className="surface-guide-grid">
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">1</span>
            <div>
              <strong>Choose environments</strong>
              <p>Select the stages this service needs.</p>
            </div>
          </div>
        </div>
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">2</span>
            <div>
              <strong>Add runtime URLs</strong>
              <p>Enter the base URL for each selected environment.</p>
            </div>
          </div>
        </div>
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">3</span>
            <div>
              <strong>Save CICD config</strong>
              <p>Generate the onboarding inputs for Surface 4.</p>
            </div>
          </div>
        </div>
      </div>

      {!flowReady ? (
        <div className="surface3-card">
          <strong>Surface 2 required</strong>
          <p>Export a real <code>flow.yaml</code> in Surface 2 before saving onboarding config for this service.</p>
        </div>
      ) : null}

      <div className="surface3-grid">
        <section className="surface3-column">
          <h3>Recommended strategy</h3>
          <div className="surface3-card surface3-strategy-card">
            <ul className="surface3-list">
              <li>Run spec lint on every PR.</li>
              <li>Run governance checks on every PR.</li>
              <li>Block the PR if either check fails.</li>
              <li>Run the full API onboarding flow on every merge to <code>main</code>.</li>
            </ul>
          </div>

          <h3>Environment strategy</h3>
          <div className="segmented">
            {DEFAULT_ENVIRONMENT_ORDER.map((slug) => (
              <button
                key={slug}
                type="button"
                className={selectedEnvironments.includes(slug) ? 'active' : ''}
                onClick={() => toggleEnvironment(slug)}
              >
                {formatEnvironmentLabel(slug)}
              </button>
            ))}
          </div>

          <div className="surface3-environment-grid">
            {environments.map((environment) => (
              <div key={environment.slug} className="surface3-environment-card">
                <div className="surface3-environment-top">
                  <div>
                    <strong>{environment.label}</strong>
                    <p>Base URL used when merge-to-main onboarding creates environment inputs.</p>
                  </div>
                  <span className="surface3-environment-pill">{environment.slug}</span>
                </div>
                <label className="field">
                  <span>{environment.label} runtime URL</span>
                  <input
                    value={runtimeUrls[environment.slug] ?? ''}
                    onChange={(event) =>
                      setRuntimeUrls((current) => ({
                        ...current,
                        [environment.slug]: event.target.value
                      }))
                    }
                    placeholder={`https://${environment.slug}-api.example.com`}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="surface3-column">
          <div className="panel-header">
            <div>
              <h3>Optional governance</h3>
              <p>Add a governance mapping only if this service needs domain-to-group assignment during onboarding.</p>
            </div>
            <button
              type="button"
              className={governanceEnabled ? 'active' : ''}
              onClick={() => setGovernanceEnabled((current) => !current)}
            >
              {governanceEnabled ? 'Governance enabled' : 'Add governance mapping'}
            </button>
          </div>

          {governanceEnabled ? (
            <div className="surface3-card-list">
              <label className="field surface3-card">
                <span>Domain key</span>
                <input
                  value={governance.domain}
                  onChange={(event) =>
                    setGovernance((current) => ({
                      ...current,
                      domain: event.target.value
                    }))
                  }
                  placeholder="payments"
                />
              </label>

              <label className="field surface3-card">
                <span>Governance group</span>
                <input
                  value={governance.groupName}
                  onChange={(event) =>
                    setGovernance((current) => ({
                      ...current,
                      groupName: event.target.value
                    }))
                  }
                  placeholder="Payments Governance"
                />
              </label>
            </div>
          ) : (
            <div className="surface3-card">
              <p>Leave this off if the customer is not using governance-group assignment yet.</p>
            </div>
          )}

          <h3>Generated onboarding inputs</h3>
          <div className="surface3-json-card">
            <pre>{JSON.stringify(config.onboardingActionInputs, null, 2)}</pre>
          </div>
        </section>
      </div>
    </section>
  );
}
