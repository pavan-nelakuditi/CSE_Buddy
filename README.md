# CSE Buddy

CSE Buddy is a local-first Electron + React desktop app for turning one API service into a Postman onboarding bundle.

It walks a user through four surfaces:

1. Import or derive a usable OpenAPI spec
2. Generate and refine a happy-path smoke flow
3. Save onboarding and environment configuration
4. Generate staged GitHub onboarding artifacts

The app is designed for teams that may already have strong specs, as well as teams starting from weaker gateway-derived definitions and moving toward a more spec-first workflow.

## What The App Produces

For each service, CSE Buddy can generate:

- a normalized OpenAPI spec
- `SpecContext`
- `flow.yaml`
- `cicd-config.json`
- a staged GitHub onboarding bundle with:
  - PR validation workflow
  - smoke flow onboarding workflow
  - staged spec and flow files
  - a generated README for first-time setup

All generated service artifacts are stored under `.cse-buddy/`.

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Vitest
- AWS SDK v3

## Requirements

- Node.js 20+ recommended
- npm
- macOS, Windows, or Linux with Electron support

For AWS import:

- valid local AWS credentials or SSO session
- API Gateway read access in the target region
- STS access for connection checks

## Install

```bash
cd /Users/pavan.nelakuditi@postman.com/Documents/Codex/CSE_Buddy
npm install
```

## Run

Build and launch the app:

```bash
npm start
```

## Development Commands

Build everything:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Run the renderer dev server:

```bash
npm run dev:renderer
```

Watch Electron TypeScript output:

```bash
npm run dev:electron
```

## Product Flow

### Surface 1: Spec Intake

Choose one of:

- `Upload OpenAPI`
- `Import from AWS API Gateway`

Surface 1 validates and normalizes the service spec, then writes a `SpecContext` for downstream surfaces.

### Surface 2: Smoke Flow

Surface 2 generates one draft smoke flow per service, lets the user refine it, and exports `flow.yaml`.

### Surface 3: Onboarding Config

Surface 3 captures:

- environment selection
- runtime URL per environment
- optional governance mapping

It then saves `cicd-config.json`.

### Surface 4: Git Artifacts

Surface 4 stages a per-service bundle containing:

- normalized spec
- `flow.yaml`
- GitHub workflows
- setup README

These outputs are staged under:

```text
.cse-buddy/surface4/<service-key>/generated/
```

## Repository Layout

```text
CSE_Buddy/
  electron/                # Electron main process, preload, IPC, services
  src/                     # React renderer, shared contracts, UI logic
  tests/                   # Vitest coverage
  api/                     # Example/local spec material used by the app
  .github/                 # Workflow-related project files
  package.json
```

## Local Generated Artifacts

The app writes local service data under:

```text
.cse-buddy/
```

That includes imported specs, exported flows, saved onboarding config, and staged Surface 4 bundles. These are local working artifacts and should not be committed by default.

## Current Scope

Current implementation focus:

- single service per onboarding flow
- one smoke flow per service
- GitHub Actions as the CI/CD target
- staged bundle generation, not direct repo publishing

## Before Pushing To GitHub

Recommended sanity check:

```bash
npm test
npm run build
```

Then review the current local artifacts under `.cse-buddy/` and make sure only source files, not generated bundles, are being committed.

## Troubleshooting

If Electron launches to a blank window:

```bash
npm run build
npm start
```

If AWS import fails:

- confirm region
- confirm profile or credential chain
- confirm session is not expired
- confirm `sts:GetCallerIdentity` and `apigateway:GET`

If Surface 3 or Surface 4 appears blocked:

- Surface 2 must export a real `flow.yaml`
- Surface 3 must save `cicd-config.json`

