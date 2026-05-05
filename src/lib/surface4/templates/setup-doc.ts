import type { CICDConfig } from '../../../shared/surface3.js';

type TemplateInput = {
  serviceName: string;
  repoSpecPath: string;
  repoFlowPath: string;
  config: CICDConfig;
};

export function renderSetupDoc(input: TemplateInput): string {
  const environmentLines = input.config.environments
    .map((environment) => `- \`${environment.slug}\`: ${environment.baseUrl}`)
    .join('\n');

  const governanceSection = input.config.onboardingActionInputs.governanceMappingJson
    ? `## Governance Mapping

\`\`\`json
${JSON.stringify(input.config.onboardingActionInputs.governanceMappingJson, null, 2)}
\`\`\`

`
    : '';

  return `# ${input.serviceName} Postman Onboarding Bundle

This generated bundle came from **CSE Buddy Surface 4**. It is designed to help a new user take an approved API spec, an approved smoke flow, and a saved CI/CD configuration and turn them into GitHub-ready onboarding artifacts.

## What This Bundle Contains

- \`${input.repoSpecPath}\`
  - The normalized OpenAPI spec that Surface 1 validated and prepared.
- \`${input.repoFlowPath}\`
  - The approved smoke flow exported from Surface 2.
- \`.github/workflows/postman-pr-validation.yml\`
  - A pull request workflow that runs Postman spec lint and governance checks.
- \`.github/workflows/postman-smoke-flow-onboarding.yml\`
  - An onboarding workflow that runs bootstrap, smoke-flow apply, and repo-sync.
- \`POSTMAN_ONBOARDING.md\`
  - This guide.

## How To Use These Artifacts

You can use this bundle in one of two ways.

### Option A: Start a new repository from the bundle

Use this path when the service does not already have a GitHub repository or when you want a clean onboarding harness.

1. create a new GitHub repository for the service
2. place the generated files at the same paths shown in this guide
3. commit the generated spec, flow file, workflow files, and this guide
4. add the required GitHub secrets
5. run the onboarding workflow manually first

### Option B: Add the artifacts to an existing service repository

Use this path when the service already has application code and a repo.

1. add \`${input.repoSpecPath}\` to the repo, or update the workflow if your spec already lives somewhere else
2. add \`${input.repoFlowPath}\` exactly where the onboarding workflow expects it
3. add the generated workflow files under \`.github/workflows/\`
4. add the required GitHub secrets
5. run the onboarding workflow manually first

If you move either the spec or flow file, update the workflow inputs so \`spec-path\`, \`spec-url\`, and \`flow-path\` still point at the real files.

## What You Need Before Running It

Add these GitHub repository secrets:

- \`POSTMAN_API_KEY\`
  - Used by Postman CLI and the onboarding actions.
- \`POSTMAN_ACCESS_TOKEN\`
  - Used for governance assignment and repo-sync operations that need Postman internal access.

You should also confirm:

- the spec path is correct: \`${input.repoSpecPath}\`
- the flow path is correct: \`${input.repoFlowPath}\`
- the environment URLs below are correct for the target service

## Configured Environments

${environmentLines}

${governanceSection}## How the Generated Workflows Work

### PR validation workflow

\`.github/workflows/postman-pr-validation.yml\` runs on pull requests and:

1. checks out the repository
2. installs Postman CLI
3. signs in with \`POSTMAN_API_KEY\`
4. runs Postman spec lint / governance validation against \`${input.repoSpecPath}\`
5. fails the PR if WARNING or ERROR level governance violations are found

### Smoke flow onboarding workflow

\`.github/workflows/postman-smoke-flow-onboarding.yml\` supports:

- manual runs through \`workflow_dispatch\`
- automatic runs on pushes to \`main\`

The workflow chains these actions in order:

1. \`postman-bootstrap-action\`
2. \`postman-smoke-flow-action\`
3. \`postman-repo-sync-action\`

## Recommended First Run

For someone using this for the first time:

1. commit this generated bundle into the target service repo
2. add the required GitHub secrets
3. trigger the onboarding workflow manually from GitHub Actions
4. leave the manual inputs at their safer defaults:
   - \`repo_write_mode=commit-only\`
   - \`collection_sync_mode=refresh\`
5. review the generated \`.postman/\` and \`postman/\` artifacts before switching later runs to \`commit-and-push\`

## Manual Workflow Inputs

The onboarding workflow exposes these manual inputs:

- \`requester_email\`
  - Workspace membership contact for bootstrap.
- \`repo_write_mode\`
  - \`commit-only\` is safer for the first run.
  - \`commit-and-push\` is useful once you trust the generated artifacts.
- \`collection_sync_mode\`
  - \`refresh\` keeps the existing tracked collection IDs stable.
  - \`version\` can be used later when you want versioned collection behavior.

## Troubleshooting

- If the smoke-flow step fails, confirm that the flow file still points at valid \`operationId\` values from the spec.
- If PR validation fails, check the workflow summary for governance violations reported by Postman CLI.
- If onboarding creates assets but repo-sync does not write expected repo files, verify that:
  - \`POSTMAN_ACCESS_TOKEN\` is valid
  - workflow permissions allow \`contents: write\`
  - the environment URLs above are still correct
`;
}
