import type { SpecContext } from '../../shared/surface1.js';
import type { CICDConfig, EnvironmentRuntime, GovernanceConfig } from '../../shared/surface3.js';

export const DEFAULT_ENVIRONMENT_ORDER = ['dev', 'test', 'stage', 'prod'] as const;

export function formatEnvironmentLabel(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function getSurface2FlowPath(specContext: SpecContext): string {
  const marker = '/.cse-buddy/';
  const markerIndex = specContext.document.normalizedPath.indexOf(marker);

  if (markerIndex >= 0) {
    const workspaceRoot = specContext.document.normalizedPath.slice(0, markerIndex);
    return `${workspaceRoot}/.cse-buddy/surface2/${specContext.serviceKey}/flow.yaml`;
  }

  return specContext.document.normalizedPath.replace(
    /normalized\/openapi\.yaml$/,
    '../../surface2/' + specContext.serviceKey + '/flow.yaml'
  );
}

export function buildCicdConfig(
  specContext: SpecContext,
  environments: EnvironmentRuntime[],
  governance?: GovernanceConfig
): CICDConfig {
  const environmentsJson = environments.map((environment) => environment.slug);
  const envRuntimeUrlsJson = Object.fromEntries(
    environments.map((environment) => [environment.slug, environment.baseUrl])
  );

  return {
    serviceKey: specContext.serviceKey,
    ciProvider: 'github',
    sourceSpecPath: specContext.document.normalizedPath,
    flowPath: getSurface2FlowPath(specContext),
    prStrategy: {
      runSpecLint: true,
      runGovernanceChecks: true,
      blockOnFailure: true
    },
    mergeStrategy: {
      targetBranch: 'main',
      trigger: 'merge_to_main',
      runFullOnboarding: true
    },
    environments,
    onboardingActionInputs: {
      environmentsJson,
      envRuntimeUrlsJson,
      ...(governance ? { governanceMappingJson: { [governance.domain]: governance.groupName } } : {})
    },
    ...(governance ? { governance } : {})
  };
}

export function validateEnvironmentSelection(selectedEnvironments: string[]): string[] {
  if (selectedEnvironments.length === 0) {
    return ['Choose at least one environment for Surface 3.'];
  }

  const unique = new Set(selectedEnvironments);
  if (unique.size !== selectedEnvironments.length) {
    return ['Each environment can only be selected once.'];
  }

  return [];
}

export function validateEnvironmentRuntimes(environments: EnvironmentRuntime[]): string[] {
  const errors: string[] = [];
  for (const environment of environments) {
    if (!environment.baseUrl.trim()) {
      errors.push(`Add a runtime URL for ${environment.slug}.`);
      continue;
    }

    try {
      const parsed = new URL(environment.baseUrl);
      if (!parsed.protocol.startsWith('http')) {
        errors.push(`${environment.slug} must use an http or https URL.`);
      }
    } catch {
      errors.push(`${environment.slug} must be a valid URL.`);
    }
  }
  return errors;
}

export function validateGovernance(governanceEnabled: boolean, governance?: GovernanceConfig): string[] {
  if (!governanceEnabled) {
    return [];
  }

  const errors: string[] = [];
  if (!governance?.domain.trim()) {
    errors.push('Add a domain key before saving governance mapping.');
  }
  if (!governance?.groupName.trim()) {
    errors.push('Add a governance group name before saving governance mapping.');
  }
  return errors;
}
