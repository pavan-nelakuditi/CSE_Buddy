export type EnvironmentSlug = 'dev' | 'test' | 'stage' | 'prod';

export type EnvironmentRuntime = {
  slug: string;
  label: string;
  baseUrl: string;
};

export type GovernanceConfig = {
  domain: string;
  groupName: string;
};

export type CICDConfig = {
  serviceKey: string;
  ciProvider: 'github';
  sourceSpecPath: string;
  flowPath: string;
  prStrategy: {
    runSpecLint: true;
    runGovernanceChecks: true;
    blockOnFailure: true;
  };
  mergeStrategy: {
    targetBranch: 'main';
    trigger: 'merge_to_main';
    runFullOnboarding: true;
  };
  environments: EnvironmentRuntime[];
  onboardingActionInputs: {
    environmentsJson: string[];
    envRuntimeUrlsJson: Record<string, string>;
    governanceMappingJson?: Record<string, string>;
  };
  governance?: GovernanceConfig;
};

export type SaveSurface3ConfigInput = {
  config: CICDConfig;
};

export type LoadSurface3StateInput = {
  serviceKey: string;
  flowPath: string;
};

export type Surface3PersistenceResult = {
  configPath: string;
};

export type Surface3LoadStateResult = {
  config?: CICDConfig;
  configPath?: string;
  flowExists: boolean;
};

export type Surface3Api = {
  loadState: (input: LoadSurface3StateInput) => Promise<Surface3LoadStateResult>;
  saveConfig: (input: SaveSurface3ConfigInput) => Promise<Surface3PersistenceResult>;
};

declare global {
  interface Window {
    surface3: Surface3Api;
  }
}
