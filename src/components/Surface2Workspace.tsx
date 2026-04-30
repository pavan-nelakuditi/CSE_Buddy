import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';

import type { SpecContext, SpecOperation } from '../shared/surface1.js';
import type { AmbiguityChoice, BindingSource, FlowStep, Surface2DraftState } from '../shared/surface2.js';
import { generateDraftFlow } from '../lib/surface2/generator.js';
import { exportManifestYaml, validateFlow } from '../lib/surface2/manifest.js';

type Props = {
  specContext: SpecContext;
  onExportSuccess?: () => void;
};

function createDraft(specContext: SpecContext, flow: Surface2DraftState['flow'], overrides: Surface2DraftState['overrides']): Surface2DraftState {
  return {
    specContext,
    flow,
    overrides
  };
}

function createErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Surface2Workspace({ specContext, onExportSuccess }: Props): ReactElement {
  const [draft, setDraft] = useState<Surface2DraftState | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string>();
  const [pendingPrompt, setPendingPrompt] = useState<ReturnType<typeof generateDraftFlow>['pendingAmbiguity']>();
  const [overrides, setOverrides] = useState<Record<string, AmbiguityChoice>>({});
  const [status, setStatus] = useState('Generate a smoke flow to start Surface 2.');
  const [error, setError] = useState('');

  const operationsById = useMemo(
    () => new Map(specContext.operations.map((operation) => [operation.operationId, operation])),
    [specContext.operations]
  );

  const selectedStep = draft?.flow.steps.find((step) => step.id === selectedStepId);
  const selectedOperation = selectedStep ? operationsById.get(selectedStep.operationId) : undefined;
  const previousSteps = useMemo(() => {
    if (!draft || !selectedStep) return [];
    const index = draft.flow.steps.findIndex((step) => step.id === selectedStep.id);
    return index > 0 ? draft.flow.steps.slice(0, index) : [];
  }, [draft, selectedStep]);

  useEffect(() => {
    setDraft(null);
    setSelectedStepId(undefined);
    setPendingPrompt(undefined);
    setOverrides({});
    setStatus(`Generate a smoke flow for ${specContext.document.name}.`);
    setError('');
  }, [specContext]);

  useEffect(() => {
    if (!draft || !window.surface2) {
      return;
    }
    void window.surface2.saveDraft({ draft }).catch(() => {
      // Keep UX resilient even if draft persistence fails.
    });
  }, [draft]);

  function applyGeneratedResult(nextOverrides: Record<string, AmbiguityChoice>): void {
    const result = generateDraftFlow(specContext, nextOverrides);
    setOverrides(result.overrides);
    setPendingPrompt(result.pendingAmbiguity);

    if (result.flow) {
      const nextDraft = createDraft(specContext, result.flow, result.overrides);
      setDraft(nextDraft);
      setSelectedStepId(result.flow.steps[0]?.id);
      setStatus(`Generated a ${result.flow.steps.length}-step smoke flow.`);
      setError('');
      return;
    }

    setDraft(null);
    if (result.pendingAmbiguity) {
      setStatus('Choose one dependency to finish the draft.');
      setError('');
      return;
    }

    setStatus('No suitable smoke flow could be generated from this service.');
  }

  function handleGenerate(): void {
    applyGeneratedResult({});
  }

  function handleAmbiguityChoice(choice: AmbiguityChoice): void {
    const nextOverrides = {
      ...overrides,
      [`${choice.targetOperationId}:${choice.targetFieldKey}`]: choice
    };
    applyGeneratedResult(nextOverrides);
  }

  function getFieldBadgeLabel(source: BindingSource): string {
    if (source === 'prior_output') {
      return 'prior output';
    }
    return source;
  }

  function updateStep(stepId: string, mutator: (step: FlowStep) => FlowStep): void {
    setDraft((current) =>
      current
        ? {
            ...current,
            flow: {
              ...current.flow,
              steps: current.flow.steps.map((step) => (step.id === stepId ? mutator(step) : step))
            }
          }
        : current
    );
  }

  function moveStep(stepId: string, direction: -1 | 1): void {
    setDraft((current) => {
      if (!current) return current;
      const index = current.flow.steps.findIndex((step) => step.id === stepId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.flow.steps.length) {
        return current;
      }
      const nextSteps = [...current.flow.steps];
      const [step] = nextSteps.splice(index, 1);
      nextSteps.splice(targetIndex, 0, step);
      return {
        ...current,
        flow: {
          ...current.flow,
          steps: nextSteps
        }
      };
    });
  }

  function removeStep(stepId: string): void {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        flow: {
          ...current.flow,
          steps: current.flow.steps.filter((step) => step.id !== stepId)
        }
      };
    });
    if (selectedStepId === stepId) {
      setSelectedStepId(undefined);
    }
  }

  function addOperation(operation: SpecOperation): void {
    setDraft((current) => {
      if (!current) return current;
      if (current.flow.steps.some((step) => step.operationId === operation.operationId)) {
        return current;
      }
      return {
        ...current,
        flow: {
          ...current.flow,
          steps: [
            ...current.flow.steps,
            {
              id: crypto.randomUUID(),
              operationId: operation.operationId,
              name: operation.summary,
              description: operation.description,
              bindings: operation.fields.map((field) => ({
                fieldKey: field.key,
                source: field.example ? 'example' : 'literal',
                value: field.example ?? ''
              })),
              extract: []
            }
          ]
        }
      };
    });
  }

  async function handleExport(): Promise<void> {
    if (!draft) return;
    if (!window.surface2) {
      setError('Surface 2 bridge is unavailable. Restart the app after rebuilding Electron.');
      return;
    }
    const errors = validateFlow(draft.flow, specContext.operations);
    if (errors.length > 0) {
      setError(errors[0] ?? 'Flow export failed validation.');
      return;
    }

    const manifestYaml = exportManifestYaml(draft);
    try {
      const result = await window.surface2.exportFlow({ draft, manifestYaml });
      setStatus(`Exported flow.yaml to ${result.manifestPath ?? 'the Surface 2 workspace'}.`);
      setError('');
      onExportSuccess?.();
    } catch (exportError) {
      setError(createErrorMessage(exportError));
    }
  }

  return (
    <section className="panel surface2-shell">
      <div className="panel-header">
        <div>
          <h2>Surface 2</h2>
          <p>Draft, refine, and export one smoke flow.</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={handleGenerate}>
            Generate smoke flow
          </button>
          <button type="button" onClick={() => applyGeneratedResult({})} disabled={!draft && !pendingPrompt}>
            Regenerate
          </button>
          <button type="button" className="primary" onClick={() => void handleExport()} disabled={!draft}>
            Export flow.yaml
          </button>
        </div>
      </div>

      <p className="status-line surface2-status">{status}</p>
      {error ? <p className="status-line error">{error}</p> : null}

      <div className="surface-guide-grid">
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">1</span>
            <div>
              <strong>Generate a draft</strong>
              <p>Start with one smoke flow for this service.</p>
            </div>
          </div>
        </div>
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">2</span>
            <div>
              <strong>Review the steps</strong>
              <p>Tune bindings, extracts, and step order.</p>
            </div>
          </div>
        </div>
        <div className="sequence-card surface-guide-card">
          <div className="sequence-card-top">
            <span className="sequence-badge">3</span>
            <div>
              <strong>Export flow.yaml</strong>
              <p>Lock the flow before moving to onboarding config.</p>
            </div>
          </div>
        </div>
      </div>

      {pendingPrompt ? (
        <div className="surface2-ambiguity">
          <h3>Ambiguity to resolve</h3>
          <p>{pendingPrompt.question}</p>
          <div className="ambiguity-choice-list">
            {pendingPrompt.choices.map((choice) => (
              <button key={`${choice.sourceOperationId}-${choice.sourceFieldJsonPath}`} type="button" onClick={() => handleAmbiguityChoice(choice)}>
                <strong>{choice.label}</strong>
                <span>{choice.reason}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="surface2-grid">
          <section className="surface2-column">
            <h3>Operation library</h3>
            <p>Add or remove steps.</p>
            <div className="surface2-card-list">
              {specContext.operations.map((operation) => {
                const included = draft.flow.steps.some((step) => step.operationId === operation.operationId);
                return (
                  <div key={operation.operationId} className={`surface2-operation-card ${included ? 'selected' : ''}`}>
                    <div className="surface2-operation-top">
                      <span className={`method-chip method-${operation.method.toLowerCase()}`}>{operation.method}</span>
                      <button type="button" onClick={() => addOperation(operation)} disabled={included}>
                        {included ? 'Added' : 'Add'}
                      </button>
                    </div>
                    <strong>{operation.summary}</strong>
                    <code>{operation.path}</code>
                    <small>{operation.operationId}</small>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="surface2-column">
            <h3>{draft.flow.name}</h3>
            <p className="surface2-column-intro">Review the sequence before export.</p>
            <label className="field">
              <span>Flow name</span>
              <input
                value={draft.flow.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          flow: {
                            ...current.flow,
                            name: event.target.value
                          }
                        }
                      : current
                  )
                }
              />
            </label>
            <div className="surface2-card-list">
              {draft.flow.steps.map((step, index) => (
                <div
                  key={step.id}
                  className={`surface2-step-card ${selectedStepId === step.id ? 'selected' : ''}`}
                  onClick={() => setSelectedStepId(step.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedStepId(step.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="surface2-step-top">
                    <div className="surface2-step-heading">
                      <span className="surface2-step-number">{index + 1}</span>
                      <strong>{step.name?.trim() || step.operationId}</strong>
                    </div>
                    <div className="inline-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); moveStep(step.id, -1); }} disabled={index === 0}>
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); moveStep(step.id, 1); }}
                        disabled={index === draft.flow.steps.length - 1}
                      >
                        Down
                      </button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); removeStep(step.id); }}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <small>{step.operationId}</small>
                  <div className="surface2-step-tags">
                    <span className="surface2-mini-pill">bindings {step.bindings.length}</span>
                    <span className="surface2-mini-pill">extracts {step.extract.length}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface2-column">
            <h3>Inspector</h3>
            {selectedStep && selectedOperation ? (
              <>
                <div className="surface2-selected-banner">
                  <div>
                    <span className="surface2-step-number static">
                      {draft.flow.steps.findIndex((step) => step.id === selectedStep.id) + 1}
                    </span>
                    <strong>{selectedStep.name?.trim() || selectedOperation.summary}</strong>
                  </div>
                  <small>{selectedOperation.method} {selectedOperation.path}</small>
                </div>
                <label className="field">
                  <span>Step label</span>
                  <input
                    value={selectedStep.name ?? ''}
                    onChange={(event) => updateStep(selectedStep.id, (step) => ({ ...step, name: event.target.value }))}
                    placeholder={selectedOperation.summary}
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={selectedStep.description ?? ''}
                    onChange={(event) => updateStep(selectedStep.id, (step) => ({ ...step, description: event.target.value }))}
                    placeholder="Optional note for reviewers"
                  />
                </label>

                <div className="surface2-inspector-section">
                  <h4>Bindings</h4>
                  {selectedOperation.fields.length === 0 ? <p>No request fields found.</p> : null}
                  {selectedOperation.fields.map((field) => {
                    const binding = selectedStep.bindings.find((entry) => entry.fieldKey === field.key) ?? {
                      fieldKey: field.key,
                      source: field.example ? 'example' as const : 'literal' as const,
                      value: field.example ?? ''
                    };

                    const availableVariables = previousSteps.flatMap((candidateStep) => {
                      const sourceOperation = operationsById.get(candidateStep.operationId);
                      return (candidateStep.extract ?? []).map((extract) => ({
                        stepId: candidateStep.id,
                        stepLabel: candidateStep.name?.trim() || candidateStep.operationId,
                        variable: extract.variable,
                        sourceOperationId: sourceOperation?.operationId
                      }));
                    });

                    return (
                      <div key={field.key} className="surface2-binding-card">
                        <div className="binding-header">
                          <strong>{field.label}</strong>
                          <span className="field-chip">{field.location}</span>
                        </div>
                        <div className="surface2-binding-meta">
                          <small>{field.type}{field.required ? ' • required' : ''}</small>
                          <span className="surface2-mini-pill">{getFieldBadgeLabel(binding.source)}</span>
                        </div>
                        <select
                          value={binding.source}
                          onChange={(event) =>
                            updateStep(selectedStep.id, (step) => ({
                              ...step,
                              bindings: [
                                  ...step.bindings.filter((entry) => entry.fieldKey !== field.key),
                                  {
                                    ...binding,
                                    source: event.target.value as BindingSource
                                  }
                                ]
                              }))
                          }
                        >
                          <option value="example">example</option>
                          <option value="literal">literal</option>
                          <option value="prior_output">prior_output</option>
                        </select>

                        {binding.source === 'literal' ? (
                          <input
                            value={binding.value ?? ''}
                            onChange={(event) =>
                              updateStep(selectedStep.id, (step) => ({
                                ...step,
                                bindings: [
                                  ...step.bindings.filter((entry) => entry.fieldKey !== field.key),
                                  {
                                    ...binding,
                                    source: 'literal',
                                    value: event.target.value
                                  }
                                ]
                              }))
                            }
                            placeholder={field.example ?? 'Enter value'}
                          />
                        ) : null}

                        {binding.source === 'prior_output' ? (
                          <div className="binding-prior-output">
                            <select
                              value={binding.sourceStepId ?? ''}
                              onChange={(event) =>
                                updateStep(selectedStep.id, (step) => ({
                                  ...step,
                                  bindings: [
                                    ...step.bindings.filter((entry) => entry.fieldKey !== field.key),
                                    {
                                      ...binding,
                                      source: 'prior_output',
                                      sourceStepId: event.target.value
                                    }
                                  ]
                                }))
                              }
                            >
                              <option value="">Select source step</option>
                              {previousSteps.map((candidateStep) => (
                                <option key={candidateStep.id} value={candidateStep.id}>
                                  {candidateStep.name?.trim() || candidateStep.operationId}
                                </option>
                              ))}
                            </select>
                            <select
                              value={binding.variable ?? ''}
                              onChange={(event) =>
                                updateStep(selectedStep.id, (step) => ({
                                  ...step,
                                  bindings: [
                                    ...step.bindings.filter((entry) => entry.fieldKey !== field.key),
                                    {
                                      ...binding,
                                      source: 'prior_output',
                                      variable: event.target.value
                                    }
                                  ]
                                }))
                              }
                            >
                              <option value="">Select variable</option>
                              {availableVariables
                                .filter((entry) => !binding.sourceStepId || entry.stepId === binding.sourceStepId)
                                .map((entry) => (
                                  <option key={`${entry.stepId}-${entry.variable}`} value={entry.variable}>
                                    {entry.variable} ({entry.stepLabel})
                                  </option>
                                ))}
                            </select>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="surface2-inspector-section">
                  <h4>Extracts</h4>
                  {selectedOperation.responseFields.length === 0 ? <p>No response fields found.</p> : null}
                  <div className="surface2-card-list">
                    {selectedOperation.responseFields.map((field) => {
                      const selected = selectedStep.extract.some((extract) => extract.jsonPath === field.jsonPath);
                      return (
                        <label key={field.key} className={`surface2-response-card ${selected ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              updateStep(selectedStep.id, (step) => ({
                                ...step,
                                extract: event.target.checked
                                  ? [
                                      ...step.extract,
                                      {
                                        id: crypto.randomUUID(),
                                        variable: `${selectedOperation.operationId}.${field.label.split('.').slice(-1)[0] ?? 'value'}`,
                                        jsonPath: field.jsonPath
                                      }
                                    ]
                                  : step.extract.filter((extract) => extract.jsonPath !== field.jsonPath)
                              }))
                            }
                          />
                          <div>
                            <strong>{field.label}</strong>
                            <code>{field.jsonPath}</code>
                            <small className="surface2-response-meta">{field.type}</small>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p>Select a step to edit bindings and extracts.</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
