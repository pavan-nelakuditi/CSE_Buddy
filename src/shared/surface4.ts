import type { SpecContext } from './surface1.js';
import type { CICDConfig } from './surface3.js';

export type Surface4GenerationSummary = {
  serviceKey: string;
  generatedAt: string;
  files: string[];
  workflowPaths: string[];
  setupDocPath: string;
  generatedRoot: string;
  generatedSpecPath: string;
  generatedFlowPath: string;
};

export type LoadSurface4StateInput = {
  serviceKey: string;
  flowPath: string;
};

export type Surface4LoadStateResult = {
  flowExists: boolean;
  configExists: boolean;
  config?: CICDConfig;
  configPath?: string;
  generatedRoot: string;
  generatedSpecPath: string;
  generatedFlowPath: string;
  expectedFiles: string[];
  summary?: Surface4GenerationSummary;
  summaryPath?: string;
};

export type GenerateSurface4ArtifactsInput = {
  specContext: SpecContext;
  config: CICDConfig;
};

export type GenerateSurface4ArtifactsResult = {
  summaryPath: string;
  summary: Surface4GenerationSummary;
};

export type Surface4Api = {
  loadState: (input: LoadSurface4StateInput) => Promise<Surface4LoadStateResult>;
  generateArtifacts: (input: GenerateSurface4ArtifactsInput) => Promise<GenerateSurface4ArtifactsResult>;
  revealBundle: (serviceKey: string) => Promise<void>;
  openReadme: (serviceKey: string) => Promise<void>;
};

declare global {
  interface Window {
    surface4: Surface4Api;
  }
}
