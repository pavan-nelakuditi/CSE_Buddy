import type { SpecContext, SpecOperation, ResponseField } from '../../shared/surface1.js';
import type { AmbiguityChoice, AmbiguityPrompt, BindingConfig, DraftResolution, ExtractionConfig, FlowDefinition, FlowStep } from '../../shared/surface2.js';

type SourceCandidate = {
  stepId: string;
  stepLabel: string;
  operationId: string;
  responseField: ResponseField;
  variableName: string;
};

const EXCLUDED_KEYWORDS = ['admin', 'health', 'internal', 'toggle', 'reset', 'ops'];
const START_PREFIXES = ['create', 'start', 'submit', 'authorize', 'initiate'];
const SUPPORTING_READ_PREFIXES = ['get', 'fetch'];
const JOURNEY_STEP_LIMIT = 5;

function createFlowId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `flow-${Math.random().toString(36).slice(2, 10)}`;
}

function createStepId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `step-${Math.random().toString(36).slice(2, 10)}`;
}

function createExtractId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `extract-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeToken(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeToken(value)
    .split('-')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !['api', 'service', 'by', 'id'].includes(token));
}

function getPrimaryResource(operation: SpecOperation): string {
  const pathTokens = operation.path.split('/').filter(Boolean).filter((part) => !part.startsWith('{'));
  const tag = operation.tags[0];
  return normalizeToken(pathTokens[0] ?? tag ?? operation.operationId);
}

function isExcludedOperation(operation: SpecOperation): boolean {
  const haystack = `${operation.operationId} ${operation.path} ${operation.tags.join(' ')} ${operation.summary}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function isStartOperation(operation: SpecOperation): boolean {
  const lowered = operation.operationId.toLowerCase();
  return START_PREFIXES.some((prefix) => lowered.startsWith(prefix)) || operation.method === 'POST';
}

function isSupportingRead(operation: SpecOperation): boolean {
  const lowered = operation.operationId.toLowerCase();
  return operation.method === 'GET' && SUPPORTING_READ_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

function isIdLike(value: string): boolean {
  return /(id|uuid|token)$/i.test(value) || /\.id$/i.test(value) || /\$\.id$/i.test(value);
}

function createVariableName(operationId: string, field: ResponseField): string {
  const suffix = field.label.split('.').slice(-1)[0] ?? 'value';
  return `${operationId}.${suffix}`;
}

function scoreStartOperation(operation: SpecOperation): number {
  let score = 0;
  if (isExcludedOperation(operation)) score -= 1000;
  if (isStartOperation(operation)) score += 80;
  if (operation.method === 'POST') score += 25;
  if (operation.path.includes('{')) score -= 20;
  if (operation.tags.length > 0) score += 10;
  return score;
}

function scoreNextOperation(candidate: SpecOperation, previous: SpecOperation, chosen: SpecOperation[]): number {
  if (isExcludedOperation(candidate)) return -1000;
  if (chosen.some((operation) => operation.operationId === candidate.operationId)) return -1000;

  const previousResource = getPrimaryResource(previous);
  const candidateResource = getPrimaryResource(candidate);
  const candidateTokens = new Set([...tokenize(candidate.operationId), ...tokenize(candidate.summary), ...tokenize(candidate.path)]);
  const previousTokens = new Set([...tokenize(previous.operationId), ...tokenize(previous.summary), ...tokenize(previous.path)]);

  let sharedTokens = 0;
  for (const token of candidateTokens) {
    if (previousTokens.has(token)) {
      sharedTokens += 1;
    }
  }

  let score = sharedTokens * 18;
  if (candidateResource === previousResource) score += 40;
  if (candidate.method === 'GET' && candidate.path.includes('{')) score += 22;
  if (candidate.method === 'GET' && !candidate.path.includes('{')) score -= 24;
  if (candidate.method === 'POST') score += 20;
  if (candidate.method === 'PATCH' || candidate.method === 'PUT') score += 12;
  if (candidate.path.includes('{')) score += 10;
  if (candidate.operationId.toLowerCase().includes('list')) score -= 32;
  if (candidate.operationId.toLowerCase().includes('history')) score -= 10;
  return score;
}

function findSupportingRead(baseOperation: SpecOperation, operations: SpecOperation[], chosen: SpecOperation[]): SpecOperation | undefined {
  const baseResource = getPrimaryResource(baseOperation);
  return operations
    .filter((operation) => !chosen.some((entry) => entry.operationId === operation.operationId))
    .filter((operation) => operation.method === 'GET' && operation.path.includes('{'))
    .filter((operation) => getPrimaryResource(operation) === baseResource)
    .sort((left, right) => scoreNextOperation(right, baseOperation, chosen) - scoreNextOperation(left, baseOperation, chosen))[0];
}

function collectJourneyOperations(specContext: SpecContext): SpecOperation[] {
  const candidates = specContext.operations.filter((operation) => !isExcludedOperation(operation));
  const start = [...candidates].sort((left, right) => scoreStartOperation(right) - scoreStartOperation(left))[0];
  if (!start) {
    return [];
  }

  const chosen: SpecOperation[] = [start];
  const initialRead = findSupportingRead(start, candidates, chosen);
  if (initialRead) {
    chosen.push(initialRead);
  }

  while (chosen.length < JOURNEY_STEP_LIMIT) {
    const previous = chosen[chosen.length - 1] ?? start;
    const next = [...candidates]
      .map((operation) => ({ operation, score: scoreNextOperation(operation, previous, chosen) }))
      .filter((entry) => entry.score > 30)
      .sort((left, right) => right.score - left.score)[0]?.operation;

    if (!next) {
      break;
    }

    chosen.push(next);

    const supportingRead = findSupportingRead(next, candidates, chosen);
    if (supportingRead && chosen.length < JOURNEY_STEP_LIMIT) {
      chosen.push(supportingRead);
    }
  }

  return chosen;
}

function findBindingCandidates(fieldKey: string, stepCandidates: SourceCandidate[]): SourceCandidate[] {
  const normalizedKey = normalizeToken(fieldKey);
  const compactKey = normalizedKey.replace(/-/g, '');
  return stepCandidates.filter((candidate) => {
    const candidateLabel = normalizeToken(candidate.responseField.label);
    const candidatePath = normalizeToken(candidate.responseField.jsonPath);
    const candidateCompact = candidateLabel.replace(/-/g, '');
    if (candidateCompact === compactKey) return true;
    if (candidateCompact.endsWith(compactKey)) return true;
    if (compactKey.endsWith(candidateCompact)) return true;
    if (candidatePath.endsWith(normalizedKey)) return true;
    if (isIdLike(fieldKey) && isIdLike(candidate.responseField.label)) return true;
    return false;
  });
}

function buildAvailableCandidates(previousSteps: Array<{ step: FlowStep; operation: SpecOperation }>): SourceCandidate[] {
  return previousSteps.flatMap(({ step, operation }) =>
    step.extract
      .map((extract) => {
        const responseField = operation.responseFields.find((field) => field.jsonPath === extract.jsonPath);
        if (!responseField) {
          return undefined;
        }
        return {
          stepId: step.id,
          stepLabel: step.name?.trim() || operation.summary,
          operationId: operation.operationId,
          responseField,
          variableName: extract.variable
        };
      })
      .filter((candidate): candidate is SourceCandidate => Boolean(candidate))
  );
}

function ensureExtract(step: FlowStep, operation: SpecOperation, candidate: SourceCandidate): void {
  const exists = step.extract.some((extract) => extract.jsonPath === candidate.responseField.jsonPath);
  if (exists) {
    return;
  }
  step.extract.push({
    id: createExtractId(),
    variable: candidate.variableName,
    jsonPath: candidate.responseField.jsonPath
  });
}

function buildAmbiguityPrompt(
  targetOperation: SpecOperation,
  fieldKey: string,
  candidates: SourceCandidate[]
): AmbiguityPrompt {
  return {
    id: `${targetOperation.operationId}:${fieldKey}`,
    question: `Which prior output should supply "${fieldKey}" for ${targetOperation.operationId}?`,
    choices: candidates.map((candidate) => ({
      label: `${candidate.operationId} → ${candidate.responseField.label}`,
      reason: `${candidate.stepLabel} exposes ${candidate.responseField.jsonPath}, which looks compatible with ${fieldKey}.`,
      sourceOperationId: candidate.operationId,
      sourceFieldJsonPath: candidate.responseField.jsonPath,
      targetOperationId: targetOperation.operationId,
      targetFieldKey: fieldKey,
      variableName: candidate.variableName
    }))
  };
}

function buildBindingsForOperation(
  operation: SpecOperation,
  previousSteps: Array<{ step: FlowStep; operation: SpecOperation }>,
  overrides: Record<string, AmbiguityChoice>
): { bindings: BindingConfig[]; prompt?: AmbiguityPrompt } {
  const bindings: BindingConfig[] = [];
  const availableCandidates = buildAvailableCandidates(previousSteps);

  for (const field of operation.fields) {
    const overrideKey = `${operation.operationId}:${field.key}`;
    const candidates = findBindingCandidates(field.key, availableCandidates);
    const shouldPreferPriorOutput = field.location === 'path' || isIdLike(field.key);

    if (candidates.length > 1 && !overrides[overrideKey]) {
      return { bindings, prompt: buildAmbiguityPrompt(operation, field.key, candidates) };
    }

    if (overrides[overrideKey]) {
      const override = overrides[overrideKey];
      const chosenCandidate = candidates.find(
        (candidate) =>
          candidate.operationId === override.sourceOperationId &&
          candidate.responseField.jsonPath === override.sourceFieldJsonPath
      );
      if (chosenCandidate) {
        const sourceStep = previousSteps.find((entry) => entry.step.id === chosenCandidate.stepId);
        if (sourceStep) {
          ensureExtract(sourceStep.step, sourceStep.operation, chosenCandidate);
        }
        bindings.push({
          fieldKey: field.key,
          source: 'prior_output',
          sourceStepId: chosenCandidate.stepId,
          variable: chosenCandidate.variableName
        });
        continue;
      }
    }

    if (candidates.length === 1 && shouldPreferPriorOutput) {
      const chosenCandidate = candidates[0];
      const sourceStep = previousSteps.find((entry) => entry.step.id === chosenCandidate.stepId);
      if (sourceStep) {
        ensureExtract(sourceStep.step, sourceStep.operation, chosenCandidate);
      }
      bindings.push({
        fieldKey: field.key,
        source: 'prior_output',
        sourceStepId: chosenCandidate.stepId,
        variable: chosenCandidate.variableName
      });
      continue;
    }

    if (field.example) {
      bindings.push({
        fieldKey: field.key,
        source: 'example'
      });
      continue;
    }

    if (candidates.length === 1) {
      const chosenCandidate = candidates[0];
      const sourceStep = previousSteps.find((entry) => entry.step.id === chosenCandidate.stepId);
      if (sourceStep) {
        ensureExtract(sourceStep.step, sourceStep.operation, chosenCandidate);
      }
      bindings.push({
        fieldKey: field.key,
        source: 'prior_output',
        sourceStepId: chosenCandidate.stepId,
        variable: chosenCandidate.variableName
      });
      continue;
    }

    bindings.push({
      fieldKey: field.key,
      source: 'example'
    });
  }

  return { bindings };
}

export function generateDraftFlow(specContext: SpecContext, overrides: Record<string, AmbiguityChoice> = {}): DraftResolution {
  const journeyOperations = collectJourneyOperations(specContext);
  if (journeyOperations.length === 0) {
    return { overrides };
  }

  const flow: FlowDefinition = {
    id: createFlowId(),
    name: `${specContext.document.name} happy path`,
    type: 'smoke',
    steps: []
  };

  const previousSteps: Array<{ step: FlowStep; operation: SpecOperation }> = [];

  for (const operation of journeyOperations) {
    const step: FlowStep = {
      id: createStepId(),
      operationId: operation.operationId,
      name: operation.summary,
      description: operation.description,
      bindings: [],
      extract: operation.responseFields
        .filter((field) => isIdLike(field.label) || field.jsonPath === '$.id')
        .slice(0, 2)
        .map((field) => ({
          id: createExtractId(),
          variable: createVariableName(operation.operationId, field),
          jsonPath: field.jsonPath
        }))
    };

    const bindingResult = buildBindingsForOperation(operation, previousSteps, overrides);
    if (bindingResult.prompt) {
      return {
        overrides,
        pendingAmbiguity: bindingResult.prompt
      };
    }

    step.bindings = bindingResult.bindings;
    previousSteps.push({ step, operation });
    flow.steps.push(step);
  }

  return {
    flow,
    overrides
  };
}
