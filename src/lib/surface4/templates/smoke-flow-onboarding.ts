import type { CICDConfig } from '../../../shared/surface3.js';

type TemplateInput = {
  config: CICDConfig;
  repoSpecPath: string;
  repoFlowPath: string;
};

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function renderGovernanceLine(config: CICDConfig): string {
  if (!config.onboardingActionInputs.governanceMappingJson) {
    return '';
  }

  return `          governance-mapping-json: '${serializeJson(config.onboardingActionInputs.governanceMappingJson)}'\n`;
}

export function renderSmokeFlowOnboardingWorkflow(input: TemplateInput): string {
  const governanceLine = renderGovernanceLine(input.config);
  return `name: Postman Smoke Flow Onboarding

on:
  workflow_dispatch:
    inputs:
      requester_email:
        description: Requester email for workspace membership
        required: false
        default: owner@example.com
        type: string
      repo_write_mode:
        description: How repo-sync should write generated artifacts
        required: true
        default: commit-only
        type: choice
        options:
          - commit-only
          - commit-and-push
      collection_sync_mode:
        description: Collection lifecycle policy
        required: true
        default: refresh
        type: choice
        options:
          - refresh
          - version
  push:
    branches:
      - ${input.config.mergeStrategy.targetBranch}
    paths-ignore:
      - '.postman/**'
      - 'postman/**'
      - 'README.md'

jobs:
  onboarding:
    runs-on: ubuntu-latest
    permissions:
      actions: write
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Resolve existing Postman resource IDs
        id: postman_resources
        run: |
          ruby <<'RUBY'
          require 'yaml'

          output_path = ENV.fetch('GITHUB_OUTPUT')
          outputs = {
            'workspace_id' => '',
            'spec_id' => '',
            'baseline_collection_id' => '',
            'smoke_collection_id' => '',
            'contract_collection_id' => ''
          }

          resources_path = '.postman/resources.yaml'
          if File.exist?(resources_path)
            resources = YAML.load_file(resources_path) || {}
            cloud_resources = resources['cloudResources'] || {}
            collections = cloud_resources['collections'] || {}
            specs = cloud_resources['specs'] || {}

            outputs['workspace_id'] = String((resources['workspace'] || {})['id'] || '')
            outputs['spec_id'] = String(specs.values.first || '')

            collections.each do |file_path, uid|
              value = String(uid || '')
              outputs['baseline_collection_id'] = value if outputs['baseline_collection_id'].empty? && file_path.include?('[Baseline]')
              outputs['smoke_collection_id'] = value if outputs['smoke_collection_id'].empty? && file_path.include?('[Smoke]')
              outputs['contract_collection_id'] = value if outputs['contract_collection_id'].empty? && file_path.include?('[Contract]')
            end
          end

          File.open(output_path, 'a') do |file|
            outputs.each do |key, value|
              file.puts("\#{key}=\#{String(value).gsub("\\n", '%0A')}")
            end
          end
          RUBY

      - id: bootstrap
        name: Bootstrap Postman assets
        uses: postman-cs/postman-bootstrap-action@main
        with:
          project-name: \${{ github.event.repository.name }}
          workspace-id: \${{ steps.postman_resources.outputs.workspace_id }}
          spec-id: \${{ steps.postman_resources.outputs.spec_id }}
          baseline-collection-id: \${{ steps.postman_resources.outputs.baseline_collection_id }}
          smoke-collection-id: \${{ steps.postman_resources.outputs.smoke_collection_id }}
          contract-collection-id: \${{ steps.postman_resources.outputs.contract_collection_id }}
          collection-sync-mode: \${{ github.event.inputs.collection_sync_mode || 'refresh' }}
          spec-sync-mode: update
          spec-path: ${input.repoSpecPath}
          spec-url: https://raw.githubusercontent.com/\${{ github.repository }}/\${{ github.sha }}/${input.repoSpecPath}
          domain: ${input.config.governance?.domain ?? 'service-domain'}
          domain-code: ${input.config.governance?.domain.slice(0, 8).toUpperCase() ?? 'SERVICE'}
          requester-email: \${{ github.event.inputs.requester_email || 'owner@example.com' }}
${governanceLine}          postman-api-key: \${{ secrets.POSTMAN_API_KEY }}
          postman-access-token: \${{ secrets.POSTMAN_ACCESS_TOKEN }}

      - id: smoke_flow
        name: Apply curated smoke flow
        uses: pavan-nelakuditi/postman-smoke-flow-action@main
        with:
          project-name: \${{ github.event.repository.name }}
          workspace-id: \${{ steps.bootstrap.outputs.workspace-id }}
          spec-id: \${{ steps.bootstrap.outputs.spec-id }}
          smoke-collection-id: \${{ steps.bootstrap.outputs.smoke-collection-id }}
          flow-path: ${input.repoFlowPath}
          spec-path: ${input.repoSpecPath}
          postman-api-key: \${{ secrets.POSTMAN_API_KEY }}

      - id: repo_sync
        name: Sync repository and workspace
        uses: postman-cs/postman-repo-sync-action@main
        with:
          project-name: \${{ github.event.repository.name }}
          workspace-id: \${{ steps.bootstrap.outputs.workspace-id }}
          baseline-collection-id: \${{ steps.bootstrap.outputs.baseline-collection-id }}
          smoke-collection-id: \${{ steps.smoke_flow.outputs.smoke-collection-id }}
          contract-collection-id: \${{ steps.bootstrap.outputs.contract-collection-id }}
          collection-sync-mode: \${{ github.event.inputs.collection_sync_mode || 'refresh' }}
          spec-sync-mode: update
          generate-ci-workflow: false
          environments-json: '${serializeJson(input.config.onboardingActionInputs.environmentsJson)}'
          env-runtime-urls-json: '${serializeJson(input.config.onboardingActionInputs.envRuntimeUrlsJson)}'
          repo-write-mode: \${{ github.event.inputs.repo_write_mode || 'commit-only' }}
          postman-api-key: \${{ secrets.POSTMAN_API_KEY }}
          postman-access-token: \${{ secrets.POSTMAN_ACCESS_TOKEN }}
          github-token: \${{ secrets.GITHUB_TOKEN }}
          spec-id: \${{ steps.bootstrap.outputs.spec-id }}
          spec-path: ${input.repoSpecPath}
`;
}
