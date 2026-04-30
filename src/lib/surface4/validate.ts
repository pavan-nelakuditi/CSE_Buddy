import type { SpecContext } from '../../shared/surface1.js';
import type { CICDConfig } from '../../shared/surface3.js';

export function validateSurface4Inputs(specContext: SpecContext, config: CICDConfig): string[] {
  const errors: string[] = [];

  if (config.serviceKey !== specContext.serviceKey) {
    errors.push('Surface 4 config does not belong to the selected service.');
  }

  if (config.ciProvider !== 'github') {
    errors.push('Surface 4 currently supports GitHub only.');
  }

  if (!config.flowPath.trim()) {
    errors.push('Surface 3 config is missing a flow path.');
  }

  if (config.environments.length === 0) {
    errors.push('Surface 3 config must include at least one environment.');
  }

  for (const environment of config.environments) {
    if (!environment.baseUrl.trim()) {
      errors.push(`Environment ${environment.slug} is missing a runtime URL.`);
    }
  }

  return errors;
}
