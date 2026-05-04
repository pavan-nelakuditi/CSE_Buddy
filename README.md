# CSE Buddy

CSE Buddy is a local-first Electron + React desktop app for turning one API service into a Postman onboarding bundle.

It walks a user through four surfaces:

1. Import or derive a usable OpenAPI spec
2. Generate and refine a happy-path smoke flow
3. Save onboarding and environment configuration
4. Generate staged GitHub onboarding artifacts

The app is designed for teams that may already have strong specs, as well as teams starting from weaker gateway-derived definitions and moving toward a more spec-first workflow.

## Workspace-First Model

CSE Buddy now opens around a user-selected workspace folder.

- app-level state lives in the OS app data directory
  - current workspace
  - recent workspaces
- service artifacts live inside the selected workspace
  - `.cse-buddy/surface1/...`
  - `.cse-buddy/surface2/...`
  - `.cse-buddy/surface3/...`
  - `.cse-buddy/surface4/...`

On first launch, choose or create a workspace. On later launches, CSE Buddy will reopen the last valid workspace automatically.

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

All generated service artifacts are stored under the selected workspace’s `.cse-buddy/` directory.

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

When the app opens:

1. choose or create a workspace
2. import one service spec in Surface 1
3. export `flow.yaml` in Surface 2
4. save onboarding config in Surface 3
5. generate the staged Git bundle in Surface 4

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

Create a local packaged macOS app directory for validation:

```bash
npm run dist:dir
```

Create internal pilot macOS artifacts:

```bash
npm run dist:mac
```

## Product Flow

### Surface 1: Spec Intake

Choose one of:

- `Upload OpenAPI`
- `Import from AWS API Gateway`

Surface 1 validates and normalizes the service spec, then writes a `SpecContext` for downstream surfaces.

### Surface 2: Smoke Flow

Surface 2 generates one draft smoke flow per service, lets the user refine it, and exports `flow.yaml`.

The `flow.yaml` file is the approved happy-path journey for the service. It is intended to become the source of truth for the Postman Smoke collection structure:

- which operations belong in the smoke flow
- the order those operations should run in
- how values from earlier responses bind into later requests
- which response fields should be extracted as variables
- which smoke checks the generated Postman collection should perform

To generate it:

1. import or open a service from Surface 1
2. move to Surface 2
3. click `Generate smoke flow`
4. review the generated steps, bindings, and extracts
5. adjust the flow if needed
6. click `Export flow.yaml`

Surface 2 writes the exported flow to the selected workspace:

```text
.cse-buddy/surface2/<service-key>/flow.yaml
```

Surface 4 also stages a repo-ready copy inside its generated bundle:

```text
.cse-buddy/surface4/<service-key>/generated/.cse-buddy/flows/<service-key>/flow.yaml
```

That staged copy is the one referenced by the generated GitHub onboarding workflow. The `postman-smoke-flow-action` reads it and applies the approved journey to the Smoke collection created by bootstrap.

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

The app writes local service data under the selected workspace:

```text
.cse-buddy/
```

That includes imported specs, exported flows, saved onboarding config, and staged Surface 4 bundles. These are local working artifacts and should not be committed by default.

## Distribution

Current packaging target:

- macOS first
- internal pilot distribution
- `electron-builder` generated `.dmg` and `.zip`

What is intentionally out of scope for this pass:

- code signing
- notarization
- auto-update
- Windows and Linux installers

## Current Scope

Current implementation focus:

- single service per onboarding flow
- one smoke flow per service
- GitHub Actions as the CI/CD target
- staged bundle generation, not direct repo publishing

## Internal Distribution Flow

For an internal pilot build:

1. install dependencies with `npm install`
2. run `npm run dist:mac`
3. open the generated app
4. choose a workspace on first launch
5. keep generated specs, flows, config, and staged bundles inside that workspace

## Pilot Test Checklist

For a realistic packaged-app test:

1. launch the app from `dist-packages/`
2. choose a fresh workspace folder
3. import one service in Surface 1
4. export `flow.yaml` in Surface 2
5. save the onboarding config in Surface 3
6. generate the Git bundle in Surface 4
7. use the app actions to:
   - open the active workspace folder
   - reveal the generated bundle
   - open the generated `README.md`
8. confirm all generated artifacts live under that workspace’s `.cse-buddy/` directory

The generated Surface 4 README is the handoff artifact for first-time users. It should be the first file reviewed after bundle generation.

## App State vs Workspace State

App-level settings:

- recent workspaces
- last-opened workspace

Workspace-level data:

- imported and normalized specs
- exported `flow.yaml`
- saved `cicd-config.json`
- staged Surface 4 Git bundle

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
