import { describe, expect, it } from 'vitest';

import { renderPrValidationWorkflow } from '../src/lib/surface4/templates/pr-validation.js';
import { renderSetupDoc } from '../src/lib/surface4/templates/setup-doc.js';
import { renderSmokeFlowOnboardingWorkflow } from '../src/lib/surface4/templates/smoke-flow-onboarding.js';
import type { CICDConfig } from '../src/shared/surface3.js';

const CICD_CONFIG: CICDConfig = {
  serviceKey: 'payments',
  ciProvider: 'github',
  sourceSpecPath: '/tmp/spec.yaml',
  flowPath: '/tmp/flow.yaml',
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
  environments: [
    { slug: 'dev', label: 'Dev', baseUrl: 'https://dev-api.example.com' },
    { slug: 'prod', label: 'Prod', baseUrl: 'https://api.example.com' }
  ],
  onboardingActionInputs: {
    environmentsJson: ['dev', 'prod'],
    envRuntimeUrlsJson: {
      dev: 'https://dev-api.example.com',
      prod: 'https://api.example.com'
    },
    governanceMappingJson: {
      payments: 'Payments Governance'
    }
  },
  governance: {
    domain: 'payments',
    groupName: 'Payments Governance'
  }
};

describe('Surface 4 templates', () => {
  it('renders the PR validation workflow with governance gate steps', () => {
    const content = renderPrValidationWorkflow({ repoSpecPath: 'api/openapi.yaml' });

    expect(content).toContain('name: Postman PR Validation');
    expect(content).toContain('postman spec lint api/openapi.yaml');
    expect(content).toContain('Summarize governance results');
    expect(content).toContain('Enforce governance gate');
  });

  it('renders the smoke-flow onboarding workflow with dispatch defaults and JSON inputs', () => {
    const content = renderSmokeFlowOnboardingWorkflow({
      config: CICD_CONFIG,
      repoSpecPath: 'api/openapi.yaml',
      repoFlowPath: '.cse-buddy/flows/payments/flow.yaml'
    });

    expect(content).toContain('name: Postman Smoke Flow Onboarding');
    expect(content).toContain('repo_write_mode');
    expect(content).toContain("default: commit-only");
    expect(content).toContain("collection_sync_mode");
    expect(content).toContain("environments-json: '[\"dev\",\"prod\"]'");
    expect(content).toContain("governance-mapping-json: '{\"payments\":\"Payments Governance\"}'");
    expect(content).toContain('uses: pavan-nelakuditi/postman-smoke-flow-action@main');
  });

  it('renders the setup doc with configured environments', () => {
    const content = renderSetupDoc({
      serviceName: 'Payments API',
      repoSpecPath: 'api/openapi.yaml',
      repoFlowPath: '.cse-buddy/flows/payments/flow.yaml',
      config: CICD_CONFIG
    });

    expect(content).toContain('# Payments API Postman Onboarding Bundle');
    expect(content).toContain('`POSTMAN_API_KEY`');
    expect(content).toContain('`dev`: https://dev-api.example.com');
    expect(content).toContain('`prod`: https://api.example.com');
    expect(content).toContain('## Recommended First Run');
    expect(content).toContain('## Troubleshooting');
    expect(content).toContain('repo_write_mode=commit-only');
  });
});
