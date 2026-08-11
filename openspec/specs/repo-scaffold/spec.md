# repo-scaffold Specification

## Purpose

Package scaffold, publish metadata, and GitHub Actions CI for the publishable
`@vanduo-oss/vdl-hybrid-search` library.

## Requirements

### Requirement: package-metadata

The package MUST be publishable as `@vanduo-oss/vdl-hybrid-search` with public
`publishConfig`, dual ESM/CJS exports, typed entry points, and MUST NOT set
`"private": true` once prepared for npm release.

#### Scenario: package is not private

- **WHEN** `package.json` is inspected for a release candidate
- **THEN** `"private"` MUST be absent or false
- **AND** `publishConfig.access` MUST be `public`

#### Scenario: version sync

- **GIVEN** package version `0.1.1`
- **WHEN** smoke tests run
- **THEN** `VDL_HYBRID_SEARCH_VERSION` equals `0.1.1`

### Requirement: github-actions-ci

The repository MUST include a GitHub Actions workflow on push/PR to `main` that
runs format check, lint, typecheck, `test:ci`, build, `pnpm pack --dry-run`, and
dependency audit.

#### Scenario: CI does not require local inference gate

- **WHEN** the CI workflow executes
- **THEN** it MUST NOT require the local MiniLM/Fuse inference suite to pass as
  part of remote CI
