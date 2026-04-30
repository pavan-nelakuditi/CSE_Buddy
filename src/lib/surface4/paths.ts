export function getGeneratedSpecRelativePath(): string {
  return 'api/openapi.yaml';
}

export function getGeneratedFlowRelativePath(serviceKey: string): string {
  return `.cse-buddy/flows/${serviceKey}/flow.yaml`;
}

export function getGeneratedPrWorkflowRelativePath(): string {
  return '.github/workflows/postman-pr-validation.yml';
}

export function getGeneratedOnboardingWorkflowRelativePath(): string {
  return '.github/workflows/postman-smoke-flow-onboarding.yml';
}

export function getGeneratedSetupDocRelativePath(): string {
  return 'README.md';
}
