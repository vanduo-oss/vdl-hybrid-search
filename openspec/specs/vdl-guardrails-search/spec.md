# vdl-guardrails-search Specification

## Purpose
TBD - created by archiving change promote-vdl-hybrid-search. Update Purpose after archive.
## Requirements
### Requirement: validate queries

`validateSearchQuery` MUST reject empty, too-short, too-long, and pathological repeated-character queries.

#### Scenario: too short
- **GIVEN** query `a`
- **WHEN** validated with default minLength 2
- **THEN** `allowed` is false

### Requirement: corpus-agnostic index payload

`validateSearchIndexPayload` MUST accept any documents array that passes per-document checks (id, title, category, safe route, arrays, bodyText), not only vd3-docs routes.

#### Scenario: curriculum fixture
- **GIVEN** the curriculum-shaped test fixture
- **WHEN** `validateSearchIndexPayload` runs
- **THEN** `allowed` is true

