type TemplateInput = {
  repoSpecPath: string;
};

export function renderPrValidationWorkflow(input: TemplateInput): string {
  return `name: Postman PR Validation

on:
  pull_request:
    branches:
      - main
    paths:
      - '${input.repoSpecPath}'
      - '.github/workflows/postman-pr-validation.yml'
  workflow_dispatch:

jobs:
  validation:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install Postman CLI
        run: curl -o- "https://dl-cli.pstmn.io/install/linux64.sh" | sh

      - name: Sign in to Postman
        run: postman login --with-api-key "\${{ secrets.POSTMAN_API_KEY }}"

      - name: Run spec lint and governance checks
        id: lint
        run: |
          set +e
          postman spec lint ${input.repoSpecPath} \\
            --fail-severity WARNING \\
            --output JSON > lint-results.json 2> lint-stderr.log
          LINT_EXIT=$?
          cat lint-stderr.log >&2
          echo "exit_code=$LINT_EXIT" >> "$GITHUB_OUTPUT"
          if [ $LINT_EXIT -eq 0 ]; then
            echo "outcome=success" >> "$GITHUB_OUTPUT"
          else
            echo "outcome=failure" >> "$GITHUB_OUTPUT"
          fi

      - name: Summarize governance results
        if: always()
        run: |
          node <<'NODE'
          const fs = require('node:fs');
          const summaryPath = process.env.GITHUB_STEP_SUMMARY;

          if (!fs.existsSync('lint-results.json')) {
            fs.appendFileSync(summaryPath, '## Postman Governance Summary\\n\\nNo lint-results.json file was produced. Check the workflow logs.\\n');
            process.exit(0);
          }

          const data = JSON.parse(fs.readFileSync('lint-results.json', 'utf8'));
          const violations = Array.isArray(data.violations) ? data.violations : [];

          fs.appendFileSync(
            summaryPath,
            [
              '## Postman Governance Summary',
              '',
              \`Violations found: **\${violations.length}**\`,
              '',
              ...(violations.length === 0
                ? ['No WARNING or ERROR level governance violations were found.']
                : violations.map((violation) => {
                    const severity = String(violation.severity || 'INFO').toUpperCase();
                    const issue = violation.issue || 'Governance violation';
                    const location = violation.path || '';
                    return \`- [\${severity}] \${issue} \${location}\`.trim();
                  }))
            ].join('\\n') + '\\n'
          );
          NODE

      - name: Enforce governance gate
        if: steps.lint.outputs.outcome == 'failure'
        run: |
          echo "::error::Postman governance check failed - spec has WARNING or ERROR level violations"
          exit 1
`;
}
