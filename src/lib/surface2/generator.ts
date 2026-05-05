import type { OperationField, ResponseField, SpecContext, SpecOperation } from '../../shared/surface1.js';
import type {
  AmbiguityChoice,
  AmbiguityPrompt,
  BindingConfig,
  DraftResolution,
  FlowDefinition,
  FlowDetectionReason,
  FlowStep
} from '../../shared/surface2.js';

type MatchConfidence = FlowDetectionReason['confidence'];

type SourceCandidate = {
  stepId: string;
  stepLabel: string;
  operationId: string;
  responseField: ResponseField;
  variableName: string;
  score: number;
  confidence: MatchConfidence;
  message: string;
};

type DependencyEdge = {
  sourceOperationId: string;
  targetOperationId: string;
  score: number;
  confidence: MatchConfidence;
  message: string;
  targetFieldKey: string;
  responseField: ResponseField;
};

const EXCLUDED_KEYWORDS = ['admin', 'health', 'internal', 'toggle', 'reset', 'ops'];
const EXCLUDED_METHODS = ['HEAD', 'OPTIONS', 'TRACE', 'DELETE'];
const START_PREFIXES = ['create', 'start', 'submit', 'authorize', 'initiate'];
const LARGE_SERVICE_STEP_LIMIT = 5;
const SMALL_SERVICE_OPERATION_LIMIT = 8;
const MIN_EDGE_SCORE = 80;
const CLOSE_MATCH_DELTA = 12;
const LOW_VALUE_FIELD_TOKENS = new Set(['api', 'service', 'by', 'id', 'the', 'a', 'an', 'request', 'response']);

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

function compact(value: string): string {
  return normalizeToken(value).replace(/-/g, '');
}

function tokenize(value: string): string[] {
  return normalizeToken(value)
    .split('-')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !LOW_VALUE_FIELD_TOKENS.has(token));
}

function lastSegment(value: string): string {
  return value.split(/[.[\]]+/).filter(Boolean).slice(-1)[0] ?? value;
}

function getPrimaryResource(operation: SpecOperation): string {
  const pathTokens = operation.path.split('/').filter(Boolean).filter((part) => !part.startsWith('{'));
  const tag = operation.tags[0];
  return normalizeToken(pathTokens[0] ?? tag ?? operation.operationId);
}

function isExcludedOperation(operation: SpecOperation): boolean {
  if (EXCLUDED_METHODS.includes(operation.method.toUpperCase())) {
    return true;
  }
  const haystack = `${operation.operationId} ${operation.path} ${operation.tags.join(' ')} ${operation.summary}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function isStartOperation(operation: SpecOperation): boolean {
  const lowered = operation.operationId.toLowerCase();
  return START_PREFIXES.some((prefix) => lowered.startsWith(prefix)) || operation.method === 'POST';
}

function isIdLike(value: string): boolean {
  return /(id|uuid|token|number|key|code)$/i.test(value) || /\.id$/i.test(value) || /\$\.id$/i.test(value);
}

function createVariableName(operationId: string, field: ResponseField): string {
  const suffix = lastSegment(field.label) || lastSegment(field.key) || 'value';
  return `${operationId}.${suffix}`;
}

function confidenceForScore(score: number): MatchConfidence {
  if (score >= 95) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function scoreStartOperation(operation: SpecOperation, outgoingEdges: DependencyEdge[]): number {
  let score = 0;
  if (isExcludedOperation(operation)) score -= 1000;
  if (isStartOperation(operation)) score += 90;
  if (operation.method === 'POST') score += 30;
  if (operation.method === 'PATCH' || operation.method === 'PUT') score += 8;
  if (operation.path.includes('{')) score -= 25;
  if (operation.tags.length > 0) score += 8;

  const bestOutgoingEdge = outgoingEdges
    .filter((edge) => edge.sourceOperationId === operation.operationId)
    .sort((left, right) => right.score - left.score)[0];
  if (bestOutgoingEdge) {
    score += Math.min(bestOutgoingEdge.score, 140);
  }

  return score;
}

function scoreFieldMatch(requestField: OperationField, responseField: ResponseField): number {
  const requestVariants = [
    requestField.key,
    requestField.label,
    lastSegment(requestField.key),
    lastSegment(requestField.label)
  ].map(compact);
  const responseVariants = [
    responseField.key,
    responseField.label,
    responseField.jsonPath,
    lastSegment(responseField.key),
    lastSegment(responseField.label),
    lastSegment(responseField.jsonPath)
  ].map(compact);

  let score = 0;
  if (requestVariants.some((request) => responseVariants.includes(request))) {
    score += 92;
  }
  if (
    requestVariants.some((request) =>
      responseVariants.some((response) => request.length > 2 && response.length > 2 && (request.endsWith(response) || response.endsWith(request)))
    )
  ) {
    score += 58;
  }
  if (isIdLike(requestField.key) && responseVariants.some((variant) => isIdLike(variant))) {
    score += 24;
  }

  const requestTokens = new Set([...tokenize(requestField.key), ...tokenize(requestField.label)]);
  const responseTokens = new Set([...tokenize(responseField.key), ...tokenize(responseField.label), ...tokenize(responseField.jsonPath)]);
  let sharedTokens = 0;
  for (const token of requestTokens) {
    if (responseTokens.has(token)) {
      sharedTokens += 1;
    }
  }
  score += sharedTokens * 16;

  if (requestField.location === 'path') score += 28;
  if (requestField.location === 'query') score += 10;
  if (requestField.required) score += 12;
  if (requestField.type && responseField.type && requestField.type === responseField.type) score += 6;

  return score;
}

function createMatchMessage(source: SpecOperation, target: SpecOperation, requestField: OperationField, responseField: ResponseField): string {
  return `${source.operationId} returns ${responseField.label} (${responseField.jsonPath}), which can satisfy ${target.operationId} ${requestField.location} field ${requestField.key}.`;
}

function getBestFieldMatch(source: SpecOperation, target: SpecOperation, requestField: OperationField): SourceCandidate | undefined {
  const best = source.responseFields
    .map((responseField) => {
      const score = scoreFieldMatch(requestField, responseField);
      return {
        stepId: '',
        stepLabel: source.summary,
        operationId: source.operationId,
        responseField,
        variableName: createVariableName(source.operationId, responseField),
        score,
        confidence: confidenceForScore(score),
        message: createMatchMessage(source, target, requestField, responseField)
      };
    })
    .filter((candidate) => candidate.score >= 45)
    .sort((left, right) => right.score - left.score)[0];

  return best;
}

function scoreOperationRelationship(source: SpecOperation, target: SpecOperation): number {
  let score = 0;
  const sameResource = getPrimaryResource(source) === getPrimaryResource(target);
  if (sameResource) score += 42;
  if (source.method === 'POST' && target.method === 'GET' && target.path.includes('{')) score += 32;
  if (source.method === 'POST' && target.path.includes('{')) score += 12;
  if (target.method === 'GET' && !target.path.includes('{')) score -= 35;
  if (target.operationId.toLowerCase().includes('list')) score -= 40;

  const sourceTokens = new Set([...tokenize(source.operationId), ...tokenize(source.summary), ...tokenize(source.path)]);
  const targetTokens = new Set([...tokenize(target.operationId), ...tokenize(target.summary), ...tokenize(target.path)]);
  for (const token of targetTokens) {
    if (sourceTokens.has(token)) {
      score += 10;
    }
  }

  return score;
}

function buildDependencyEdges(operations: SpecOperation[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (const source of operations) {
    for (const target of operations) {
      if (source.operationId === target.operationId || isExcludedOperation(source) || isExcludedOperation(target)) {
        continue;
      }

      const requiredOrAddressingFields = target.fields.filter(
        (field) => field.required || field.location === 'path' || field.location === 'query' || isIdLike(field.key)
      );
      const matches = requiredOrAddressingFields
        .map((field) => ({ field, match: getBestFieldMatch(source, target, field) }))
        .filter((entry): entry is { field: OperationField; match: SourceCandidate } => Boolean(entry.match))
        .sort((left, right) => right.match.score - left.match.score);
      const bestMatch = matches[0];
      if (!bestMatch) {
        continue;
      }

      const relationshipScore = scoreOperationRelationship(source, target);
      const score = bestMatch.match.score + relationshipScore;
      if (score < 55) {
        continue;
      }

      edges.push({
        sourceOperationId: source.operationId,
        targetOperationId: target.operationId,
        score,
        confidence: confidenceForScore(score),
        message: bestMatch.match.message,
        targetFieldKey: bestMatch.field.key,
        responseField: bestMatch.match.responseField
      });
    }
  }

  return edges.sort((left, right) => right.score - left.score);
}

function collectJourneyOperations(specContext: SpecContext): SpecOperation[] {
  const candidates = specContext.operations.filter((operation) => !isExcludedOperation(operation));
  const journeyStepLimit = candidates.length <= SMALL_SERVICE_OPERATION_LIMIT ? candidates.length : LARGE_SERVICE_STEP_LIMIT;
  const operationById = new Map(candidates.map((operation) => [operation.operationId, operation]));
  const edges = buildDependencyEdges(candidates);
  const start = [...candidates].sort((left, right) => scoreStartOperation(right, edges) - scoreStartOperation(left, edges))[0];
  if (!start) {
    return [];
  }

  const chosen: SpecOperation[] = [start];
  const chosenIds = new Set([start.operationId]);

  while (chosen.length < journeyStepLimit) {
    const nextEdge = edges
      .filter((edge) => chosenIds.has(edge.sourceOperationId) && !chosenIds.has(edge.targetOperationId))
      .filter((edge) => edge.score >= MIN_EDGE_SCORE)
      .sort((left, right) => {
        const currentSourceBonus = left.sourceOperationId === chosen[chosen.length - 1]?.operationId ? 12 : 0;
        const otherCurrentSourceBonus = right.sourceOperationId === chosen[chosen.length - 1]?.operationId ? 12 : 0;
        return right.score + otherCurrentSourceBonus - (left.score + currentSourceBonus);
      })[0];

    if (!nextEdge) {
      break;
    }

    const next = operationById.get(nextEdge.targetOperationId);
    if (!next) {
      break;
    }

    chosen.push(next);
    chosenIds.add(next.operationId);
  }

  return chosen;
}

function findBindingCandidates(field: OperationField, previousSteps: Array<{ step: FlowStep; operation: SpecOperation }>, targetOperation: SpecOperation): SourceCandidate[] {
  return previousSteps
    .flatMap(({ step, operation }) =>
      operation.responseFields.map((responseField) => {
        const score = scoreFieldMatch(field, responseField) + scoreOperationRelationship(operation, targetOperation);
        return {
          stepId: step.id,
          stepLabel: step.name?.trim() || operation.summary,
          operationId: operation.operationId,
          responseField,
          variableName: createVariableName(operation.operationId, responseField),
          score,
          confidence: confidenceForScore(score),
          message: createMatchMessage(operation, targetOperation, field, responseField)
        };
      })
    )
    .filter((candidate) => candidate.score >= 50)
    .sort((left, right) => right.score - left.score);
}

function ensureExtract(step: FlowStep, candidate: SourceCandidate, reason: FlowDetectionReason): void {
  const exists = step.extract.some((extract) => extract.jsonPath === candidate.responseField.jsonPath);
  if (exists) {
    return;
  }
  step.extract.push({
    id: createExtractId(),
    variable: candidate.variableName,
    jsonPath: candidate.responseField.jsonPath,
    detectionReason: reason
  });
}

function buildAmbiguityPrompt(targetOperation: SpecOperation, fieldKey: string, candidates: SourceCandidate[]): AmbiguityPrompt {
  return {
    id: `${targetOperation.operationId}:${fieldKey}`,
    question: `Which prior output should supply "${fieldKey}" for ${targetOperation.operationId}?`,
    choices: candidates.slice(0, 4).map((candidate) => ({
      source: 'prior_output',
      label: `${candidate.operationId} -> ${candidate.responseField.label}`,
      reason: candidate.message,
      sourceOperationId: candidate.operationId,
      sourceFieldJsonPath: candidate.responseField.jsonPath,
      targetOperationId: targetOperation.operationId,
      targetFieldKey: fieldKey,
      variableName: candidate.variableName
    }))
  };
}

function createFallbackReason(operation: SpecOperation, field: OperationField): FlowDetectionReason {
  return {
    type: 'fallback_example',
    confidence: field.example ? 'medium' : 'low',
    message: field.example
      ? `${operation.operationId}.${field.key} uses the example value from the OpenAPI schema.`
      : `${operation.operationId}.${field.key} has no detected prior output, so Surface 2 will rely on an editable example value.`
  };
}

function createDataDependencyReason(candidate: SourceCandidate): FlowDetectionReason {
  return {
    type: 'data_dependency',
    confidence: candidate.confidence,
    message: candidate.message
  };
}

function buildBindingsForOperation(
  operation: SpecOperation,
  previousSteps: Array<{ step: FlowStep; operation: SpecOperation }>,
  overrides: Record<string, AmbiguityChoice>
): { bindings: BindingConfig[]; prompt?: AmbiguityPrompt } {
  const bindings: BindingConfig[] = [];

  for (const field of operation.fields) {
    const overrideKey = `${operation.operationId}:${field.key}`;
    const candidates = findBindingCandidates(field, previousSteps, operation);
    const best = candidates[0];
    const second = candidates[1];
    const hasCloseAmbiguity = Boolean(best && second && best.score - second.score <= CLOSE_MATCH_DELTA);

    if (hasCloseAmbiguity && !overrides[overrideKey]) {
      return { bindings, prompt: buildAmbiguityPrompt(operation, field.key, candidates) };
    }

    const override = overrides[overrideKey];
    if (override?.source === 'example') {
      bindings.push({
        fieldKey: field.key,
        source: 'example',
        detectionReason: createFallbackReason(operation, field)
      });
      continue;
    }

    const chosenCandidate = override
      ? candidates.find(
          (candidate) =>
            candidate.operationId === override.sourceOperationId &&
            candidate.responseField.jsonPath === override.sourceFieldJsonPath
        )
      : best;

    if (chosenCandidate && (field.required || field.location === 'path' || field.location === 'query' || chosenCandidate.score >= 85)) {
      const sourceStep = previousSteps.find((entry) => entry.step.id === chosenCandidate.stepId);
      const reason = createDataDependencyReason(chosenCandidate);
      if (sourceStep) {
        ensureExtract(sourceStep.step, chosenCandidate, reason);
      }
      bindings.push({
        fieldKey: field.key,
        source: 'prior_output',
        sourceStepId: chosenCandidate.stepId,
        variable: chosenCandidate.variableName,
        detectionReason: reason
      });
      continue;
    }

    bindings.push({
      fieldKey: field.key,
      source: 'example',
      detectionReason: createFallbackReason(operation, field)
    });
  }

  return { bindings };
}

function createStepForOperation(operation: SpecOperation, index: number): FlowStep {
  const startReason: FlowDetectionReason =
    index === 0
      ? {
          type: 'start_operation',
          confidence: isStartOperation(operation) ? 'high' : 'medium',
          message: `${operation.operationId} is the best smoke-flow start because it looks like a customer-facing write operation.`
        }
      : {
          type: 'data_dependency',
          confidence: 'medium',
          message: `${operation.operationId} was selected because earlier responses appear to satisfy its request inputs.`
        };

  return {
    id: createStepId(),
    operationId: operation.operationId,
    name: operation.summary,
    description: operation.description,
    bindings: [],
    extract: [],
    detectionReasons: [startReason]
  };
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

  for (const [index, operation] of journeyOperations.entries()) {
    const step = createStepForOperation(operation, index);
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

  flow.detectionScore = flow.steps.reduce(
    (score, step) => score + step.bindings.filter((binding) => binding.source === 'prior_output').length * 25 - step.bindings.filter((binding) => binding.source === 'example').length * 3,
    0
  );

  return {
    flow,
    overrides
  };
}
