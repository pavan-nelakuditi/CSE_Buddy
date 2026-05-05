import type { SpecContext } from './surface1.js';

export type FlowType = 'smoke';

export type BindingSource = 'example' | 'literal' | 'prior_output';

export type FlowDetectionReason = {
  type: 'start_operation' | 'supporting_read' | 'data_dependency' | 'fallback_example';
  confidence: 'high' | 'medium' | 'low';
  message: string;
};

export type BindingConfig = {
  fieldKey: string;
  source: BindingSource;
  value?: string;
  sourceStepId?: string;
  variable?: string;
  detectionReason?: FlowDetectionReason;
};

export type ExtractionConfig = {
  id: string;
  variable: string;
  jsonPath: string;
  detectionReason?: FlowDetectionReason;
};

export type FlowStep = {
  id: string;
  operationId: string;
  name?: string;
  description?: string;
  bindings: BindingConfig[];
  extract: ExtractionConfig[];
  detectionReasons?: FlowDetectionReason[];
};

export type FlowDefinition = {
  id: string;
  name: string;
  type: FlowType;
  steps: FlowStep[];
  detectionScore?: number;
};

export type AmbiguityChoice = {
  label: string;
  reason: string;
  sourceOperationId: string;
  sourceFieldJsonPath: string;
  targetOperationId: string;
  targetFieldKey: string;
  variableName: string;
};

export type AmbiguityPrompt = {
  id: string;
  question: string;
  choices: AmbiguityChoice[];
};

export type DraftResolution = {
  flow?: FlowDefinition;
  pendingAmbiguity?: AmbiguityPrompt;
  overrides: Record<string, AmbiguityChoice>;
};

export type Surface2DraftState = {
  specContext: SpecContext;
  flow: FlowDefinition;
  overrides: Record<string, AmbiguityChoice>;
};

export type FlowManifest = {
  spec: {
    fileName: string;
    title: string;
    version: string;
  };
  flows: Array<{
    name: string;
    type: FlowType;
    steps: Array<{
      stepKey: string;
      operationId: string;
      name?: string;
      description?: string;
      bindings: Array<{
        fieldKey: string;
        source: BindingSource;
        value?: string;
        sourceStepKey?: string;
        variable?: string;
      }>;
      extract: Array<{
        variable: string;
        jsonPath: string;
      }>;
    }>;
  }>;
};

export type SaveSurface2DraftInput = {
  draft: Surface2DraftState;
};

export type ExportSurface2FlowInput = {
  draft: Surface2DraftState;
  manifestYaml: string;
};

export type Surface2PersistenceResult = {
  draftPath: string;
  manifestPath?: string;
};

export type Surface2Api = {
  saveDraft: (input: SaveSurface2DraftInput) => Promise<Surface2PersistenceResult>;
  exportFlow: (input: ExportSurface2FlowInput) => Promise<Surface2PersistenceResult>;
};

declare global {
  interface Window {
    surface2: Surface2Api;
  }
}
