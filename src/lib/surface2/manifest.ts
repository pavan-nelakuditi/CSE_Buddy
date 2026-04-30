import { stringify } from 'yaml';

import type { FlowDefinition, FlowManifest, Surface2DraftState } from '../../shared/surface2.js';
import type { SpecOperation } from '../../shared/surface1.js';

function slugifyOperationId(operationId: string): string {
  return operationId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

function makeStepKey(index: number, operationId: string): string {
  return `${slugifyOperationId(operationId)}-${index + 1}`;
}

export function validateFlow(flow: FlowDefinition, operations: SpecOperation[]): string[] {
  const operationIds = new Set(operations.map((operation) => operation.operationId));
  const errors: string[] = [];

  if (!flow.name.trim()) {
    errors.push('The smoke flow must have a name.');
  }

  for (const step of flow.steps) {
    if (!operationIds.has(step.operationId)) {
      errors.push(`Unknown operationId in flow: ${step.operationId}`);
    }
    for (const binding of step.bindings) {
      if (binding.source === 'literal' && !binding.value?.trim()) {
        errors.push(`Binding "${binding.fieldKey}" in "${step.operationId}" needs a literal value.`);
      }
      if (binding.source === 'prior_output' && (!binding.sourceStepId || !binding.variable)) {
        errors.push(`Binding "${binding.fieldKey}" in "${step.operationId}" needs a source step and variable.`);
      }
    }
    for (const extract of step.extract) {
      if (!extract.variable.trim() || !extract.jsonPath.trim()) {
        errors.push(`Extract rules in "${step.operationId}" need both a variable name and JSON path.`);
      }
    }
  }

  return errors;
}

export function toFlowManifest(draft: Surface2DraftState): FlowManifest {
  const stepKeyById = new Map<string, string>();
  draft.flow.steps.forEach((step, index) => {
    stepKeyById.set(step.id, makeStepKey(index, step.operationId));
  });

  return {
    spec: {
      fileName: draft.specContext.document.originalPath.split('/').slice(-1)[0] ?? 'openapi.yaml',
      title: draft.specContext.document.name,
      version: draft.specContext.document.version
    },
    flows: [
      {
        name: draft.flow.name.trim(),
        type: 'smoke',
        steps: draft.flow.steps.map((step, index) => ({
          stepKey: makeStepKey(index, step.operationId),
          operationId: step.operationId,
          ...(step.name?.trim() ? { name: step.name.trim() } : {}),
          ...(step.description?.trim() ? { description: step.description.trim() } : {}),
          bindings: step.bindings.map((binding) => {
            if (binding.source === 'literal') {
              return {
                fieldKey: binding.fieldKey,
                source: binding.source,
                ...(binding.value ? { value: binding.value } : {})
              };
            }
            if (binding.source === 'prior_output') {
              return {
                fieldKey: binding.fieldKey,
                source: binding.source,
                ...(binding.sourceStepId && stepKeyById.get(binding.sourceStepId)
                  ? { sourceStepKey: stepKeyById.get(binding.sourceStepId) }
                  : {}),
                ...(binding.variable ? { variable: binding.variable } : {})
              };
            }
            return {
              fieldKey: binding.fieldKey,
              source: binding.source
            };
          }),
          extract: step.extract.map((entry) => ({
            variable: entry.variable,
            jsonPath: entry.jsonPath
          }))
        }))
      }
    ]
  };
}

export function exportManifestYaml(draft: Surface2DraftState): string {
  return stringify(toFlowManifest(draft), { lineWidth: 0 });
}
